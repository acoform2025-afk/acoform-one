/**
 * Reads an AutoCAD DXF floor plan in the browser (dxf-parser, MIT) and turns it into simple paths per layer,
 * a picture of the plan, and automatic quantities per layer role (walls / columns / slab outline / openings).
 */
import DxfParser from "dxf-parser";
import { polyArea, polyLength, type DxfAuto, type DxfUnits, type LayerRole, type Pt } from "./calc";

export type DxfPath = { layer: string; pts: Pt[]; closed: boolean };
export type DxfLayerInfo = { name: string; count: number; closed: number; suggested: LayerRole };
export type DxfModel = { paths: DxfPath[]; layers: DxfLayerInfo[]; units: DxfUnits; unitsGuessed: boolean; bbox: [number, number, number, number] };

type AnyEnt = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
type Xf = { a: number; b: number; c: number; d: number; e: number; f: number }; // x' = a x + c y + e ; y' = b x + d y + f
const ID: Xf = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };
const mul = (m: Xf, n: Xf): Xf => ({
  a: m.a * n.a + m.c * n.b, b: m.b * n.a + m.d * n.b, c: m.a * n.c + m.c * n.d, d: m.b * n.c + m.d * n.d,
  e: m.a * n.e + m.c * n.f + m.e, f: m.b * n.e + m.d * n.f + m.f,
});
const ap = (m: Xf, x: number, y: number): Pt => [m.a * x + m.c * y + m.e, m.b * x + m.d * y + m.f];

function arcPts(cx: number, cy: number, r: number, a0: number, a1: number): Pt[] {
  let sweep = a1 - a0; if (sweep <= 0) sweep += Math.PI * 2;
  const n = Math.max(4, Math.ceil(sweep / (Math.PI / 16)));
  return Array.from({ length: n + 1 }, (_, i) => { const t = a0 + (sweep * i) / n; return [cx + r * Math.cos(t), cy + r * Math.sin(t)] as Pt; });
}
/** Polyline vertices with bulges (arc segments) → plain points. */
function bulgePts(vs: { x: number; y: number; bulge?: number }[], closed: boolean): Pt[] {
  const out: Pt[] = [];
  const n = vs.length;
  for (let i = 0; i < n; i++) {
    const p = vs[i]; out.push([p.x, p.y]);
    const b = p.bulge ?? 0; if (!b || (!closed && i === n - 1)) continue;
    const q = vs[(i + 1) % n];
    const theta = 4 * Math.atan(b); const chord = Math.hypot(q.x - p.x, q.y - p.y); if (chord === 0) continue;
    const r = chord / (2 * Math.sin(theta / 2));
    const mx = (p.x + q.x) / 2, my = (p.y + q.y) / 2;
    const h = r * Math.cos(theta / 2);
    const ux = -(q.y - p.y) / chord, uy = (q.x - p.x) / chord;
    const cx = mx + ux * h, cy = my + uy * h;
    const a0 = Math.atan2(p.y - cy, p.x - cx);
    const steps = Math.max(2, Math.ceil(Math.abs(theta) / (Math.PI / 16)));
    for (let k = 1; k < steps; k++) { const t = a0 + (theta * k) / steps; out.push([cx + Math.abs(r) * Math.cos(t), cy + Math.abs(r) * Math.sin(t)]); }
  }
  return out;
}

function suggestRole(name: string): LayerRole {
  const n = name.toLowerCase();
  if (/parapet|compound|hatch|elev|elv|sec(tion)?[^a-z]|text|dim|furn|door|win|grid/.test(n)) return "ignore";
  if (/(^|[^a-z])(col|cols|clm|column|columns)([^a-z]|$)|column/.test(n)) return "columns";
  if (/beam|(^|[^a-z])bm([^a-z]|$)/.test(n)) return "beams";
  if (/wall|shear|brick|masonry|(^|[^a-z])rcc([^a-z]|$)|_rcc$|(^|[^a-z])wl([^a-z]|$)/.test(n)) return "walls";
  if (/shaft|cut ?out|opening|duct|lift|stair.?open/.test(n)) return "opening";
  if (/slab|outline|boundary|plate|periphery|edge|built.?up/.test(n)) return "slab";
  return "ignore";
}

const INSUNITS: Record<number, DxfUnits> = { 1: "in", 2: "ft", 4: "mm", 5: "cm", 6: "m" };

/**
 * A DXF is strict pairs of lines: a numeric group code, then its value. Some converters (e.g. LibreDWG on long
 * MTEXT notes) put a line break inside a value, which throws every reader off. Re-join such broken values.
 */
export function cleanDxfText(text: string): string {
  const lines = text.split(/\r?\n/);
  const out: string[] = [];
  const isCode = (l: string) => /^\s*-?\d{1,4}\s*$/.test(l);
  let expectCode = true;
  for (const line of lines) {
    if (expectCode) {
      if (isCode(line) || out.length === 0) { out.push(line); expectCode = false; }
      else out[out.length - 1] += " " + line; // stray continuation of the previous value
    } else { out.push(line); expectCode = true; }
  }
  return out.join("\n");
}

