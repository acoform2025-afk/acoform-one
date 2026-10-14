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
import { normaliseTableStyles, type TableStyles } from "@/lib/floor-plans/table-styles";

export type FormworkSystem = "tierod" | "flattie" | "acoform";

export type LayoutRules = {
  system: FormworkSystem;
  // walls
  wallWidths: number[];          // mm, preferred widths (empty = panel catalogue)
  stdHeight: number;             // standard wall panel height (tie-rod / ACOFORM)
  fullHeight: boolean;           // one full-height wall panel per face (flat-tie) instead of standard + top panel
  bottomStrip: number;           // mm strip under full-height panels (flat-tie R40 / R50), 0 = none
  minFiller: number;             // fillers narrower than this are solid strips
  propKn: number;                // kN — safe load of one prop (the design check warns above it; 0 = off)
  deckPlywoodMax: number;        // m² — a deck special up to this size is plywood on battens; a larger one is cut to shape at the factory
  internalCorner: number;        // mm leg of the internal corner (IC 100 × 100)
  internalCornerLeg: number;     // second leg of the internal corner, mm (Cosmos IC 100 × 125)
  wallEcAngles: boolean;         // external corner angles on outside wall corners (off: outside corners formed by external wall panels WE)
  columnSetPct: number;          // column sets bought, % of all column / core faces (sets are re-used; Cosmos Royce One ≈ 64 %)
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
  soffitCornerLeg: number;       // soffit-corner leg down the wall / column face, mm (Cosmos SCU 100 × 125)
  beamCapLeg: number;            // soffit-corner (beam cap) leg down the beam sides, mm (Cosmos SET / SER 175 … 250)
  bothLegs: boolean;             // corner / soffit-corner area counted on both legs (Indian BOM practice) — else one leg
  kickerCornerLen: number;       // kicker corner piece at every slab-edge corner, length mm (0 = none)
  upstandMm: number;             // upstand / planter wall height when the layer name gives none, mm
  propSpacing: number;           // max prop spacing, m
  supportSets: number;           // sets of prop heads / props in use (props stay up for this many floors)
  // beams, columns, stairs
  beamLenStep: number;           // beam side / bottom panel length step, mm
  columnsSeparate: boolean;      // columns and shear walls cast first with their own column formwork
  columnFirstCast: number;       // height of that first column pour, mm
  coresWithColumns: boolean;     // lift cores / L-shaped shear walls drawn on column layers go with the column set (else with the walls)
  stairClosed: boolean;          // closed (fully enclosed) staircase: tread cover panels on every step as well as riser shutters
  stairStyle: "india" | "china"; // stair panel convention: Indian Mivan (D 700 rows + 150 prop strips, SPTR/SPTREC, SPGUN/SPCOVER) or Chinese dog-tooth (400 soffit, DT, TS)
  // accessories
  lossPct: number;               // extra % on small parts (pins, wedges, ties, sleeves)
  sparePct: Record<string, number>;   // site spare % per panel family (learned from site reports), e.g. { deck: 2 }
  tableStyles?: TableStyles;     // columns / order / headings of the Excel lists
  pk?: PkRules;                  // detailed beam / wall rules (priority lists, back-ribs, K-plates, props)
};

