/**
 * Floor-plan area take-off: data model + the formwork area formulas.
 * Pure functions, used by the measuring screen (browser) and shown on quotations.
 *
 * All drawn shapes are stored in "image pixels" of the plan picture; metersPerPx turns them into metres.
 * Areas are PER TYPICAL FLOOR: one aluminium formwork set is reused on every floor, so the set = typical floor + extra %
 * + the additional pieces non-typical floors need (first floor, terrace, refuge…). `floors` is for information only.
 */

import type { Building } from "./building";
import { DEFAULT_RULES, normaliseRules, type MeasureRules } from "./rules";

export type Pt = [number, number];
export type ShapeKind = "slab" | "opening" | "wall" | "column" | "beam" | "door" | "window" | "loft" | "separate";
/**
 * A drawn element. Optional sizes (mm) override the plan defaults:
 * wall: t = thickness, h = height · beam: b = width, d = depth · column: h = height · slab/opening: t = thickness.
 */
export type Shape = {
  id: string; kind: ShapeKind; pts: Pt[]; label?: string;
  t?: number; h?: number; b?: number; d?: number;
  sill?: number;   // window sill height above floor (mm)
  lvl?: number;    // slab level offset (mm, e.g. −50 sunken) · loft bottom level above floor (mm)
};
/** Door / window / loft defaults (mm). */
export const OPENING_DEFAULTS = { doorH: 2100, windowH: 1200, windowSill: 900, loftT: 75, loftLvl: 2100 };
export type ColumnRow = { w_mm: number; d_mm: number; qty: number };
/** Beam sides to shutter: side length (both sides) × (depth − slab). The beam bottom is already in the slab area. */
/**
 * Beam row. sides: 2 = internal beam (both sides below the slab), 1 = one side (edge beam inner side, or when the
 * length typed is already the total side length, as on the ACOFORM sheet). bottom: 1 = add the beam soffit
 * (only when it is outside the slab outline). Rows saved before sides existed mean "total side length".
 */
export type BeamRow = { label?: string; width_mm?: number; depth_mm: number; length_m: number; qty: number; sides?: number; bottom?: number; ext?: number };   // ext: 1 = outer face of an edge beam (full depth)
/** Staircase flight: waist soffit + risers + open side cheeks + landing soffit (all per flight × flights). */
export type StairRow = { label?: string; width_mm: number; risers: number; riser_mm: number; tread_mm: number; waist_mm: number; open_sides?: number; landing_m2?: number; flights: number };
/** Lump-sum items such as a staircase (ST1 = 100 m²). */
export type ExtraRow = { label: string; area_m2: number };
export type Params = {
  floorHeight: number; slabMm: number; floors: number;
  wallTopM2?: number;       // slab deduction for wall tops (m²)
  // figures typed in from the estimator's own measurement — replace what was read from the drawing
  slabM2?: number; ductM2?: number; wallLenM?: number; beamLenM?: number;
  includeEdges?: boolean;   // (unset = company rule)   // add slab / opening edge formwork (default on — IS 1200-5: edges of slabs are measured)
  minOpeningM2?: number;    // openings smaller than this are not deducted (IS 1200-5: 0.4 m²)
  extraPct?: number;        // add % on the typical-floor total (e.g. 10)
  beamDepthMm?: number;     // default beam depth (drawn beams and DXF beam layers)
  beamWidthMm?: number;     // default width of drawn beams
  scope?: Scope;            // what is formed with this formwork (unset = full)
  minWallMm?: number;      // thinnest wall that is concrete (walls read from paired lines); thinner pairs are blockwork / finishes
  autoLintels?: boolean;
  autoEdgeBeams?: boolean;  // edge beams under slab edges without a wall (balcony fronts) — default on when the drawing has no beam layers
  parapetMm?: number;       // balcony parapet height (walls with a railing on them), default 900
  sillMm?: number;          // window sill height (sill wall under windows found in wall openings), default 900    // beams / lintels over wall openings found on the drawing (default on)
  wallThkMm?: number;       // default thickness of drawn walls (3D view, wall tops)
};

/** Scope of the formwork order: full monolithic (Mivan) or a part of the structure. */
export type Scope = "full" | "vertical" | "columns" | "framed" | "deck";
export const SCOPES: Record<Scope, { label: string; what: string; parts: AreaItem["group"][] }> = {
  full: { label: "Full (Mivan / monolithic)", what: "slab, walls, beams, columns, stairs, upstands", parts: ["slab", "deduct", "edge", "wall", "opening", "column", "beam", "loft", "extra"] },
  vertical: { label: "Vertical only", what: "walls and columns (deck by others)", parts: ["wall", "opening", "column"] },
  columns: { label: "Columns only", what: "columns", parts: ["column"] },
  framed: { label: "Deck + beams + columns", what: "slab, beams, columns, stairs (walls in blockwork)", parts: ["slab", "deduct", "edge", "column", "beam", "loft", "extra"] },
  deck: { label: "Deck + beams", what: "slab, beams, stairs", parts: ["slab", "deduct", "edge", "beam", "loft", "extra"] },
};

/** One line of the formwork area list (like an "estimate FM area list"). */
export type AreaItem = { code: string; group: "slab" | "deduct" | "edge" | "wall" | "opening" | "column" | "beam" | "loft" | "extra"; label: string; calc: string; area: number };
/** Shell-plan title block and notes (stored with the take-off). */
export type ShellMeta = { drawingNo?: string; rev?: string; drawnBy?: string; checkedBy?: string; notes?: string; scaleNote?: string };
export type LayerRole = "ignore" | "walls" | "columns" | "slab" | "opening" | "beams" | "upstand";

