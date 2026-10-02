/**
 * Reads an AutoCAD DXF floor plan in the browser (dxf-parser, MIT) and turns it into simple paths per layer,
 * a picture of the plan, and automatic quantities per layer role (walls / columns / slab outline / openings).
 */
import DxfParser from "dxf-parser";
import polygonClipping, { type MultiPolygon, type Polygon } from "polygon-clipping";
import { polyArea, polyLength, type DxfAuto, type DxfUnits, type LayerRole, type Pt } from "./calc";
import { nearRings, outlineFromWalls, wallGaps, wallUnion, xMarkedBoxes } from "./geom";
import { beamSizeFromLayer, isNoiseLayer, suggestLayerRole } from "./layer-rules";

export type DxfPath = { layer: string; pts: Pt[]; closed: boolean };
export type DxfLayerInfo = { name: string; count: number; closed: number; suggested: LayerRole };
export type DxfText = { text: string; x: number; y: number; h: number };
/** A named drawing inside the file (Revit view / AutoCAD block), box in drawing units. */
export type DxfView = { name: string; box: [number, number, number, number] };
export type DxfModel = { texts?: DxfText[]; views?: DxfView[]; paths: DxfPath[]; layers: DxfLayerInfo[]; units: DxfUnits; unitsGuessed: boolean; bbox: [number, number, number, number] };

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

const suggestRole = (name: string): LayerRole => suggestLayerRole(name);

const VIEW_LAYER = "ACOFORM-VIEWS";

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

/**
 * Lean DXF reader: only what the take-off uses (LINE, LWPOLYLINE, POLYLINE/VERTEX, CIRCLE, ARC, INSERT, BLOCKS,
 * $INSUNITS). It walks the text without splitting it into an array, so a 20 MB drawing needs a fraction of the
 * memory of a general DXF parser. Values broken over two lines (LibreDWG MTEXT) are skipped like cleanDxfText.
 * Output has the same shape as dxf-parser's for the fields readDxf reads.
 */
export function leanParseDxf(text: string): { header: AnyEnt; entities: AnyEnt[]; blocks: Record<string, AnyEnt> } {
  let pos = 0;
  const n = text.length;
  const line = (): string | null => {
    if (pos >= n) return null;
    let e = text.indexOf("\n", pos); if (e < 0) e = n;
    let l = text.slice(pos, e); pos = e + 1;
    if (l.endsWith("\r")) l = l.slice(0, -1);
    return l;
  };
  const isCode = (l: string) => /^\s*-?\d{1,4}\s*$/.test(l);
  // next (code, value) pair; a non-numeric line where a code is expected is a broken value → skip it
  let code = 0, val = "";
  const next = (): boolean => {
    for (;;) {
      const c = line(); if (c === null) return false;
      if (!isCode(c)) continue;
      const v = line(); if (v === null) return false;
      code = parseInt(c, 10); val = v.trim(); return true;
    }
  };
  const header: AnyEnt = {}, entities: AnyEnt[] = [], blocks: Record<string, AnyEnt> = {};
  const deg = Math.PI / 180;
  let section = "", cur: AnyEnt | null = null, target: AnyEnt[] = entities, block: AnyEnt | null = null, poly: AnyEnt | null = null, vtx: AnyEnt | null = null, hdrVar = "";
  const flush = () => {
    if (!cur) return;
    const e = cur; cur = null;
    if (e.type === "VERTEX") { if (poly && !(e._flag & 16)) poly.vertices.push({ x: e._x, y: e._y, bulge: e._b ?? 0 }); return; }
    if (e.type === "SEQEND") { poly = null; return; }
    if (e.type === "BLOCK") { block = { name: e.name, position: { x: e._x ?? 0, y: e._y ?? 0 }, entities: [] }; if (e.name) blocks[e.name] = block; target = block.entities; return; }
    if (e.type === "ENDBLK") { block = null; target = entities; return; }
    if (e.inPaperSpace) return;
    switch (e.type) {
      case "LINE": target.push({ type: "LINE", layer: e.layer, vertices: [{ x: e._x, y: e._y }, { x: e._x1, y: e._y1 }] }); break;
      case "LWPOLYLINE": target.push({ type: "LWPOLYLINE", layer: e.layer, shape: (e._flag & 1) === 1, vertices: e._vs ?? [] }); break;
      case "POLYLINE": if (!(e._flag & (16 | 64))) { const pl = { type: "POLYLINE", layer: e.layer, shape: (e._flag & 1) === 1, vertices: [] as AnyEnt[] }; target.push(pl); poly = pl; } else poly = { vertices: [] }; break;
      case "CIRCLE": target.push({ type: "CIRCLE", layer: e.layer, center: { x: e._x, y: e._y }, radius: e._r }); break;
      case "ARC": target.push({ type: "ARC", layer: e.layer, center: { x: e._x, y: e._y }, radius: e._r, startAngle: (e._a0 ?? 0) * deg, endAngle: (e._a1 ?? 360) * deg }); break;
      case "INSERT": target.push({ type: "INSERT", layer: e.layer, name: e.name, position: { x: e._x ?? 0, y: e._y ?? 0 }, xScale: e._sx ?? 1, yScale: e._sy ?? 1, rotation: e._rot ?? 0 }); break;
      case "TEXT": case "MTEXT": { const t = ((e._t3 ?? "") + (e._t ?? "")).trim(); if (t) target.push({ type: "TEXT", layer: e.layer, text: t, position: { x: e._x ?? 0, y: e._y ?? 0 }, height: e._r ?? 0 }); break; }
      default: break;
    }
  };
  while (next()) {
    if (code === 0) {
      flush();
      if (val === "SECTION") { if (!next()) break; section = (code as number) === 2 ? val : ""; continue; }
      if (val === "ENDSEC") { section = ""; continue; }
      if (val === "EOF") break;
      if (section === "ENTITIES" || section === "BLOCKS") cur = { type: val, layer: "0" };
      continue;
    }
    if (section === "HEADER") {
      if (code === 9) hdrVar = val; else if (hdrVar === "$INSUNITS" && code === 70) header.$INSUNITS = Number(val);
      continue;
    }
    if (!cur) continue;
    const num = Number(val);
    switch (code) {
      case 8: cur.layer = val; break;
      case 1: if (cur.type === "TEXT" || cur.type === "MTEXT") cur._t = val.slice(0, 200); break;
      case 3: if (cur.type === "MTEXT") cur._t3 = ((cur._t3 ?? "") + val).slice(0, 200); break;
      case 2: cur.name = val; break;
      case 67: cur.inPaperSpace = num === 1; break;
      case 70: cur._flag = num; break;
      case 40: cur._r = num; break;
      case 41: cur._sx = num; break;
      case 42: if (cur.type === "LWPOLYLINE") { const vs = cur._vs; if (vs?.length) vs[vs.length - 1].bulge = num; } else if (cur.type === "VERTEX") cur._b = num; else cur._sy = num; break;
      case 50: if (cur.type === "INSERT") cur._rot = num; else cur._a0 = num; break;
      case 51: cur._a1 = num; break;
      case 10: if (cur.type === "LWPOLYLINE") (cur._vs ??= []).push({ x: num, y: 0, bulge: 0 }); else cur._x = num; break;
      case 20: if (cur.type === "LWPOLYLINE") { const vs = cur._vs; if (vs?.length) vs[vs.length - 1].y = num; } else cur._y = num; break;
      case 11: cur._x1 = num; break;
      case 21: cur._y1 = num; break;
      default: break;
    }
  }
  flush();
  return { header, entities, blocks };
}