// ---------- detailed (PKPM-style) rules: beam + wall tabs, priority lists, back-ribs, K-plates, props ----------
export type PropGroup = { maxBeamW: number; extend: number; width: number };
export type PkRules = {
  enabled: boolean;                   // off = lists/layout use the simple rules above only
  // beam tab
  beamTallVertMm: number;             // beam side taller than this: panels go vertical
  beamSideWidths: number[];           // beam side panel width priority (try in order)
  beamSideLens: number[];             // beam side panel length priority
  beamMinSplit: number;               // min split width
  beamSplitWidths: number[];          // beam cross-direction split width priority
  beamKWidth: number; beamKLens: number[]; beamKUpturn50: boolean;
  beamRibLens: number[]; beamRibWidth: number; beamRibFromBeam: number; beamRib2Height: number; beamRib2From: number; beamRibTie: number;
  beamCornerWidth: number; beamCornerOut: number;
  beamBottomMode: "auto" | "slab" | "wall";
  beamBottomLens: number[]; beamBottomMin: number;
  propGroups: PropGroup[];            // beam-bottom props by beam width limit
  propSpread: "even" | "multiple100" | "maxlen";
  beamAutoRib: boolean; beamAutoProps: boolean; beamTiePlate: boolean; beamUseSupport: boolean; beam200250Support: boolean;
  // wall tab
  wallWidthPriority: number[];        // wall panel width priority
  wallPanelWidth: number;
  clampMinGap: number;                // min gap of square-tube clamp
  wallKHeight: number; wallKMin: number; wallKLens: number[];
  ribHeights: number[];               // back-rib centre heights, mm
  tubeHeights: number[];              // square-tube centre heights, mm
  tubeStagger: boolean;               // stagger tubes floor to floor
  ribWidth: number; rib45Width: number; tubeWidth: number;
  ribMax: number; tubeMax: number; ribGap: number;
  ribEndExt: number; angleExt: number; diagExt: number; uClip: number;
  bottomAngle: number; sunkAngle: number; insideFromFloor: number; sunkC: number; cornerFloorGap: number;
  // slab tab (楼面)
  slabCornerWidth: number; slabCornerLens: number[]; slabInnerCornerLen: number; slabCornerMin: number;
  slabPanelWidths: number[]; slabPanelLens: number[]; slabPanelMinW: number; slabPanelMinL: number; slabFirstLen: number; slabFirstEqLast: boolean;
  slabRemainEvenAt: number; slabRemainCrossAt: number;
  joistMidLens: number[]; joistEdgeMin: number; joistEdgeMax: number; joistEdgeLensOn: boolean; joistEdgeLens: number[]; joistUneven: boolean; joistMaxDiff: number;
  autoSlabProps: boolean; slabDirection: "auto" | "across" | "along";
  wallAutoTie: boolean; wallAutoRib: boolean; wallAutoBrace: boolean; wallPanelWithAngle: boolean; wallTiePlate: boolean; extWallUpturn50: boolean;
};

export const DEFAULT_PK: PkRules = {
  enabled: false,
  beamTallVertMm: 550, beamSideWidths: [400, 300, 200], beamSideLens: [1100, 1000, 900], beamMinSplit: 100, beamSplitWidths: [400, 250, 200],
  beamKWidth: 0, beamKLens: [1100, 1000, 900], beamKUpturn50: true,
  beamRibLens: [2500, 2000, 1200], beamRibWidth: 50, beamRibFromBeam: 250, beamRib2Height: 750, beamRib2From: 150, beamRibTie: 1000,
  beamCornerWidth: 0, beamCornerOut: 50, beamBottomMode: "auto", beamBottomLens: [1000, 900, 700], beamBottomMin: 100,
  propGroups: [{ maxBeamW: 150, extend: 15, width: 200 }, { maxBeamW: 200, extend: 15, width: 150 }, { maxBeamW: 99999, extend: 10, width: 150 }],
  propSpread: "even", beamAutoRib: true, beamAutoProps: false, beamTiePlate: false, beamUseSupport: false, beam200250Support: true,
  wallWidthPriority: [400, 300, 200], wallPanelWidth: 500, clampMinGap: 1000, wallKHeight: 300, wallKMin: 500, wallKLens: [1500, 1200, 1000],
  ribHeights: [250, 800, 1600, 2500], tubeHeights: [275, 1075, 1975], tubeStagger: true,
  ribWidth: 60, rib45Width: 60, tubeWidth: 50, ribMax: 3000, tubeMax: 3500, ribGap: 20, ribEndExt: 180, angleExt: 22, diagExt: 30, uClip: 400,
  bottomAngle: 40, sunkAngle: 65, insideFromFloor: 50, sunkC: 50, cornerFloorGap: 5,
  slabCornerWidth: 100, slabCornerLens: [1600, 1400, 700], slabInnerCornerLen: 400, slabCornerMin: 300,
  slabPanelWidths: [400, 300, 300], slabPanelLens: [1200, 1100, 1000], slabPanelMinW: 100, slabPanelMinL: 500, slabFirstLen: 1000, slabFirstEqLast: false,
  slabRemainEvenAt: 500, slabRemainCrossAt: 400,
  joistMidLens: [1000, 600], joistEdgeMin: 350, joistEdgeMax: 750, joistEdgeLensOn: false, joistEdgeLens: [600, 400], joistUneven: true, joistMaxDiff: 100,
  autoSlabProps: false, slabDirection: "auto",
  wallAutoTie: false, wallAutoRib: true, wallAutoBrace: false, wallPanelWithAngle: true, wallTiePlate: false, extWallUpturn50: true,
};

