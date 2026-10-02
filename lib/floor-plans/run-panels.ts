import type { createClient } from "@/lib/supabase/server";
import { dxfTextFromBlob } from "@/lib/floor-plans/dxf-text";
import { readDxf, type DxfModel } from "./dxf";
import { panelInputs } from "./panel-input";
import { loadRules } from "./rules";
import type { Takeoff } from "./calc";
import { layoutFloor, type CatPanel, type PanelOptions } from "@/lib/design-engine/floor-panels";
import { deckZones, layoutZone, type Zone } from "./zones";
import { loadLayoutRules, DEFAULT_LAYOUT_RULES, type LayoutRules } from "@/lib/design-engine/layout-rules";

type Supa = Awaited<ReturnType<typeof createClient>>;
export type PanelQuery = { h?: string; kg?: string; prop?: string };

export function readOptions(q: PanelQuery, rules: LayoutRules = DEFAULT_LAYOUT_RULES) {
  const num = (v: string | undefined, d: number, lo: number, hi: number) => { const n = Number(v); return v != null && v !== "" && Number.isFinite(n) && n >= lo && n <= hi ? n : d; };
  return { stdHeight: num(q.h, rules.stdHeight, 1200, 3600), kgPerM2: num(q.kg, 20, 5, 60), propSpacing: num(q.prop, rules.propSpacing, 0.6, 2.4) };
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
    if (blob) { try { model = readDxf(await dxfTextFromBlob(blob)); } catch { model = null; } }
  }
  const { data: catalog } = await supabase.from("panel_master")
    .select("id, panel_code, panel_category, width_mm, height_mm, weight_kg, area_sqm").eq("is_active", true);
  const { data: eng } = await supabase.from("engineering_parameters").select("tie_spacing_h_mm, tie_spacing_v_mm").maybeSingle();
  const layoutRules = await loadLayoutRules(supabase);
  const opt = readOptions(q, layoutRules);
  // full-height system: one panel to the clear height less the bottom strip (unless a height was typed in)
  if (layoutRules.fullHeight && !q.h) opt.stdHeight = Math.max(1200, Math.round(((t.params.floorHeight - t.params.slabMm / 1000) * 1000 - layoutRules.bottomStrip) / 5) * 5);
  const rules = await loadRules(supabase);
  const inp = panelInputs(t, model, rules);
  const o: PanelOptions = { ...opt, rules: layoutRules, tieH: Number(eng?.tie_spacing_h_mm) || 800, tieV: Number(eng?.tie_spacing_v_mm) || 800, deckLen: 1200, soffitArea: inp.totals.slab_soffit, slabMm: t.params.slabMm, openings: inp.openings, columns: inp.columns, stairSets: inp.stairSets, stairs: inp.stairs };
  const zones = buildZones(inp, (catalog ?? []) as unknown as CatPanel[], layoutRules);
  o.zoneDeck = zones.length ? { panels: zones.flatMap((z) => z.panels.map((p) => ({ code: p.code, w: p.w, L: p.L, custom: p.custom }))), specialArea: zones.reduce((a, z) => a + z.specialArea, 0), area: zones.reduce((a, z) => a + z.area, 0), zones: zones.length } : undefined;
  const result = layoutFloor(inp.faces, inp.decks, inp.beams, inp.corners, (catalog ?? []).map((c) => ({ ...c, width_mm: Number(c.width_mm), height_mm: Number(c.height_mm), weight_kg: Number(c.weight_kg), area_sqm: Number(c.area_sqm) })) as CatPanel[], o);
  const lead = Array.isArray(plan.leads) ? plan.leads[0] : plan.leads;
  return { plan, lead, t, opt, totals: inp.totals, result, shell: inp.shell, error: null, inp, catalog: (catalog ?? []) as unknown as CatPanel[], layoutRules };
}

/** Numbered deck zones (M1, M2 …) with every deck panel placed — for the installation drawing and numbering list. */
export function buildZones(inp: ReturnType<typeof panelInputs>, catalog: CatPanel[], rules?: LayoutRules): Zone[] {
  const sys = rules && rules.system !== "acoform" ? rules : null;
  const lens = sys?.deckLengths.length ? sys.deckLengths : [1200];
  const deck = catalog.filter((c) => c.panel_category === "deck_panel");
  const deckW = sys?.deckWidths.length ? sys.deckWidths : deck.filter((c) => Number(c.height_mm) === 1200).map((c) => Number(c.width_mm));
  const codeFor = (w: number, L: number) => deck.find((c) => Number(c.width_mm) === w && Number(c.height_mm) === L)?.panel_code ?? `DP-${w}-${L}`;
  return deckZones(inp.decks, inp.zoneWalls, inp.zoneGaps, 0.25, inp.zoneBeams).map((z, i) => layoutZone(`M${i + 1}`, z, deckW.length ? deckW : [600, 500, 450, 400, 300], lens, codeFor, sys?.midBeam ?? 100, 25, sys?.soffitCornerW ?? 0));
}