export function readDxf(raw: string): DxfModel {
  let dxf: { header?: AnyEnt; entities: AnyEnt[]; blocks?: Record<string, AnyEnt> } | null = null;
  try { dxf = leanParseDxf(raw); } catch { dxf = null; }
  if (!dxf || dxf.entities.length === 0) {
    dxf = new DxfParser().parseSync(cleanDxfText(raw)) as unknown as { header?: AnyEnt; entities: AnyEnt[]; blocks?: Record<string, AnyEnt> } | null;
  }
  if (!dxf) throw new Error("This DXF file could not be read.");
  const blocks = dxf.blocks ?? {};
  const paths: DxfPath[] = [];
  const texts: DxfText[] = [];
  const views: DxfView[] = [];
  const noiseCache = new Map<string, boolean>();
  const extentPts: number[] = [];

  const walk = (ents: AnyEnt[], m: Xf, parentLayer: string | null, depth: number) => {
    for (const e of ents) {
      if (paths.length > 150000) return;
      if (e.inPaperSpace) continue;
      const layer: string = (e.layer === "0" || !e.layer) && parentLayer ? parentLayer : (e.layer ?? "0");
      // doors, windows, glazing, furniture … never carry formwork geometry: skip their lines (keep their texts)
      const noise = noiseCache.get(layer) ?? (noiseCache.set(layer, isNoiseLayer(layer)), noiseCache.get(layer)!);
      const push = (pts: Pt[], closed: boolean) => {
        if (pts.length < 2) return;
        if (!noise) { paths.push({ layer, pts: pts.map(([x, y]) => ap(m, x, y)), closed }); return; }
        // skipped lines still count for the drawing extents, so saved plan regions (in picture pixels) stay put
        if (extentPts.length < 4_000_000) for (const [x, y] of pts) { const q = ap(m, x, y); extentPts.push(q[0], q[1]); }
      };
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
          const before = paths.length;
          walk(b.entities ?? [], mul(m, local), layer, depth + 1);
          // a big named block placed in model space is a drawing of its own (e.g. "TOWER B FIRST FLOOR PLAN")
          if (depth === 0 && paths.length - before >= 150 && !/^\*|^A\$C[0-9a-f]+$/i.test(String(e.name))) {
            let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
            for (let i = before; i < paths.length; i++) for (const [x, y] of paths[i].pts) { if (x < x0) x0 = x; if (y < y0) y0 = y; if (x > x1) x1 = x; if (y > y1) y1 = y; }
            if (x1 > x0) views.push({ name: String(e.name).slice(0, 120), box: [x0, y0, x1, y1] });
          }
          break;
        }
        case "TEXT": case "MTEXT": {
          if (texts.length >= 20000 || depth > 2) break;
          const raw = String(e.text ?? "");
          if (layer === VIEW_LAYER && raw.startsWith("VIEW|")) {
            const [, a, b2, c, d2, ...name] = raw.split("|");
            const box = [a, b2, c, d2].map(Number) as [number, number, number, number];
            if (box.every(Number.isFinite) && box[2] > box[0]) views.push({ name: name.join("|").trim(), box });
            break;
          }
          const clean = raw.replace(/\\P/g, " ").replace(/\\[LlOoKk]/g, "").replace(/\\[A-Za-z][^;\\]*;/g, "").replace(/[{}]/g, "").replace(/%%[cdpCDP]/g, "").replace(/\s+/g, " ").trim();
          const pos = e.position ?? e.startPoint ?? { x: 0, y: 0 };
          if (clean && Number.isFinite(pos.x) && Number.isFinite(pos.y)) { const [x, y] = ap(m, pos.x, pos.y); texts.push({ text: clean.slice(0, 160), x, y, h: Math.abs(Number(e.height ?? e.textHeight ?? 0)) || 0 }); }
          break;
        }
        default: break; // dimensions, hatches etc. are not needed for quantities
      }
    }
  };
  walk(dxf.entities ?? [], ID, null, 0);
  if (paths.length === 0) throw new Error("No lines or polylines were found in this DXF (only model space is read).");

  // extents: ignore a few far-away stray objects
  const xs: number[] = [], ys: number[] = [];
  for (const p of paths) for (const [x, y] of p.pts) { xs.push(x); ys.push(y); }
  for (let i = 0; i < extentPts.length; i += 2) { xs.push(extentPts[i]); ys.push(extentPts[i + 1]); }
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

  return { texts, views, paths, layers: [...byLayer.values()].sort((a, b) => b.count - a.count), units, unitsGuessed, bbox: [x0, y0, x1, y1] };
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
    fromPx: ([px, py]: Pt): Pt => [px / s + x0 - pad, y1 + pad - py / s],
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

/**
 * Joins open pieces of outline into closed loops: pieces whose ends meet (within `tol`, drawing units) are
 * chained; a chain whose ends meet is closed. With `closeGaps` (columns), a 3-sided outline whose missing
 * side is no longer than its longest side is also closed — many drawings leave the last column side undrawn.
 */
export function closedLoops(paths: DxfPath[], tol: number, closeGaps = false): Pt[][] {
  const out: Pt[][] = [];
  const open: Pt[][] = [];
  for (const p of paths) { if (p.closed) out.push(p.pts); else if (p.pts.length >= 2) open.push([...p.pts]); }
  if (open.length > 20000) return out;
  const key = (q: Pt) => `${Math.round(q[0] / tol)},${Math.round(q[1] / tol)}`;
  const ends = new Map<string, number[]>();
  const reg = (i: number) => { for (const q of [open[i][0], open[i][open[i].length - 1]]) { const k = key(q); (ends.get(k) ?? ends.set(k, []).get(k)!).push(i); } };
  open.forEach((_, i) => reg(i));
  const used = new Set<number>();
  const near = (a: Pt, b: Pt) => Math.hypot(a[0] - b[0], a[1] - b[1]) <= tol * 1.5;
  const find = (q: Pt, self: number) => {
    const [kx, ky] = key(q).split(",").map(Number);
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (const j of ends.get(`${kx + dx},${ky + dy}`) ?? []) {
      if (j === self || used.has(j)) continue;
      const o = open[j];
      if (near(o[0], q)) return { j, rev: false };
      if (near(o[o.length - 1], q)) return { j, rev: true };
    }
    return null;
  };
  for (let i = 0; i < open.length; i++) {
    if (used.has(i)) continue;
    used.add(i);
    let chain = [...open[i]];
    for (let guard = 0; guard < 500; guard++) {
      const nx = find(chain[chain.length - 1], i); if (!nx) break;
      used.add(nx.j);
      const seg = nx.rev ? [...open[nx.j]].reverse() : open[nx.j];
      chain = chain.concat(seg.slice(1));
    }
    const a = chain[0], b = chain[chain.length - 1];
    if (chain.length >= 3 && near(a, b)) { out.push(chain.slice(0, -1)); continue; }
    if (closeGaps && chain.length >= 4) {
      let longest = 0; for (let k = 1; k < chain.length; k++) longest = Math.max(longest, Math.hypot(chain[k][0] - chain[k - 1][0], chain[k][1] - chain[k - 1][1]));
      if (Math.hypot(a[0] - b[0], a[1] - b[1]) <= longest * 1.05) out.push(chain);
    }
  }
  return out;
}