export type Takeoff = {
  v: 1;
  params: Params;
  metersPerPx: number | null;          // null = scale not set yet (PDF / picture)
  calib?: { p1: Pt; p2: Pt; mm: number };
  image?: { w: number; h: number; page?: number };
  shapes: Shape[];
  columns: ColumnRow[];                // columns typed in by size
  beams: BeamRow[];
  extras?: ExtraRow[];
  nonTypical?: ExtraRow[];
  auto?: { done: boolean; note?: string };   // automatic first reading of the drawing — runs once per plan, never again             // additional formwork for non-typical floors (added once to the set, not per floor)
  stairs?: StairRow[];
  shell?: ShellMeta;
  system?: "tierod" | "flattie" | "acoform";   // formwork system for this plan only (unset = company setting)
  building?: Building;                  // every level of the building (read from the drawing) + open questions — on the typical plan
  parentPlan?: string;                  // this plan is one level's own plan, made from that typical plan
  ruleOverrides?: { columnSetPct?: number };   // layout-rule values for this plan only
  dxf?: { units: DxfUnits; layerRoles: Record<string, LayerRole>; wallsDrawn: "faces" | "centre"; region?: [number, number, number, number] | null;
    excludeM?: [number, number, number, number][];   // boxes (plan metres) the user marked "not part of this floor"
    includeM?: [number, number, number, number][];   // boxes (plan metres) the user marked "part of this floor"
    approved?: { at: string; by?: string; fp: Record<string, number | string> } | null;   // the reading the user approved (its fingerprint); later reads are compared with it
  };
};

export type DxfUnits = "mm" | "cm" | "m" | "in" | "ft";
export const UNIT_TO_M: Record<DxfUnits, number> = { mm: 0.001, cm: 0.01, m: 1, in: 0.0254, ft: 0.3048 };

/** Areas/lengths the DXF reader found automatically (already in metres). */
export type DxfAuto = {
  onFloor?: (p: { pts: Pt[]; layer: string; closed: boolean }) => boolean;   // the floor island: is this drawing path part of the floor read (region + connected structure)?
  notes?: { kind: "dropped" | "detail" | "cloud" | "wall-column" | "label-stair" | "bay" | "unwalled" | "beam-size"; box: [number, number, number, number]; n?: number; text?: string }[];   // what the reader decided on its own (drawing units) — for the review screen
  slabArea: number; slabPerimeter: number;
  openingArea: number; openingPerimeter: number;
  wallLineLength: number;                           // total length of lines on wall layers
  wallPairs?: { byThk: Record<number, number>; unpaired: number };   // walls rebuilt from pairs of loose lines: face length (m) by thickness (mm), single lines left out (m)
  beamLineLength?: number;                          // total length of lines on beam layers without a size (= beam side length)
  beamSized?: { b: number; d: number; len: number; bottom: number; count: number; inner?: number; outer?: number; lintel?: number }[];   // inner / outer: side-face length (m) with / without slab beyond; lintel: length of beams that are wall lintels   // beams sized by their layer name: b, d mm; len m (clear of walls / columns); bottom m²
  beamRings?: Pt[][];                               // outlines of the sized beams (drawing units) — deck zones stop at them
  columnRings?: Pt[][];                             // outlines of the columns (drawing units)
  columns: { w: number; d: number; perimeter: number; area: number; round?: boolean }[];
  wallTopArea?: number;                             // wall outlines merged (overlaps counted once), m²
  slabFromWalls?: boolean;                          // no slab layer: slab = outer outline of the walls
  slabLoops?: Pt[][];                               // slab outlines used (drawing units) — for deck layout / display
  openingLoops?: Pt[][];                            // duct / lift cut-outs used (drawing units)
  wallRings?: Pt[][];                               // merged wall outlines (drawing units) — every edge is a wall face
  wallLoose?: Pt[][];                               // wall lines not part of an outline (drawing units)
  columnWallEdges?: string[];                       // "ring:edge" of wall faces drawn on column layers (lift cores, shear walls)
  sunk?: { depth: number; perimeter: number; area: number }[];   // sunk slab outlines: drop depth mm, edge m, area m²
  wallSeparate?: number[];                          // wall outline rings inside a "separate set" area (core cast separately)
  separateWall?: { faces: number; cols: number; colPerimeter: number };   // what was left out of the typical set, m
  wallOpenings?: { ring: number; edge: number; t0: number; t1: number; door: boolean; thk: number }[];   // door / window stretches of wall faces (drawing units along wallRings[ring] edge `edge`)
  stairCount?: number;                              // staircases found on stair layers
  stairBoxes?: [number, number, number, number][];  // drawing units
  wetRooms?: { label: string; area: number; perimeter: number; box: [number, number, number, number] }[];   // toilets / kitchens / balconies found by their names (m², m)
  stairsMeasured?: { box: [number, number, number, number]; flights: { width: number; treads: number; tread: number }[]; landingM2: number }[];   // flights read from the tread lines (mm)
  beamRingDepth?: number[];                         // mm, depth of each beam ring
  upstands?: { label: string; h: number; length: number; parapet?: boolean }[];   // upstand / planter walls on the slab: h mm, face length m (both faces)
  gapSpan?: number;                                 // openings in wall lines (door / window / passage widths), m
  gapCount?: number;
  gapSoffit?: number;                               // underside of the beams over wall openings (span × wall thickness), m²
  windowGaps?: { count: number; span: number; top: number };   // openings with a window: sill wall under it (span m, sill top m²)
  edgeBeamLength?: number;                          // slab edges with no full-height wall under them (balcony fronts, open edges), m
  edgeBeams?: [Pt, Pt][];                           // those edges (drawing units), for drawings
  parapetRings?: Pt[][];                            // balcony parapet outlines (drawing units)
  gaps?: { a: Pt; b: Pt; span: number; thk?: number }[];
  dwGaps?: { a: Pt; b: Pt; thk: number; door: boolean; free?: boolean }[];   // doors / windows standing in a break of the wall: the opening's centre line (drawing units), wall thickness m  // a, b in drawing units; span, thk in m
};