export function readDxf(raw: string): DxfModel {
  const text = cleanDxfText(raw);
  const dxf = new DxfParser().parseSync(text) as unknown as { header?: AnyEnt; entities: AnyEnt[]; blocks?: Record<string, AnyEnt> } | null;
  if (!dxf) throw new Error("This DXF file could not be read.");
  const blocks = dxf.blocks ?? {};
  const paths: DxfPath[] = [];

  const walk = (ents: AnyEnt[], m: Xf, parentLayer: string | null, depth: number) => {
    for (const e of ents) {
      if (paths.length > 150000) return;
      if (e.inPaperSpace) continue;
      const layer: string = (e.layer === "0" || !e.layer) && parentLayer ? parentLayer : (e.layer ?? "0");
      const push = (pts: Pt[], closed: boolean) => { if (pts.length >= 2) paths.push({ layer, pts: pts.map(([x, y]) => ap(m, x, y)), closed }); };
      switch (e.type) {
        case "LINE": if (e.vertices?.length >= 2) push([[e.vertices[0].x, e.vertices[0].y], [e.vertices[1].x, e.vertices[1].y]], false); break;
        case "LWPOLYLINE": case "POLYLINE": {
          const vs = (e.vertices ?? []).filter((v: AnyEnt) => Number.isFinite(v.x) && Number.isFinite(v.y));
          if (vs.length < 2) break;
          let closed = !!e.shape;
          const f = vs[0], l = vs[vs.length - 1];
          if (!closed && vs.length > 3 && Math.hypot(f.x - l.x, f.y - l.y) < 1e-6) { closed = true; vs.pop(); }
          push(bulgePts(vs, closed), closed); break;
        }
        case "CIRCLE": if (e.center && e.radius > 0) push(arcPts(e.center.x, e.center.y, e.radius, 0, Math.PI * 2).slice(0, -1), true); break;
        case "ARC": if (e.center && e.radius > 0) push(arcPts(e.center.x, e.center.y, e.radius, e.startAngle ?? 0, e.endAngle ?? Math.PI * 2), false); break;
        case "INSERT": {
          const b = blocks[e.name]; if (!b || depth > 5) break;
          const rot = ((e.rotation ?? 0) * Math.PI) / 180, sx = e.xScale ?? 1, sy = e.yScale ?? 1;
          const base = b.position ?? { x: 0, y: 0 };
          const t: Xf = {
            a: Math.cos(rot) * sx, b: Math.sin(rot) * sx, c: -Math.sin(rot) * sy, d: Math.cos(rot) * sy,
            e: e.position?.x ?? 0, f: e.position?.y ?? 0,
          };
          const local = mul(t, { ...ID, e: -base.x, f: -base.y });
          walk(b.entities ?? [], mul(m, local), layer, depth + 1);
          break;
        }
        default: break; // text, dimensions, hatches etc. are not needed for quantities
      }
    }
  };
  walk(dxf.entities ?? [], ID, null, 0);
  if (paths.length === 0) throw new Error("No lines or polylines were found in this DXF (only model space is read).");

  // extents: ignore a few far-away stray objects
  const xs: number[] = [], ys: number[] = [];
  for (const p of paths) for (const [x, y] of p.pts) { xs.push(x); ys.push(y); }
  xs.sort((a, b) => a - b); ys.sort((a, b) => a - b);
  const q = (arr: number[], f: number) => arr[Math.min(arr.length - 1, Math.max(0, Math.floor(f * (arr.length - 1))))];
  let [x0, x1, y0, y1] = [xs[0], xs[xs.length - 1], ys[0], ys[ys.length - 1]];
  const [px0, px1, py0, py1] = [q(xs, 0.01), q(xs, 0.99), q(ys, 0.01), q(ys, 0.99)];
  if ((px1 - px0) * 4 < x1 - x0 || (py1 - py0) * 4 < y1 - y0) {
    const w = px1 - px0, h = py1 - py0; [x0, x1, y0, y1] = [px0 - w * 0.1, px1 + w * 0.1, py0 - h * 0.1, py1 + h * 0.1];
  }

  const byLayer = new Map<string, DxfLayerInfo>();
  for (const p of paths) {
    const li = byLayer.get(p.layer) ?? { name: p.layer, count: 0, closed: 0, suggested: suggestRole(p.layer) };
    li.count++; if (p.closed) li.closed++; byLayer.set(p.layer, li);
  }

  const code = Number((dxf.header ?? {})["$INSUNITS"]);
  let units = INSUNITS[code];
  const unitsGuessed = !units;
  if (!units) { const span = Math.max(x1 - x0, y1 - y0); units = span > 2000 ? "mm" : span > 300 ? "cm" : "m"; }

  return { paths, layers: [...byLayer.values()].sort((a, b) => b.count - a.count), units, unitsGuessed, bbox: [x0, y0, x1, y1] };
}