/** Staircases: stair-layer lines grouped (1 m apart), groups at least 2 × 2 m. Boxes in drawing units. */
function stairClusters(paths: DxfPath[], u: number): [number, number, number, number][] {
  const boxes = paths.map((p) => { const xs = p.pts.map((q) => q[0]), ys = p.pts.map((q) => q[1]); return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)]; });
  const g = 1 / u; const parent = boxes.map((_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
    const a = boxes[i], b = boxes[j];
    if (a[0] - g <= b[2] && b[0] - g <= a[2] && a[1] - g <= b[3] && b[1] - g <= a[3]) parent[find(i)] = find(j);
  }
  const grp = new Map<number, number[]>();
  boxes.forEach((b, i) => { const r = find(i); const c = grp.get(r) ?? [Infinity, Infinity, -Infinity, -Infinity]; grp.set(r, [Math.min(c[0], b[0]), Math.min(c[1], b[1]), Math.max(c[2], b[2]), Math.max(c[3], b[3])]); });
  return [...grp.values()].filter((b) => (b[2] - b[0]) * u >= 2 && (b[3] - b[1]) * u >= 2) as [number, number, number, number][];
}

const closeRing = (r: Pt[]): [number, number][] => { const o = r.map((q) => [q[0], q[1]] as [number, number]); if (o.length && (o[0][0] !== o[o.length - 1][0] || o[0][1] !== o[o.length - 1][1])) o.push(o[0]); return o; };
const SLAB_EDGE_HINT = /parapet|railing|balcon|chajja|slab.?edge/i;

/** keep: optional filter, e.g. only paths inside the chosen plan region (so sections/elevations in the same file are not counted). */
export function dxfAuto(model: DxfModel, roles: Record<string, LayerRole>, unitToM: number, keep?: (p: DxfPath) => boolean, minOpeningM2 = 0.4): DxfAuto {
  const of = (r: LayerRole) => model.paths.filter((p) => (roles[p.layer] ?? "ignore") === r && (!keep || keep(p)));
  const u = unitToM, u2 = unitToM * unitToM;
  const tol = 0.005 / u;                                      // 5 mm in drawing units
  const loops = (r: LayerRole, gaps = false) => closedLoops(of(r), tol, gaps).map((pts) => ({ layer: r, pts, closed: true }) as DxfPath);

  // columns: small rectangular / round outlines; big or L-shaped ones (shear walls, lift cores) are walls
  const colAll = outermost(loops("columns", true).filter((p) => p.pts.length >= 3)).map(({ p }) => {
    const xs = p.pts.map((q) => q[0]), ys = p.pts.map((q) => q[1]);
    const w = (Math.max(...xs) - Math.min(...xs)) * u, d = (Math.max(...ys) - Math.min(...ys)) * u, area = polyArea(p.pts) * u2;
    // round: many points, as wide as deep and about π/4 of its box; anything else that is not a rectangle is a wall
    const round = p.pts.length > 8 && Math.abs(w - d) <= 0.1 * Math.max(w, d) && area >= 0.7 * w * d && area <= 0.86 * w * d;
    return { p, w, d, perimeter: polyLength(p.pts, true) * u, area, round, isCol: area > 0 && w >= 0.1 && d >= 0.1 && w <= 4 && d <= 4 && (area >= 0.86 * w * d || round) };
  });
  const colWalls = colAll.filter((c) => !c.isCol && c.area > 0.05).map((c) => c.p.pts);

  // walls: closed outlines merged (duplicates / overlaps once) → wall tops + face length; loose lines add their length
  const wallPaths = of("walls");
  const U = wallUnion([...wallPaths.filter((p) => p.closed).map((p) => p.pts), ...colWalls]);
  let looseLen = 0; const loose: Pt[][] = [];
  for (const p of wallPaths) {
    if (p.closed) continue;
    const L = polyLength(p.pts, false);
    const mid: Pt = [(p.pts[0][0] + p.pts[p.pts.length - 1][0]) / 2, (p.pts[0][1] + p.pts[p.pts.length - 1][1]) / 2];
    if (U.rings.length && nearRings(mid, U.rings, 0.02 / u) && nearRings(p.pts[0], U.rings, 0.02 / u)) continue;   // lies on a wall already counted
    looseLen += L; loose.push(p.pts);
  }

  // openings: closed loops + boxes marked with an X
  // IS 1200-5: openings under 0.4 m² are not deducted
  const openL = outermost([...loops("opening"), ...xMarkedBoxes(of("opening"), 0.02 / u).map((pts) => ({ layer: "opening", pts, closed: true }) as DxfPath)]).filter((x) => x.a * u2 >= minOpeningM2);

  // beams: outlines on beam layers. A size in the layer name ("BEAM 300X750H") gives each beam its own width and
  // depth: the part clear of walls / columns is its length → both sides (depth − slab) and the bottom. Beam layers
  // without a size keep the old rule (line length × one default depth).
  const beamPaths = of("beams");
  const byLayer = new Map<string, DxfPath[]>();
  for (const p of beamPaths) (byLayer.get(p.layer) ?? byLayer.set(p.layer, []).get(p.layer)!).push(p);
  const solid: MultiPolygon = [];
  for (const r of U.rings) if (r.length >= 3) solid.push([closeRing(r)]);
  for (const c of colAll) if (c.isCol) solid.push([closeRing(c.p.pts)]);
  let solidU: MultiPolygon = [];
  try { solidU = solid.length ? polygonClipping.union(solid[0] as Polygon, ...(solid.slice(1) as Polygon[])) : []; } catch { solidU = []; }
  const sized = new Map<string, { b: number; d: number; len: number; bottom: number; count: number }>();
  const beamRings: Pt[][] = [];
  let unsizedLen = 0;
  // a size written next to the beam ("B:125X750H", "IVP:100X375H", "B1 230x450") when the layer has none
  const sizeTexts = (model.texts ?? []).map((t) => ({ t, sz: beamSizeFromLayer(t.text) })).filter((x) => x.sz);
  const sizeNear = (r: Pt[], wMm: number) => {
    const xs = r.map((q) => q[0]), ys = r.map((q) => q[1]), pad = 0.6 / u;
    const b = [Math.min(...xs) - pad, Math.min(...ys) - pad, Math.max(...xs) + pad, Math.max(...ys) + pad];
    const cx = (b[0] + b[2]) / 2, cy = (b[1] + b[3]) / 2;
    // the label of this beam: inside its box, and its width matches the drawn width
    const hits = sizeTexts.filter((x) => x.t.x >= b[0] && x.t.x <= b[2] && x.t.y >= b[1] && x.t.y <= b[3] && Math.abs(x.sz!.b - wMm) <= 0.5 * x.sz!.b);
    hits.sort((p1, p2) => Math.hypot(p1.t.x - cx, p1.t.y - cy) - Math.hypot(p2.t.x - cx, p2.t.y - cy));
    return hits[0]?.sz ?? null;
  };
  for (const [layer, ps] of byLayer) {
    const lsz = beamSizeFromLayer(layer);
    const L = closedLoops(ps, tol).filter((r) => r.length >= 3 && Math.abs(polyArea(r)) * u2 > 0.01);
    if (!L.length) { unsizedLen += ps.reduce((s2, p) => s2 + polyLength(p.pts, p.closed), 0) * u; continue; }
    for (const r of L) {
      // a beam outline is a narrow strip about as wide as the beam (not a room enclosed by chained beam lines)
      const wEst = (2 * Math.abs(polyArea(r)) * u2) / Math.max(1e-9, polyLength(r, true) * u) * 1000;
      const sz = lsz ?? sizeNear(r, wEst);
      if (!sz || wEst < 0.4 * sz.b || wEst > 1.8 * sz.b) { unsizedLen += polyLength(r, true) * u; continue; }
      beamRings.push(r);
      let clearA = Math.abs(polyArea(r)) * u2;
      try { if (solidU.length) { const diff = polygonClipping.difference([closeRing(r)] as Polygon, solidU); clearA = diff.reduce((s2, poly) => s2 + Math.abs(polyArea(poly[0].slice(0, -1) as Pt[])) - poly.slice(1).reduce((h, q) => h + Math.abs(polyArea(q.slice(0, -1) as Pt[])), 0), 0) * u2; } } catch { /* keep the full area */ }
      const k = `${sz.b}x${sz.d}`;
      const g = sized.get(k) ?? { b: sz.b, d: sz.d, len: 0, bottom: 0, count: 0 };
      g.len += clearA / (sz.b / 1000); g.bottom += clearA; g.count++; sized.set(k, g);
    }
  }
  const beamSized = [...sized.values()].sort((a, b) => b.len - a.len);

  // slab: slab layer outlines; if none, the outer face of the walls (with columns and beams: a framed building's
  // slab runs out to its beams)
  let slab = outermost(loops("slab"));
  let slabFromWalls = false;
  // a slab layer that covers only a small corner of the walls (a detail, a balcony) is not the floor outline
  if (slab.length && wallPaths.length) {
    const xs = wallPaths.flatMap((p) => p.pts.map((q) => q[0])), ys = wallPaths.flatMap((p) => p.pts.map((q) => q[1]));
    const wallBox = (Math.max(...xs) - Math.min(...xs)) * (Math.max(...ys) - Math.min(...ys));
    if (slab.reduce((s2, x) => s2 + x.a, 0) < 0.25 * wallBox) slab = [];
  }
  if (!slab.length && (wallPaths.length || beamRings.length)) {
    // balcony parapets / railings mark slab edges outside the walls
    const edgeHints = model.paths.filter((p) => SLAB_EDGE_HINT.test(p.layer) && (!keep || keep(p)));
    const frame = beamRings.length ? [...beamRings.map((pts) => ({ pts, closed: true })), ...colAll.map((c) => ({ pts: c.p.pts, closed: true }))] : [];
    const o = outlineFromWalls([...wallPaths, ...colWalls.map((pts) => ({ pts, closed: true })), ...frame, ...edgeHints], 1 / u);
    const outer = o.loops.filter((l) => polyArea(l) > 0);
    if (outer.length) { slab = outer.map((pts) => ({ p: { layer: "slab", pts, closed: true } as DxfPath, a: Math.abs(polyArea(pts)) })); slabFromWalls = true; }
  }

  const cols = colAll.filter((c) => c.isCol).map(({ w, d, perimeter, area, p, round }) => ({ w, d, perimeter, area, round, pts: p.pts }));
  return {
    slabArea: slab.reduce((s, x) => s + x.a, 0) * u2,
    slabPerimeter: slab.reduce((s, x) => s + polyLength(x.p.pts, true), 0) * u,
    openingArea: openL.reduce((s, x) => s + x.a, 0) * u2,
    openingPerimeter: openL.reduce((s, x) => s + polyLength(x.p.pts, true), 0) * u,
    wallLineLength: (U.perimeter + looseLen) * u,
    wallTopArea: U.area * u2,
    beamLineLength: unsizedLen,
    beamSized, beamRings,
    columns: cols.map(({ w, d, perimeter, area, round }) => ({ w, d, perimeter, area, round })), columnRings: cols.map((c) => c.pts),
    slabFromWalls, slabLoops: slab.map((x) => x.p.pts), openingLoops: openL.map((x) => x.p.pts),
    wallRings: U.rings, wallLoose: loose,
    ...(() => { const s = stairClusters(model.paths.filter((p) => /stair|staircase|\bstep|(^|[^a-z])strs([^a-z]|$)/i.test(p.layer) && (!keep || keep(p))), u); return { stairCount: s.length, stairBoxes: s }; })(),
    ...(() => { const g = wallGaps(U.rings, u); return { gapSpan: g.reduce((s, x) => s + x.span, 0), gapCount: g.length, gaps: g.map((x) => ({ a: x.a, b: x.b, span: x.span, thk: x.thk })) }; })(),
  };
}

