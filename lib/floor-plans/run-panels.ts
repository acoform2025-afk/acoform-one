import type { createClient } from "@/lib/supabase/server";
import { dxfTextFromBlob } from "@/lib/floor-plans/dxf-text";
import { readDxf, type DxfModel } from "./dxf";
import { panelInputs } from "./panel-input";
import { loadRules } from "./rules";
import type { Takeoff } from "./calc";
import { layoutFloor, type CatPanel, type PanelOptions } from "@/lib/design-engine/floor-panels";
import { deckZones, layoutZone, type Zone } from "./zones";
import { loadLayoutRules, rulesForPlan, DEFAULT_LAYOUT_RULES, type LayoutRules } from "@/lib/design-engine/layout-rules";

type Supa = Awaited<ReturnType<typeof createClient>>;
export type PanelQuery = { h?: string; kg?: string; prop?: string };

export function readOptions(q: PanelQuery, rules: LayoutRules = DEFAULT_LAYOUT_RULES) {
  const num = (v: string | undefined, d: number, lo: number, hi: number) => { const n = Number(v); return v != null && v !== "" && Number.isFinite(n) && n >= lo && n <= hi ? n : d; };
  return { stdHeight: num(q.h, rules.stdHeight, 1200, 3600), kgPerM2: num(q.kg, 20, 5, 60), propSpacing: num(q.prop, rules.propSpacing, 0.6, 2.4) };
}

// Small in-memory caches (the free server is slow): the parsed drawing per file, and the last layouts. A layout is
// reused only for the same plan version (updated_at), options, rules and catalogue — and only after the plan row was
// read with the user's own access rights above, so nothing crosses accounts.
const modelCache = new Map<string, DxfModel | null>();
const runCache = new Map<string, unknown>();
const remember = <T,>(m: Map<string, T>, k: string, v: T, max: number) => { m.delete(k); m.set(k, v); while (m.size > max) m.delete(m.keys().next().value as string); return v; };

