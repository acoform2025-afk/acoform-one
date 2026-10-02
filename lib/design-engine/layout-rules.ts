/**
 * Company panel-layout rules ("rule settings", as in PKPM-LMB / YJK-LMB): which formwork system, which panel sizes
 * come first, deck lengths, mid-beam / prop-head sizes, tie and prop spacing, loss %, support-head sets …
 * Set once in Settings → Panel layout rules; every layout, drawing and list follows them.
 *
 * Three ready-made systems:
 *  • "tierod"  — 2400 standard panel + top panel, tie rods (Indian practice, e.g. Royce One / Cosmos)
 *  • "flattie" — one full-height panel + 40/50 mm bottom strip, flat ties (Chinese practice, e.g. Guangzhou Motian)
 *  • "acoform" — ACOFORM standard (ACOFORM STD FAB drawings, panel catalogue widths)
 */
export type FormworkSystem = "tierod" | "flattie" | "acoform";

export type LayoutRules = {
  system: FormworkSystem;
  // walls
  wallWidths: number[];          // mm, preferred widths (empty = panel catalogue)
  stdHeight: number;             // standard wall panel height (tie-rod / ACOFORM)
  fullHeight: boolean;           // one full-height wall panel per face (flat-tie) instead of standard + top panel
  bottomStrip: number;           // mm strip under full-height panels (flat-tie R40 / R50), 0 = none
  minFiller: number;             // fillers narrower than this are solid strips
  internalCorner: number;        // mm leg of the internal corner (IC 100 × 100)
  externalCorner: number;        // mm leg of the external corner angle (63.5 / 65)
  kickerMm: number;              // external kicker height on the outer slab edge (0 = none)
  tie: "rod" | "flat";
  tieH: number; tieV: number;    // tie spacing along / up the wall, mm
  // deck
  deckWidths: number[];          // mm, preferred deck panel widths
  deckLengths: number[];         // mm, deck panel lengths in order of preference (rows are sized to fit each room)
  midBeam: number;               // mid beam width, mm (150 tie-rod / 100 flat-tie)
  propHead: [number, number];    // prop head size, mm
  soffitCornerLen: number;       // standard soffit-corner length, mm
  soffitCornerW: number;         // soffit-corner width on the deck side, mm (the deck starts inside it; 0 = deck to the wall face)
  propSpacing: number;           // max prop spacing, m
  supportSets: number;           // sets of prop heads / props in use (props stay up for this many floors)
  // beams, columns, stairs
  beamLenStep: number;           // beam side / bottom panel length step, mm
  columnsSeparate: boolean;      // columns and shear walls cast first with their own column formwork
  columnFirstCast: number;       // height of that first column pour, mm
  // accessories
  lossPct: number;               // extra % on small parts (pins, wedges, ties, sleeves)
};

const range = (a: number, b: number, s: number) => { const o: number[] = []; for (let v = b; v >= a; v -= s) o.push(v); return o; };

export const PRESETS: Record<FormworkSystem, { label: string; note: string; rules: LayoutRules }> = {
  tierod: {
    label: "Tie-rod system · 2400 panel + top panel",
    note: "Indian practice (e.g. Royce One / Cosmos): 2400 wall panels with a top panel, widths in 25 mm steps, tie rods, 150 mm mid beam and prop heads, deck lengths sized to each room.",
    rules: {
      system: "tierod", wallWidths: range(125, 600, 25), stdHeight: 2400, fullHeight: false, bottomStrip: 0, minFiller: 100,
      internalCorner: 100, externalCorner: 63.5, kickerMm: 100, tie: "rod", tieH: 800, tieV: 600,
      deckWidths: range(200, 600, 25), deckLengths: [1200, 1050, 900, 850, 800], midBeam: 150, propHead: [150, 300],
      soffitCornerLen: 1800, soffitCornerW: 100, propSpacing: 1.2, supportSets: 1, beamLenStep: 25, columnsSeparate: true, columnFirstCast: 2400, lossPct: 5,
    },
  },
  flattie: {
    label: "Flat-tie system · full-height panel",
    note: "Chinese practice (e.g. Guangzhou Motian): one full-height wall panel on a 40–50 mm bottom strip, widths in 50 mm steps up to 500, flat ties, 100 mm mid beam, 100 × 200 support heads, 200 mm external kicker, props kept for 3 floors, 10 % loss on small parts.",
    rules: {
      system: "flattie", wallWidths: range(100, 500, 50), stdHeight: 2700, fullHeight: true, bottomStrip: 40, minFiller: 100,
      internalCorner: 100, externalCorner: 65, kickerMm: 200, tie: "flat", tieH: 450, tieV: 600,
      deckWidths: range(100, 600, 50), deckLengths: [1200, 1100, 900, 800], midBeam: 100, propHead: [100, 200],
      soffitCornerLen: 1800, soffitCornerW: 100, propSpacing: 1.2, supportSets: 3, beamLenStep: 50, columnsSeparate: false, columnFirstCast: 0, lossPct: 10,
    },
  },
  acoform: {
    label: "ACOFORM standard",
    note: "ACOFORM STD FAB drawings: catalogue wall panels (600 … 100) at 2400 with top panels / RK panels, 1200 deck panels, 100 mm mid beam and prop heads, tie rods.",
    rules: {
      system: "acoform", wallWidths: [], stdHeight: 2400, fullHeight: false, bottomStrip: 0, minFiller: 100,
      internalCorner: 100, externalCorner: 65, kickerMm: 100, tie: "rod", tieH: 800, tieV: 800,
      deckWidths: [], deckLengths: [1200], midBeam: 100, propHead: [100, 230],
      soffitCornerLen: 1200, soffitCornerW: 0, propSpacing: 1.2, supportSets: 1, beamLenStep: 5, columnsSeparate: false, columnFirstCast: 0, lossPct: 5,
    },
  },
};

