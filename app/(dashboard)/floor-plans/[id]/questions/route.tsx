import { renderToBuffer } from "@react-pdf/renderer";
import { dxfTextFromBlob } from "@/lib/floor-plans/dxf-text";
import { createClient } from "@/lib/supabase/server";
import { computeTotals, UNIT_TO_M, type DxfAuto, type Takeoff } from "@/lib/floor-plans/calc";
import { loadRules } from "@/lib/floor-plans/rules";
import { drawingSection, dxfAuto, dxfFrame, readDxf, separateAreas, type DxfModel } from "@/lib/floor-plans/dxf";
import { buildingTotals, groupLevels } from "@/lib/floor-plans/building";
import { measureQuestions } from "@/lib/floor-plans/questions";
import { QuestionsDocument } from "@/lib/pdf/questions-document";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const safe = (s: string) => s.replace(/[^\w.\- ]+/g, "_").slice(0, 80);

/** "Clarifications before design" PDF: the open questions for architect / structure / client, with the level list. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new Response("Not found", { status: 404 });
  const supabase = await createClient();
  const { data: plan } = await supabase.from("floor_plans")
    .select("id, name, source_kind, file_path, takeoff, tenant_id, lead_id, leads ( lead_code, project_name, customer_name, company_name )")
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
    auto = dxfAuto(model, t.dxf.layerRoles, UNIT_TO_M[t.dxf.units], keep, t.params.minOpeningM2 != null && String(t.params.minOpeningM2) !== "" ? Number(t.params.minOpeningM2) : rules.minOpeningM2, separateAreas(t.shapes, f), { minWallMm: Number(t.params.minWallMm) || 0 });
  }
  const section = model ? drawingSection(model) : null;
  model = null;
  const totals = computeTotals(t, auto, rules);
  const saved = t.building?.questions ?? [];
  const questions = [...saved, ...measureQuestions(t, totals, auto, rules, section).filter((q) => !saved.some((s) => s.id === q.id))];
  const levels = t.building ? groupLevels(t.building.levels) : [];
  // the levels' own plans, for the whole-building figure
  const own: Record<string, { contact: number; quote: number }> = {};
  const ids = (t.building?.levels ?? []).map((l) => l.planId).filter((x): x is string => !!x && /^[0-9a-f-]{36}$/i.test(x));
  if (ids.length) {
    const { data: rows } = await supabase.from("floor_plans").select("id, totals").in("id", ids);
    for (const r of rows ?? []) { const tt = r.totals as { contact_area?: number; quote_area?: number } | null; if (tt && Number(tt.contact_area) > 0) own[r.id] = { contact: Number(tt.contact_area), quote: Number(tt.quote_area) || 0 }; }
  }
  const whole = t.building ? buildingTotals(t.building, { contact: totals.contact_area, quote: totals.quote_area }, own) : null;
  const lead = Array.isArray(plan.leads) ? plan.leads[0] : plan.leads;
  const { data: company } = await supabase.from("tenants").select("company_name").eq("id", plan.tenant_id).maybeSingle();

  const buffer = await renderToBuffer(
    <QuestionsDocument questions={questions} levels={levels} info={{
      company: company?.company_name ?? "Aco Form Work Pvt Ltd", project: lead?.project_name ?? plan.name, client: lead?.company_name ?? lead?.customer_name ?? "", planName: plan.name,
      date: new Date().toLocaleDateString("en-GB"), ref: `${lead?.lead_code ?? "FP"}/RFI-${new Date().toISOString().slice(2, 10).replace(/-/g, "")}`,
      levelsNote: t.building?.note, contact: totals.contact_area, floors: whole?.floors ?? t.params.floors, whole: whole?.contact,
    }} />,
  );
  return new Response(new Uint8Array(buffer), {
    headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="${safe(`Clarifications ${plan.name}`)}.pdf"`, "Cache-Control": "no-store" },
  });
}