/**
 * Finds the separate drawings (floor plans, sections…) in a DXF by grouping wall lines that lie close together.
 * Returns their boxes in drawing units, biggest first — the user clicks the typical floor instead of boxing it by hand.
 */
export type PlanCandidate = { box: [number, number, number, number]; count: number; w: number; h: number; title?: string; score: number; floors?: number };

const BAD_TITLE = /section|elevation|site|roof|terrace|parking|basement|stilt|podium|detail|stair|lift|key\s*plan|location|schedule|foundation|footing|column\s*layout|centre\s*line|center\s*line|剖面|立面|屋面|地下|详图|大样|楼梯|总平面/i;
/** Floors from a title like "TYPICAL 1ST TO 14TH FLOOR PLAN" or "2nd-12th floor". */
function floorsFromTitle(t: string): number | undefined {
  const m = t.match(/(\d{1,3})\s*(?:st|nd|rd|th)?\s*(?:floor\s*)?(?:to|-|–|&|upto|up to)\s*(\d{1,3})\s*(?:st|nd|rd|th)?/i);
  if (m) { const a = +m[1], b = +m[2]; if (b > a && b - a < 200) return b - a + 1; }
  const n = t.match(/\((\d{1,3})\s*(?:nos|floors?)\)/i) ?? t.match(/(\d{1,3})\s*(?:nos\.?|floors)\b/i);
  if (n && +n[1] > 0 && +n[1] < 200) return +n[1];
  return undefined;
}
/** Title of a drawing: the biggest text inside or just below/above its box that reads like a drawing title. */
function titleFor(texts: DxfText[], box: [number, number, number, number], others: number[][] = []): string | undefined {
  const [x0, y0, x1, y1] = box, w = x1 - x0, h = y1 - y0;
  const inOther = (t: DxfText) => others.some((o) => t.x > o[0] && t.x < o[2] && t.y > o[1] && t.y < o[3] && !(t.x >= x0 && t.x <= x1 && t.y >= y0 && t.y <= y1));
  const near = texts.filter((t) => t.x >= x0 - w * 0.05 && t.x <= x1 + w * 0.05 && t.y >= y0 - h * 0.25 && t.y <= y1 + h * 0.25 && !inOther(t))
    .map((t) => ({ ...t, text: t.text.split(/\bscale\b/i)[0].replace(/\\[A-Za-z]/g, "").trim().slice(0, 80) }))
    .filter((t) => /plan|section|elevation|layout|floor|block|tower|wing|平面图|剖面|立面图|深化图|大样/i.test(t.text) && !/\b(lvl|level|slab|beam)\b/i.test(t.text) && !/^回复|说明|问题|建议|仅用于|^\d+[.、]\s?\S/.test(t.text) && t.text.length >= 4 && t.text.length <= 90);
  const pri = (x: string) => (/plan|section|elevation|layout|平面图|剖面|立面图|深化图/i.test(x) ? 1 : 0);
  // a big title written inside the drawing's own outline wins; otherwise "… PLAN / SECTION / ELEVATION" titles, biggest first
  const maxH = Math.max(0, ...near.map((t) => t.h));
  const own = (t: DxfText) => (t.x >= x0 && t.x <= x1 && t.y >= y0 && t.y <= y1 && t.h >= 0.6 * maxH ? 1 : 0);
  near.sort((a, b) => own(b) - own(a) || pri(b.text) - pri(a.text) || b.h - a.h || (/typical/i.test(b.text) ? 1 : 0) - (/typical/i.test(a.text) ? 1 : 0));
  return near[0]?.text;
}
/** Floor height (mm) and number of slabs (first floor to terrace) read from the drawing's notes and level marks. */
/** Floor height (mm) and number of floors read from the drawing's notes, level marks and level names.
 *  `extra` = other names to read too (project / lead name, file name) — e.g. "Basement+G+12 Floors". */
