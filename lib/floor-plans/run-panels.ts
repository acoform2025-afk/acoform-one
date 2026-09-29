import type { createClient } from "@/lib/supabase/server";
import { readDxf, type DxfModel } from "./dxf";
import { panelInputs } from "./panel-input";
import type { Takeoff } from "./calc";
import { layoutFloor, type CatPanel, type PanelOptions } from "@/lib/design-engine/floor-panels";

type Supa = Awaited<ReturnType<typeof createClient>>;
export type PanelQuery = { h?: string; kg?: string; prop?: string };

export function readOptions(q: PanelQuery) {
  const num = (v: string | undefined, d: number, lo: number, hi: number) => { const n = Number(v); return Number.isFinite(n) && n >= lo && n <= hi ? n : d; };
  return { stdHeight: num(q.h, 2400, 1200, 3600), kgPerM2: num(q.kg, 20, 5, 60), propSpacing: num(q.prop, 1.2, 0.6, 2.4) };
}

/** Loads a floor plan and runs the panel layout. Returns null when the plan is missing or not measured. */
export async function runPanels(supabase: Supa, id: string, q: PanelQuery) {
  const { data: plan } = await supabase.from("floor_plans")
    .select("id, name, source_kind, file_path, takeoff, tenant_id, lead_id, leads ( lead_code, project_name, customer_name, company_name )")
    .eq("id", id).maybeSingle();
  if (!plan) return null;
  const t = plan.takeoff as unknown as Takeoff;
  if (!t || !Array.isArray(t.shapes)) return { plan, error: "Measure and save this floor plan first." as const };
  let model: DxfModel | null = null;
  if (plan.source_kind === "dxf") {
    const { data: blob } = await supabase.storage.from("floor-plans").download(plan.file_path);
    if (blob) { try { model = readDxf(await blob.text()); } catch { model = null; } }
  }
  const { data: catalog } = await supabase.from("panel_master")
    .select("id, panel_code, panel_category, width_mm, height_mm, weight_kg, area_sqm").eq("is_active", true);
  const opt = readOptions(q);
  const inp = panelInputs(t, model);
  const o: PanelOptions = { ...opt, deckLen: 1200, soffitArea: inp.totals.slab_soffit, slabMm: t.params.slabMm };
  const result = layoutFloor(inp.faces, inp.decks, inp.beams, inp.corners, (catalog ?? []).map((c) => ({ ...c, width_mm: Number(c.width_mm), height_mm: Number(c.height_mm), weight_kg: Number(c.weight_kg), area_sqm: Number(c.area_sqm) })) as CatPanel[], o);
  const lead = Array.isArray(plan.leads) ? plan.leads[0] : plan.leads;
  return { plan, lead, t, opt, totals: inp.totals, result, error: null };
}
