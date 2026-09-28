// ACOFORM wall layout engine (rebuilt). Pure functions — no database access.
// Places catalog wall panels along each wall face, with corner pieces and a custom filler for any remainder.
// Assumptions (review with ACOFORM design team):
//  • Both faces of a wall get the same panel run (quantity x2).
//  • 'internal' / 'external' corner at a wall end = one IC / EC corner piece; the run shortens by the corner width.
//  • Panels are 2400 mm tall; for walls taller than 2400 mm the top strip is flagged, not yet modelled.
//  • Openings are not yet deducted.

export type CatalogPanel = { id: string; panel_code: string; panel_category: string; width_mm: number; height_mm: number; weight_kg: number; area_sqm: number };
export type Wall = { id: string; wall_code: string; length_mm: number; height_mm: number; start_corner: string; end_corner: string };

export type Placement = {
  design_wall_id: string; panel_master_id: string | null; panel_role: "standard" | "corner_internal" | "corner_external" | "custom_filler";
  custom_width_mm: number | null; position_mm: number; quantity: number; sequence_in_wall: number;
};

export type LayoutOption = {
  option_number: number; strategy_label: string; standardization_rate: number; filler_ratio: number; cost_score: number;
  inventory_complexity_score: number; reuse_score: number; composite_score: number; total_weight_kg: number; total_area_sqm: number;
  total_estimated_cost: number; distinct_panel_type_count: number; custom_filler_count: number; reasoning: string; rank: number;
  panels: Placement[];
};

const FACES = 2;
const STEP = 50; // catalog widths are multiples of 50 mm

type Strategy = { label: string; fill: (run: number, widths: number[]) => number[] };

/** Greedy: biggest panel that fits, repeatedly. */
function largestFirst(run: number, widths: number[]): number[] {
  const out: number[] = [];
  let left = run;
  for (const w of [...widths].sort((a, b) => b - a)) while (left >= w) { out.push(w); left -= w; }
  return out;
}

/** Fewest panels: exact DP over 50 mm units — maximise covered length, then minimise count. */
function fewestPanels(run: number, widths: number[]): number[] {
  const units = Math.floor(run / STEP);
  const u = widths.map((w) => w / STEP).filter(Number.isInteger);
  const best: (number | null)[] = Array(units + 1).fill(null);
  const pick: number[] = Array(units + 1).fill(0);
  best[0] = 0;
  for (let i = 1; i <= units; i++) {
    for (const w of u) {
      const prev = best[i - w];
      if (i >= w && prev != null && (best[i] == null || prev + 1 < best[i]!)) { best[i] = prev + 1; pick[i] = w; }
    }
  }
  let i = units;
  while (i > 0 && best[i] == null) i--;
  const out: number[] = [];
  while (i > 0) { out.push(pick[i] * STEP); i -= pick[i]; }
  return out.sort((a, b) => b - a);
}

/** Fewest distinct types: the largest width plus at most one other width. */
function fewestTypes(run: number, widths: number[]): number[] {
  const sorted = [...widths].sort((a, b) => b - a);
  const big = sorted[0];
  let bestSet: number[] = largestFirst(run, [big]);
  let bestLeft = run - bestSet.reduce((s, w) => s + w, 0);
  for (const other of sorted.slice(1)) {
    for (let a = Math.floor(run / big); a >= 0; a--) {
      const rest = run - a * big;
      const b = Math.floor(rest / other);
      const left = rest - b * other;
      if (left < bestLeft || (left === bestLeft && a + b < bestSet.length)) {
        bestLeft = left;
        bestSet = [...Array(a).fill(big), ...Array(b).fill(other)];
      }
    }
  }
  return bestSet;
}

const STRATEGIES: Strategy[] = [
  { label: "Largest panels first", fill: largestFirst },
  { label: "Fewest panels", fill: fewestPanels },
  { label: "Fewest distinct types", fill: fewestTypes },
];