export function floorInfoFromTexts(texts: DxfText[], unitToM = 0.001, extra: string[] = []): { heightMm?: number; floors?: number; source?: string } {
  let heightMm = floorHeightFromTexts(texts);
  let hSource: string | undefined;
  let floors: number | undefined, source: string | undefined;
  for (const t of [...texts.map((x) => x.text), ...extra]) { const m = t.match(/\bG\s*\+\s*(\d{1,3})\b/i); if (m && +m[1] > 0 && +m[1] < 150) { floors = +m[1]; source = `"${t.slice(0, 40)}"`; break; } }
  const stack = levelNameStack(texts, unitToM);
  if (!floors && stack?.floors) { floors = stack.floors; source = stack.source; }
  if (!heightMm && stack?.heightMm) { heightMm = stack.heightMm; hSource = stack.source; }
  if (!floors && heightMm) {
    const lv = levelMarks(texts).filter((v) => v >= 2000);
    if (lv.length >= 2) {
      const n = (lv[lv.length - 1] - lv[0]) / heightMm;
      if (Math.abs(n - Math.round(n)) < 0.02 && n >= 1) { floors = Math.round(n) + 1; source = `level marks +${lv[0]} to +${lv[lv.length - 1]} mm`; }
    }
  }
  return { heightMm, floors, source: source ?? hSource };
}

const ORD: Record<string, number> = { first: 1, second: 2, third: 3, fourth: 4, fifth: 5, sixth: 6, seventh: 7, eighth: 8, eight: 8, ninth: 9, nineth: 9, tenth: 10, eleventh: 11, twelfth: 12, twelth: 12, twelve: 12, thirteenth: 13, fourteenth: 14, fifteenth: 15, sixteenth: 16, seventeenth: 17, eighteenth: 18, nineteenth: 19, twentieth: 20 };
/** Revit / section level names stacked one above the other ("01 FIRST FLOOR LVL" … "13 TERRACE FLOOR LVL"):
 *  floors = numbered floor levels below the terrace, floor height = their vertical spacing on the section. */
function levelNameStack(texts: DxfText[], unitToM: number): { floors?: number; heightMm?: number; source: string } | null {
  type L = { n: number; x: number; y: number; terrace: boolean };
  const ls: L[] = [];
  for (const t of texts) {
    const s = t.text.trim();
    if (!/\b(floor|flr)\b.*\b(lvl|level|lev)\b|\b(lvl|level)\b.*\bfloor\b|terrace/i.test(s) || s.length > 50) continue;
    const terrace = /terrace|roof/i.test(s);
    const num = s.match(/^(\d{1,3})\b/) ?? s.match(/\b(\d{1,3})(?:st|nd|rd|th)\b/i);
    const word = s.toLowerCase().match(/\b(first|second|third|fourth|fifth|sixth|seventh|eighth|eight|ninth|nineth|tenth|eleventh|twelfth|twelth|twelve|thirteenth|fourteenth|fifteenth|sixteenth|seventeenth|eighteenth|nineteenth|twentieth)\b/);
    const n = num ? +num[1] : word ? ORD[word[1]] : NaN;
    if (Number.isFinite(n) && n >= 0 && n < 150) ls.push({ n, x: t.x, y: t.y, terrace });
  }
  if (ls.length < 3) return null;
  // the longest column of level names (same x within 1 m)
  const col = new Map<number, L[]>();
  for (const l of ls) { const k = Math.round((l.x * unitToM) / 1); col.set(k, [...(col.get(k) ?? []), l]); }
  const best = [...col.values()].sort((a, b) => b.length - a.length)[0];
  const byN = new Map<number, L>(); for (const l of best) if (!byN.has(l.n)) byN.set(l.n, l);
  const arr = [...byN.values()].sort((a, b) => a.n - b.n);
  if (arr.length < 3) return null;
  const top = arr.find((l) => l.terrace) ?? arr[arr.length - 1];
  const floors = arr.filter((l) => !l.terrace && l.n >= 1 && l.n < top.n).length || undefined;
  const steps: number[] = [];
  for (let i = 1; i < arr.length; i++) if (arr[i].n === arr[i - 1].n + 1) steps.push(Math.round(((arr[i].y - arr[i - 1].y) * unitToM * 1000) / 5) * 5);
  steps.sort((a, b) => a - b);
  const med = steps.length >= 2 ? steps[Math.floor(steps.length / 2)] : undefined;
  const agree = med ? steps.filter((v) => Math.abs(v - med) <= 10).length >= Math.max(2, steps.length * 0.6) : false;
  const heightMm = med && agree && med >= 2400 && med <= 4500 ? med : undefined;
  return { floors, heightMm, source: `level names ${arr[0].n}–${top.n}${top.terrace ? " (terrace)" : ""}` };
}
function levelMarks(texts: DxfText[]): number[] {
  const lv = new Set<number>();
  for (const t of texts) for (const m of t.text.matchAll(/(?:^|[^\d.])\+\s*(\d{1,3}\.\d{2,3})(?!\d)/g)) { const v = Math.round(+m[1] * 1000); if (v > 0 && v < 400000) lv.add(v); }
  for (const t of texts) for (const m of t.text.matchAll(/\+\s*(\d{3,6})\s*mm/gi)) { const v = +m[1]; if (v > 0 && v < 400000) lv.add(v); }
  return [...lv].sort((a, b) => a - b);
}

/** Floor-to-floor height (mm) read from the drawing: "FLOOR HEIGHT 3075" / "F.T.F. 3.075", else the usual step between level marks (+3.075, +6.150 …). */
export function floorHeightFromTexts(texts: DxfText[]): number | undefined {
  for (const t of texts) {
    const m = t.text.match(/(?:floor\s*(?:to\s*floor\s*)?height|f\s*\.?\s*t\s*\.?\s*f\s*\.?|floor\s*ht\.?)\D{0,8}(\d{4}|\d\.\d{2,3})/i);
    if (m) { const v = m[1].includes(".") ? Math.round(+m[1] * 1000) : +m[1]; if (v >= 2600 && v <= 4500) return v; }
  }
  const lv = new Set<number>();
  for (const t of texts) for (const m of t.text.matchAll(/(?:^|[^\d.])\+\s*(\d{1,3}\.\d{2,3})(?!\d)/g)) { const v = Math.round(+m[1] * 1000); if (v > 0 && v < 400000) lv.add(v); }
  for (const t of texts) for (const m of t.text.matchAll(/\+\s*(\d{3,6})\s*mm/gi)) { const v = +m[1]; if (v > 0 && v < 400000) lv.add(v); }
  const vals = [...lv].sort((a, b) => a - b);
  const diffs = new Map<number, number>();
  for (let i = 1; i < vals.length; i++) { const d = Math.round((vals[i] - vals[i - 1]) / 5) * 5; if (d >= 2600 && d <= 4500) diffs.set(d, (diffs.get(d) ?? 0) + 1); }
  const best = [...diffs.entries()].sort((a, b) => b[1] - a[1])[0];
  if (best && best[1] >= 2) return best[0];
  // first floor and top (terrace) levels only: floor height = (top − first) / n that is a round 25 mm figure
  const hi = vals.filter((v) => v >= 2000);
  if (hi.length >= 2) {
    const span = hi[hi.length - 1] - hi[0];
    const fits: number[] = [];
    for (let n = 1; n <= 80; n++) { const h = span / n; const r = h % 25; if (h >= 2750 && h <= 3600 && (r < 0.5 || r > 24.5)) fits.push(Math.round(h)); }
    if (fits.length === 1) return fits[0];
  }
  return undefined;
}

