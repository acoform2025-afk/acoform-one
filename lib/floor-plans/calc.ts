/**
 * Floor-plan area take-off: data model + the formwork area formulas.
 * Pure functions, used by the measuring screen (browser) and shown on quotations.
 *
 * All drawn shapes are stored in "image pixels" of the plan picture; metersPerPx turns them into metres.
 * Areas are PER FLOOR (one typical floor = one formwork set); `floors` only multiplies the "all floors" figure.
 */

export type Pt = [number, number];
export type ShapeKind = "slab" | "opening" | "wall" | "column" | "beam" | "door" | "window" | "loft";
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
export type BeamRow = { label?: string; width_mm?: number; depth_mm: number; length_m: number; qty: number };
/** Lump-sum items such as a staircase (ST1 = 100 m²). */
export type ExtraRow = { label: string; area_m2: number };
export type Params = {
  floorHeight: number; slabMm: number; floors: number;
  wallTopM2?: number;       // slab deduction for wall tops (m²)
  includeEdges?: boolean;   // add slab / opening edge formwork (default off)
  extraPct?: number;        // add % on the typical-floor total (e.g. 10)
  beamDepthMm?: number;     // default beam depth (drawn beams and DXF beam layers)
  beamWidthMm?: number;     // default width of drawn beams
  wallThkMm?: number;       // default thickness of drawn walls (3D view, wall tops)
};

/** One line of the formwork area list (like an "estimate FM area list"). */
export type AreaItem = { code: string; group: "slab" | "deduct" | "edge" | "wall" | "opening" | "column" | "beam" | "loft" | "extra"; label: string; calc: string; area: number };
/** Shell-plan title block and notes (stored with the take-off). */
export type ShellMeta = { drawingNo?: string; rev?: string; drawnBy?: string; checkedBy?: string; notes?: string; scaleNote?: string };
export type LayerRole = "ignore" | "walls" | "columns" | "slab" | "opening" | "beams";

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
  shell?: ShellMeta;
  dxf?: { units: DxfUnits; layerRoles: Record<string, LayerRole>; wallsDrawn: "faces" | "centre"; region?: [number, number, number, number] | null };
};

export type DxfUnits = "mm" | "cm" | "m" | "in" | "ft";
export const UNIT_TO_M: Record<DxfUnits, number> = { mm: 0.001, cm: 0.01, m: 1, in: 0.0254, ft: 0.3048 };

/** Areas/lengths the DXF reader found automatically (already in metres). */
export type DxfAuto = {
  slabArea: number; slabPerimeter: number;
  openingArea: number; openingPerimeter: number;
  wallLineLength: number;                           // total length of lines on wall layers
  beamLineLength?: number;                          // total length of lines on beam layers (= beam side length)
  columns: { w: number; d: number; perimeter: number; area: number }[];
  wallTopArea?: number;                             // wall outlines merged (overlaps counted once), m²
  slabFromWalls?: boolean;                          // no slab layer: slab = outer outline of the walls
  slabLoops?: Pt[][];                               // slab outlines used (drawing units) — for deck layout / display
  openingLoops?: Pt[][];                            // duct / lift cut-outs used (drawing units)
  wallRings?: Pt[][];                               // merged wall outlines (drawing units) — every edge is a wall face
  wallLoose?: Pt[][];                               // wall lines not part of an outline (drawing units)
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
  quote_area: number;      // contact area + extra % (quick quote "Full set" basis)
  clear_height: number;
  floors: number;
  params: Takeoff["params"];
  source: "manual" | "dxf" | "mixed";
  wall_top_drawn: number;  // wall tops of drawn walls (length × thickness), offered as the deduction
  items: AreaItem[];
};

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