/** Loads a floor plan and runs the panel layout. Returns null when the plan is missing or not measured. */
export async function runPanels(supabase: Supa, id: string, q: PanelQuery) {
  const { data: plan } = await supabase.from("floor_plans")
    .select("id, name, source_kind, file_path, takeoff, tenant_id, lead_id, updated_at, leads ( lead_code, project_name, customer_name, company_name )")
    .eq("id", id).maybeSingle();
  if (!plan) return null;
  const t = plan.takeoff as unknown as Takeoff;
  if (!t || !Array.isArray(t.shapes)) return { plan, error: "Measure and save this floor plan first." as const, opt: undefined };
  const { data: catalog } = await supabase.from("panel_master")
    .select("id, panel_code, panel_category, width_mm, height_mm, weight_kg, area_sqm").eq("is_active", true);
  const { data: eng } = await supabase.from("engineering_parameters").select("tie_spacing_h_mm, tie_spacing_v_mm").maybeSingle();
  const companyRules = await loadLayoutRules(supabase);
  const layoutRules = rulesForPlan(companyRules, t.system, t.ruleOverrides);
  const opt = readOptions(q, layoutRules);
  // full-height system: one panel to the clear height less the bottom strip (unless a height was typed in)
  if (layoutRules.fullHeight && !q.h) opt.stdHeight = Math.max(1200, Math.round(((t.params.floorHeight - t.params.slabMm / 1000) * 1000 - layoutRules.bottomStrip) / 5) * 5);
  const rules = await loadRules(supabase);
  const key = JSON.stringify([id, plan.updated_at, plan.file_path, q.h ?? "", q.kg ?? "", q.prop ?? "", layoutRules, rules, eng, (catalog ?? []).map((c) => `${c.panel_code}:${c.width_mm}:${c.height_mm}:${c.weight_kg}`).join("|")]);
  const hit = runCache.get(key);
  if (hit) return { ...(hit as Computed), plan, lead: Array.isArray(plan.leads) ? plan.leads[0] : plan.leads };
  let model: DxfModel | null = null;
  if (plan.source_kind === "dxf") {
    const mk = `${plan.tenant_id}/${plan.file_path}/${plan.updated_at}`;   // a re-read drawing (same path) is read again
    if (modelCache.has(mk)) model = modelCache.get(mk)!;
    else {
      const { data: blob } = await supabase.storage.from("floor-plans").download(plan.file_path);
      if (blob) { try { model = readDxf(await dxfTextFromBlob(blob)); } catch { model = null; } }
      if (model) remember(modelCache, mk, model, 2);
    }
  }
  const inp = panelInputs(t, model, rules);
  const o: PanelOptions = { ...opt, extCorners: inp.extCorners, upstands: inp.upstands, sunk: inp.sunk, rules: layoutRules, tieH: Number(eng?.tie_spacing_h_mm) || 800, tieV: Number(eng?.tie_spacing_v_mm) || 800, deckLen: 1200, soffitArea: inp.totals.slab_soffit, slabMm: t.params.slabMm, openings: inp.openings, columns: inp.columns, stairSets: inp.stairSets, stairs: inp.stairs };
  const zones = buildZones(inp, (catalog ?? []) as unknown as CatPanel[], layoutRules);
  o.zoneDeck = zones.length ? { panels: zones.flatMap((z) => z.panels.map((p) => ({ code: p.code, w: p.w, L: p.L, custom: p.custom }))), specialArea: zones.reduce((a, z) => a + z.specialArea, 0), area: zones.reduce((a, z) => a + z.area, 0), zones: zones.length } : undefined;
  const result = layoutFloor(inp.faces, inp.decks, inp.beams, inp.corners, (catalog ?? []).map((c) => ({ ...c, width_mm: Number(c.width_mm), height_mm: Number(c.height_mm), weight_kg: Number(c.weight_kg), area_sqm: Number(c.area_sqm) })) as CatPanel[], o);
  const lead = Array.isArray(plan.leads) ? plan.leads[0] : plan.leads;
  const computed = { t, opt, totals: inp.totals, result, shell: inp.shell, error: null, inp, catalog: (catalog ?? []) as unknown as CatPanel[], layoutRules, companySystem: companyRules.system, zones };
  remember(runCache, key, computed, 3);
  return { plan, lead, ...computed };
}
type Computed = { t: Takeoff; opt: ReturnType<typeof readOptions>; totals: ReturnType<typeof panelInputs>["totals"]; result: ReturnType<typeof layoutFloor>; shell: ReturnType<typeof panelInputs>["shell"]; error: null; inp: ReturnType<typeof panelInputs>; catalog: CatPanel[]; layoutRules: LayoutRules; companySystem: LayoutRules["system"]; zones: Zone[] };

/** Numbered deck zones (M1, M2 …) with every deck panel placed — for the installation drawing and numbering list. */
export function buildZones(inp: ReturnType<typeof panelInputs>, catalog: CatPanel[], rules?: LayoutRules): Zone[] {
  const sys = rules && rules.system !== "acoform" ? rules : null;
  const lens = sys?.deckLengths.length ? sys.deckLengths : [1200];
  const deck = catalog.filter((c) => c.panel_category === "deck_panel");
  const deckW = sys?.deckWidths.length ? sys.deckWidths : deck.filter((c) => Number(c.height_mm) === 1200).map((c) => Number(c.width_mm));
  const codeFor = (w: number, L: number) => deck.find((c) => Number(c.width_mm) === w && Number(c.height_mm) === L)?.panel_code ?? `DP-${w}-${L}`;
  return deckZones(inp.decks, inp.zoneWalls, inp.zoneGaps, 0.25, inp.zoneBeams).map((z, i) => layoutZone(`M${i + 1}`, z, deckW.length ? deckW : [600, 500, 450, 400, 300], lens, codeFor, sys?.midBeam ?? 100, 25, sys?.soffitCornerW ?? 0));
}