export type Totals = {
  plan_area: number;       // floor plate: slab outline − openings (ducts/shafts)
  slab_soffit: number;     // plan area − wall tops − column footprints
  slab_edge: number;       // slab + opening edges × slab thickness
  wall_length: number;     // centre-line length
  wall_area: number;       // both faces × clear height
  column_count: number;
  column_area: number;     // perimeter × clear height
  column_sizes: { size: string; qty: number }[];
  beam_area: number;       // side length × (depth − slab)
  extra_area: number;      // staircase & other lump sums
  wall_top_area: number;   // deducted from the slab
  vertical_area: number;   // walls + columns (quick quote "Vertical set" basis)
  contact_area: number;    // total formwork contact area for one typical floor
  extra_pct: number;
  typical_quote: number;   // typical floor contact area + extra %
  nontypical_area: number; // additional formwork for non-typical floors
  quote_area: number;      // formwork set = typical + extra % + non-typical additions (quick quote "Full set" basis)
  clear_height: number;
  floors: number;
  params: Takeoff["params"];
  source: "manual" | "dxf" | "mixed";
  wall_top_drawn: number;  // wall tops of drawn walls (length × thickness), offered as the deduction
  items: AreaItem[];
  rules?: MeasureRules;     // company measurement rules used for this take-off
  wall_options?: WallOptions;   // both wall options of this plan (all walls concrete / thin walls in block), for quotes with options
};
/** The two wall options of a plan: contact and quote (+extra %) areas, and the block-wall limit. */
export type WallOptions = { all: { contact: number; quote: number }; thin: { contact: number; quote: number }; limitMm: number; chosen: "all" | "thin" };
export const WALL_OPTION_LABEL = (limitMm: number) => ["All walls in concrete", `Walls under ${limitMm} mm in blockwork by others`] as const;

export const emptyTakeoff = (): Takeoff => ({
  v: 1, params: { floorHeight: 3, slabMm: 150, floors: 1 }, metersPerPx: null, shapes: [], columns: [], beams: [],
});

export function polyArea(pts: Pt[]): number {
  let a = 0;
  for (let i = 0; i < pts.length; i++) { const [x1, y1] = pts[i]; const [x2, y2] = pts[(i + 1) % pts.length]; a += x1 * y2 - x2 * y1; }
  return Math.abs(a) / 2;
}
export function polyLength(pts: Pt[], closed: boolean): number {
  let l = 0;
  for (let i = 0; i < pts.length - (closed ? 0 : 1); i++) { const [x1, y1] = pts[i]; const [x2, y2] = pts[(i + 1) % pts.length]; l += Math.hypot(x2 - x1, y2 - y1); }
  return l;
}
function bboxSize(pts: Pt[]): [number, number] {
  const xs = pts.map((p) => p[0]); const ys = pts.map((p) => p[1]);
  return [Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)];
}

/** Value of one drawn shape in metres (area m² for areas, length m for walls). */
export function shapeMeasure(s: Shape, mpp: number): { area: number; length: number; perimeter: number } {
  const open = s.kind === "wall" || s.kind === "beam" || s.kind === "door" || s.kind === "window";
  const length = polyLength(s.pts, !open) * mpp;
  const area = !open && s.pts.length >= 3 ? polyArea(s.pts) * mpp * mpp : 0;
  return { area, length: open ? length : 0, perimeter: open ? 0 : length };
}

const r2 = (n: number) => Math.round(n * 100) / 100;

const n2 = (v: number) => v.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const n3 = (v: number) => v.toLocaleString("en-IN", { minimumFractionDigits: 3, maximumFractionDigits: 3 });

/** Staircase flight formwork (m²): waist soffit (width × sloped length) + riser faces + open side cheeks + landing soffit, × flights. */
export function stairBreakdown(st: StairRow) {
  const f = Math.max(0, Math.round(Number(st.flights) || 0)), n = Math.max(0, Math.round(Number(st.risers) || 0));
  const W = Math.max(0, Number(st.width_mm) || 0) / 1000, R = Math.max(0, Number(st.riser_mm) || 0) / 1000, T = Math.max(0, Number(st.tread_mm) || 0) / 1000, w = Math.max(0, Number(st.waist_mm) || 0) / 1000;
  if (!f || !n || !W) return null;
  const slope = n * Math.hypot(R, T);
  const soffit = W * slope, risers = n * W * R;
  const cheeks = Math.max(0, Math.min(2, Math.round(Number(st.open_sides) || 0))) * (n * R * T / 2 + slope * w);
  const landing = Math.max(0, Number(st.landing_m2) || 0);
  return { f, n, R, T, slope, soffit, risers, cheeks, landing, total: (soffit + risers + cheeks + landing) * f };
}

/** Stair rows from the flights measured on the drawing: risers per flight = tread lines (+1 where that gives a riser
 *  nearer 150–180 mm), riser height = floor height ÷ risers of the staircase, one open side per flight (stair well). */
export function autoStairRows(auto: DxfAuto | null | undefined, floorHeight: number): { row: StairRow; desc: string; width: number }[] {
  const out: { row: StairRow; desc: string; width: number }[] = [];
  const H = floorHeight * 1000;
  for (const st of auto?.stairsMeasured ?? []) {
    if (!st.flights.length) continue;
    const lines = st.flights.reduce((s, f) => s + f.treads, 0), nF = st.flights.length;
    const pick = [lines, lines + nF].map((n) => ({ n, r: H / n })).sort((a, b) => Math.abs(a.r - 165) - Math.abs(b.r - 165))[0];
    const risersTotal = pick.n, riser = H / risersTotal;
    if (riser < 120 || riser > 200 || lines < 4) continue;      // not a staircase (a symbol, a ramp): the allowance applies
    const width = Math.round(st.flights.reduce((s, f) => s + f.width, 0) / nF), tread = Math.round(st.flights.reduce((s, f) => s + f.tread, 0) / nF);
    // one row for the whole staircase: risers per flight averaged (the area is the same), landing shared
    out.push({
      row: { width_mm: width, risers: Math.round(risersTotal / nF), riser_mm: Math.round(riser), tread_mm: tread, waist_mm: 150, open_sides: 1, landing_m2: st.landingM2 / nF, flights: nF },
      desc: `${nF} flight${nF > 1 ? "s" : ""}, ${risersTotal} risers ${Math.round(riser)}/${tread}, ${(width / 1000).toFixed(2)} m wide${st.landingM2 ? `, landing ${st.landingM2.toFixed(1)} m²` : ""}`,
      width,
    });
  }
  return out;
}

