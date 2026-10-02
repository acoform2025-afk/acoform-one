import { renderToBuffer } from "@react-pdf/renderer";
import { dxfTextFromBlob } from "@/lib/floor-plans/dxf-text";
import { createClient } from "@/lib/supabase/server";
import { computeTotals, UNIT_TO_M, WALL_OPTION_LABEL, type DxfAuto, type Takeoff } from "@/lib/floor-plans/calc";
import { loadRules } from "@/lib/floor-plans/rules";
import { dxfAuto, dxfFrame, readDxf, separateAreas, type DxfModel } from "@/lib/floor-plans/dxf";
import { sheetGeo, sheetSections } from "@/lib/floor-plans/area-sheet";
import { AreaSheetsDocument, type SheetInfo } from "@/lib/pdf/area-sheet-document";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const safe = (s: string) => s.replace(/[^\w.\- ]+/g, "_").slice(0, 80);

/** All area calculation sheets of a lead in one PDF: one page per measured plan (block); ?options=both adds a page for the other wall option. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new Response("Not found", { status: 404 });
  const both = new URL(req.url).searchParams.get("options") === "both";
  const supabase = await createClient();
  const { data: lead } = await supabase.from("leads").select("id, lead_code, project_name, customer_name, company_name").eq("id", id).maybeSingle();
  if (!lead) return new Response("Lead not found", { status: 404 });
  const { data: plans } = await supabase.from("floor_plans").select("id, name, source_kind, file_path, takeoff, tenant_id").eq("lead_id", id).eq("drawing_type", "plan").order("name");
  const measured = (plans ?? []).filter((p) => p.takeoff && Array.isArray((p.takeoff as Takeoff).shapes));
  if (!measured.length) return new Response("No measured floor plans on this lead.", { status: 400 });
  const rules = await loadRules(supabase);
  const { data: company } = await supabase.from("tenants").select("company_name").eq("id", measured[0].tenant_id).maybeSingle();
  const date = new Date().toLocaleDateString("en-GB");
  const models = new Map<string, DxfModel | null>();     // blocks of one project share a drawing: read once
  const sheets: { geo: ReturnType<typeof sheetGeo>; info: SheetInfo; sections: ReturnType<typeof sheetSections> }[] = [];
  for (const plan of measured) {
    const t = plan.takeoff as Takeoff;
    let model: DxfModel | null = null;
    if (plan.source_kind === "dxf") {
      if (models.has(plan.file_path)) model = models.get(plan.file_path)!;
      else { const { data: blob } = await supabase.storage.from("floor-plans").download(plan.file_path); try { model = blob ? readDxf(await dxfTextFromBlob(blob)) : null; } catch { model = null; } models.set(plan.file_path, model); }
    }
    const minOpen = t.params.minOpeningM2 != null && String(t.params.minOpeningM2) !== "" ? Number(t.params.minOpeningM2) : rules.minOpeningM2;
    const thinChosen = (Number(t.params.minWallMm) || 0) > 75;
    const variants: { minWallMm: number; label: string }[] = [{ minWallMm: Number(t.params.minWallMm) || 0, label: "" }];
    if (both && model && t.dxf) variants.push({ minWallMm: thinChosen ? 0 : 125, label: "" });
    for (const v of variants) {
      const tv: Takeoff = { ...t, params: { ...t.params, minWallMm: v.minWallMm || undefined } };
      let auto: DxfAuto | null = null;
      if (model && t.dxf) {
        const reg = t.dxf.region, f = dxfFrame(model, 2400);
        const keep = reg ? (p: { pts: [number, number][] }) => p.pts.every((q) => { const [x, y] = f.toPx(q); return x >= reg[0] && x <= reg[2] && y >= reg[1] && y <= reg[3]; }) : undefined;
        auto = dxfAuto(model, t.dxf.layerRoles, UNIT_TO_M[t.dxf.units], keep, minOpen, separateAreas(t.shapes, f), { minWallMm: v.minWallMm });
      }
      const totals = computeTotals(tv, auto, rules);
      const optLabel = both && auto?.wallPairs ? ` — ${v.minWallMm > 75 ? WALL_OPTION_LABEL(v.minWallMm)[1] : WALL_OPTION_LABEL(125)[0]}` : "";
      sheets.push({
        geo: sheetGeo(auto), sections: sheetSections(tv, totals, auto),
        info: { title: "TENTATIVE AREA CALCULATION", company: company?.company_name ?? "Aco Form Work Pvt Ltd", project: lead.project_name ?? plan.name, client: lead.company_name ?? lead.customer_name ?? "", planName: plan.name + optLabel, date, extraPct: totals.extra_pct, contact: totals.contact_area, quote: totals.typical_quote, set: totals.quote_area, nonTypical: (t.nonTypical ?? []).filter((x) => Number(x.area_m2) > 0).map((x) => ({ label: (x.label || "Additional").slice(0, 40), area: Number(x.area_m2) })) },
      });
    }
  }
  models.clear();
  const buffer = await renderToBuffer(<AreaSheetsDocument title={`Area calculation — ${lead.project_name ?? lead.lead_code}`} company={company?.company_name ?? ""} sheets={sheets} />);
  return new Response(new Uint8Array(buffer), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="${safe(`Area calculation ${lead.project_name ?? lead.lead_code}${both ? " (both options)" : ""}`)}.pdf"`, "Cache-Control": "no-store" } });
}