const pnum = (v: unknown, d: number, lo: number, hi: number) => { const n = Number(v); return v === null || v === undefined || v === "" || !Number.isFinite(n) ? d : Math.min(hi, Math.max(lo, n)); };
const pbool = (v: unknown, d: boolean) => (typeof v === "boolean" ? v : d);
/** Priority list: keeps the order given (first = tried first). */
const plist = (v: unknown, d: number[], lo: number, hi: number) => {
  const a = Array.isArray(v) ? v : typeof v === "string" ? v.split(/[\s,;\-]+/) : null;
  if (!a) return d;
  const o = a.map(Number).filter((x) => Number.isFinite(x) && x >= lo && x <= hi);
  return o.length ? o : d;
};

export function normalisePk(raw: unknown): PkRules {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const d = DEFAULT_PK;
  const pg = Array.isArray(r.propGroups) && r.propGroups.length ? (r.propGroups as Record<string, unknown>[]).slice(0, 5).map((g, i) => ({
    maxBeamW: pnum(g?.maxBeamW, d.propGroups[Math.min(i, 2)].maxBeamW, 50, 99999), extend: pnum(g?.extend, d.propGroups[Math.min(i, 2)].extend, 0, 200), width: pnum(g?.width, d.propGroups[Math.min(i, 2)].width, 50, 400),
  })) : d.propGroups;
  return {
    enabled: pbool(r.enabled, d.enabled),
    beamTallVertMm: pnum(r.beamTallVertMm, d.beamTallVertMm, 200, 2000),
    beamSideWidths: plist(r.beamSideWidths, d.beamSideWidths, 50, 1200), beamSideLens: plist(r.beamSideLens, d.beamSideLens, 200, 2400),
    beamMinSplit: pnum(r.beamMinSplit, d.beamMinSplit, 0, 400), beamSplitWidths: plist(r.beamSplitWidths, d.beamSplitWidths, 50, 1200),
    beamKWidth: pnum(r.beamKWidth, d.beamKWidth, 0, 600), beamKLens: plist(r.beamKLens, d.beamKLens, 200, 2400), beamKUpturn50: pbool(r.beamKUpturn50, d.beamKUpturn50),
    beamRibLens: plist(r.beamRibLens, d.beamRibLens, 300, 6000), beamRibWidth: pnum(r.beamRibWidth, d.beamRibWidth, 20, 200),
    beamRibFromBeam: pnum(r.beamRibFromBeam, d.beamRibFromBeam, 0, 1000), beamRib2Height: pnum(r.beamRib2Height, d.beamRib2Height, 0, 2000),
    beamRib2From: pnum(r.beamRib2From, d.beamRib2From, 0, 1000), beamRibTie: pnum(r.beamRibTie, d.beamRibTie, 200, 2500),
    beamCornerWidth: pnum(r.beamCornerWidth, d.beamCornerWidth, 0, 300), beamCornerOut: pnum(r.beamCornerOut, d.beamCornerOut, 0, 200),
    beamBottomMode: r.beamBottomMode === "slab" || r.beamBottomMode === "wall" ? r.beamBottomMode : "auto",
    beamBottomLens: plist(r.beamBottomLens, d.beamBottomLens, 200, 2400), beamBottomMin: pnum(r.beamBottomMin, d.beamBottomMin, 0, 600),
    propGroups: pg,
    propSpread: r.propSpread === "multiple100" || r.propSpread === "maxlen" ? r.propSpread : "even",
    beamAutoRib: pbool(r.beamAutoRib, d.beamAutoRib), beamAutoProps: pbool(r.beamAutoProps, d.beamAutoProps), beamTiePlate: pbool(r.beamTiePlate, d.beamTiePlate),
    beamUseSupport: pbool(r.beamUseSupport, d.beamUseSupport), beam200250Support: pbool(r.beam200250Support, d.beam200250Support),
    wallWidthPriority: plist(r.wallWidthPriority, d.wallWidthPriority, 50, 1200), wallPanelWidth: pnum(r.wallPanelWidth, d.wallPanelWidth, 100, 1200),
    clampMinGap: pnum(r.clampMinGap, d.clampMinGap, 200, 2500),
    wallKHeight: pnum(r.wallKHeight, d.wallKHeight, 100, 800), wallKMin: pnum(r.wallKMin, d.wallKMin, 100, 1500), wallKLens: plist(r.wallKLens, d.wallKLens, 200, 2400),
    ribHeights: plist(r.ribHeights, d.ribHeights, 50, 4000), tubeHeights: plist(r.tubeHeights, d.tubeHeights, 50, 4000), tubeStagger: pbool(r.tubeStagger, d.tubeStagger),
    ribWidth: pnum(r.ribWidth, d.ribWidth, 20, 200), rib45Width: pnum(r.rib45Width, d.rib45Width, 20, 200), tubeWidth: pnum(r.tubeWidth, d.tubeWidth, 20, 200),
    ribMax: pnum(r.ribMax, d.ribMax, 500, 8000), tubeMax: pnum(r.tubeMax, d.tubeMax, 500, 8000), ribGap: pnum(r.ribGap, d.ribGap, 0, 100),
    ribEndExt: pnum(r.ribEndExt, d.ribEndExt, 0, 500), angleExt: pnum(r.angleExt, d.angleExt, 0, 200), diagExt: pnum(r.diagExt, d.diagExt, 0, 200), uClip: pnum(r.uClip, d.uClip, 100, 1000),
    bottomAngle: pnum(r.bottomAngle, d.bottomAngle, 0, 200), sunkAngle: pnum(r.sunkAngle, d.sunkAngle, 0, 200), insideFromFloor: pnum(r.insideFromFloor, d.insideFromFloor, 0, 200),
    sunkC: pnum(r.sunkC, d.sunkC, 0, 200), cornerFloorGap: pnum(r.cornerFloorGap, d.cornerFloorGap, 0, 50),
    slabCornerWidth: pnum(r.slabCornerWidth, d.slabCornerWidth, 0, 300), slabCornerLens: plist(r.slabCornerLens, d.slabCornerLens, 200, 3000),
    slabInnerCornerLen: pnum(r.slabInnerCornerLen, d.slabInnerCornerLen, 100, 1500), slabCornerMin: pnum(r.slabCornerMin, d.slabCornerMin, 50, 1000),
    slabPanelWidths: plist(r.slabPanelWidths, d.slabPanelWidths, 50, 1200), slabPanelLens: plist(r.slabPanelLens, d.slabPanelLens, 300, 2400),
    slabPanelMinW: pnum(r.slabPanelMinW, d.slabPanelMinW, 0, 400), slabPanelMinL: pnum(r.slabPanelMinL, d.slabPanelMinL, 0, 1500),
    slabFirstLen: pnum(r.slabFirstLen, d.slabFirstLen, 300, 2400), slabFirstEqLast: pbool(r.slabFirstEqLast, d.slabFirstEqLast),
    slabRemainEvenAt: pnum(r.slabRemainEvenAt, d.slabRemainEvenAt, 0, 1500), slabRemainCrossAt: pnum(r.slabRemainCrossAt, d.slabRemainCrossAt, 0, 1500),
    joistMidLens: plist(r.joistMidLens, d.joistMidLens, 200, 3000), joistEdgeMin: pnum(r.joistEdgeMin, d.joistEdgeMin, 100, 2000), joistEdgeMax: pnum(r.joistEdgeMax, d.joistEdgeMax, 100, 3000),
    joistEdgeLensOn: pbool(r.joistEdgeLensOn, d.joistEdgeLensOn), joistEdgeLens: plist(r.joistEdgeLens, d.joistEdgeLens, 200, 3000),
    joistUneven: pbool(r.joistUneven, d.joistUneven), joistMaxDiff: pnum(r.joistMaxDiff, d.joistMaxDiff, 0, 1000),
    autoSlabProps: pbool(r.autoSlabProps, d.autoSlabProps), slabDirection: r.slabDirection === "across" || r.slabDirection === "along" ? r.slabDirection : "auto",
    wallAutoTie: pbool(r.wallAutoTie, d.wallAutoTie), wallAutoRib: pbool(r.wallAutoRib, d.wallAutoRib), wallAutoBrace: pbool(r.wallAutoBrace, d.wallAutoBrace),
    wallPanelWithAngle: pbool(r.wallPanelWithAngle, d.wallPanelWithAngle), wallTiePlate: pbool(r.wallTiePlate, d.wallTiePlate), extWallUpturn50: pbool(r.extWallUpturn50, d.extWallUpturn50),
  };
}