export function generateLayouts(walls: Wall[], catalog: CatalogPanel[], ratePerKg: number): { options: LayoutOption[]; warnings: string[] } {
  const wallPanels = catalog.filter((p) => p.panel_category === "wall_panel" && Number(p.height_mm) === 2400);
  const ic = catalog.find((p) => p.panel_category === "internal_corner");
  const ec = catalog.find((p) => p.panel_category === "external_corner");
  if (wallPanels.length === 0) throw new Error("No 2400 mm wall panels in the panel catalog.");
  const widths = [...new Set(wallPanels.map((p) => Number(p.width_mm)))];
  const byWidth = new Map(wallPanels.map((p) => [Number(p.width_mm), p]));
  const kgPerSqm = wallPanels.reduce((s, p) => s + Number(p.weight_kg) / Number(p.area_sqm), 0) / wallPanels.length;

  const warnings: string[] = [];
  for (const w of walls) {
    if (Number(w.height_mm) > 2400) warnings.push(`${w.wall_code}: height ${w.height_mm} mm — top strip above 2400 mm is not yet included.`);
    if ((w.start_corner === "internal" && !ic) || (w.end_corner === "internal" && !ic)) warnings.push("No internal corner panel in the catalog.");
    if ((w.start_corner === "external" && !ec) || (w.end_corner === "external" && !ec)) warnings.push("No external corner panel in the catalog.");
  }

  const raw = STRATEGIES.map((strategy, idx) => {
    const panels: Placement[] = [];
    let weight = 0, area = 0, stdArea = 0, fillerMm = 0, runMm = 0, fillers = 0;
    const types = new Set<string>();

    for (const w of walls) {
      const H = Number(w.height_mm);
      const panelH = 2400;
      let seq = 0;
      let pos = 0;
      const corner = (kind: string) => (kind === "internal" ? ic : kind === "external" ? ec : undefined);
      const startC = corner(w.start_corner), endC = corner(w.end_corner);
      const run = Number(w.length_mm) - (startC ? Number(startC.width_mm) : 0) - (endC ? Number(endC.width_mm) : 0);
      if (run <= 0) throw new Error(`${w.wall_code}: wall is shorter than its corner pieces.`);
      runMm += run * FACES;

      const addCorner = (c: CatalogPanel | undefined, role: "corner_internal" | "corner_external") => {
        if (!c) return;
        panels.push({ design_wall_id: w.id, panel_master_id: c.id, panel_role: role, custom_width_mm: null, position_mm: pos, quantity: 1, sequence_in_wall: ++seq });
        weight += Number(c.weight_kg); area += Number(c.area_sqm); stdArea += Number(c.area_sqm); types.add(c.panel_code);
        pos += Number(c.width_mm);
      };
      addCorner(startC, w.start_corner === "internal" ? "corner_internal" : "corner_external");

      const chosen = strategy.fill(run, widths);
      // group consecutive equal widths into one placement row
      const counts = new Map<number, number>();
      chosen.forEach((wd) => counts.set(wd, (counts.get(wd) ?? 0) + 1));
      for (const [wd, n] of [...counts.entries()].sort((a, b) => b[0] - a[0])) {
        const p = byWidth.get(wd)!;
        panels.push({ design_wall_id: w.id, panel_master_id: p.id, panel_role: "standard", custom_width_mm: null, position_mm: pos, quantity: n * FACES, sequence_in_wall: ++seq });
        weight += Number(p.weight_kg) * n * FACES; area += Number(p.area_sqm) * n * FACES; stdArea += Number(p.area_sqm) * n * FACES; types.add(p.panel_code);
        pos += wd * n;
      }
      const left = run - chosen.reduce((s, x) => s + x, 0);
      if (left > 0) {
        const fa = (left / 1000) * (panelH / 1000);
        panels.push({ design_wall_id: w.id, panel_master_id: null, panel_role: "custom_filler", custom_width_mm: left, position_mm: pos, quantity: FACES, sequence_in_wall: ++seq });
        weight += kgPerSqm * fa * FACES; area += fa * FACES; fillerMm += left * FACES; fillers += FACES;
        pos += left;
      }
      addCorner(endC, w.end_corner === "internal" ? "corner_internal" : "corner_external");
      void H;
    }

    const cost = weight * ratePerKg;
    return {
      option_number: idx + 1, strategy_label: strategy.label, panels,
      standardization_rate: area ? stdArea / area : 0, filler_ratio: runMm ? fillerMm / runMm : 0,
      total_weight_kg: weight, total_area_sqm: area, total_estimated_cost: cost,
      distinct_panel_type_count: types.size, custom_filler_count: fillers,
      pieces: panels.reduce((s, p) => s + p.quantity, 0),
    };
  });

  // Scores 0–100 (higher is better). Composite: reuse 40%, cost 30%, inventory simplicity 20%, pieces to handle 10%.
  const minCost = Math.min(...raw.map((r) => r.total_estimated_cost)) || 1;
  const minTypes = Math.min(...raw.map((r) => r.distinct_panel_type_count)) || 1;
  const minPieces = Math.min(...raw.map((r) => r.pieces)) || 1;
  const scored = raw.map((r) => {
    const reuse = 100 * r.standardization_rate;
    const costScore = 100 * (minCost / (r.total_estimated_cost || minCost));
    const inv = 100 * (minTypes / (r.distinct_panel_type_count || minTypes));
    const handling = 100 * (minPieces / (r.pieces || minPieces));
    const composite = 0.4 * reuse + 0.3 * costScore + 0.2 * inv + 0.1 * handling;
    const reasoning = `${r.pieces} pieces, ${r.distinct_panel_type_count} panel types, ${(r.standardization_rate * 100).toFixed(1)}% standard panels` +
      (r.custom_filler_count ? `, ${r.custom_filler_count} custom fillers (${(r.filler_ratio * 100).toFixed(1)}% of run length)` : ", no custom fillers") +
      `. Est. ${r.total_weight_kg.toFixed(1)} kg.`;
    return { ...r, reuse_score: round(reuse), cost_score: round(costScore), inventory_complexity_score: round(inv), composite_score: round(composite), reasoning };
  });

  const ranked = [...scored].sort((a, b) => b.composite_score - a.composite_score || a.pieces - b.pieces);
  const options: LayoutOption[] = scored.map((r) => ({
    option_number: r.option_number, strategy_label: r.strategy_label, standardization_rate: round(r.standardization_rate, 4),
    filler_ratio: round(r.filler_ratio, 4), cost_score: r.cost_score, inventory_complexity_score: r.inventory_complexity_score,
    reuse_score: r.reuse_score, composite_score: r.composite_score, total_weight_kg: round(r.total_weight_kg), total_area_sqm: round(r.total_area_sqm, 4),
    total_estimated_cost: round(r.total_estimated_cost), distinct_panel_type_count: r.distinct_panel_type_count,
    custom_filler_count: r.custom_filler_count, reasoning: r.reasoning, rank: ranked.indexOf(r) + 1, panels: r.panels,
  }));
  return { options, warnings: [...new Set(warnings)] };
}

function round(n: number, d = 2) { const f = 10 ** d; return Math.round(n * f) / f; }