export const DEFAULT_LAYOUT_RULES = PRESETS.acoform.rules;

const num = (v: unknown, d: number, lo: number, hi: number) => { const n = Number(v); return v === null || v === undefined || v === "" || !Number.isFinite(n) ? d : Math.min(hi, Math.max(lo, n)); };
const list = (v: unknown, d: number[], lo: number, hi: number) => {
  const a = Array.isArray(v) ? v : typeof v === "string" ? v.split(/[\s,;]+/) : null;
  if (!a) return d;
  const o = [...new Set(a.map(Number).filter((x) => Number.isFinite(x) && x >= lo && x <= hi).map((x) => Math.round(x)))].sort((x, y) => y - x);
  return o;
};

/** Any stored JSON → a full rule set (missing values from the chosen system's preset). */
export function normaliseLayoutRules(raw: unknown): LayoutRules {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const sys: FormworkSystem = r.system === "tierod" || r.system === "flattie" || r.system === "acoform" ? r.system : "acoform";
  const d = PRESETS[sys].rules;
  const ph = Array.isArray(r.propHead) ? r.propHead : d.propHead;
  return {
    system: sys,
    wallWidths: list(r.wallWidths, d.wallWidths, 50, 1200),
    stdHeight: num(r.stdHeight, d.stdHeight, 1200, 3600),
    fullHeight: typeof r.fullHeight === "boolean" ? r.fullHeight : d.fullHeight,
    bottomStrip: num(r.bottomStrip, d.bottomStrip, 0, 150),
    minFiller: num(r.minFiller, d.minFiller, 0, 300),
    internalCorner: num(r.internalCorner, d.internalCorner, 50, 300),
    externalCorner: num(r.externalCorner, d.externalCorner, 40, 150),
    kickerMm: num(r.kickerMm, d.kickerMm, 0, 500),
    tie: r.tie === "flat" || r.tie === "rod" ? r.tie : d.tie,
    tieH: num(r.tieH, d.tieH, 200, 1500), tieV: num(r.tieV, d.tieV, 200, 1500),
    deckWidths: list(r.deckWidths, d.deckWidths, 50, 1200),
    deckLengths: (() => { const l = list(r.deckLengths, d.deckLengths, 300, 2400); return l.length ? l : d.deckLengths; })(),
    midBeam: num(r.midBeam, d.midBeam, 50, 300),
    propHead: [num(ph[0], d.propHead[0], 50, 300), num(ph[1], d.propHead[1], 100, 600)],
    soffitCornerLen: num(r.soffitCornerLen, d.soffitCornerLen, 300, 3000),
    soffitCornerW: num(r.soffitCornerW, d.soffitCornerW, 0, 300),
    propSpacing: num(r.propSpacing, d.propSpacing, 0.6, 2.4),
    supportSets: Math.round(num(r.supportSets, d.supportSets, 1, 5)),
    beamLenStep: num(r.beamLenStep, d.beamLenStep, 5, 300),
    columnsSeparate: typeof r.columnsSeparate === "boolean" ? r.columnsSeparate : d.columnsSeparate,
    columnFirstCast: num(r.columnFirstCast, d.columnFirstCast, 0, 4000),
    lossPct: num(r.lossPct, d.lossPct, 0, 50),
  };
}

/** Plain-English lines for drawings / BOM notes. */
export function describeLayoutRules(r: LayoutRules): string[] {
  const out = [`System: ${PRESETS[r.system].label}.`];
  out.push(r.fullHeight ? `Walls: one full-height panel per face${r.bottomStrip ? ` on a ${r.bottomStrip} mm bottom strip` : ""}.` : `Walls: ${r.stdHeight} mm standard panels + top panel to the slab.`);
  if (r.wallWidths.length) out.push(`Wall panel widths: ${r.wallWidths.join(", ")} mm.`);
  out.push(`Deck: ${r.deckLengths.join(" / ")} mm lengths${r.deckWidths.length ? `, widths ${r.deckWidths[0]}…${r.deckWidths[r.deckWidths.length - 1]}` : ""}; mid beam ${r.midBeam} mm, prop head ${r.propHead[0]} × ${r.propHead[1]}, props @ ≤ ${r.propSpacing} m.`);
  out.push(`${r.tie === "flat" ? "Flat ties" : "Tie rods"} @ ${r.tieH} × ${r.tieV} mm.`);
  if (r.supportSets > 1) out.push(`Props and support heads stay up for ${r.supportSets} floors (${r.supportSets} sets).`);
  if (r.columnsSeparate) out.push(`Columns / shear walls cast first with their own column formwork${r.columnFirstCast ? ` (up to ${r.columnFirstCast} mm)` : ""}.`);
  if (r.lossPct) out.push(`${r.lossPct} % added on small parts (pins, wedges, ties).`);
  return out;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function loadLayoutRules(supabase: any): Promise<LayoutRules> {
  const { data } = await supabase.from("measurement_rules").select("layout").maybeSingle();
  return normaliseLayoutRules(data?.layout);
}