export function planCandidates(model: DxfModel, roles: Record<string, LayerRole>, unitToM: number): PlanCandidate[] {
  const walls = model.paths.filter((p) => (roles[p.layer] ?? "ignore") === "walls");
  if (walls.length < 5) return [];
  const gap = 2.5 / unitToM;                                  // drawings closer than 2.5 m belong together
  const C = gap;
  const [bx0, by0] = model.bbox;
  const cells = new Map<string, number>();                    // cell → wall count
  for (const p of walls) for (const [x, y] of p.pts) {
    const k = `${Math.floor((x - bx0) / C)},${Math.floor((y - by0) / C)}`;
    cells.set(k, (cells.get(k) ?? 0) + 1);
  }
  const seen = new Set<string>();
  const out: PlanCandidate[] = [];
  for (const start of cells.keys()) {
    if (seen.has(start)) continue;
    const stack = [start]; seen.add(start);
    let i0 = Infinity, j0 = Infinity, i1 = -Infinity, j1 = -Infinity, n = 0;
    while (stack.length) {
      const k = stack.pop()!; const [i, j] = k.split(",").map(Number);
      n += cells.get(k) ?? 0; i0 = Math.min(i0, i); j0 = Math.min(j0, j); i1 = Math.max(i1, i); j1 = Math.max(j1, j);
      for (let di = -1; di <= 1; di++) for (let dj = -1; dj <= 1; dj++) {
        const q = `${i + di},${j + dj}`;
        if (!seen.has(q) && cells.has(q)) { seen.add(q); stack.push(q); }
      }
    }
    const box: [number, number, number, number] = [bx0 + i0 * C, by0 + j0 * C, bx0 + (i1 + 1) * C, by0 + (j1 + 1) * C];
    out.push({ box, count: n, w: (box[2] - box[0]) * unitToM, h: (box[3] - box[1]) * unitToM, score: n });
  }
  const max = Math.max(...out.map((o) => o.count));
  const texts = model.texts ?? [];
  const kept = out.filter((o) => o.count >= max * 0.08 && o.w >= 3 && o.h >= 3);
  const areaOf = (b: number[]) => Math.max(0, b[2] - b[0]) * Math.max(0, b[3] - b[1]);
  for (const o of kept) {
    // the named drawing (Revit view / block) this candidate sits in
    const v = (model.views ?? []).map((v) => ({ v, i: areaOf([Math.max(v.box[0], o.box[0]), Math.max(v.box[1], o.box[1]), Math.min(v.box[2], o.box[2]), Math.min(v.box[3], o.box[3])]) }))
      .filter((x) => x.i >= 0.6 * areaOf(o.box)).sort((a, b) => areaOf(a.v.box) - areaOf(b.v.box))[0]?.v;
    const vl = v ? viewLabel(v.name) : undefined;
    const tt = texts.length ? titleFor(texts, o.box) : undefined;
    const title = tt && vl && !tt.toUpperCase().includes(vl.toUpperCase()) ? `${tt} · ${vl}` : tt ?? vl;
    o.title = title;
    if (tt) o.count *= 1.001;                                   // same drawing twice: prefer the copy with its own title
    // the typical floor plan: most walls, a "typical … plan" title, not a section / elevation / site / parking / roof drawing
    let f = 1;
    if (title) {
      if (/typical/i.test(title)) f = 4;
      else if (BAD_TITLE.test(title)) f = 0.25;
      else if (/floor\s*plan|plan|block|tower|wing/i.test(title)) f = 1.5;
      o.floors = floorsFromTitle(title);
    }
    const aspect = Math.max(o.w, o.h) / Math.max(0.1, Math.min(o.w, o.h));
    if (aspect > 6) f *= 0.3;                                   // long thin strips: elevations / sections
    o.score = o.count * f;
  }
  return kept.sort((a, b) => b.score - a.score).slice(0, 12);
}


/* ---------- separate drawings in one file ---------- */
export type PartKind = "plan" | "section" | "elevation" | "site" | "detail" | "other";
export type DrawingPart = { n: number; box: [number, number, number, number]; w: number; h: number; title: string; sub?: string; kind: PartKind; count: number };

/** Readable name of a Revit view / block: "TO-01-TOWER _B_-ARCH-PD_rvt-1-01 FIRST FLOOR PLAN AJ" → "TOWER B · 01 FIRST FLOOR PLAN AJ". */
export function viewLabel(name: string): string {
  const n = name.replace(/_/g, " ").replace(/\s+/g, " ").trim();
  const bld = n.match(/\b(TOWER|BLOCK|WING|BLDG|BUILDING)\s*-?\s*([A-Z0-9]{1,3})\b/i);
  const bits = n.split(/rvt-\d+-/i);
  const view = (bits.length > 1 ? bits[bits.length - 1] : n).replace(/\b(ARCH|STR|MEP)-PD\b/gi, "").replace(/\s+/g, " ").trim();
  if (!bld) return view || n;
  const b = `${bld[1].toUpperCase()} ${bld[2].toUpperCase()}`;
  return view.toUpperCase().includes(b) ? view : `${b} · ${view}`;
}
export function partKind(t: string): PartKind {
  if (/section|sectional|\bsec\b|剖面/i.test(t)) return "section";
  if (/elevation|\belev\b|立面/i.test(t)) return "elevation";
  if (/大样|详图/.test(t)) return "detail";
  if (/总平面/.test(t)) return "site";
  if (/平面图|深化图|标准层/.test(t)) return "plan";
  if (/site|master|location|key\s*plan|layout\s*plan|parking/i.test(t)) return "site";
  if (/schedule|legend|notes?\b|title/i.test(t)) return "detail";
  if (/plan|floor|block|tower|wing|layout/i.test(t)) return "plan";
  if (/detail/i.test(t)) return "detail";
  return "other";
}

/**
 * Splits the whole file into its separate drawings: everything closer than 3 m belongs together; named blocks /
 * Revit views are drawings of their own. Each gets a title (drawing title text or view name) and a type.
 * Numbered in reading order (top row first, left to right).
 */
type Box = [number, number, number, number];
const boxArea = (b: number[]) => Math.max(0, b[2] - b[0]) * Math.max(0, b[3] - b[1]);
const boxInter = (a: number[], b: number[]) => boxArea([Math.max(a[0], b[0]), Math.max(a[1], b[1]), Math.min(a[2], b[2]), Math.min(a[3], b[3])]);