export function computeTotals(t: Takeoff, auto?: DxfAuto | null, companyRules?: Partial<MeasureRules> | null): Totals {
  const { floorHeight, slabMm, floors } = t.params;
  const base = normaliseRules(companyRules ?? DEFAULT_RULES);
  const rules: MeasureRules = {
    ...base,
    minOpeningM2: t.params.minOpeningM2 != null && String(t.params.minOpeningM2) !== "" ? Math.max(0, Number(t.params.minOpeningM2) || 0) : base.minOpeningM2,
    slabEdges: t.params.includeEdges != null ? t.params.includeEdges : base.slabEdges,
    extraPct: t.params.extraPct != null && String(t.params.extraPct) !== "" ? Math.min(100, Math.max(0, Number(t.params.extraPct) || 0)) : base.extraPct,
  };
  const slab = Math.max(0, slabMm) / 1000;
  const H = Math.max(0, floorHeight - slab);
  const mpp = t.metersPerPx ?? 0;
  const items: AreaItem[] = [];
  const cnt: Record<string, number> = {};
  const code = (p: string, own?: string) => (own && own.trim() ? own.trim().slice(0, 20) : `${p}${(cnt[p] = (cnt[p] ?? 0) + 1)}`);
  const hOf = (s: Shape) => (s.h && s.h > 0 ? s.h / 1000 : H);
  const minOpen = rules.minOpeningM2;

  let slabArea = 0, slabPer = 0, openArea = 0, openPer = 0, wallCentre = 0, wallFaces = 0, wallArea = 0, wallTopDrawn = 0;
  let colCount = 0, colPerimeter = 0, colFoot = 0, colArea = 0, beamArea = 0, loftArea = 0, lintelAuto = 0;
  const sizes = new Map<string, number>();
  const addSize = (wm: number, dm: number, q: number) => {
    const a = Math.round(Math.min(wm, dm) * 1000 / 5) * 5, b = Math.round(Math.max(wm, dm) * 1000 / 5) * 5;
    const k = `${a} × ${b} mm`; sizes.set(k, (sizes.get(k) ?? 0) + q);
  };
  const beamSides = (len: number, dMm: number) => 2 * len * Math.max(0, dMm / 1000 - slab);

  if (mpp > 0) {
    for (const s of t.shapes) {
      const m = shapeMeasure(s, mpp);
      if (s.kind === "slab") {
        slabArea += m.area; slabPer += m.perimeter;
        items.push({ code: code("S", s.label), group: "slab", label: `Slab${s.t ? ` ${s.t} thk` : ""}${s.lvl ? ` (${s.lvl > 0 ? "+" : ""}${s.lvl})` : ""}`, calc: `outline ${n2(m.area)} m²`, area: m.area });
      } else if (s.kind === "opening") {
        if (m.area < minOpen) { items.push({ code: code("D", s.label), group: "deduct", label: `Duct / opening under ${minOpen} m² — not deducted (IS 1200-5)`, calc: `${n2(m.area)} m²`, area: 0 }); continue; }
        openArea += m.area; openPer += m.perimeter;
        items.push({ code: code("D", s.label), group: "deduct", label: "Duct / opening", calc: `− ${n2(m.area)} m²`, area: -m.area });
      } else if (s.kind === "wall") {
        const h = hOf(s), a = 2 * m.length * h;
        wallCentre += m.length; wallFaces += 2 * m.length; wallArea += a;
        wallTopDrawn += m.length * ((s.t && s.t > 0 ? s.t : Number(t.params.wallThkMm) || 150) / 1000);
        items.push({ code: code("W", s.label), group: "wall", label: `Wall${s.t ? ` ${s.t} thk` : ""}`, calc: `2 × ${n2(m.length)} m × ${n3(h)} m`, area: a });
      } else if (s.kind === "column") {
        const h = hOf(s), a = m.perimeter * h;
        colCount += 1; colPerimeter += m.perimeter; colFoot += m.area; colArea += a;
        const [w, d] = bboxSize(s.pts); addSize(w * mpp, d * mpp, 1);
        items.push({ code: code("C", s.label), group: "column", label: `Column ${Math.round(w * mpp * 1000)}×${Math.round(d * mpp * 1000)}`, calc: `${n2(m.perimeter)} m × ${n3(h)} m`, area: a });
      } else if (s.kind === "beam") {
        const dMm = s.d && s.d > 0 ? s.d : Number(t.params.beamDepthMm) || 600;
        const bMm = s.b && s.b > 0 ? s.b : Number(t.params.beamWidthMm) || 200;
        const a = beamSides(m.length, dMm);
        beamArea += a;
        items.push({ code: code("B", s.label), group: "beam", label: `Beam ${bMm}×${dMm}`, calc: `2 × ${n2(m.length)} m × (${n3(dMm / 1000)} − ${n3(slab)}) m`, area: a });
      } else if (s.kind === "door" || s.kind === "window") {
        // opening in a drawn wall: both faces come off the wall; the concrete reveals (sides, top, sill) are added
        const isDoor = s.kind === "door";
        const w = m.length, h = (s.h && s.h > 0 ? s.h : isDoor ? OPENING_DEFAULTS.doorH : OPENING_DEFAULTS.windowH) / 1000;
        const thk = (s.t && s.t > 0 ? s.t : Number(t.params.wallThkMm) || 150) / 1000;
        if (w * h < minOpen) continue;                                   // small opening: not deducted, sides not added (IS 1200-5)
        const faces = 2 * w * h, reveal = (2 * h + w * (isDoor ? 1 : 2)) * thk;
        const c = code(isDoor ? "DR" : "WN", s.label);
        wallArea -= faces;
        items.push({ code: c, group: "opening", label: `${isDoor ? "Door" : "Window"} ${Math.round(w * 1000)}×${Math.round(h * 1000)} − faces`, calc: `− 2 × ${n2(w)} m × ${n3(h)} m`, area: -faces });
        if (!rules.reveals) continue;
        wallArea += reveal;
        items.push({ code: c, group: "opening", label: `${isDoor ? "Door" : "Window"} reveals`, calc: `(2 × ${n3(h)} + ${isDoor ? "" : "2 × "}${n2(w)}) m × ${n3(thk)} m`, area: reveal });
      } else if (s.kind === "loft") {
        const lt = (s.t && s.t > 0 ? s.t : OPENING_DEFAULTS.loftT) / 1000;
        const a = m.area + m.perimeter * lt;
        loftArea += a;
        items.push({ code: code("L", s.label), group: "loft", label: `Loft ${Math.round(lt * 1000)} thk`, calc: `${n2(m.area)} m² + ${n2(m.perimeter)} m × ${n3(lt)} m`, area: a });
      }
    }
  }
  if (auto) {
    if (auto.slabArea) { slabArea += auto.slabArea; slabPer += auto.slabPerimeter; items.push({ code: code("S"), group: "slab", label: auto.slabFromWalls ? "Slab outline (outer face of walls)" : "Slab outline (DXF layers)", calc: `outline ${n2(auto.slabArea)} m²`, area: auto.slabArea }); }
    if (auto.openingArea) { openArea += auto.openingArea; openPer += auto.openingPerimeter; items.push({ code: code("D"), group: "deduct", label: "Ducts / openings (DXF layers)", calc: `− ${n2(auto.openingArea)} m²`, area: -auto.openingArea }); }
    if (auto.wallLineLength) {
      const faces = t.dxf?.wallsDrawn === "centre" ? 2 * auto.wallLineLength : auto.wallLineLength;
      wallCentre += faces / 2; wallFaces += faces; wallArea += faces * H;
      const wp = auto.wallPairs, thk = wp ? Object.entries(wp.byThk).filter(([, v]) => v >= 1).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} mm ${Math.round(v)} m`).join(", ") : "";
      items.push({ code: code("W"), group: "wall", label: wp ? `Walls (from paired lines on the wall layers${thk ? ": " + thk : ""})` : "Walls (DXF layers)", calc: `${n2(faces)} m faces × ${n3(H)} m${wp && wp.unpaired >= 1 ? ` · ${n2(wp.unpaired)} m of single lines and thinner walls left out` : ""}`, area: faces * H });
    }
    // doors / windows found inside the walls (each face listed once; reveals shared by the two faces of a wall)
    const uM = UNIT_TO_M[t.dxf?.units ?? "mm"] ?? 0.001;
    let dN = 0, dLen = 0, dFace = 0, dRev = 0, wN = 0, wLen = 0, wFace = 0, wRev = 0;
    for (const o of auto.wallOpenings ?? []) {
      const w = (o.t1 - o.t0) * uM, h = (o.door ? OPENING_DEFAULTS.doorH : OPENING_DEFAULTS.windowH) / 1000, thk = (o.thk || Number(t.params.wallThkMm) || 150) / 1000;
      if (w * h < minOpen) continue;
      const rev = rules.reveals ? 0.5 * (2 * h + w * (o.door ? 1 : 2)) * thk : 0;
      if (o.door) { dN++; dLen += w; dFace += w * h; dRev += rev; } else { wN++; wLen += w; wFace += w * h; wRev += rev; }
    }
    for (const [door, n, len, face, rev] of [[true, dN, dLen, dFace, dRev], [false, wN, wLen, wFace, wRev]] as const) {
      if (!n) continue;
      wallArea -= face;
      items.push({ code: code(door ? "DR" : "WN"), group: "opening", label: `${door ? "Doors" : "Windows"} in walls (drawing, ${Math.round(n / 2)}) − faces`, calc: `− ${n2(len)} m of faces × ${n3((door ? OPENING_DEFAULTS.doorH : OPENING_DEFAULTS.windowH) / 1000)} m`, area: -face });
      if (rev > 0) { wallArea += rev; items.push({ code: code(door ? "DR" : "WN"), group: "opening", label: `${door ? "Door" : "Window"} reveals`, calc: "sides, head" + (door ? "" : ", sill") + " × wall thickness", area: rev }); }
    }
    if (auto.separateWall && (auto.separateWall.faces > 0 || auto.separateWall.cols > 0)) {
      const sw = auto.separateWall;
      items.push({ code: code("X"), group: "wall", label: "Separate set (core / cast separately) — not in the typical floor", calc: `${n2(sw.faces)} m wall faces${sw.cols ? ` + ${sw.cols} columns (${n2(sw.colPerimeter)} m)` : ""} left out`, area: 0 });
    }
    // upstands / planters on the slab: both faces (outline length) × height (layer name, else 250 mm)
    // kerbs along the walls of wet rooms (toilet / kitchen / balcony): both faces × kerb height — unless the drawing
    // marks sunk slabs on a layer (then those are measured as drop formwork instead)
    const kerb = Number(rules.wetKerbMm) || 0;
    if (kerb > 0 && auto.wetRooms?.length && !(auto.sunk ?? []).length) {
      const per = auto.wetRooms.reduce((s2, r) => s2 + r.perimeter, 0), a = 2 * per * (kerb / 1000);
      wallArea += a;
      items.push({ code: code("U"), group: "wall", label: `Kerbs at ${auto.wetRooms.length} wet rooms (${[...new Set(auto.wetRooms.map((r) => r.label))].slice(0, 4).join(", ")})`, calc: `2 × ${n2(per)} m × ${n3(kerb / 1000)} m`, area: a });
    }
    for (const up of auto.upstands ?? []) {
      const pMm = Number(t.params.parapetMm) || 900;
      const h = (up.parapet ? pMm : up.h || 250) / 1000, a = up.length * h;
      wallArea += a;
      items.push({ code: code("U"), group: "wall", label: up.parapet ? up.label : `Upstand / planter — ${up.label}`, calc: `${n2(up.length)} m faces × ${n3(h)} m${up.parapet ? " (parapet height)" : up.h ? "" : " (height not in the layer name: 250 mm)"}`, area: a });
    }
    for (const c of auto.columns) {
      colCount += 1; colPerimeter += c.perimeter; colFoot += c.area; colArea += c.perimeter * H; addSize(c.w, c.d, 1);
    }
    if (auto.columns.length) {
      const per = auto.columns.reduce((x, c) => x + c.perimeter, 0);
      items.push({ code: code("C"), group: "column", label: `${auto.columns.length} columns (DXF layers)`, calc: `${n2(per)} m × ${n3(H)} m`, area: per * H });
    }
    if (auto.gapSpan && t.params.autoLintels !== false && !(auto.beamSized ?? []).length && !(t.beams ?? []).some((b) => b.qty > 0 && b.length_m > 0)) {
      // aluminium formwork: every opening in a wall line gets a beam / lintel up to the slab — both sides measured
      const dMm = Number(t.params.beamDepthMm) || 600, side = Math.max(0, dMm / 1000 - slab), L2 = 2 * auto.gapSpan;
      const a = L2 * side;
      beamArea += a; lintelAuto += a;
      items.push({ code: code("B"), group: "beam", label: `Beams over ${auto.gapCount ?? ""} wall openings (auto)`, calc: `2 × ${n2(auto.gapSpan)} m × (${n3(dMm / 1000)} − ${n3(slab)}) m`, area: a });
      if (rules.reveals && auto.gapSoffit) {
        beamArea += auto.gapSoffit; lintelAuto += auto.gapSoffit;
        items.push({ code: code("B"), group: "beam", label: "Underside of the beams over openings", calc: `${n2(auto.gapSpan)} m × wall thickness`, area: auto.gapSoffit });
      }
    }
    // windows found in wall openings: the sill wall under them is cast too (both faces × sill height, + sill top)
    if (auto.windowGaps?.count && t.params.autoLintels !== false) {
      const sh = (Number(t.params.sillMm) || OPENING_DEFAULTS.windowSill) / 1000, wg = auto.windowGaps;
      const a = 2 * wg.span * sh + (rules.reveals ? wg.top : 0);
      wallArea += a;
      items.push({ code: code("W"), group: "wall", label: `Sill walls under ${wg.count} windows (auto)`, calc: `2 × ${n2(wg.span)} m × ${n3(sh)} m${rules.reveals ? ` + sill top ${n2(wg.top)} m²` : ""}`, area: a });
    }
    // slab edges with no full-height wall under them (balcony fronts under a parapet, open edges): edge beam
    if (auto.edgeBeamLength && auto.edgeBeamLength >= 0.5 && t.params.autoEdgeBeams !== false && !(auto.beamSized ?? []).length && !auto.beamLineLength && !(t.beams ?? []).some((b) => b.qty > 0 && b.length_m > 0)) {
      const dMm = Number(t.params.beamDepthMm) || 600, L = auto.edgeBeamLength, a = L * Math.max(0, dMm / 1000 - slab) + L * (dMm / 1000);
      beamArea += a;
      items.push({ code: code("B"), group: "beam", label: "Edge beams at slab edges without a wall (auto)", calc: `${n2(L)} m × ((${n3(dMm / 1000)} − ${n3(slab)}) inside + ${n3(dMm / 1000)} outside)`, area: a });
    }
    for (const g of auto.beamSized ?? []) {
      const h = Math.max(0, g.d / 1000 - slab);
      const faces = g.inner != null;
      const a = faces ? (g.inner ?? 0) * h + (g.outer ?? 0) * (g.d / 1000) + 2 * (g.lintel ?? 0) * h : 2 * g.len * h;
      beamArea += a;
      const calc = faces
        ? `${n2(g.inner ?? 0)} m inner faces × ${n3(h)}${g.outer ? ` + ${n2(g.outer)} m outer faces × ${n3(g.d / 1000)}` : ""}${g.lintel ? ` + 2 × ${n2(g.lintel)} m lintels × ${n3(h)}` : ""} m · bottom ${n2(g.bottom)} m² in the slab`
        : `2 × ${n2(g.len)} m × (${n3(g.d / 1000)} − ${n3(slab)}) m · bottom ${n2(g.bottom)} m² in the slab`;
      items.push({ code: code("B"), group: "beam", label: `Beams ${g.b}×${g.d} (${g.count} on the drawing)`, calc, area: a });
    }
    if (auto.beamLineLength) {
      const dMm = Number(t.params.beamDepthMm) || 600, a = auto.beamLineLength * Math.max(0, dMm / 1000 - slab);
      beamArea += a;
      items.push({ code: code("B"), group: "beam", label: "Beam sides (DXF layers)", calc: `${n2(auto.beamLineLength)} m × (${n3(dMm / 1000)} − ${n3(slab)}) m`, area: a });
    }
  }
  for (const c of t.columns) {
    const q = Math.max(0, Math.round(c.qty || 0)); if (!q || c.w_mm <= 0 || c.d_mm <= 0) continue;
    const per = 2 * (c.w_mm + c.d_mm) / 1000;
    colCount += q; colPerimeter += per * q; colFoot += (c.w_mm * c.d_mm) / 1e6 * q; colArea += per * q * H; addSize(c.w_mm / 1000, c.d_mm / 1000, q);
    items.push({ code: code("C"), group: "column", label: `${q} × column ${c.w_mm}×${c.d_mm}`, calc: `${q} × ${n2(per)} m × ${n3(H)} m`, area: per * q * H });
  }
  let extraArea = 0;
  for (const b of t.beams) {
    const q = Math.max(0, b.qty || 0); if (!q || b.length_m <= 0) continue;
    const sides = b.sides == null ? 1 : Math.max(0, Math.min(2, Math.round(b.sides)));
    const bw = Math.max(0, Number(b.width_mm) || 0) / 1000, side = Math.max(0, b.depth_mm / 1000 - slab);
    const bottom = b.bottom ? bw : 0;
    const ext = b.ext ? b.depth_mm / 1000 : 0;                          // outer face of an edge beam: full depth
    const a = b.length_m * (sides * side + ext + bottom) * q;
    beamArea += a;
    const parts = [sides ? `${sides > 1 ? `${sides} × ` : ""}(${n3(b.depth_mm / 1000)} − ${n3(slab)})` : "", ext ? `${n3(ext)} outer face` : "", bottom ? `${n3(bw)} bottom` : ""].filter(Boolean).join(" + ");
    items.push({ code: code("B", b.label), group: "beam", label: `Beam${bw ? ` ${Math.round(bw * 1000)}×${b.depth_mm}` : `, depth ${b.depth_mm}`}${sides === 2 ? " (2 sides)" : ""}${ext ? " edge beam" : ""}${bottom ? " + bottom" : ""}`, calc: `${q > 1 ? `${q} × ` : ""}${n2(b.length_m)} m × [${parts}] m`, area: a });
  }
  for (const st of rules.stairs ? t.stairs ?? [] : []) {
    const b = stairBreakdown(st); if (!b) continue;
    const { f, n, R, T, soffit, risers, cheeks, landing, total: a } = b;
    extraArea += a;
    items.push({ code: code("ST", st.label), group: "extra", label: `Staircase${st.label ? ` ${st.label}` : ""} — ${f} flight${f > 1 ? "s" : ""} × ${n} risers ${Math.round(R * 1000)}/${Math.round(T * 1000)}`,
      calc: `${f > 1 ? `${f} × ` : ""}(soffit ${n2(soffit)} + risers ${n2(risers)}${cheeks ? ` + stringers ${n2(cheeks)}` : ""}${landing ? ` + landing soffit ${n2(landing)}` : ""})`, area: a });
  }
  // staircases measured from the tread lines on the drawing (riser height from the floor height); else the allowance
  const noTyped = !(t.stairs ?? []).length && !(t.extras ?? []).some((x) => Number(x.area_m2) > 0);
  const measuredStairs = rules.stairs && noTyped ? autoStairRows(auto, floorHeight) : [];
  const useMeasured = measuredStairs.length > 0 && (rules.stairBasis === "measured" || rules.stairAllowanceM2 <= 0);
  if (useMeasured) for (const [i, st] of measuredStairs.entries()) {
    const b = stairBreakdown(st.row); if (!b) continue;
    extraArea += b.total;
    items.push({ code: code("ST"), group: "extra", label: `Staircase ${i + 1} (measured from the drawing) — ${st.desc}`, calc: `soffit ${n2(b.soffit * b.f)} + risers ${n2(b.risers * b.f)}${b.cheeks ? ` + stringer ${n2(b.cheeks * b.f)}` : ""}${b.landing ? ` + landing ${n2(b.landing * b.f)}` : ""}`, area: b.total });
  }
  if (!useMeasured && rules.stairs && rules.stairAllowanceM2 > 0 && auto?.stairCount && noTyped) {
    const a = auto.stairCount * rules.stairAllowanceM2;
    extraArea += a;
    const meas = measuredStairs.reduce((s2, st) => s2 + (stairBreakdown(st.row)?.total ?? 0), 0);
    items.push({ code: code("ST"), group: "extra", label: `Staircase${auto.stairCount > 1 ? `s × ${auto.stairCount}` : ""} (company allowance, auto)`, calc: `${auto.stairCount} × ${n2(rules.stairAllowanceM2)} m²${meas > 0 ? ` · measured flights ${n2(meas)} m² (${measuredStairs.map((st) => st.desc).join("; ")})` : ""}`, area: a });
  }
  for (const x of t.extras ?? []) {
    const a = Math.max(0, Number(x.area_m2) || 0); if (!a) continue;
    extraArea += a;
    items.push({ code: code("X"), group: "extra", label: (x.label || "Other").slice(0, 60), calc: "lump sum", area: a });
  }
  // typed-in figures (estimator's own measurement) replace the drawing's
  const ov = (v: unknown) => (v != null && String(v) !== "" && Number.isFinite(Number(v)) && Number(v) >= 0 ? Number(v) : null);
  const drop = (pred: (i: AreaItem) => boolean) => { for (let i = items.length - 1; i >= 0; i--) if (pred(items[i])) items.splice(i, 1); };
  const oSlab = ov(t.params.slabM2), oDuct = ov(t.params.ductM2), oWall = ov(t.params.wallLenM), oBeam = ov(t.params.beamLenM);
  if (oSlab != null) { drop((i) => i.group === "slab"); slabArea = oSlab; items.push({ code: "S1", group: "slab", label: "Slab area (entered)", calc: `${n2(oSlab)} m²`, area: oSlab }); }
  if (oDuct != null) { drop((i) => i.group === "deduct"); openArea = oDuct; items.push({ code: "D1", group: "deduct", label: "Ducts / openings (entered)", calc: `− ${n2(oDuct)} m²`, area: -oDuct }); }
  if (oWall != null) {
    const adj = items.filter((i) => i.group === "opening").reduce((s, i) => s + i.area, 0);
    drop((i) => i.group === "wall"); wallCentre = oWall / 2; wallFaces = oWall; wallArea = oWall * H + adj;
    items.push({ code: "W1", group: "wall", label: "Wall length (entered)", calc: `${n2(oWall)} m × ${n3(H)} m`, area: oWall * H });
  }
  if (oBeam != null) {
    const dMm = Number(t.params.beamDepthMm) || 600, a = oBeam * Math.max(0, dMm / 1000 - slab);
    drop((i) => i.group === "beam"); beamArea = a;
    if (a > 0) items.push({ code: "B1", group: "beam", label: "Beam length (entered)", calc: `${n2(oBeam)} m × (${n3(dMm / 1000)} − ${n3(slab)}) m`, area: a });
  }
  // scope of the order: parts not formed with this formwork are left out (walls in blockwork: no wall tops off the
  // deck, and no auto beams over wall openings — those are lintels of the block walls)
  const scope: Scope = t.params.scope && t.params.scope in SCOPES ? t.params.scope : "full";
  const inc = new Set<AreaItem["group"]>(SCOPES[scope].parts);
  if (scope !== "full") {
    if (!inc.has("wall") && lintelAuto) { beamArea -= lintelAuto; drop((i) => i.group === "beam" && / wall openings \(auto\)/.test(i.label)); }
    drop((i) => !inc.has(i.group));
    if (!inc.has("wall")) { wallArea = 0; wallFaces = 0; wallCentre = 0; }
    if (!inc.has("column")) { colArea = 0; colCount = 0; colPerimeter = 0; }
    if (!inc.has("beam")) beamArea = 0;
    if (!inc.has("extra")) extraArea = 0;
    if (!inc.has("loft")) loftArea = 0;
    if (!inc.has("slab")) { slabArea = 0; openArea = 0; slabPer = 0; openPer = 0; }
    items.push({ code: "SC", group: inc.has("extra") ? "extra" : [...inc][0], label: `Scope: ${SCOPES[scope].label} — ${SCOPES[scope].what}`, calc: "other parts left out", area: 0 });
  }
  // wall tops: typed in, else from the walls (drawn walls + merged DXF wall outlines)
  const wallTop = !inc.has("wall") ? 0 : t.params.wallTopM2 != null && String(t.params.wallTopM2) !== "" ? Math.max(0, Number(t.params.wallTopM2) || 0) : rules.deductWallTops ? wallTopDrawn + (auto?.wallTopArea ?? 0) : 0;
  if (!rules.deductColumnTops || !inc.has("slab")) colFoot = 0;
  if (wallTop) items.push({ code: "WT", group: "deduct", label: "Wall tops", calc: `− ${n2(wallTop)} m²`, area: -wallTop });
  if (colFoot) items.push({ code: "CT", group: "deduct", label: "Column tops", calc: `− ${n2(colFoot)} m²`, area: -colFoot });
  const extraPct = rules.extraPct;

  const plan = Math.max(0, slabArea - openArea);
  const soffit = Math.max(0, plan - wallTop - colFoot);
  let edge = rules.slabEdges ? (slabPer + openPer) * slab : 0;
  if (edge) items.push({ code: "E", group: "edge", label: "Slab & opening edges", calc: `${n2(slabPer + openPer)} m × ${n3(slab)} m`, area: edge });
  const kicker = rules.kickerMm > 0 ? slabPer * rules.kickerMm / 1000 : 0;
  if (kicker) { items.push({ code: "K", group: "edge", label: `External kicker ${rules.kickerMm} mm`, calc: `${n2(slabPer)} m × ${n3(rules.kickerMm / 1000)} m`, area: kicker }); edge += kicker; }
  const nonTyp = (t.nonTypical ?? []).reduce((s, x) => s + Math.max(0, Number(x.area_m2) || 0), 0);
  const contact = soffit + edge + wallArea + colArea + beamArea + extraArea + loftArea;
  const hasManual = t.shapes.length > 0 || t.columns.length > 0 || t.beams.length > 0 || (t.stairs ?? []).length > 0 || extraArea > 0;
  const order = { slab: 0, deduct: 1, edge: 2, wall: 3, opening: 4, column: 5, beam: 6, loft: 7, extra: 8 } as const;
  items.sort((x, y) => order[x.group] - order[y.group]);
  return {
    plan_area: r2(plan), slab_soffit: r2(soffit), slab_edge: r2(edge),
    wall_length: r2(wallCentre), wall_area: r2(wallArea),
    column_count: colCount, column_area: r2(colArea),
    column_sizes: [...sizes.entries()].map(([size, qty]) => ({ size, qty })).sort((a, b) => b.qty - a.qty),
    beam_area: r2(beamArea), extra_area: r2(extraArea + loftArea), wall_top_area: r2(wallTop),
    vertical_area: r2(wallArea + colArea),
    contact_area: r2(contact), extra_pct: extraPct, typical_quote: r2(contact * (1 + extraPct / 100)), nontypical_area: r2(nonTyp),
    quote_area: r2(contact * (1 + extraPct / 100) + nonTyp),
    clear_height: r2(H), floors: Math.max(1, Math.round(floors || 1)), params: t.params,
    source: auto && hasManual ? "mixed" : auto ? "dxf" : "manual",
    wall_top_drawn: r2(wallTopDrawn + (auto?.wallTopArea ?? 0)),
    items: items.slice(0, 400).map((i) => ({ ...i, area: r2(i.area) })),
    rules,
  };
}

export const fmtArea = (n: number | null | undefined) => `${Number(n ?? 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} m²`;
export const fmtLen = (n: number | null | undefined) => `${Number(n ?? 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} m`;

/** Rows printed on the quotation PDF and shown on screens. */
export function totalsRows(t: Partial<Totals>): [string, string][] {
  const rows: [string, string][] = [
    ["Slab area (outline − ducts / cut-outs)", fmtArea(t.plan_area)],
    ["Slab soffit formwork (less wall tops" + (t.column_count ? " & columns" : "") + ")", fmtArea(t.slab_soffit)],
  ];
  if (t.slab_edge) rows.push(["Slab & opening edges", fmtArea(t.slab_edge)]);
  rows.push([`Wall formwork · ${fmtLen((t.wall_length ?? 0) * 2)} wall face length`, fmtArea(t.wall_area)]);
  if (t.column_count) rows.push([`Columns (${t.column_count} nos.)`, fmtArea(t.column_area)]);
  if (t.beam_area) rows.push(["Beam sides", fmtArea(t.beam_area)]);
  if (t.extra_area) rows.push(["Staircase & other items", fmtArea(t.extra_area)]);
  rows.push(["Total for typical floor", fmtArea(t.contact_area)]);
  const typ = t.typical_quote ?? t.quote_area;
  if (t.extra_pct) rows.push([`Add ${t.extra_pct}%`, fmtArea(typ)]);
  if (t.nontypical_area) {
    rows.push(["Additional for non-typical floors", fmtArea(t.nontypical_area)]);
    rows.push(["Formwork set (one set for all floors)", fmtArea(t.quote_area)]);
  }
  return rows;
}