export function computeTotals(t: Takeoff, auto?: DxfAuto | null): Totals {
  const { floorHeight, slabMm, floors } = t.params;
  const slab = Math.max(0, slabMm) / 1000;
  const H = Math.max(0, floorHeight - slab);
  const mpp = t.metersPerPx ?? 0;
  const items: AreaItem[] = [];
  const cnt: Record<string, number> = {};
  const code = (p: string, own?: string) => (own && own.trim() ? own.trim().slice(0, 20) : `${p}${(cnt[p] = (cnt[p] ?? 0) + 1)}`);
  const hOf = (s: Shape) => (s.h && s.h > 0 ? s.h / 1000 : H);

  let slabArea = 0, slabPer = 0, openArea = 0, openPer = 0, wallCentre = 0, wallFaces = 0, wallArea = 0, wallTopDrawn = 0;
  let colCount = 0, colPerimeter = 0, colFoot = 0, colArea = 0, beamArea = 0, loftArea = 0;
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
        const faces = 2 * w * h, reveal = (2 * h + w * (isDoor ? 1 : 2)) * thk;
        const c = code(isDoor ? "DR" : "WN", s.label);
        wallArea -= faces; wallArea += reveal;
        items.push({ code: c, group: "opening", label: `${isDoor ? "Door" : "Window"} ${Math.round(w * 1000)}×${Math.round(h * 1000)} − faces`, calc: `− 2 × ${n2(w)} m × ${n3(h)} m`, area: -faces });
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
      items.push({ code: code("W"), group: "wall", label: "Walls (DXF layers)", calc: `${n2(faces)} m faces × ${n3(H)} m`, area: faces * H });
    }
    for (const c of auto.columns) {
      colCount += 1; colPerimeter += c.perimeter; colFoot += c.area; colArea += c.perimeter * H; addSize(c.w, c.d, 1);
    }
    if (auto.columns.length) {
      const per = auto.columns.reduce((x, c) => x + c.perimeter, 0);
      items.push({ code: code("C"), group: "column", label: `${auto.columns.length} columns (DXF layers)`, calc: `${n2(per)} m × ${n3(H)} m`, area: per * H });
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
  for (const b of t.beams) {
    const q = Math.max(0, b.qty || 0); if (!q || b.length_m <= 0) continue;
    const a = b.length_m * Math.max(0, b.depth_mm / 1000 - slab) * q;
    beamArea += a;
    items.push({ code: code("B", b.label), group: "beam", label: `Beam sides, depth ${b.depth_mm}`, calc: `${q > 1 ? `${q} × ` : ""}${n2(b.length_m)} m × (${n3(b.depth_mm / 1000)} − ${n3(slab)}) m`, area: a });
  }
  let extraArea = 0;
  for (const x of t.extras ?? []) {
    const a = Math.max(0, Number(x.area_m2) || 0); if (!a) continue;
    extraArea += a;
    items.push({ code: code("X"), group: "extra", label: (x.label || "Other").slice(0, 60), calc: "lump sum", area: a });
  }
  // wall tops: typed in, else from the walls (drawn walls + merged DXF wall outlines)
  const wallTop = t.params.wallTopM2 != null && String(t.params.wallTopM2) !== "" ? Math.max(0, Number(t.params.wallTopM2) || 0) : wallTopDrawn + (auto?.wallTopArea ?? 0);
  if (wallTop) items.push({ code: "WT", group: "deduct", label: "Wall tops", calc: `− ${n2(wallTop)} m²`, area: -wallTop });
  if (colFoot) items.push({ code: "CT", group: "deduct", label: "Column tops", calc: `− ${n2(colFoot)} m²`, area: -colFoot });
  const extraPct = Math.min(100, Math.max(0, Number(t.params.extraPct) || 0));

  const plan = Math.max(0, slabArea - openArea);
  const soffit = Math.max(0, plan - wallTop - colFoot);
  const edge = t.params.includeEdges ? (slabPer + openPer) * slab : 0;
  if (edge) items.push({ code: "E", group: "edge", label: "Slab & opening edges", calc: `${n2(slabPer + openPer)} m × ${n3(slab)} m`, area: edge });
  const contact = soffit + edge + wallArea + colArea + beamArea + extraArea + loftArea;
  const hasManual = t.shapes.length > 0 || t.columns.length > 0 || t.beams.length > 0 || extraArea > 0;
  const order = { slab: 0, deduct: 1, edge: 2, wall: 3, opening: 4, column: 5, beam: 6, loft: 7, extra: 8 } as const;
  items.sort((x, y) => order[x.group] - order[y.group]);
  return {
    plan_area: r2(plan), slab_soffit: r2(soffit), slab_edge: r2(edge),
    wall_length: r2(wallCentre), wall_area: r2(wallArea),
    column_count: colCount, column_area: r2(colArea),
    column_sizes: [...sizes.entries()].map(([size, qty]) => ({ size, qty })).sort((a, b) => b.qty - a.qty),
    beam_area: r2(beamArea), extra_area: r2(extraArea + loftArea), wall_top_area: r2(wallTop),
    vertical_area: r2(wallArea + colArea),
    contact_area: r2(contact), extra_pct: extraPct, quote_area: r2(contact * (1 + extraPct / 100)),
    clear_height: r2(H), floors: Math.max(1, Math.round(floors || 1)), params: t.params,
    source: auto && hasManual ? "mixed" : auto ? "dxf" : "manual",
    wall_top_drawn: r2(wallTopDrawn + (auto?.wallTopArea ?? 0)),
    items: items.slice(0, 400).map((i) => ({ ...i, area: r2(i.area) })),
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
  if (t.extra_pct) rows.push([`Add ${t.extra_pct}%`, fmtArea(t.quote_area)]);
  return rows;
}