/** Everything closer than `gap` (drawing units) belongs together. `outside` = line points not inside a named view. */
function clusterBoxes(model: DxfModel, gap: number, vBoxes: Box[]): { box: Box; hits: number; outside: number }[] {
  const C = gap;
  const [bx0, by0, bx1, by1] = model.bbox;
  const span = Math.max(bx1 - bx0, by1 - by0);
  const cells = new Map<string, number>();
  const key = (x: number, y: number) => `${Math.floor((x - bx0) / C)},${Math.floor((y - by0) / C)}`;
  const inBox = (x: number, y: number) => x >= bx0 - span * 0.05 && x <= bx1 + span * 0.05 && y >= by0 - span * 0.05 && y <= by1 + span * 0.05;
  for (const p of model.paths) {
    // long slanting single lines are note leaders / match lines drawn across sheets: they do not join drawings
    if (p.pts.length === 2) {
      const dx = Math.abs(p.pts[1][0] - p.pts[0][0]), dy = Math.abs(p.pts[1][1] - p.pts[0][1]);
      if (Math.hypot(dx, dy) > 3 * C && Math.min(dx, dy) > 0.05 * Math.max(dx, dy)) continue;
    }
    for (let i = 0; i < p.pts.length; i++) {
      const [x, y] = p.pts[i]; if (!inBox(x, y)) continue;
      const k0 = key(x, y); cells.set(k0, (cells.get(k0) ?? 0) + 1);
      if (i > 0) {                                   // long lines fill the cells they cross
        const [px, py] = p.pts[i - 1]; const L = Math.hypot(x - px, y - py);
        const steps = Math.min(300, Math.floor(L / C));
        for (let s = 1; s < steps; s++) { const kx = key(px + ((x - px) * s) / steps, py + ((y - py) * s) / steps); if (!cells.has(kx)) cells.set(kx, 0); }
      }
    }
  }
  const inView = (i: number, j: number) => { const x = bx0 + (i + 0.5) * C, y = by0 + (j + 0.5) * C; return vBoxes.some((b) => x >= b[0] && x <= b[2] && y >= b[1] && y <= b[3]); };
  const owner = new Set<string>();
  const out: { box: Box; hits: number; outside: number }[] = [];
  for (const start of cells.keys()) {
    if (owner.has(start)) continue;
    const stack = [start]; owner.add(start);
    let i0 = Infinity, j0 = Infinity, i1 = -Infinity, j1 = -Infinity, hits = 0, outside = 0;
    while (stack.length) {
      const k = stack.pop()!; const [i, j] = k.split(",").map(Number);
      const hk = cells.get(k) ?? 0; hits += hk; if (hk && vBoxes.length && !inView(i, j)) outside += hk;
      i0 = Math.min(i0, i); j0 = Math.min(j0, j); i1 = Math.max(i1, i); j1 = Math.max(j1, j);
      for (let di = -1; di <= 1; di++) for (let dj = -1; dj <= 1; dj++) { const q = `${i + di},${j + dj}`; if (!owner.has(q) && cells.has(q)) { owner.add(q); stack.push(q); } }
    }
    out.push({ box: [bx0 + i0 * C, by0 + j0 * C, bx0 + (i1 + 1) * C, by0 + (j1 + 1) * C], hits, outside: vBoxes.length ? outside : hits });
  }
  return out;
}


/**
 * Sheet frames drawn in model space (several A1 / A0 sheets laid side by side, each with its own border and title
 * block): big axis-aligned rectangles of drawing-sheet proportions. A double border counts once; a frame drawn around
 * several sheets is left out (its sheets are the drawings).
 */
