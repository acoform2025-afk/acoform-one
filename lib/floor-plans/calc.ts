/**
 * Floor-plan area take-off: data model + the formwork area formulas.
 * Pure functions, used by the measuring screen (browser) and shown on quotations.
 *
 * All drawn shapes are stored in "image pixels" of the plan picture; metersPerPx turns them into metres.
 * Areas are PER FLOOR (one typical floor = one formwork set); `floors` only multiplies the "all floors" figure.
 */

export type Pt = [number, number];
export type ShapeKind = "slab" | "opening" | "wall" | "column";
export type Shape = { id: string; kind: ShapeKind; pts: Pt[] };
export type ColumnRow = { w_mm: number; d_mm: number; qty: number };
export type BeamRow = { label?: string; width_mm: number; depth_mm: number; length_m: number; qty: number };
export type LayerRole = "ignore" | "walls" | "columns" | "slab" | "opening";

export type Takeoff = {
  v: 1;
  params: { floorHeight: number; slabMm: number; floors: number };
  metersPerPx: number | null;          // null = scale not set yet (PDF / picture)
  calib?: { p1: Pt; p2: Pt; mm: number };
  image?: { w: number; h: number; page?: number };
  shapes: Shape[];
  columns: ColumnRow[];                // columns typed in by size
  beams: BeamRow[];
  dxf?: { units: DxfUnits; layerRoles: Record<string, LayerRole>; wallsDrawn: "faces" | "centre"; region?: [number, number, number, number] | null };
};

export type DxfUnits = "mm" | "cm" | "m" | "in" | "ft";
export const UNIT_TO_M: Record<DxfUnits, number> = { mm: 0.001, cm: 0.01, m: 1, in: 0.0254, ft: 0.3048 };

/** Areas/lengths the DXF reader found automatically (already in metres). */
export type DxfAuto = {
  slabArea: number; slabPerimeter: number;
  openingArea: number; openingPerimeter: number;
  wallLineLength: number;                           // total length of lines on wall layers
  columns: { w: number; d: number; perimeter: number; area: number }[];
};

export type Totals = {
  plan_area: number;       // floor plate: slab outline − openings  (quick quote "Full set / monolithic" basis)
  slab_soffit: number;     // plan area − column footprints
  slab_edge: number;       // slab + opening edges × slab thickness
  wall_length: number;     // centre-line length
  wall_area: number;       // both faces × clear height
  column_count: number;
  column_area: number;     // perimeter × clear height
  column_sizes: { size: string; qty: number }[];
  beam_area: number;       // (width + 2 × depth below slab) × length
  vertical_area: number;   // walls + columns (quick quote "Vertical set" basis)
  contact_area: number;    // total formwork contact area
  clear_height: number;
  floors: number;
  params: Takeoff["params"];
  source: "manual" | "dxf" | "mixed";
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
  const closed = s.kind !== "wall";
  const length = polyLength(s.pts, closed) * mpp;
  const area = closed && s.pts.length >= 3 ? polyArea(s.pts) * mpp * mpp : 0;
  return { area, length: s.kind === "wall" ? length : 0, perimeter: closed ? length : 0 };
}

const r2 = (n: number) => Math.round(n * 100) / 100;