const range = (a: number, b: number, s: number) => { const o: number[] = []; for (let v = b; v >= a; v -= s) o.push(v); return o; };

export const PRESETS: Record<FormworkSystem, { label: string; note: string; rules: LayoutRules }> = {
  tierod: {
    label: "Tie-rod system · 2400 panel + top panel",
    note: "Indian practice (e.g. Royce One / Cosmos): 2400 wall panels with a top panel, widths in 25 mm steps, tie rods, 150 mm mid beam and prop heads, deck lengths sized to each room.",
    rules: {
      system: "tierod", wallWidths: range(125, 600, 25), stdHeight: 2400, fullHeight: false, bottomStrip: 0, minFiller: 100, deckPlywoodMax: 0.05, propKn: 20,
      internalCorner: 100, internalCornerLeg: 125, wallEcAngles: false, columnSetPct: 100, externalCorner: 63.5, kickerMm: 150, tie: "rod", tieH: 800, tieV: 600,
      deckWidths: range(200, 600, 25), deckLengths: [1200, 1050, 900, 850, 800], midBeam: 150, propHead: [150, 300],
      soffitCornerLen: 1800, soffitCornerW: 100, soffitCornerLeg: 125, beamCapLeg: 175, bothLegs: true, kickerCornerLen: 330, upstandMm: 250, propSpacing: 1.2, supportSets: 1, beamLenStep: 25, columnsSeparate: true, columnFirstCast: 2400, coresWithColumns: true, stairClosed: true, stairStyle: "india", lossPct: 5, sparePct: {},
    },
  },
  flattie: {
    label: "Flat-tie system · full-height panel",
    note: "Chinese practice (Guangzhou Motian, Poly Linyu 3# package): full-height wall panels Q (2700 outside, 2600 + 40/50 foot board R inside), widths in 50 mm steps up to 500, flat ties, keel ZL 100 × 1000 + end keels DL, prop heads PH 100 × 200, slab corner C 100 × 150, internal corner QZ 150 × 150, external K-board 200, beam side L / bottom LD / corner E, walers FT in 4 rows, props kept for 3 floors, 10 % loss on small parts.",
    rules: {
      system: "flattie", wallWidths: range(100, 500, 50), stdHeight: 2700, fullHeight: true, bottomStrip: 40, minFiller: 100, deckPlywoodMax: 0.05, propKn: 20,
      internalCorner: 150, internalCornerLeg: 150, wallEcAngles: true, columnSetPct: 100, externalCorner: 65, kickerMm: 200, tie: "flat", tieH: 450, tieV: 600,
      deckWidths: range(100, 600, 50), deckLengths: [1200, 1100, 900, 800, 600], midBeam: 100, propHead: [100, 200],
      soffitCornerLen: 1800, soffitCornerW: 100, soffitCornerLeg: 150, beamCapLeg: 150, bothLegs: true, kickerCornerLen: 0, upstandMm: 250, propSpacing: 1.2, supportSets: 3, beamLenStep: 50, columnsSeparate: false, columnFirstCast: 0, coresWithColumns: false, stairClosed: true, stairStyle: "china", lossPct: 10, sparePct: {},
    },
  },
  acoform: {
    label: "ACOFORM standard",
    note: "ACOFORM STD FAB drawings: catalogue wall panels (600 … 100) at 2400 with top panels / RK panels, 1200 deck panels, 100 mm mid beam and prop heads, tie rods.",
    rules: {
      system: "acoform", wallWidths: [], stdHeight: 2400, fullHeight: false, bottomStrip: 0, minFiller: 100, deckPlywoodMax: 0.05, propKn: 20,
      internalCorner: 100, internalCornerLeg: 100, wallEcAngles: true, columnSetPct: 100, externalCorner: 65, kickerMm: 100, tie: "rod", tieH: 800, tieV: 800,
      deckWidths: [], deckLengths: [1200], midBeam: 100, propHead: [100, 230],
      soffitCornerLen: 1200, soffitCornerW: 0, soffitCornerLeg: 0, beamCapLeg: 0, bothLegs: false, kickerCornerLen: 0, upstandMm: 250, propSpacing: 1.2, supportSets: 1, beamLenStep: 5, columnsSeparate: false, columnFirstCast: 0, coresWithColumns: false, stairClosed: true, stairStyle: "india", lossPct: 5, sparePct: {},
    },
  },
};