export function sheetFrames(model: DxfModel, unitToM: number): Box[] {
  const out: Box[] = [];
  for (const p of model.paths) {
    if (!p.closed || p.pts.length < 4 || p.pts.length > 5) continue;
    const xs = p.pts.map((q) => q[0]), ys = p.pts.map((q) => q[1]);
    const b: Box = [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
    const w = (b[2] - b[0]) * unitToM, h = (b[3] - b[1]) * unitToM;
    if (Math.min(w, h) < 10 || Math.max(w, h) / Math.min(w, h) < 1.2 || Math.max(w, h) / Math.min(w, h) > 2.2) continue;
    // a rectangle: every corner on the box
    const tol = Math.max(b[2] - b[0], b[3] - b[1]) * 0.002;
    if (!p.pts.every(([x, y]) => (Math.abs(x - b[0]) < tol || Math.abs(x - b[2]) < tol) && (Math.abs(y - b[1]) < tol || Math.abs(y - b[3]) < tol))) continue;
    if (!out.some((o) => boxInter(o, b) > 0.98 * Math.max(boxArea(o), boxArea(b)))) out.push(b);
  }
  out.sort((a, b) => boxArea(b) - boxArea(a));
  const keep = new Set(out);
  for (const f of out) {
    if (!keep.has(f)) continue;
    const inner = out.filter((g) => g !== f && keep.has(g) && boxArea(g) < boxArea(f) && boxInter(f, g) >= 0.95 * boxArea(g));
    if (inner.length >= 2) keep.delete(f);                      // a border around several sheets
    else if (inner.length === 1 && boxArea(inner[0]) >= 0.8 * boxArea(f)) keep.delete(inner[0]);  // double border
  }
  return out.filter((f) => keep.has(f));
}

/**
 * Splits the whole file into its separate drawings: everything closer than 3 m belongs together (closer drawings are
 * split again where each piece has its own title, or by their walls); named blocks / Revit views are drawings of their
 * own. Each gets a title (drawing title text or view name) and a type. Numbered in reading order (top row first).
 */
export function drawingParts(model: DxfModel, unitToM: number, roles?: Record<string, LayerRole>): DrawingPart[] {
  // named blocks that hold only skipped layers (glazing, doors, railings in elevations) are not drawings
  const linesIn = (b: number[]) => { let n = 0; for (const p of model.paths) { const [x, y] = p.pts[0]; if (x >= b[0] && x <= b[2] && y >= b[1] && y <= b[3] && ++n >= 30) break; } return n; };
  const views = (model.views ?? []).filter((v) => (v.box[2] - v.box[0]) * unitToM >= 2 && (v.box[3] - v.box[1]) * unitToM >= 2 && linesIn(v.box) >= 30);
  const vBoxes = views.map((v) => v.box);
  const texts = model.texts ?? [];
  const minHits = 12;
  const bigEnough = (b: Box) => (b[2] - b[0]) * unitToM >= 2 && (b[3] - b[1]) * unitToM >= 2;
  const raw: { box: Box; view?: string; hits: number; title?: string }[] = [];
  // the same view placed twice on top of itself → once
  for (const v of views) if (!raw.some((r) => boxInter(r.box, v.box) > 0.95 * Math.max(boxArea(r.box), boxArea(v.box)))) raw.push({ box: v.box, view: v.name, hits: 1000 });
  const big = clusterBoxes(model, 3 / unitToM, vBoxes);
  const small = clusterBoxes(model, 1.5 / unitToM, vBoxes).filter((c) => c.hits >= minHits && bigEnough(c.box));
  const TITLE = /plan|section|elevation|layout|floor|block|tower|wing|平面图|剖面|立面图|深化图/i;
  const cands = roles ? planCandidates(model, roles, unitToM) : [];
  const plansIn = (b: Box) => cands.filter((c) => partKind(c.title ?? "plan") === "plan" && boxInter(c.box, b) >= 0.8 * boxArea(c.box) && !views.some((v) => boxInter(c.box, v.box) >= 0.8 * boxArea(c.box)));
  const frames = sheetFrames(model, unitToM);
  const pointsIn = (b: Box) => { let n = 0; for (const p of model.paths) { const [x, y] = p.pts[0]; if (x >= b[0] && x <= b[2] && y >= b[1] && y <= b[3]) n++; } return n; };
  for (const c of big) {
    if (c.hits < minHits || !bigEnough(c.box)) continue;
    if (views.some((v) => boxInter(c.box, v.box) >= 0.85 * boxArea(c.box))) continue;  // already listed as a named drawing
    // several drawing sheets side by side, each in its own frame: every sheet is one drawing
    const fr = frames.filter((f) => boxInter(f, c.box) >= 0.9 * boxArea(f));
    if (fr.length >= 2) {
      for (const f of fr) { const n = pointsIn(f); if (n >= minHits) raw.push({ box: f, hits: n }); }
      for (const s2 of small) if (boxInter(s2.box, c.box) >= 0.9 * boxArea(s2.box) && s2.hits >= 40 && !fr.some((f) => boxInter(f, s2.box) >= 0.3 * boxArea(s2.box))) raw.push({ box: s2.box, hits: s2.hits });
      continue;
    }
    const inside = views.filter((v) => boxInter(c.box, v.box) >= 0.9 * boxArea(v.box));
    const covered = inside.reduce((s2, v) => s2 + boxArea(v.box), 0);
    if (c.outside < Math.max(minHits, c.hits * 0.12) && (inside.length >= 2 || covered >= 0.5 * boxArea(c.box))) continue; // only named drawings + a sheet frame
    // drawings placed close together: if the group carries several drawing titles (the biggest texts in it),
    // each piece goes to its nearest title
    const subs = small.filter((s2) => boxInter(s2.box, c.box) >= 0.9 * boxArea(s2.box));
    const tIn = texts.filter((t) => t.x >= c.box[0] && t.x <= c.box[2] && t.y >= c.box[1] && t.y <= c.box[3] && TITLE.test(t.text) && !/\b(lvl|level|slab|beam)\b/i.test(t.text) && t.text.length >= 4);
    const maxH = Math.max(0, ...tIn.map((t) => t.h));
    const heads = maxH > 0 ? tIn.filter((t) => t.h >= 0.7 * maxH).filter((t, i, a) => a.findIndex((u) => u.text === t.text && Math.hypot(u.x - t.x, u.y - t.y) < maxH * 3) === i) : [];
    const pl = plansIn(c.box);
    if (pl.length >= 2) {
      // several floor plans: split by their walls; the rest of the group (elevations, details) by titles below
      for (const c2 of pl) raw.push({ box: c2.box, hits: c2.count });
      const restSubs = subs.filter((s2) => !pl.some((c2) => boxInter(c2.box, s2.box) >= 0.5 * boxArea(s2.box)));
      for (const s2 of restSubs) if (s2.hits >= 40) raw.push({ box: s2.box, hits: s2.hits });
    } else if (subs.length >= 2 && heads.length >= 2 && heads.length <= 12) {
      const groups = heads.map((t) => ({ t, box: [t.x, t.y, t.x, t.y] as Box, hits: 0 }));
      const dist = (b: Box, x: number, y: number) => Math.hypot(Math.max(b[0] - x, 0, x - b[2]), Math.max(b[1] - y, 0, y - b[3]));
      for (const s2 of subs) {
        const g = groups.reduce((best, g2) => (dist(s2.box, g2.t.x, g2.t.y) < dist(s2.box, best.t.x, best.t.y) ? g2 : best), groups[0]);
        g.box = [Math.min(g.box[0], s2.box[0]), Math.min(g.box[1], s2.box[1]), Math.max(g.box[2], s2.box[2]), Math.max(g.box[3], s2.box[3])]; g.hits += s2.hits;
      }
      for (const g of groups) if (g.hits >= minHits && bigEnough(g.box)) raw.push({ box: g.box, hits: g.hits, title: g.t.text.split(/\bscale\b/i)[0].trim().slice(0, 80) });
    } else raw.push({ box: c.box, hits: c.hits });
  }
  // plans joined by grid / dimension lines are split again by their walls
  const isFrame = (b: Box) => frames.some((f) => f === b);
  for (let i = raw.length - 1; i >= 0; i--) {
    const r = raw[i]; if (r.view || isFrame(r.box)) continue;
    const own = r.title ?? (texts.length ? titleFor(texts, r.box) : undefined);
    if (own && /section|elevation|elev\b/i.test(own)) continue;
    const inside = cands.filter((c) => partKind(c.title ?? "plan") === "plan" && boxInter(c.box, r.box) >= 0.8 * boxArea(c.box) && !views.some((v) => boxInter(c.box, v.box) >= 0.8 * boxArea(c.box)));
    if (inside.length >= 2) raw.splice(i, 1, ...inside.map((c) => ({ box: c.box, hits: c.count })));
  }
  // the same box twice (overlapping groups) → once
  for (let i = raw.length - 1; i >= 0; i--) {
    const r = raw[i];
    if (raw.some((o, j) => j < i && boxInter(o.box, r.box) >= 0.9 * Math.max(boxArea(o.box), boxArea(r.box)))) raw.splice(i, 1);
  }
  // a drawing broken in two by a wide gap: the piece without its own title joins the titled piece right above / below it
  const C3 = 3.1 / unitToM;
  const ownTitle = (b: Box) => { const tt = texts.filter((t) => t.x >= b[0] && t.x <= b[2] && t.y >= b[1] && t.y <= b[3] && TITLE.test(t.text)); const all = texts.filter((t) => TITLE.test(t.text)); const mh = Math.max(0, ...all.filter((t) => t.x >= b[0] - (b[2] - b[0]) * 0.05 && t.x <= b[2] + (b[2] - b[0]) * 0.05 && t.y >= b[1] - (b[3] - b[1]) * 0.25 && t.y <= b[3] + (b[3] - b[1]) * 0.25).map((t) => t.h)); return tt.some((t) => t.h >= 0.6 * mh && mh > 0); };
  // only where titles are written ABOVE their drawings (decided by the wall plans and their titles)
  let above = 0, below = 0;
  for (const c of cands) {
    const tt = c.title ? texts.find((t) => c.title!.startsWith(t.text.slice(0, 20)) && t.x >= c.box[0] - (c.box[2] - c.box[0]) * 0.05 && t.x <= c.box[2] + (c.box[2] - c.box[0]) * 0.05) : undefined;
    if (tt) { if (tt.y > (c.box[1] + c.box[3]) / 2) above++; else below++; }
  }
  for (let i = raw.length - 1; i >= 0 && above > below; i--) {
    const r = raw[i]; if (r.view || r.title || ownTitle(r.box)) continue;
    const xo = (o: Box) => Math.max(0, Math.min(o[2], r.box[2]) - Math.max(o[0], r.box[0])) / Math.min(o[2] - o[0], r.box[2] - r.box[0]);
    const o = raw.find((o2) => o2 !== r && !o2.view && xo(o2.box) >= 0.8 && Math.abs(o2.box[1] - r.box[3]) <= C3 && (o2.title || ownTitle(o2.box)));
    if (o) { o.box = [Math.min(o.box[0], r.box[0]), Math.min(o.box[1], r.box[1]), Math.max(o.box[2], r.box[2]), Math.max(o.box[3], r.box[3])]; o.hits += r.hits; raw.splice(i, 1); }
  }
  // a loose piece lying inside another drawing (e.g. a lift core inside the basement plan) is part of that drawing
  for (let i = raw.length - 1; i >= 0; i--) {
    const r = raw[i]; if (r.view) continue;
    if (raw.some((o, j) => j !== i && !o.view && boxArea(o.box) > boxArea(r.box) && boxInter(o.box, r.box) >= 0.9 * boxArea(r.box))) raw.splice(i, 1);
  }
  const out = raw.map((r) => {
    // a title written inside a neighbouring drawing belongs to that drawing
    const others = raw.filter((o) => o !== r && boxInter(o.box, r.box) < 0.5 * boxArea(r.box)).map((o) => o.box);
    const tt = r.title ?? (texts.length ? titleFor(texts, r.box, others) : undefined);
    const vl = r.view ? viewLabel(r.view) : undefined;
    const title = tt ?? vl ?? "";
    return { box: r.box, w: (r.box[2] - r.box[0]) * unitToM, h: (r.box[3] - r.box[1]) * unitToM, title, sub: tt && vl && vl !== tt ? vl : undefined, kind: partKind(`${title} ${vl ?? ""}`), count: r.hits, n: 0 };
  });
  // reading order: rows from the top, left to right inside a row
  out.sort((a, b) => b.box[3] - a.box[3]);
  const rows: (typeof out)[] = [];
  for (const p of out) {
    const row = rows.find((r) => p.box[3] <= r[0].box[3] && p.box[3] >= r[0].box[1]);
    if (row) row.push(p); else rows.push([p]);
  }
  const ordered = rows.flatMap((r) => r.sort((a, b) => a.box[0] - b.box[0])).filter(keepPart).slice(0, 80);
  ordered.forEach((p, i) => { p.n = i + 1; if (!p.title) p.title = `Drawing ${i + 1}`; });
  return ordered;
}
function keepPart(p: { title: string; w: number; h: number; count: number }) {
  // untitled strips (notes, title blocks, text rows) are not drawings
  return !!p.title || (Math.min(p.w, p.h) >= 4 && p.count >= 40);
}
