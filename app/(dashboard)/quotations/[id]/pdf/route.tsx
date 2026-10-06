import { renderToBuffer } from "@react-pdf/renderer";
import { createClient } from "@/lib/supabase/server";
import { QuotationDocument, type PdfLine, type PdfQuotation, type PdfCompany } from "@/lib/pdf/quotation-document";
import { formworkKind, pdfFileName } from "@/lib/quotations/document-content";
import { mediaForPdf } from "@/lib/quotations/media";
import { totalsRows, UNIT_TO_M, type DxfAuto, type Takeoff, type Totals } from "@/lib/floor-plans/calc";
import { dxfTextFromBlob } from "@/lib/floor-plans/dxf-text";
import { dxfAuto, dxfFrame, readDxf, separateAreas, type DxfModel } from "@/lib/floor-plans/dxf";
import { sheetGeo } from "@/lib/floor-plans/area-sheet";
import type { PdfFloorPlan } from "@/lib/pdf/quotation-document";
import { describeRules, loadRules, normaliseRules } from "@/lib/floor-plans/rules";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: q } = await supabase.from("quotations").select("*").eq("id", id).single();
  if (!q) return new Response("Quotation not found", { status: 404 });

  const { data: company } = await supabase
    .from("tenants")
    .select("company_name, company_address, company_phone, company_website, gst_number, bank_account_name, bank_name, bank_account_number, bank_ifsc_code, bank_branch")
    .eq("id", q.tenant_id)
    .single();

  const { data: rawLines } = await supabase
    .from("quotation_lines")
    .select("id, line_type, description, unit, quantity, unit_rate, line_total, notes, unit_weight_kg, rate_per_kg, sort_order, panel_master ( panel_code, width_mm, height_mm, area_sqm )")
    .eq("quotation_id", id)
    .order("line_type")
    .order("sort_order");

  const lines: PdfLine[] = (rawLines ?? []).map((l) => {
    const pm = Array.isArray(l.panel_master) ? l.panel_master[0] : l.panel_master;
    return {
      id: l.id, line_type: l.line_type, description: l.description, unit: l.unit, quantity: Number(l.quantity),
      unit_rate: l.unit_rate, line_total: l.line_total, notes: l.notes, unit_weight_kg: l.unit_weight_kg, rate_per_kg: l.rate_per_kg,
      panel_code: pm?.panel_code ?? null, width_mm: pm?.width_mm ?? null, height_mm: pm?.height_mm ?? null, area_sqm: pm?.area_sqm ?? null,
    };
  });

  const media = q.show_references === false ? { photos: [], logos: [] } : await mediaForPdf(supabase);

  // measured floor plans to print: the attached plan, or every block of a "quote all blocks" quotation
  const opts = q.options as { blocks?: { id?: string }[] } | null;
  const planIds = [...new Set([q.floor_plan_id, ...((opts?.blocks ?? []).map((b) => b.id))].filter((x): x is string => !!x && /^[0-9a-f-]{36}$/i.test(x)))];
  const plans: PdfFloorPlan[] = [];
  const models = new Map<string, DxfModel | null>();
  const companyRules = await loadRules(supabase);
  for (const pid of planIds) {
    const { data: fp } = await supabase.from("floor_plans").select("name, totals, preview_path, source_kind, file_path, takeoff").eq("id", pid).maybeSingle();
    if (!fp) continue;
    let image: PdfFloorPlan["image"] = null;
    const t = (fp.totals ?? {}) as Record<string, number> & { params?: { floorHeight?: number; slabMm?: number; floors?: number; beamDepthMm?: number; parapetMm?: number; minWallMm?: number } };
    const pr = t.params ?? {};
    const saved = (t as unknown as { rules?: unknown }).rules;
    const mr = saved ? normaliseRules(saved) : companyRules;
    // coloured plan + 3D view from the drawing (DXF plans); picture fallback for PDF / image plans
    let geo: PdfFloorPlan["geo"] = null; let unitToM = 0.001;
    const tk = fp.takeoff as Takeoff | null;
    if (fp.source_kind === "dxf" && tk?.dxf && Array.isArray(tk.shapes)) {
      let model = models.get(fp.file_path) ?? null;
      if (!models.has(fp.file_path)) { const { data: blob } = await supabase.storage.from("floor-plans").download(fp.file_path); try { model = blob ? readDxf(await dxfTextFromBlob(blob)) : null; } catch { model = null; } models.set(fp.file_path, model); }
      if (model) {
        const reg = tk.dxf.region, f = dxfFrame(model, 2400);
        const keep = reg ? (p: { pts: [number, number][] }) => p.pts.every((qq) => { const [x, y] = f.toPx(qq); return x >= reg[0] && x <= reg[2] && y >= reg[1] && y <= reg[3]; }) : undefined;
        unitToM = UNIT_TO_M[tk.dxf.units] ?? 0.001;
        const auto: DxfAuto = dxfAuto(model, tk.dxf.layerRoles, unitToM, keep, tk.params.minOpeningM2 != null && String(tk.params.minOpeningM2) !== "" ? Number(tk.params.minOpeningM2) : mr.minOpeningM2, separateAreas(tk.shapes, f), { minWallMm: Number(tk.params.minWallMm) || 0 });
        geo = sheetGeo(auto);
      }
    }
    if (!geo && fp.preview_path) {
      const { data: img } = await supabase.storage.from("floor-plans").download(fp.preview_path);
      if (img) image = { data: Buffer.from(await img.arrayBuffer()), format: "jpg" };
    }
    plans.push({
      // the quotation shows the quoted area only — no split into slab / walls / columns / beams and no element list
      name: fp.name, image, geo, rows: totalsRows(t as unknown as Partial<Totals>).filter(([k]) => /^(Total for typical floor|Add \d|Additional for non-typical|Formwork set)/.test(k)),
      dims: { floorMm: Math.round((pr.floorHeight ?? 3) * 1000), slabMm: pr.slabMm ?? 150, beamMm: pr.beamDepthMm ?? 600, parapetMm: pr.parapetMm ?? 900, unitToM, thin: (Number(pr.minWallMm) || 0) > 75 },
      rules: mr.printOnQuote ? describeRules(mr) : undefined,
      items: undefined,
      note: `Areas are per typical floor, measured from the client's drawing. Floor height ${pr.floorHeight != null ? Math.round(pr.floorHeight * 1000) : "-"} mm, slab ${pr.slabMm ?? "-"} mm. One formwork set is reused on all floors (typical floor basis${Number((t as Record<string, number>).nontypical_area) > 0 ? " + additional pieces for non-typical floors" : ""}). Final quantities as per approved GFC drawings.`,
    });
  }
  models.clear();
  const plan = plans[0] ?? null;

  const buffer = await renderToBuffer(
    <QuotationDocument q={q as unknown as PdfQuotation} lines={lines} company={(company ?? {}) as PdfCompany} media={media} plan={plan} plans={plans} />,
  );

  const name = pdfFileName(q.quotation_code, q.revision_no, formworkKind(q.formwork_type), q.quotation_date);
  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${name.replace(/"/g, "")}"; filename*=UTF-8''${encodeURIComponent(name)}`,
      "Cache-Control": "no-store",
    },
  });
}