export const DEFAULT_LAYOUT_RULES = PRESETS.acoform.rules;

/** Rules for one floor plan: the company's own rules, or — when the plan has its own system (e.g. a test project in
 *  another system) — that system's ready-made values. */
export function rulesForPlan(company: LayoutRules, system?: string | null, overrides?: Partial<LayoutRules> | null): LayoutRules {
  const base = !system || system === company.system || !(system in PRESETS) ? company : normaliseLayoutRules({ ...PRESETS[system as FormworkSystem].rules, sparePct: {} });
  // values set for this plan only (e.g. the number of column sets bought for this project)
  return overrides && Object.keys(overrides).length ? normaliseLayoutRules({ ...base, ...overrides, system: base.system }) : base;
}

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
    deckPlywoodMax: num(r.deckPlywoodMax, d.deckPlywoodMax, 0, 5),
    propKn: num(r.propKn, d.propKn, 0, 200),
    internalCorner: num(r.internalCorner, d.internalCorner, 50, 300),
    internalCornerLeg: num(r.internalCornerLeg, d.internalCornerLeg, 50, 300),
    wallEcAngles: typeof r.wallEcAngles === "boolean" ? r.wallEcAngles : d.wallEcAngles,
    columnSetPct: num(r.columnSetPct, d.columnSetPct, 10, 100),
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
    soffitCornerLeg: num(r.soffitCornerLeg, d.soffitCornerLeg, 0, 400),
    beamCapLeg: num(r.beamCapLeg, d.beamCapLeg, 0, 400),
    bothLegs: typeof r.bothLegs === "boolean" ? r.bothLegs : d.bothLegs,
    kickerCornerLen: num(r.kickerCornerLen, d.kickerCornerLen, 0, 1200),
    upstandMm: num(r.upstandMm, d.upstandMm, 50, 2000),
    propSpacing: num(r.propSpacing, d.propSpacing, 0.6, 2.4),
    supportSets: Math.round(num(r.supportSets, d.supportSets, 1, 5)),
    beamLenStep: num(r.beamLenStep, d.beamLenStep, 5, 300),
    columnsSeparate: typeof r.columnsSeparate === "boolean" ? r.columnsSeparate : d.columnsSeparate,
    columnFirstCast: num(r.columnFirstCast, d.columnFirstCast, 0, 4000),
    coresWithColumns: typeof r.coresWithColumns === "boolean" ? r.coresWithColumns : d.coresWithColumns,
    stairClosed: typeof r.stairClosed === "boolean" ? r.stairClosed : d.stairClosed,
    stairStyle: r.stairStyle === "china" || r.stairStyle === "india" ? r.stairStyle : d.stairStyle,
    lossPct: num(r.lossPct, d.lossPct, 0, 50),
    sparePct: (() => { const o: Record<string, number> = {}; const sp = r.sparePct && typeof r.sparePct === "object" ? (r.sparePct as Record<string, unknown>) : {}; for (const [k, v] of Object.entries(sp)) { const n = Number(v); if (/^[a-z-]{2,12}$/.test(k) && Number.isFinite(n) && n > 0) o[k] = Math.min(25, n); } return o; })(),
    pk: normalisePk(r.pk),
    tableStyles: normaliseTableStyles(r.tableStyles),
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
  if (r.columnsSeparate) out.push(`Columns${r.coresWithColumns ? " and lift cores / L-walls" : ""} cast first with their own column formwork${r.columnFirstCast ? ` (up to ${r.columnFirstCast} mm)` : ""}.`);
  if (r.lossPct) out.push(`${r.lossPct} % added on small parts (pins, wedges, ties).`);
  const sp = Object.entries(r.sparePct ?? {}).filter(([, v]) => v > 0);
  if (sp.length) out.push(`Site spares (learned from site reports): ${sp.map(([k, v]) => `${k} ${v} %`).join(", ")}.`);
  if (r.pk?.enabled) out.push(`Detailed rules on: wall widths ${r.pk.wallWidthPriority.join(" → ")}, back-ribs at ${r.pk.ribHeights.join(" / ")} mm, tubes at ${r.pk.tubeHeights.join(" / ")} mm, beam sides vertical above ${r.pk.beamTallVertMm} mm, deck panels ${r.pk.slabPanelWidths.join(" → ")} wide × ${r.pk.slabPanelLens.join(" → ")} long.`);
  return out;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function loadLayoutRules(supabase: any): Promise<LayoutRules> {
  const { data } = await supabase.from("measurement_rules").select("layout").maybeSingle();
  return normaliseLayoutRules(data?.layout);
}