/** Picture of the plan: longest side = maxSide px. Returns px → drawing-unit factor. */
export function dxfFrame(model: DxfModel, maxSide = 2400) {
  const [x0, y0, x1, y1] = model.bbox;
  const pad = Math.max(x1 - x0, y1 - y0) * 0.03 || 1;
  const w = x1 - x0 + 2 * pad, h = y1 - y0 + 2 * pad;
  const s = maxSide / Math.max(w, h);
  return {
    width: Math.max(1, Math.round(w * s)), height: Math.max(1, Math.round(h * s)), unitsPerPx: 1 / s,
    toPx: ([x, y]: Pt): Pt => [(x - x0 + pad) * s, (y1 + pad - y) * s],
  };
}

export const ROLE_COLOR: Record<LayerRole, string> = { ignore: "#b9bcc2", walls: "#1f2937", columns: "#dc2626", slab: "#2563eb", opening: "#9333ea", beams: "#db2777" };

export function drawDxf(ctx: CanvasRenderingContext2D, model: DxfModel, roles: Record<string, LayerRole>, frame: ReturnType<typeof dxfFrame>) {
  ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, frame.width, frame.height);
  const order: LayerRole[] = ["ignore", "slab", "opening", "beams", "walls", "columns"];
  for (const role of order) {
    ctx.strokeStyle = ROLE_COLOR[role]; ctx.lineWidth = role === "ignore" ? 0.8 : role === "walls" ? 1.6 : 1.4;
    ctx.fillStyle = role === "columns" ? "rgba(220,38,38,0.35)" : role === "opening" ? "rgba(147,51,234,0.12)" : "transparent";
    for (const p of model.paths) {
      if ((roles[p.layer] ?? "ignore") !== role) continue;
      ctx.beginPath();
      p.pts.forEach((pt, i) => { const [x, y] = frame.toPx(pt); if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y); });
      if (p.closed) { ctx.closePath(); if (role === "columns" || role === "opening") ctx.fill(); }
      ctx.stroke();
    }
  }
}

/** Vertex list (in picture px) used to snap clicks onto the drawing's corners. */
export function snapPoints(model: DxfModel, frame: ReturnType<typeof dxfFrame>, roles: Record<string, LayerRole>, limit = 60000): Pt[] {
  const out: Pt[] = [];
  const seen = new Set<string>();
  const sorted = [...model.paths].sort((a, b) => ((roles[a.layer] ?? "ignore") === "ignore" ? 1 : 0) - ((roles[b.layer] ?? "ignore") === "ignore" ? 1 : 0));
  for (const p of sorted) for (const pt of p.pts) {
    const [x, y] = frame.toPx(pt); const k = `${Math.round(x)},${Math.round(y)}`;
    if (seen.has(k)) continue; seen.add(k); out.push([x, y]); if (out.length >= limit) return out;
  }
  return out;
}

function inside(pt: Pt, poly: Pt[]) {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if (yi > pt[1] !== yj > pt[1] && pt[0] < ((xj - xi) * (pt[1] - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
}
/** Closed outlines of a role, dropping ones drawn inside a bigger one (e.g. inner line of a slab edge). */
function outermost(paths: DxfPath[]) {
  const withA = paths.map((p) => ({ p, a: polyArea(p.pts) })).filter((x) => x.a > 0).sort((a, b) => b.a - a.a);
  const keep: typeof withA = [];
  for (const x of withA) if (!keep.some((k) => inside(x.p.pts[0], k.p.pts))) keep.push(x);
  return keep;
}

/** keep: optional filter, e.g. only paths inside the chosen plan region (so sections/elevations in the same file are not counted). */
export function dxfAuto(model: DxfModel, roles: Record<string, LayerRole>, unitToM: number, keep?: (p: DxfPath) => boolean): DxfAuto {
  const of = (r: LayerRole) => model.paths.filter((p) => (roles[p.layer] ?? "ignore") === r && (!keep || keep(p)));
  const u = unitToM, u2 = unitToM * unitToM;
  const slab = outermost(of("slab").filter((p) => p.closed));
  const open = outermost(of("opening").filter((p) => p.closed));
  const cols = outermost(of("columns").filter((p) => p.closed && p.pts.length >= 3)).map(({ p }) => {
    const xs = p.pts.map((q) => q[0]), ys = p.pts.map((q) => q[1]);
    return { w: (Math.max(...xs) - Math.min(...xs)) * u, d: (Math.max(...ys) - Math.min(...ys)) * u, perimeter: polyLength(p.pts, true) * u, area: polyArea(p.pts) * u2 };
  }).filter((c) => c.area > 0);
  return {
    slabArea: slab.reduce((s, x) => s + x.a, 0) * u2,
    slabPerimeter: slab.reduce((s, x) => s + polyLength(x.p.pts, true), 0) * u,
    openingArea: open.reduce((s, x) => s + x.a, 0) * u2,
    openingPerimeter: open.reduce((s, x) => s + polyLength(x.p.pts, true), 0) * u,
    wallLineLength: of("walls").reduce((s, p) => s + polyLength(p.pts, p.closed), 0) * u,
    beamLineLength: of("beams").reduce((s, p) => s + polyLength(p.pts, p.closed), 0) * u,
    columns: cols,
  };
}
