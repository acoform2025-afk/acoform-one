import { renderToBuffer } from "@react-pdf/renderer";
import { dxfTextFromBlob } from "@/lib/floor-plans/dxf-text";
import { createClient } from "@/lib/supabase/server";
import { computeTotals, UNIT_TO_M, type DxfAuto, type Takeoff } from "@/lib/floor-plans/calc";
import { loadRules } from "@/lib/floor-plans/rules";
import { dxfAuto, dxfFrame, readDxf, type DxfModel } from "@/lib/floor-plans/dxf";
import { sheetGeo, sheetSections } from "@/lib/floor-plans/area-sheet";
import { AreaSheetDocument } from "@/lib/pdf/area-sheet-document";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const safe = (s: string) => s.replace(/[^\w.\- ]+/g, "_").slice(0, 80);

/** ACOFORM "tentative area calculation" sheet (A3 PDF) for a measured floor plan. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new Response("Not found", { status: 404 });
  const supabase = await createClient();
  const { data: plan } = await supabase.from("floor_plans")
    .select("id, name, source_kind, file_path, takeoff, tenant_id, leads ( lead_code, project_name, customer_name, company_name )")
    .eq("id", id).maybeSingle();
  if (!plan) return new Response("Floor plan not found", { status: 404 });
  const t = plan.takeoff as unknown as Takeoff;
  if (!t || !Array.isArray(t.shapes)) return new Response("Measure and save this plan first.", { status: 400 });

  const rules = await loadRules(supabase);
  let model: DxfModel | null = null;
  if (plan.source_kind === "dxf") {
    const { data: blob } = await supabase.storage.from("floor-plans").download(plan.file_path);
    if (blob) { try { model = readDxf(await dxfTextFromBlob(blob)); } catch { model = null; } }
  }
  let auto: DxfAuto | null = null;
  if (model && t.dxf) {
    const reg = t.dxf.region;
    const f = dxfFrame(model, 2400);
    const keep = reg ? (p: { pts: [number, number][] }) => p.pts.every((q) => { const [x, y] = f.toPx(q); return x >= reg[0] && x <= reg[2] && y >= reg[1] && y <= reg[3]; }) : undefined;
    auto = dxfAuto(model, t.dxf.layerRoles, UNIT_TO_M[t.dxf.units], keep, t.params.minOpeningM2 != null && String(t.params.minOpeningM2) !== "" ? Number(t.params.minOpeningM2) : rules.minOpeningM2);
  }
  model = null;
  const totals = computeTotals(t, auto, rules);
  const lead = Array.isArray(plan.leads) ? plan.leads[0] : plan.leads;
  const { data: company } = await supabase.from("tenants").select("company_name").eq("id", plan.tenant_id).maybeSingle();

  const buffer = await renderToBuffer(
    <AreaSheetDocument geo={sheetGeo(auto)} sections={sheetSections(t, totals, auto)} info={{
      title: "TENTATIVE AREA CALCULATION", company: company?.company_name ?? "Aco Form Work Pvt Ltd",
      project: lead?.project_name ?? plan.name, client: lead?.company_name ?? lead?.customer_name ?? "", planName: plan.name,
      date: new Date().toLocaleDateString("en-GB"), extraPct: totals.extra_pct, contact: totals.contact_area, quote: totals.typical_quote, set: totals.quote_area,
      nonTypical: (t.nonTypical ?? []).filter((x) => Number(x.area_m2) > 0).map((x) => ({ label: (x.label || "Additional").slice(0, 40), area: Number(x.area_m2) })),
    }} />,
  );
  return new Response(new Uint8Array(buffer), {
    headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="${safe(`Area calculation ${plan.name}`)}.pdf"`, "Cache-Control": "no-store" },
  });
}