export function computeTotals(t: Takeoff, auto?: DxfAuto | null): Totals {
  const { floorHeight, slabMm, floors } = t.params;
  const slab = Math.max(0, slabMm) / 1000;
  const H = Math.max(0, floorHeight - slab);
  const mpp = t.metersPerPx ?? 0;

  let slabArea = 0, slabPer = 0, openArea = 0, openPer = 0, wallCentre = 0, wallFaces = 0;
  let colCount = 0, colPerimeter = 0, colFoot = 0;
  const sizes = new Map<string, number>();
  const addSize = (wm: number, dm: number, q: number) => {
    const a = Math.round(Math.min(wm, dm) * 1000 / 5) * 5, b = Math.round(Math.max(wm, dm) * 1000 / 5) * 5;
    const k = `${a} × ${b} mm`; sizes.set(k, (sizes.get(k) ?? 0) + q);
  };

  if (mpp > 0) {
    for (const s of t.shapes) {
      const m = shapeMeasure(s, mpp);
      if (s.kind === "slab") { slabArea += m.area; slabPer += m.perimeter; }
      else if (s.kind === "opening") { openArea += m.area; openPer += m.perimeter; }
      else if (s.kind === "wall") { wallCentre += m.length; wallFaces += 2 * m.length; }
      else if (s.kind === "column") {
        colCount += 1; colPerimeter += m.perimeter; colFoot += m.area;
        const [w, d] = bboxSize(s.pts); addSize(w * mpp, d * mpp, 1);
      }
    }
  }
  if (auto) {
    slabArea += auto.slabArea; slabPer += auto.slabPerimeter;
    openArea += auto.openingArea; openPer += auto.openingPerimeter;
    if (t.dxf?.wallsDrawn === "centre") { wallCentre += auto.wallLineLength; wallFaces += 2 * auto.wallLineLength; }
    else { wallCentre += auto.wallLineLength / 2; wallFaces += auto.wallLineLength; }
    for (const c of auto.columns) { colCount += 1; colPerimeter += c.perimeter; colFoot += c.area; addSize(c.w, c.d, 1); }
  }
  for (const c of t.columns) {
    const q = Math.max(0, Math.round(c.qty || 0)); if (!q || c.w_mm <= 0 || c.d_mm <= 0) continue;
    colCount += q; colPerimeter += 2 * (c.w_mm + c.d_mm) / 1000 * q; colFoot += (c.w_mm * c.d_mm) / 1e6 * q; addSize(c.w_mm / 1000, c.d_mm / 1000, q);
  }
  let beamArea = 0;
  for (const b of t.beams) {
    const q = Math.max(0, b.qty || 0); if (!q || b.length_m <= 0) continue;
    beamArea += b.length_m * (Math.max(0, b.width_mm) / 1000 + 2 * Math.max(0, b.depth_mm / 1000 - slab)) * q;
  }

  const plan = Math.max(0, slabArea - openArea);
  const soffit = Math.max(0, plan - colFoot);
  const edge = (slabPer + openPer) * slab;
  const wallArea = wallFaces * H;
  const colArea = colPerimeter * H;
  const hasManual = t.shapes.length > 0 || t.columns.length > 0 || t.beams.length > 0;
  return {
    plan_area: r2(plan), slab_soffit: r2(soffit), slab_edge: r2(edge),
    wall_length: r2(wallCentre), wall_area: r2(wallArea),
    column_count: colCount, column_area: r2(colArea),
    column_sizes: [...sizes.entries()].map(([size, qty]) => ({ size, qty })).sort((a, b) => b.qty - a.qty),
    beam_area: r2(beamArea),
    vertical_area: r2(wallArea + colArea),
    contact_area: r2(soffit + edge + wallArea + colArea + beamArea),
    clear_height: r2(H), floors: Math.max(1, Math.round(floors || 1)), params: t.params,
    source: auto && hasManual ? "mixed" : auto ? "dxf" : "manual",
  };
}

export const fmtArea = (n: number | null | undefined) => `${Number(n ?? 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} m²`;
export const fmtLen = (n: number | null | undefined) => `${Number(n ?? 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} m`;

/** Rows printed on the quotation PDF and shown on screens. */
export function totalsRows(t: Partial<Totals>): [string, string][] {
  const rows: [string, string][] = [
    ["Floor plate area (slab outline − openings)", fmtArea(t.plan_area)],
    ["Slab soffit formwork", fmtArea(t.slab_soffit)],
    ["Slab & opening edges", fmtArea(t.slab_edge)],
    ["Wall running length", fmtLen(t.wall_length)],
    ["Wall formwork (both faces)", fmtArea(t.wall_area)],
    [`Columns (${t.column_count ?? 0} nos.)`, fmtArea(t.column_area)],
    ["Beams (soffit + sides)", fmtArea(t.beam_area)],
    ["Total formwork contact area", fmtArea(t.contact_area)],
  ];
  return rows;
}
