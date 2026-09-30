import { renderToBuffer } from "@react-pdf/renderer";
import { createClient } from "@/lib/supabase/server";
import { QuotationDocument, type PdfLine, type PdfQuotation, type PdfCompany } from "@/lib/pdf/quotation-document";
import { formworkKind, pdfFileName } from "@/lib/quotations/document-content";
import { mediaForPdf } from "@/lib/quotations/media";
import { totalsRows, type Totals } from "@/lib/floor-plans/calc";
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

  let plan: PdfFloorPlan | null = null;
  if (q.floor_plan_id) {
    const { data: fp } = await supabase.from("floor_plans").select("name, totals, preview_path").eq("id", q.floor_plan_id).maybeSingle();
    if (fp) {
      let image: PdfFloorPlan["image"] = null;
      if (fp.preview_path) {
        const { data: img } = await supabase.storage.from("floor-plans").download(fp.preview_path);
        if (img) image = { data: Buffer.from(await img.arrayBuffer()), format: "jpg" };
      }
      const t = (fp.totals ?? {}) as Record<string, number> & { params?: { floorHeight?: number; slabMm?: number; floors?: number } };
      const pr = t.params ?? {};
      const saved = (t as unknown as { rules?: unknown }).rules;
      const mr = saved ? normaliseRules(saved) : await loadRules(supabase);
      plan = {
        name: fp.name, image, rows: totalsRows(t as unknown as Partial<Totals>),
        rules: mr.printOnQuote ? describeRules(mr) : undefined,
        items: Array.isArray((t as unknown as Totals).items) ? (t as unknown as Totals).items.slice(0, 400) : undefined,
        note: `Areas are per typical floor, measured from the client's drawing. Floor height ${pr.floorHeight != null ? Math.round(pr.floorHeight * 1000) : "-"} mm, slab ${pr.slabMm ?? "-"} mm${(pr.floors ?? 1) > 1 ? `, ${pr.floors} floors` : ""}. Final quantities as per approved GFC drawings.`,
      };
    }
  }

  const buffer = await renderToBuffer(
    <QuotationDocument q={q as unknown as PdfQuotation} lines={lines} company={(company ?? {}) as PdfCompany} media={media} plan={plan} />,
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
