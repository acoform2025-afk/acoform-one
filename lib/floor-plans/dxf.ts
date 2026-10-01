/**
 * Reads an AutoCAD DXF floor plan in the browser (dxf-parser, MIT) and turns it into simple paths per layer,
 * a picture of the plan, and automatic quantities per layer role (walls / columns / slab outline / openings).
 */
import DxfParser from "dxf-parser";
import { polyArea, polyLength, type DxfAuto, type DxfUnits, type LayerRole, type Pt } from "./calc";
import { nearRings, outlineFromWalls, wallGaps, wallUnion, xMarkedBoxes } from "./geom";

export type DxfPath = { layer: string; pts: Pt[]; closed: boolean };
export type DxfLayerInfo = { name: string; count: number; closed: number; suggested: LayerRole };
export type DxfText = { text: string; x: number; y: number; h: number };
export type DxfModel = { texts?: DxfText[]; paths: DxfPath[]; layers: DxfLayerInfo[]; units: DxfUnits; unitsGuessed: boolean; bbox: [number, number, number, number] };

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
  if (/^[a-z]-flor$|^a-flor-mcut$/.test(n)) return "slab";          // Revit floor edges
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
        case "TEXT": case "MTEXT": {
          if (texts.length >= 20000 || depth > 2) break;
          const raw = String(e.text ?? "");
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

  return { texts, paths, layers: [...byLayer.values()].sort((a, b) => b.count - a.count), units, unitsGuessed, bbox: [x0, y0, x1, y1] };
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

const SLAB_EDGE_HINT = /parapet|railing|balcon|chajja|slab.?edge/i;

/** keep: optional filter, e.g. only paths inside the chosen plan region (so sections/elevations in the same file are not counted). */
export function dxfAuto(model: DxfModel, roles: Record<string, LayerRole>, unitToM: number, keep?: (p: DxfPath) => boolean, minOpeningM2 = 0.4): DxfAuto {
  const of = (r: LayerRole) => model.paths.filter((p) => (roles[p.layer] ?? "ignore") === r && (!keep || keep(p)));
  const u = unitToM, u2 = unitToM * unitToM;
  const tol = 0.005 / u;                                      // 5 mm in drawing units
  const loops = (r: LayerRole, gaps = false) => closedLoops(of(r), tol, gaps).map((pts) => ({ layer: r, pts, closed: true }) as DxfPath);

  // walls: closed outlines merged (duplicates / overlaps once) → wall tops + face length; loose lines add their length
  const wallPaths = of("walls");
  const U = wallUnion(wallPaths.filter((p) => p.closed).map((p) => p.pts));
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

  // slab: slab layer outlines; if none, the outer face of the walls
  let slab = outermost(loops("slab"));
  let slabFromWalls = false;
  if (!slab.length && wallPaths.length) {
    // balcony parapets / railings mark slab edges outside the walls
    const edgeHints = model.paths.filter((p) => SLAB_EDGE_HINT.test(p.layer) && (!keep || keep(p)));
    const o = outlineFromWalls([...wallPaths, ...edgeHints], 1 / u);
    const outer = o.loops.filter((l) => polyArea(l) > 0);
    if (outer.length) { slab = outer.map((pts) => ({ p: { layer: "slab", pts, closed: true } as DxfPath, a: Math.abs(polyArea(pts)) })); slabFromWalls = true; }
  }

  const cols = outermost(loops("columns", true).filter((p) => p.pts.length >= 3)).map(({ p }) => {
    const xs = p.pts.map((q) => q[0]), ys = p.pts.map((q) => q[1]);
    return { w: (Math.max(...xs) - Math.min(...xs)) * u, d: (Math.max(...ys) - Math.min(...ys)) * u, perimeter: polyLength(p.pts, true) * u, area: polyArea(p.pts) * u2 };
  }).filter((c) => c.area > 0 && c.w >= 0.1 && c.d >= 0.1 && c.w <= 4 && c.d <= 4);
  return {
    slabArea: slab.reduce((s, x) => s + x.a, 0) * u2,
    slabPerimeter: slab.reduce((s, x) => s + polyLength(x.p.pts, true), 0) * u,
    openingArea: openL.reduce((s, x) => s + x.a, 0) * u2,
    openingPerimeter: openL.reduce((s, x) => s + polyLength(x.p.pts, true), 0) * u,
    wallLineLength: (U.perimeter + looseLen) * u,
    wallTopArea: U.area * u2,
    beamLineLength: of("beams").reduce((s, p) => s + polyLength(p.pts, p.closed), 0) * u,
    columns: cols,
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

const BAD_TITLE = /section|elevation|site|roof|terrace|parking|basement|stilt|podium|detail|stair|lift|key\s*plan|location|schedule|foundation|footing|column\s*layout|centre\s*line|center\s*line/i;
/** Floors from a title like "TYPICAL 1ST TO 14TH FLOOR PLAN" or "2nd-12th floor". */
function floorsFromTitle(t: string): number | undefined {
  const m = t.match(/(\d{1,3})\s*(?:st|nd|rd|th)?\s*(?:floor\s*)?(?:to|-|–|&|upto|up to)\s*(\d{1,3})\s*(?:st|nd|rd|th)?/i);
  if (m) { const a = +m[1], b = +m[2]; if (b > a && b - a < 200) return b - a + 1; }
  const n = t.match(/\((\d{1,3})\s*(?:nos|floors?)\)/i) ?? t.match(/(\d{1,3})\s*(?:nos\.?|floors)\b/i);
  if (n && +n[1] > 0 && +n[1] < 200) return +n[1];
  return undefined;
}
/** Title of a drawing: the biggest text inside or just below/above its box that reads like a drawing title. */
function titleFor(texts: DxfText[], box: [number, number, number, number]): string | undefined {
  const [x0, y0, x1, y1] = box, w = x1 - x0, h = y1 - y0;
  const near = texts.filter((t) => t.x >= x0 - w * 0.05 && t.x <= x1 + w * 0.05 && t.y >= y0 - h * 0.25 && t.y <= y1 + h * 0.2)
    .map((t) => ({ ...t, text: t.text.split(/\bscale\b/i)[0].replace(/\\[A-Za-z]/g, "").trim().slice(0, 80) }))
    .filter((t) => /plan|section|elevation|layout|floor|block|tower|wing/i.test(t.text) && t.text.length >= 4);
  near.sort((a, b) => b.h - a.h || (/typical/i.test(b.text) ? 1 : 0) - (/typical/i.test(a.text) ? 1 : 0));
  return near[0]?.text;
}
/** Floor height (mm) and number of slabs (first floor to terrace) read from the drawing's notes and level marks. */
export function floorInfoFromTexts(texts: DxfText[]): { heightMm?: number; floors?: number; source?: string } {
  const heightMm = floorHeightFromTexts(texts);
  let floors: number | undefined, source: string | undefined;
  for (const t of texts) { const m = t.text.match(/\bG\s*\+\s*(\d{1,3})\b/i); if (m && +m[1] > 0 && +m[1] < 150) { floors = +m[1]; source = `"${t.text.slice(0, 40)}"`; break; } }
  if (!floors && heightMm) {
    const lv = levelMarks(texts).filter((v) => v >= 2000);
    if (lv.length >= 2) {
      const n = (lv[lv.length - 1] - lv[0]) / heightMm;
      if (Math.abs(n - Math.round(n)) < 0.02 && n >= 1) { floors = Math.round(n) + 1; source = `level marks +${lv[0]} to +${lv[lv.length - 1]} mm`; }
    }
  }
  return { heightMm, floors, source };
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
  for (const o of kept) {
    const title = texts.length ? titleFor(texts, o.box) : undefined;
    o.title = title;
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
