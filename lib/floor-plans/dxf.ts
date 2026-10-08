/**
 * Reads an AutoCAD DXF floor plan in the browser (dxf-parser, MIT) and turns it into simple paths per layer,
 * a picture of the plan, and automatic quantities per layer role (walls / columns / slab outline / openings).
 */
import DxfParser from "dxf-parser";
import { hexBytes, oleTable } from "./ole-table";
import polygonClipping, { type MultiPolygon, type Polygon } from "polygon-clipping";
import { polyArea, polyLength, type DxfAuto, type DxfUnits, type LayerRole, type Pt } from "./calc";
import { labelledSpaces, nearRings, outlineFromWalls, pairedWallStrips, wallGaps, wallUnion, xMarkedBoxes } from "./geom";
import { beamSizeFromLayer, doorWindowKind, isNoiseLayer, isRailLayer, suggestLayerRole, WET_ROOM } from "./layer-rules";
import { meaningOf, type Dictionary } from "./vocab";
import { agreedSection, parseSectionMarker, SECTION_LAYER, sectionLevels, type SectionLevels } from "./section-read";

export type DxfPath = { layer: string; pts: Pt[]; closed: boolean; dashed?: boolean };   // dashed: drawn with a broken linetype (hidden / dashed)
export type DxfLayerInfo = { name: string; count: number; closed: number; suggested: LayerRole; texts?: number; fills?: number; vetoed?: LayerRole };   // vetoed: the role the name implies but the drawn content rules out (e.g. a "wall" layer of circles) — never used, also when taught for that name   // count / closed: lines; texts: texts, dimension values, block attributes; fills: hatch / leader outlines
/** A hatch boundary (filled area: columns, sunk / raised zones, cut-outs) or a leader line — kept apart from the lines so the reading of walls / beams is not changed by them. */
export type DxfFill = DxfPath & { kind: "hatch" | "leader" };
export type DxfText = { text: string; x: number; y: number; h: number; layer?: string; r?: number; al?: "c" | "r"; kind?: "dim" | "attr" };   // r: rotation (radians, drawing axes); kind: a dimension value / a block attribute (grid bubble, tag)
/** A named drawing inside the file (Revit view / AutoCAD block), box in drawing units. */
export type DxfView = { name: string; box: [number, number, number, number] };
/** A table pasted from Excel (OLE object): its cells, in its frame (drawing units). */
export type DxfTable = { layer: string; box: [number, number, number, number]; rows: string[][] };
export type DxfModel = { tables?: DxfTable[]; fills?: DxfFill[]; texts?: DxfText[]; views?: DxfView[]; sections?: SectionLevels[]; rails?: DxfPath[]; dw?: (DxfPath & { kind: "door" | "window" })[]; paths: DxfPath[]; layers: DxfLayerInfo[]; units: DxfUnits; unitsGuessed: boolean; bbox: [number, number, number, number] };

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
export function leanParseDxf(text: string): { header: AnyEnt; entities: AnyEnt[]; blocks: Record<string, AnyEnt>; layerLt: Record<string, string>; ltDashed: Record<string, boolean> } {
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
  const layerLt: Record<string, string> = {}, ltDashed: Record<string, boolean> = {};
  let tab: { type: string; name?: string; lt?: string; n?: number } | null = null;
  const endTab = () => { if (tab?.name) { if (tab.type === "LAYER" && tab.lt) layerLt[tab.name] = tab.lt; if (tab.type === "LTYPE") ltDashed[tab.name.toUpperCase()] = (tab.n ?? 0) > 0; } tab = null; };
  const RAW = new Set(["OLE2FRAME", "HATCH", "LEADER", "SPLINE", "SOLID", "TRACE", "ELLIPSE", "DIMENSION", "MULTILEADER", "MLEADER"]);
  const flush = () => {
    if (!cur) return;
    const e = cur; cur = null;
    if (e.type === "VERTEX") { if (poly && !(e._flag & 16)) poly.vertices.push({ x: e._x, y: e._y, bulge: e._b ?? 0 }); return; }
    if (e.type === "SEQEND") { poly = null; return; }
    if (e.type === "BLOCK") { block = { name: e.name, position: { x: e._x ?? 0, y: e._y ?? 0 }, entities: [] }; if (e.name) blocks[e.name] = block; target = block.entities; return; }
    if (e.type === "ENDBLK") { block = null; target = entities; return; }
    if (e.inPaperSpace) return;
    switch (e.type) {
      case "LINE": target.push({ type: "LINE", layer: e.layer, lt: e._lt, vertices: [{ x: e._x, y: e._y }, { x: e._x1, y: e._y1 }] }); break;
      case "LWPOLYLINE": target.push({ type: "LWPOLYLINE", layer: e.layer, lt: e._lt, shape: (e._flag & 1) === 1, vertices: e._vs ?? [] }); break;
      case "POLYLINE": if (!(e._flag & (16 | 64))) { const pl = { type: "POLYLINE", layer: e.layer, lt: e._lt, shape: (e._flag & 1) === 1, vertices: [] as AnyEnt[] }; target.push(pl); poly = pl; } else poly = { vertices: [] }; break;
      case "CIRCLE": target.push({ type: "CIRCLE", layer: e.layer, center: { x: e._x, y: e._y }, radius: e._r }); break;
      case "ARC": target.push({ type: "ARC", layer: e.layer, center: { x: e._x, y: e._y }, radius: e._r, startAngle: (e._a0 ?? 0) * deg, endAngle: (e._a1 ?? 360) * deg }); break;
      case "INSERT": target.push({ type: "INSERT", layer: e.layer, lt: e._lt, name: e.name, position: { x: e._x ?? 0, y: e._y ?? 0 }, xScale: e._sx ?? 1, yScale: e._sy ?? 1, rotation: e._rot ?? 0, cols: e._flag || 1, rows: e._rows || 1, colGap: e._cs ?? 0, rowGap: e._rs ?? 0 }); break;
      case "TEXT": case "MTEXT": case "ATTRIB": {
        const t = ((e._t3 ?? "") + (e._t ?? "")).trim();
        // justified single-line text sits at its alignment point (11/21), not at its first point
        const just = e.type !== "MTEXT" && (e._j72 || e._j73) && e._x1 != null;
        // rotation: code 50 (degrees); an MTEXT may give its direction as a vector (11/21) instead
        const rot = e._a0 != null ? e._a0 * deg : e.type === "MTEXT" && e._x1 != null ? Math.atan2(e._y1 ?? 0, e._x1) : 0;
        if (t && !(e.type === "ATTRIB" && e._flag & 1)) target.push({ type: "TEXT", layer: e.layer, text: t, position: just ? { x: e._x1, y: e._y1 ?? 0 } : { x: e._x ?? 0, y: e._y ?? 0 }, height: e._r ?? 0, rotation: rot, attr: e.type === "ATTRIB", al: e.type === "MTEXT" ? ([0, 0, "c", "r"] as const)[((((e._rows ?? 1) - 1) % 3) + 1)] || undefined : just ? (e._j72 === 2 ? "r" : e._j72 ? "c" : undefined) : undefined });
        break;
      }
      default: if (RAW.has(e.type) && e._raw) { const d = decodeRaw(e.type, e._raw); if (d) target.push({ ...d, layer: e.layer }); } break;
    }
  };
  while (next()) {
    if (code === 0) {
      flush();
      if (val === "SECTION") { if (!next()) break; section = (code as number) === 2 ? val : ""; continue; }
      if (val === "ENDSEC") { section = ""; continue; }
      if (val === "EOF") break;
      if (section === "ENTITIES" || section === "BLOCKS") cur = { type: val, layer: "0" };
      if (section === "TABLES") { endTab(); tab = val === "LAYER" || val === "LTYPE" ? { type: val } : null; }
      continue;
    }
    if (section === "HEADER") {
      if (code === 9) hdrVar = val; else if (hdrVar === "$INSUNITS" && code === 70) header.$INSUNITS = Number(val);
      continue;
    }
    // layer and linetype tables: which linetype each layer draws with, and which linetypes are broken (dashed)
    if (section === "TABLES") {
      if (tab) {
        if (code === 2 && tab.name == null) tab.name = val;
        else if (code === 6 && tab.type === "LAYER") tab.lt = val;
        else if (code === 73 && tab.type === "LTYPE") tab.n = Number(val);
      }
      continue;
    }
    if (!cur) continue;
    const num = Number(val);
    if (RAW.has(cur.type) && code !== 8 && code !== 67) { const raw: [number, string][] = (cur._raw ??= []); if (raw.length < 400_000) raw.push([code, val]); continue; }
    switch (code) {
      case 8: cur.layer = val; break;
      case 6: cur._lt = val; break;
      case 1: if (cur.type === "TEXT" || cur.type === "MTEXT" || cur.type === "ATTRIB") cur._t = val.slice(0, 2000); break;
      case 3: if (cur.type === "MTEXT") cur._t3 = ((cur._t3 ?? "") + val).slice(0, 2000); break;
      case 71: cur._rows = num; break;
      case 44: cur._cs = num; break;
      case 45: cur._rs = num; break;
      case 72: cur._j72 = num; break;
      case 73: case 74: if (num) cur._j73 = num; break;
      case 2: cur.name = val; break;
      case 67: cur.inPaperSpace = num === 1; break;
      case 70: if (cur.type === "ATTRIB" && cur._flag != null) break; cur._flag = num; break;   // an attribute's own flags come first (an embedded xrecord repeats 70)
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
  return { header, entities, blocks, layerLt, ltDashed };
}

/**
 * Entities read from their raw group codes: hatch boundaries (columns, sunk / raised zones), leaders, splines,
 * ellipses, solids, dimensions (the value written on the drawing) and multileader texts.
 */
function decodeRaw(type: string, raw: [number, string][]): AnyEnt | null {
  const n = (k: number) => Number(raw[k][1]);
  const first = (c: number) => { const i = raw.findIndex((r) => r[0] === c); return i >= 0 ? Number(raw[i][1]) : undefined; };
  const firstS = (c: number) => raw.find((r) => r[0] === c)?.[1];
  const pairs = (cx: number, cy: number) => { const out: { x: number; y: number }[] = []; for (let i = 0; i < raw.length; i++) if (raw[i][0] === cx) { const j = raw.findIndex((r, k) => k > i && r[0] === cy); if (j > i && j - i <= 3) out.push({ x: n(i), y: n(j) }); } return out; };
  const deg = Math.PI / 180;
  switch (type) {
    case "LEADER": { const v = pairs(10, 20); return v.length >= 2 ? { type: "LEADER", vertices: v } : null; }
    case "OLE2FRAME": {
      // a table pasted from Excel: the workbook inside, placed in the frame (upper-left 10/20, lower-right 11/21)
      const a = pairs(10, 20)[0], b = pairs(11, 21)[0];
      if (!a || !b) return null;
      const tab = oleTable(hexBytes(raw.filter((r) => r[0] === 310).map((r) => r[1])));
      return tab ? { type: "OLETABLE", table: tab, box: [a.x, a.y, b.x, b.y] } : null;
    }
    case "SPLINE": {
      const fit = pairs(11, 21), ctrl = pairs(10, 20), v = fit.length >= 2 ? fit : ctrl;
      return v.length >= 2 ? { type: "LWPOLYLINE", shape: ((first(70) ?? 0) & 1) === 1, vertices: v.map((q) => ({ ...q, bulge: 0 })) } : null;
    }
    case "SOLID": case "TRACE": {
      const p = [pairs(10, 20)[0], pairs(11, 21)[0], pairs(13, 23)[0], pairs(12, 22)[0]].filter(Boolean);
      return p.length >= 3 ? { type: "LWPOLYLINE", shape: true, vertices: p.map((q) => ({ ...q, bulge: 0 })) } : null;
    }
    case "ELLIPSE": {
      const c = pairs(10, 20)[0], mj = pairs(11, 21)[0], r = first(40) ?? 1, t0 = first(41) ?? 0, t1 = first(42) ?? Math.PI * 2;
      if (!c || !mj) return null;
      const span = ((t1 - t0) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) || Math.PI * 2, steps = Math.max(8, Math.ceil(span / (Math.PI / 24)));
      const v: { x: number; y: number; bulge: number }[] = [];
      for (let i = 0; i <= steps; i++) { const t = t0 + (span * i) / steps; v.push({ x: c.x + mj.x * Math.cos(t) - mj.y * r * Math.sin(t), y: c.y + mj.y * Math.cos(t) + mj.x * r * Math.sin(t), bulge: 0 }); }
      const full = Math.abs(span - Math.PI * 2) < 1e-6; if (full) v.pop();
      return { type: "LWPOLYLINE", shape: full, vertices: v };
    }
    case "DIMENSION": {
      // the text as written: override (1) with "<>" for the measured value (42), at the text middle (11/21)
      const m = first(42), o = firstS(1), mid = pairs(11, 21)[0];
      const meas = m != null && Number.isFinite(m) ? String(Math.round(m * 100) / 100) : "";
      const text = o ? (o.includes("<>") ? o.replace("<>", meas) : o) : meas;
      return { type: "DIMENSION", block: firstS(2), text, position: mid ?? pairs(10, 20)[0] ?? { x: 0, y: 0 } };
    }
    case "MULTILEADER": case "MLEADER": {
      const t = firstS(304), p = pairs(12, 22)[0] ?? pairs(10, 20)[0];
      return t && p ? { type: "TEXT", text: t, position: p, height: first(41) ?? 0 } : null;
    }
    case "HATCH": {
      const loops: Pt[][] = [];
      let k = raw.findIndex((r) => r[0] === 91); if (k < 0) return null;
      const nPaths = n(k++);
      const to = (c: number) => { while (k < raw.length && raw[k][0] !== c) k++; return k < raw.length; };
      for (let p = 0; p < nPaths && p < 2000; p++) {
        if (!to(92)) break;
        const flag = n(k++);
        if (flag & 2) {
          let bul = 0; while (k < raw.length && raw[k][0] !== 93) { if (raw[k][0] === 72) bul = n(k); k++; }
          if (k >= raw.length) break;
          const nv = n(k++); const vs: { x: number; y: number; bulge: number }[] = [];
          for (let v = 0; v < nv && k < raw.length; v++) {
            if (!to(10)) break; const x = n(k++); if (!to(20)) break; const y = n(k++);
            let b = 0; if (bul && k < raw.length && raw[k][0] === 42) b = n(k++);
            vs.push({ x, y, bulge: b });
          }
          if (vs.length >= 3) loops.push(bulgePts(vs, true));
        } else {
          if (!to(93)) break;
          const ne = n(k++); const pts: Pt[] = [];
          const add = (q: Pt) => { const l = pts[pts.length - 1]; if (!l || Math.abs(l[0] - q[0]) > 1e-9 || Math.abs(l[1] - q[1]) > 1e-9) pts.push(q); };
          for (let e = 0; e < ne && k < raw.length; e++) {
            if (!to(72)) break; const et = n(k++);
            const get = (c: number) => { const i = k; while (k < raw.length && raw[k][0] !== c) k++; if (k >= raw.length) { k = i; return NaN; } return n(k++); };
            if (et === 1) { const x0 = get(10), y0 = get(20), x1 = get(11), y1 = get(21); add([x0, y0]); add([x1, y1]); }
            else if (et === 2) {
              const cx = get(10), cy = get(20), r = get(40); let a0 = get(50), a1 = get(51); const ccw = get(73);
              if (!ccw) [a0, a1] = [360 - a1, 360 - a0];
              if (a1 <= a0) a1 += 360;
              const arc = arcPts(cx, cy, r, a0 * deg, a1 * deg); if (!ccw) { arc.reverse(); for (const q of arc) add([q[0], 2 * cy - q[1]]); } else for (const q of arc) add(q);
            } else if (et === 3) {
              const cx = get(10), cy = get(20), mx = get(11), my = get(21), r = get(40), a0 = get(50), a1 = get(51); get(73);
              const steps = 24; for (let i = 0; i <= steps; i++) { const t = (a0 + ((((a1 - a0) % 360) + 360) % 360 || 360) * i / steps) * deg; add([cx + mx * Math.cos(t) - my * r * Math.sin(t), cy + my * Math.cos(t) + mx * r * Math.sin(t)]); }
            } else if (et === 4) {
              // spline edge: its control points, up to the next edge / end of the loop
              while (k < raw.length && raw[k][0] !== 72 && raw[k][0] !== 97 && raw[k][0] !== 92) { if (raw[k][0] === 10 && raw[k + 1]?.[0] === 20) { add([n(k), n(k + 1)]); k += 2; } else k++; }
            }
          }
          if (pts.length >= 3) { const f = pts[0], l = pts[pts.length - 1]; if (Math.abs(f[0] - l[0]) < 1e-9 && Math.abs(f[1] - l[1]) < 1e-9) pts.pop(); loops.push(pts); }
        }
      }
      return loops.length ? { type: "HATCH", loops } : null;
    }
  }
  return null;
}

/** Text as written, without AutoCAD format codes (\\P new line, \\A1; alignment, {\\f…;}, %%U underline, %%C Ø …). */
export function cleanText(raw: string): string {
  return raw.replace(/\\P/g, " ").replace(/\\[LlOoKk]/g, "").replace(/\\S([^;^/#]*)[\^/#]([^;]*);/g, "$1/$2").replace(/\\[A-Za-z][^;\\]*;/g, "").replace(/[{}]/g, "")
    .replace(/%%[cC]/g, "Ø").replace(/%%[dD]/g, "°").replace(/%%[pP]/g, "±").replace(/%%[uUoOkK]/g, "").replace(/\s+/g, " ").trim();
}

const UNIT_TO_M_LOCAL: Record<string, number> = { mm: 0.001, cm: 0.01, m: 1, in: 0.0254, ft: 0.3048 };

/** Slab thickness / floor height from the sections in the drawing (most sections agreeing), or null. */
export function drawingSection(model: DxfModel): SectionLevels | null { return agreedSection(model.sections ?? []); }

export function readDxf(raw: string): DxfModel {
  let dxf: { header?: AnyEnt; entities: AnyEnt[]; blocks?: Record<string, AnyEnt>; layerLt?: Record<string, string>; ltDashed?: Record<string, boolean> } | null = null;
  try { dxf = leanParseDxf(raw); } catch { dxf = null; }
  if (!dxf || dxf.entities.length === 0) {
    dxf = new DxfParser().parseSync(cleanDxfText(raw)) as unknown as { header?: AnyEnt; entities: AnyEnt[]; blocks?: Record<string, AnyEnt> } | null;
  }
  if (!dxf) throw new Error("This DXF file could not be read.");
  const blocks = dxf.blocks ?? {};
  const layerLt = dxf.layerLt ?? {}, ltDashed = dxf.ltDashed ?? {};
  const paths: DxfPath[] = [];
  const texts: DxfText[] = [];
  const views: DxfView[] = [];
  const sections: SectionLevels[] = [];
  const secRanges = new Map<string, [number, number][]>();
  const noiseCache = new Map<string, boolean>();
  const extentPts: number[] = [];
  const dwCache = new Map<string, "door" | "window" | null>();
  const dw: (DxfPath & { kind: "door" | "window" })[] = [];
  const rails: DxfPath[] = []; const railCache = new Map<string, boolean>();
  let marksNoExtent = false;

  const fills: DxfFill[] = [];
  const tables: DxfTable[] = [];
  const lateKinds = new WeakSet<DxfPath>();
  // textOnly: a dimension's own block — only its written value is wanted, not its extension lines / arrows
  // a broken linetype: by the linetype table (has dash elements), else by its name
  const LT_NAME = /dash|hidden|dot|center|centre|phantom|divide|border|acad_iso0[2-9]|acad_iso1/i;
  const isDashed = (lt: string | undefined): boolean => {
    if (!lt) return false; const k = lt.toUpperCase();
    if (k === "CONTINUOUS" || k === "BYLAYER" || k === "BYBLOCK") return false;
    return ltDashed[k] ?? LT_NAME.test(lt);
  };
  const walk = (ents: AnyEnt[], m: Xf, parentLayer: string | null, depth: number, textOnly = false, parentLt?: string) => {
    for (const e of ents) {
      if (paths.length > 150000) return;
      if (textOnly && e.type !== "TEXT" && e.type !== "MTEXT" && e.type !== "INSERT") continue;
      if (e.inPaperSpace) continue;
      const layer: string = (e.layer === "0" || !e.layer) && parentLayer ? parentLayer : (e.layer ?? "0");
      // doors, windows, glazing, furniture … never carry formwork geometry: skip their lines (keep their texts)
      const noise = noiseCache.get(layer) ?? (noiseCache.set(layer, isNoiseLayer(layer)), noiseCache.get(layer)!);
      // the entity's linetype: its own, else its layer's (BYLAYER), else the block insert's (BYBLOCK)
      const ltName = !e.lt || /^bylayer$/i.test(e.lt) ? layerLt[layer] : /^byblock$/i.test(e.lt) ? parentLt : e.lt;
      const push = (pts: Pt[], closed: boolean) => {
        if (pts.length < 2) return;
        if (!noise) { paths.push({ layer, pts: pts.map(([x, y]) => ap(m, x, y)), closed, ...(isDashed(ltName) ? { dashed: true } : {}) }); return; }
        // door / window lines are kept apart: where they sit inside a wall they mark an opening in it
        const dk = dwCache.get(layer) ?? (dwCache.set(layer, doorWindowKind(layer)), dwCache.get(layer)!);
        if (dk && dw.length < 80_000) dw.push({ layer, kind: dk, pts: pts.map(([x, y]) => ap(m, x, y)), closed });
        // railings: a wall line under a railing is a balcony parapet (upstand), not a full-height wall
        else if (!dk && rails.length < 40_000 && (railCache.get(layer) ?? (railCache.set(layer, isRailLayer(layer)), railCache.get(layer)!))) rails.push({ layer, pts: pts.map(([x, y]) => ap(m, x, y)), closed });
        // skipped lines still count for the drawing extents, so saved plan regions (in picture pixels) stay put
        if (!marksNoExtent && extentPts.length < 4_000_000) for (const [x, y] of pts) { const q = ap(m, x, y); extentPts.push(q[0], q[1]); }
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
        case "SPLINE": case "SOLID": case "TRACE": case "ELLIPSE": {
          const vs = (e.vertices ?? []).filter((v: AnyEnt) => Number.isFinite(v.x) && Number.isFinite(v.y));
          const before = paths.length;
          if (vs.length >= 2) push(bulgePts(vs, !!e.shape), !!e.shape);
          // read since Oct 2026: they do not move the drawing extents, so plan regions saved before stay where they were
          for (let i = before; i < paths.length; i++) lateKinds.add(paths[i]);
          break;
        }
        case "HATCH": {
          if (textOnly || fills.length > 60_000) break;
          for (const loop of e.loops ?? []) if (loop.length >= 3) fills.push({ kind: "hatch", layer, pts: loop.map(([x, y]: Pt) => ap(m, x, y)), closed: true });
          break;
        }
        case "OLETABLE": {
          // every cell becomes a text in its place in the frame, so the table shows on the drawing and its notes
          // (concrete grades, beam sizes, slab thickness …) are read like any other text
          const [ax, ay, bx, by] = e.box as number[];
          const tab = e.table as { rows: string[][]; colW: number[] };
          const p = ap(m, Math.min(ax, bx), Math.max(ay, by)), q = ap(m, Math.max(ax, bx), Math.min(ay, by));
          const x0 = Math.min(p[0], q[0]), x1 = Math.max(p[0], q[0]), y0 = Math.min(p[1], q[1]), y1 = Math.max(p[1], q[1]);
          const nR = tab.rows.length, rowH = (y1 - y0) / Math.max(1, nR), wSum = tab.colW.reduce((s2, w) => s2 + w, 0) || 1;
          tables.push({ layer, box: [x0, y0, x1, y1], rows: tab.rows });
          tab.rows.forEach((row, ri) => {
            let cx = x0;
            row.forEach((cell, ci) => {
              const w = ((tab.colW[ci] ?? 8.43) / wSum) * (x1 - x0);
              if (cell && texts.length < 40000) texts.push({ text: cell.slice(0, 400), x: cx + Math.min(w * 0.03, rowH * 0.3), y: y1 - (ri + 0.7) * rowH, h: rowH * 0.45, layer });
              cx += w;
            });
          });
          break;
        }
        case "LEADER": {
          if (textOnly || fills.length > 60_000) break;
          const vs = (e.vertices ?? []).filter((v: AnyEnt) => Number.isFinite(v.x) && Number.isFinite(v.y));
          if (vs.length >= 2) fills.push({ kind: "leader", layer, pts: vs.map((v: AnyEnt) => ap(m, v.x, v.y)), closed: false });
          break;
        }
        case "DIMENSION": {
          // the value as drawn: the texts of the dimension's own block; else the measured / override value
          const before = texts.length;
          const b = e.block ? blocks[e.block] : null;
          if (b && depth <= 5) walk(b.entities ?? [], m, layer, depth + 1, true);
          if (texts.length === before && e.text && texts.length < 40000) { const [x, y] = ap(m, e.position?.x ?? 0, e.position?.y ?? 0); const t = cleanText(String(e.text)); if (t) texts.push({ text: t, x, y, h: 0, layer, kind: "dim" }); }
          break;
        }
        case "INSERT": {
          const b = blocks[e.name]; if (!b || depth > 5) break;
          const rot = ((e.rotation ?? 0) * Math.PI) / 180, sx = e.xScale ?? 1, sy = e.yScale ?? 1;
          const base = b.position ?? { x: 0, y: 0 };
          const before = paths.length;
          // an arrayed insert (MINSERT): one copy per column / row, spaced along the insert's own axes
          const nc = Math.max(1, Math.min(50, e.cols ?? 1)), nr = Math.max(1, Math.min(50, e.rows ?? 1));
          for (let ci = 0; ci < nc; ci++) for (let ri = 0; ri < nr; ri++) {
            const ox = ci * (e.colGap ?? 0), oy = ri * (e.rowGap ?? 0);
            const t: Xf = {
              a: Math.cos(rot) * sx, b: Math.sin(rot) * sx, c: -Math.sin(rot) * sy, d: Math.cos(rot) * sy,
              e: (e.position?.x ?? 0) + ox * Math.cos(rot) - oy * Math.sin(rot), f: (e.position?.y ?? 0) + ox * Math.sin(rot) + oy * Math.cos(rot),
            };
            const local = mul(t, { ...ID, e: -base.x, f: -base.y });
            walk(b.entities ?? [], mul(m, local), layer, depth + 1, textOnly, ltName);
          }
          if (depth === 0 && /section|(^|[^a-z])sec([^a-z]|$)/i.test(String(e.name))) { const nm = String(e.name).slice(0, 100); (secRanges.get(nm) ?? secRanges.set(nm, []).get(nm)!).push([before, paths.length]); }
          // a big named block placed in model space is a drawing of its own (e.g. "TOWER B FIRST FLOOR PLAN")
          if (depth === 0 && paths.length - before >= 150 && !/^\*|^A\$C[0-9a-f]+$/i.test(String(e.name))) {
            let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
            for (let i = before; i < paths.length; i++) for (const [x, y] of paths[i].pts) { if (x < x0) x0 = x; if (y < y0) y0 = y; if (x > x1) x1 = x; if (y > y1) y1 = y; }
            if (x1 > x0) views.push({ name: String(e.name).slice(0, 120), box: [x0, y0, x1, y1] });
          }
          break;
        }
        case "TEXT": case "MTEXT": {
          if (texts.length >= 40000 || depth > 6) break;
          const raw = String(e.text ?? "");
          if (layer === SECTION_LAYER) { const sl = parseSectionMarker(raw); if (sl) sections.push(sl); break; }
          if (layer === VIEW_LAYER && raw === "ACOFORM|marks-not-extents") { marksNoExtent = true; break; }
          if (layer === VIEW_LAYER && raw.startsWith("VIEW|")) {
            const [, a, b2, c, d2, ...name] = raw.split("|");
            const box = [a, b2, c, d2].map(Number) as [number, number, number, number];
            if (box.every(Number.isFinite) && box[2] > box[0]) views.push({ name: name.join("|").trim(), box });
            break;
          }
          const clean = cleanText(raw);
          const pos = e.position ?? e.startPoint ?? { x: 0, y: 0 };
          // text inside a scaled block is drawn bigger / smaller by the block's scale
          const k = Math.sqrt(Math.abs(m.a * m.d - m.b * m.c)) || 1;
          if (clean && Number.isFinite(pos.x) && Number.isFinite(pos.y)) {
            const [x, y] = ap(m, pos.x, pos.y);
            const r = (Number(e.rotation) || 0) + Math.atan2(m.b, m.a);
            texts.push({ text: clean.slice(0, 400), x, y, h: (Math.abs(Number(e.height ?? e.textHeight ?? 0)) || 0) * k, layer, ...(Math.abs(r) > 1e-6 ? { r } : {}), ...(e.al ? { al: e.al } : {}), ...(textOnly ? { kind: "dim" as const } : e.attr ? { kind: "attr" as const } : {}) });
          }
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
  for (const p of paths) if (!lateKinds.has(p)) for (const [x, y] of p.pts) { xs.push(x); ys.push(y); }
  for (let i = 0; i < extentPts.length; i += 2) { xs.push(extentPts[i]); ys.push(extentPts[i + 1]); }
  xs.sort((a, b) => a - b); ys.sort((a, b) => a - b);
  const q = (arr: number[], f: number) => arr[Math.min(arr.length - 1, Math.max(0, Math.floor(f * (arr.length - 1))))];
  let [x0, x1, y0, y1] = [xs[0], xs[xs.length - 1], ys[0], ys[ys.length - 1]];
  const [px0, px1, py0, py1] = [q(xs, 0.01), q(xs, 0.99), q(ys, 0.01), q(ys, 0.99)];
  if ((px1 - px0) * 4 < x1 - x0 || (py1 - py0) * 4 < y1 - y0) {
    const w = px1 - px0, h = py1 - py0; [x0, x1, y0, y1] = [px0 - w * 0.1, px1 + w * 0.1, py0 - h * 0.1, py1 + h * 0.1];
  }

  const byLayer = new Map<string, DxfLayerInfo>();
  const info = (l: string) => byLayer.get(l) ?? (byLayer.set(l, { name: l, count: 0, closed: 0, suggested: suggestRole(l) }), byLayer.get(l)!);
  for (const p of paths) { const li = info(p.layer); li.count++; if (p.closed) li.closed++; }
  // a layer named as walls / columns that holds only circles (room-type tags, grid bubbles) is not structure
  {
    const circ = new Map<string, number>();
    for (const p of paths) {
      if (!p.closed || p.pts.length < 16) continue;
      const cx = p.pts.reduce((a, q) => a + q[0], 0) / p.pts.length, cy = p.pts.reduce((a, q) => a + q[1], 0) / p.pts.length;
      const r = p.pts.map((q) => Math.hypot(q[0] - cx, q[1] - cy)), rm = r.reduce((a, b) => a + b, 0) / r.length;
      if (rm > 0 && r.every((v) => Math.abs(v - rm) <= 0.03 * rm)) circ.set(p.layer, (circ.get(p.layer) ?? 0) + 1);
    }
    for (const li of byLayer.values()) if ((li.suggested === "walls" || li.suggested === "columns") && li.count >= 3 && (circ.get(li.name) ?? 0) >= 0.75 * li.count) { li.vetoed = li.suggested; li.suggested = "ignore"; }
  }
  // every layer of the drawing is listed — also those with only texts (beam marks, dimensions) or only hatches
  for (const t of texts) if (t.layer) { const li = info(t.layer); li.texts = (li.texts ?? 0) + 1; }
  for (const f of fills) { const li = info(f.layer); li.fills = (li.fills ?? 0) + 1; }

  const code = Number((dxf.header ?? {})["$INSUNITS"]);
  let units = INSUNITS[code];
  const unitsGuessed = !units;
  if (!units) { const span = Math.max(x1 - x0, y1 - y0); units = span > 2000 ? "mm" : span > 300 ? "cm" : "m"; }

  // DXF saved from AutoCAD / Revit: section views are in the file as named blocks (often one insert per floor) —
  // their floor lines, gathered by name, give the slab thickness and floor height
  if (!sections.length && secRanges.size) {
    const uM = UNIT_TO_M_LOCAL[units] ?? 0.001;
    for (const [nm, ranges] of secRanges) {
      const hl: { x0: number; x1: number; y: number }[] = [];
      for (const [i0, i1] of ranges) for (let k = i0; k < i1; k++) {
        const p = paths[k]; if (/lev|grid|axis|anno|dim|text|hral|rail|symb|title|elev|ovhd/i.test(p.layer)) continue;
        for (let i = 1; i < p.pts.length; i++) { const a = p.pts[i - 1], c = p.pts[i]; if (Math.abs(c[0] - a[0]) > 0 && Math.abs(a[1] - c[1]) <= 0.001 * Math.abs(c[0] - a[0])) hl.push({ x0: Math.min(a[0], c[0]), x1: Math.max(a[0], c[0]), y: (a[1] + c[1]) / 2 }); }
      }
      const sl = sectionLevels(hl, uM, nm); if (sl) sections.push(sl);
    }
  }

  return { tables, fills, texts, views, sections, dw, rails, paths, layers: [...byLayer.values()].sort((a, b) => b.count - a.count || (b.texts ?? 0) + (b.fills ?? 0) - (a.texts ?? 0) - (a.fills ?? 0)), units, unitsGuessed, bbox: [x0, y0, x1, y1] };
}

/** Picture of the plan: longest side = maxSide px. Returns px → drawing-unit factor. */
/** "Separate set" areas the user drew on the plan (picture px) → drawing units, for dxfAuto. */
export function separateAreas(shapes: { kind: string; pts: Pt[] }[] | undefined, frame: { fromPx: (p: Pt) => Pt }): Pt[][] {
  return (shapes ?? []).filter((s) => s.kind === "separate" && s.pts.length >= 3).map((s) => s.pts.map((q) => frame.fromPx(q)));
}

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

export const ROLE_COLOR: Record<LayerRole, string> = { ignore: "#b9bcc2", walls: "#1f2937", columns: "#dc2626", slab: "#2563eb", opening: "#9333ea", beams: "#db2777", upstand: "#0d9488" };

export function drawDxf(ctx: CanvasRenderingContext2D, model: DxfModel, roles: Record<string, LayerRole>, frame: ReturnType<typeof dxfFrame>) {
  ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, frame.width, frame.height);
  const order: LayerRole[] = ["ignore", "slab", "opening", "upstand", "beams", "walls", "columns"];
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
/** A revision cloud: a closed (or nearly closed) chain of many short arc segments, a few metres round at most. */
export function isRevCloud(pts: Pt[], unitToM: number): boolean {
  if (pts.length < 24) return false;
  const segs: number[] = []; let per = 0;
  for (let i = 1; i < pts.length; i++) { const L = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]) * unitToM; segs.push(L); per += L; }
  if (per > 12) return false;
  // a circle (grid bubble, room tag, round column drawn as an arc) is not a cloud: every point at the same distance from the centre
  const cx = pts.reduce((a, q) => a + q[0], 0) / pts.length, cy = pts.reduce((a, q) => a + q[1], 0) / pts.length;
  const rr = pts.map((q) => Math.hypot(q[0] - cx, q[1] - cy)), rm = rr.reduce((a, b) => a + b, 0) / rr.length;
  if (rm > 0 && rr.every((v) => Math.abs(v - rm) <= 0.05 * rm)) return false;
  const short = segs.filter((L) => L < 0.04).length;
  return short >= 0.7 * segs.length;
}

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

/**
 * Staircases drawn on layers with no stair name (architects often use generic layers): runs of at least 5 parallel
 * lines of the same length (0.7–2.5 m) at a regular 200–360 mm spacing are tread lines. Flights closer than 1.5 m
 * make one staircase. Returns the staircase boxes (drawing units) round the flights.
 */
export function treadFlightBoxes(paths: DxfPath[], u: number): [number, number, number, number][] {
  const mm = u * 1000;
  type Seg = { a: Pt; b: Pt; L: number; ang: number };
  const segs: Seg[] = [];
  for (const p of paths) for (let i = 1; i < p.pts.length; i++) {
    const a = p.pts[i - 1], b = p.pts[i], L = Math.hypot(b[0] - a[0], b[1] - a[1]) * mm;
    if (L < 700 || L > 2500) continue;
    let ang = Math.atan2(b[1] - a[1], b[0] - a[0]); if (ang < 0) ang += Math.PI; if (ang >= Math.PI - 0.02) ang = 0;
    segs.push({ a, b, L, ang });
  }
  const groups = new Map<string, Seg[]>();
  for (const sg of segs) { const k = `${Math.round(sg.ang / (Math.PI / 36))}:${Math.round(Math.log(sg.L) / 0.1)}`; (groups.get(k) ?? groups.set(k, []).get(k)!).push(sg); }
  const flights: [number, number, number, number][] = [];
  for (const g of groups.values()) {
    if (g.length < 5) continue;
    const ux = Math.cos(g[0].ang), uy = Math.sin(g[0].ang);
    const rows = g.map((sg) => ({ sg, off: ((sg.a[0] + sg.b[0]) / 2) * -uy + ((sg.a[1] + sg.b[1]) / 2) * ux, along: ((sg.a[0] + sg.b[0]) / 2) * ux + ((sg.a[1] + sg.b[1]) / 2) * uy }));
    // lines side by side along their own direction belong to different flights
    rows.sort((p1, p2) => p1.along - p2.along);
    const cls: (typeof rows)[] = [];
    for (const r of rows) { const c = cls.find((c2) => Math.abs(c2[0].along - r.along) * mm <= 0.4 * r.sg.L); if (c) c.push(r); else cls.push([r]); }
    for (const cl of cls) {
      // a tread drawn with its nosing (two lines 25–80 mm apart) counts once
      const rs: typeof cl = [];
      for (const r of cl.sort((p1, p2) => p1.off - p2.off)) if (!rs.length || (r.off - rs[rs.length - 1].off) * mm >= 90) rs.push(r);
      let run: typeof rs = [];
      const flush = () => {
        if (run.length >= 5) {
          const xs = run.flatMap((r) => [r.sg.a[0], r.sg.b[0]]), ys = run.flatMap((r) => [r.sg.a[1], r.sg.b[1]]);
          flights.push([Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)]);
        }
        run = [];
      };
      for (const r of rs) {
        if (!run.length) { run.push(r); continue; }
        const gap = (r.off - run[run.length - 1].off) * mm;
        const prev = run.length >= 2 ? (run[run.length - 1].off - run[run.length - 2].off) * mm : gap;
        if (gap >= 200 && gap <= 360 && Math.abs(gap - prev) <= 0.15 * prev) run.push(r); else { flush(); run.push(r); }
      }
      flush();
    }
  }
  return mergeFlights(flights, u);
}
/** Flights near each other (dog-leg: side by side; also when each flight is drawn on its own layer) → one staircase. */
function mergeFlights(flights: [number, number, number, number][], u: number): [number, number, number, number][] {
  const g = 1.5 / u, parent = flights.map((_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  for (let i = 0; i < flights.length; i++) for (let j = i + 1; j < flights.length; j++) {
    const a = flights[i], b = flights[j];
    if (a[0] - g <= b[2] && b[0] - g <= a[2] && a[1] - g <= b[3] && b[1] - g <= a[3]) parent[find(i)] = find(j);
  }
  const out = new Map<number, [number, number, number, number]>();
  flights.forEach((b, i) => { const r = find(i), c = out.get(r) ?? [Infinity, Infinity, -Infinity, -Infinity]; out.set(r, [Math.min(c[0], b[0]), Math.min(c[1], b[1]), Math.max(c[2], b[2]), Math.max(c[3], b[3])]); });
  return [...out.values()];
}
/** Layers that never carry stairs / shafts / ducts even when generic: services, annotation, sheet. */
const MISC_NOISE = /(^|[-\s])f-|fire|pipe|sprink|hydrant|hose|drain|plumb|sanit|elec|light|furn|text|dim|hatch|title|plot|defpoint|viewport|level|grid|tree|car|park/i;
/** Text that names a lift well, shaft, duct or cut-out in the slab. */
/** A lift / shaft / duct / cut-out named on the plan: by the drawing dictionary (and what the company taught), so
 *  "LIFT LOBBY" is a lobby, not a hole; Chinese labels keep the older rule. */
function isOpeningLabel(text: string, dict?: Dictionary): boolean {
  if (/[\u4e00-\u9fff]/.test(text)) return SHAFT_TXT.test(text);
  const m = meaningOf(text, dict);
  return m ? OPENING_KEYS.has(m.key) : SHAFT_TXT.test(text);
}
const OPENING_KEYS = new Set(["lift", "duct", "cutout", "ots"]);
const SHAFT_TXT = /(^|[^a-z])(p\.?|s\.?|pass(enger)?\.?|serv(ice)?\.?|fire\.?)?\s*lift|elevator|lift\s*well|shaft|(^|[^a-z])duct|cut\s*-?out|(^|[^a-z])o\.?t\.?s\.?([^a-z]|$)|open\s*to\s*sky|void/i;

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

/**
 * Flights measured from the tread lines on the stair layers inside one staircase box: parallel lines of about the
 * same length at a regular 220–350 mm spacing make a flight (width = line length, tread = spacing, treads = lines).
 * The landing is what is left of the box beside the flights. Units: mm (via u).
 */
export type StairMeasure = {
  box: [number, number, number, number]; flights: { width: number; treads: number; tread: number; ang?: number; span?: [number, number] }[]; landingM2: number;   // span: where the flight lies across the climb (drawing units along the tread lines)
  run?: "x" | "y";            // the flights climb along x or y (across their tread lines)
  landPt?: Pt;               // a point on the mid-landing (drawing units): the landing is at that end of the stairwell
  upPt?: Pt;                 // the "UP" arrow text: the first flight (up from this floor) is on its side
};
export function measureStairs(paths: DxfPath[], boxes: [number, number, number, number][], u: number): StairMeasure[] {
  const mm = u * 1000;
  const out: StairMeasure[] = [];
  for (const box of boxes) {
    type Seg = { a: Pt; b: Pt; L: number; ang: number };
    const segs: Seg[] = [];
    for (const p of paths) for (let i = 1; i < p.pts.length; i++) {
      const a = p.pts[i - 1], b = p.pts[i];
      if (a[0] < box[0] - 1 || a[0] > box[2] + 1 || a[1] < box[1] - 1 || a[1] > box[3] + 1) continue;
      const L = Math.hypot(b[0] - a[0], b[1] - a[1]) * mm; if (L < 600 || L > 3000) continue;         // a tread line: 0.6–3 m
      let ang = Math.atan2(b[1] - a[1], b[0] - a[0]); if (ang < 0) ang += Math.PI; if (ang >= Math.PI - 0.02) ang = 0;
      segs.push({ a, b, L, ang });
    }
    // group by direction (5°) and length (10 %)
    const groups = new Map<string, Seg[]>();
    for (const sg of segs) { const k = `${Math.round(sg.ang / (Math.PI / 36))}:${Math.round(Math.log(sg.L) / 0.1)}`; (groups.get(k) ?? groups.set(k, []).get(k)!).push(sg); }
    const flights: StairMeasure["flights"] = [];
    let flightArea = 0;
    for (const g of groups.values()) {
      if (g.length < 3) continue;
      const ux = Math.cos(g[0].ang), uy = Math.sin(g[0].ang);
      // offset of each line across its direction; lines that overlap along the direction belong to the same flight
      const all = g.map((sg) => ({ off: ((sg.a[0] + sg.b[0]) / 2) * -uy + ((sg.a[1] + sg.b[1]) / 2) * ux, along: ((sg.a[0] + sg.b[0]) / 2) * ux + ((sg.a[1] + sg.b[1]) / 2) * uy, L: sg.L, s0: Math.min(sg.a[0] * ux + sg.a[1] * uy, sg.b[0] * ux + sg.b[1] * uy), s1: Math.max(sg.a[0] * ux + sg.a[1] * uy, sg.b[0] * ux + sg.b[1] * uy) })).sort((p1, p2) => p1.along - p2.along);
      // flights side by side (same direction, different position along the lines) are split first
      const clusters: (typeof all)[] = [];
      for (const r2 of all) { const c = clusters[clusters.length - 1]; if (c && Math.abs(r2.along - c[c.length - 1].along) * mm <= 0.5 * r2.L) c.push(r2); else clusters.push([r2]); }
      for (const cl of clusters) {
        // the same line drawn twice, or a tread drawn with its nosing (a second line 25–80 mm away), counts once
        const rows: typeof cl = [];
        for (const r2 of cl.sort((p1, p2) => p1.off - p2.off)) if (!rows.length || (r2.off - rows[rows.length - 1].off) * mm >= 90) rows.push(r2);
        let run: typeof rows = [];
        const flush = () => {
          if (run.length >= 3) {
            const sp = run.slice(1).map((r2, i) => (r2.off - run[i].off) * mm), tread = sp.reduce((s2, v) => s2 + v, 0) / sp.length;
            const width = run.reduce((s2, r2) => s2 + r2.L, 0) / run.length;
            const s0 = run.reduce((m, r2) => Math.min(m, r2.s0), Infinity), s1 = run.reduce((m, r2) => Math.max(m, r2.s1), -Infinity);
            flights.push({ width: Math.round(width / 5) * 5, treads: run.length, tread: Math.round(tread / 5) * 5, ang: g[0].ang, span: [s0, s1] });
            flightArea += (run.length * tread) * width;
          }
          run = [];
        };
        for (const r2 of rows) {
          const prev = run[run.length - 1];
          if (prev && ((r2.off - prev.off) * mm < 220 || (r2.off - prev.off) * mm > 350)) flush();
          run.push(r2);
        }
        flush();
      }
    }
    // one entry per box, in the same order (a staircase whose treads cannot be read keeps its place, with no flights)
    if (!flights.length) { out.push({ box, flights: [], landingM2: 0 }); continue; }
    const boxA = (box[2] - box[0]) * (box[3] - box[1]) * mm * mm;
    // landing: the rest of the box, else (landing lines not on the stair layer) a landing as deep as the flights are wide
    const sumW = flights.reduce((s2, fl) => s2 + fl.width, 0), avgW = sumW / flights.length;
    const landingM2 = Math.max(Math.max(0, Math.min(boxA - flightArea, 2 * sumW * avgW)), flights.length > 1 ? sumW * avgW : 0) / 1e6;
    out.push({ box, flights, landingM2: Math.round(landingM2 * 100) / 100 });
  }
  return out;
}

const closeRing = (r: Pt[]): [number, number][] => { const o = r.map((q) => [q[0], q[1]] as [number, number]); if (o.length && (o[0][0] !== o[o.length - 1][0] || o[0][1] !== o[o.length - 1][1])) o.push(o[0]); return o; };

/**
 * Openings inside walls: door / window lines that lie inside a wall outline, projected on each wall face (outline
 * edge) → the stretch of that face that is an opening. Walls drawn straight through windows / doors (common on
 * shell plans) would otherwise be measured and panelled full height. Units: drawing units; t0 / t1 along the edge.
 */
/**
 * Doors / windows standing in a break of the wall (the wall stops either side of the door / window drawing): each
 * door / window drawing is one opening, from its own extent — whether or not the two wall ends look alike. Its width
 * is the long side of the drawing, the wall thickness the short side (at most 350 mm). Drawing units, thk / span in m.
 */
function dwGapsOf(rings: Pt[][], dw: (DxfPath & { kind: "door" | "window" })[], u: number): { a: Pt; b: Pt; thk: number; door: boolean; free?: boolean }[] {
  if (!dw.length || !rings.length) return [];
  const inWall = (x: number, y: number) => { let c = false; for (const r of rings) for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const [xi, yi] = r[i], [xj, yj] = r[j]; if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c; } return c; };
  // one door / window = the lines lying within 150 mm of each other (same kind)
  type G = { x0: number; y0: number; x1: number; y1: number; door: boolean; n: number };
  const groups: G[] = []; const near = 0.15 / u;
  const boxOf = (p: DxfPath) => { const xs = p.pts.map((q) => q[0]), ys = p.pts.map((q) => q[1]); return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)]; };
  for (const p of dw) {
    const [x0, y0, x1, y1] = boxOf(p);
    if ((x1 - x0) * u > 6 || (y1 - y0) * u > 6) continue;
    const door = p.kind === "door";
    const hit = groups.filter((g) => g.door === door && x0 <= g.x1 + near && x1 >= g.x0 - near && y0 <= g.y1 + near && y1 >= g.y0 - near);
    const g: G = hit[0] ?? { x0, y0, x1, y1, door, n: 0 };
    if (!hit.length) groups.push(g);
    g.x0 = Math.min(g.x0, x0, ...hit.slice(1).map((h) => h.x0)); g.y0 = Math.min(g.y0, y0, ...hit.slice(1).map((h) => h.y0));
    g.x1 = Math.max(g.x1, x1, ...hit.slice(1).map((h) => h.x1)); g.y1 = Math.max(g.y1, y1, ...hit.slice(1).map((h) => h.y1)); g.n += 1 + hit.slice(1).reduce((s2, h) => s2 + h.n, 0);
    for (const h of hit.slice(1)) groups.splice(groups.indexOf(h), 1);
  }
  const out: { a: Pt; b: Pt; thk: number; door: boolean; free?: boolean }[] = [];
  for (const g of groups) {
    const w = g.x1 - g.x0, h = g.y1 - g.y0, along = w >= h;
    // a door drawing includes its swing (a square-ish box): the leaf side is the long one only for windows
    let span = (along ? w : h) * u, thk = (along ? h : w) * u;
    if (span < 0.4 || span > 4.5) continue;
    const cx = (g.x0 + g.x1) / 2, cy = (g.y0 + g.y1) / 2;
    // which way the wall runs: walls just beyond both ends of the opening along that axis
    const probe = (ax: boolean): number | null => {
      const half = ((ax ? w : h) / 2), out1 = half + 0.12 / u;
      for (const off of [0, -0.1 / u, 0.1 / u, -0.2 / u, 0.2 / u]) {
        const p1: Pt = ax ? [cx - out1, cy + off] : [cx + off, cy - out1], p2: Pt = ax ? [cx + out1, cy + off] : [cx + off, cy + out1];
        if (inWall(p1[0], p1[1]) && inWall(p2[0], p2[1])) return off;
      }
      return null;
    };
    let ax = along, off = probe(ax);
    if (off == null && g.door) { ax = !along; off = probe(ax); if (off != null) { span = (ax ? w : h) * u; } }
    // a window with no concrete wall either side (it sits in a block / brick wall, or the wall is not drawn):
    // shown in the model as the window in a masonry infill — nothing to form there
    if (off == null && !g.door && thk <= 0.35 && span >= 0.4 && span <= 4.5) {
      const half2 = (along ? w : h) / 2, a: Pt = along ? [cx - half2, cy] : [cx, cy - half2], b: Pt = along ? [cx + half2, cy] : [cx, cy + half2];
      if (!out.some((o) => Math.hypot((o.a[0] + o.b[0]) / 2 - cx, (o.a[1] + o.b[1]) / 2 - cy) * u < 0.3)) out.push({ a, b, thk: Math.max(0.1, thk), door: false, free: true });
      continue;
    }
    if (off == null || span < 0.4 || span > 4.5) continue;
    // the wall thickness at the ends (the door / window drawing may be thinner or thicker than the wall)
    const half = (ax ? w : h) / 2, endP: Pt = ax ? [cx - half - 0.06 / u, cy + off] : [cx + off, cy - half - 0.06 / u];
    let lo = 0, hi = 0; for (let s2 = 0.01; s2 <= 0.4; s2 += 0.01) { if (inWall(ax ? endP[0] : endP[0] - s2 / u, ax ? endP[1] - s2 / u : endP[1])) lo = s2; else break; }
    for (let s2 = 0.01; s2 <= 0.4; s2 += 0.01) { if (inWall(ax ? endP[0] : endP[0] + s2 / u, ax ? endP[1] + s2 / u : endP[1])) hi = s2; else break; }
    // a wall running across at the end reads too thick: then the door / window drawing's own depth is used
    if (lo + hi > 0.35) { lo = Math.min(lo, Math.max(0.05, thk / 2)); hi = Math.min(hi, Math.max(0.05, thk / 2)); }
    thk = Math.min(0.35, Math.max(0.075, lo + hi));
    const mid = ax ? cy + off + (hi - lo) / 2 / u : cx + off + (hi - lo) / 2 / u;
    const a: Pt = ax ? [cx - half, mid] : [mid, cy - half], b: Pt = ax ? [cx + half, mid] : [mid, cy + half];
    if (inWall((a[0] + b[0]) / 2, (a[1] + b[1]) / 2)) continue;        // inside the wall: a cut in the wall, found elsewhere
    if (out.some((o) => Math.hypot((o.a[0] + o.b[0]) / 2 - (a[0] + b[0]) / 2, (o.a[1] + o.b[1]) / 2 - (a[1] + b[1]) / 2) * u < 0.3)) continue;
    out.push({ a, b, thk, door: g.door });
  }
  return out;
}

function wallOpeningsOf(rings: Pt[][], dw: (DxfPath & { kind: "door" | "window" })[], u: number) {
  const out: { ring: number; edge: number; t0: number; t1: number; door: boolean; thk: number }[] = [];
  if (!dw.length || !rings.length) return out;
  const C = 1 / u;                                                      // 1 m grid
  const grid = new Map<string, { x: number; y: number; door: boolean }[]>();
  const put = (x: number, y: number, door: boolean) => { const k = `${Math.floor(x / C)},${Math.floor(y / C)}`; (grid.get(k) ?? grid.set(k, []).get(k)!).push({ x, y, door }); };
  for (const p of dw) {
    for (let i = 0; i < p.pts.length; i++) {
      put(p.pts[i][0], p.pts[i][1], p.kind === "door");
      const q = p.pts[i + 1]; if (!q) continue;
      const L = Math.hypot(q[0] - p.pts[i][0], q[1] - p.pts[i][1]), n = Math.min(40, Math.floor((L * u) / 0.1));
      for (let k = 1; k < n; k++) put(p.pts[i][0] + ((q[0] - p.pts[i][0]) * k) / n, p.pts[i][1] + ((q[1] - p.pts[i][1]) * k) / n, p.kind === "door");
    }
  }
  const inWall = (x: number, y: number) => { let c = false; for (const r of rings) for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const [xi, yi] = r[i], [xj, yj] = r[j]; if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c; } return c; };
  rings.forEach((r, ri) => r.forEach((a, ei) => {
    const b = r[(ei + 1) % r.length];
    const dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy); if (L * u < 0.5) return;
    const ux = dx / L, uy = dy / L; let nx = -uy, ny = ux;
    const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2, e = 0.02 / u;
    if (!inWall(mx + nx * e, my + ny * e)) { nx = -nx; ny = -ny; }             // n points into the wall
    if (!inWall(mx + nx * e, my + ny * e)) return;
    let thk = 0; for (let s2 = 0.02; s2 <= 1.0; s2 += 0.02) { if (!inWall(mx + nx * (s2 / u), my + ny * (s2 / u))) break; thk = s2; }
    const band = Math.max(0.08, thk) / u;
    const x0 = Math.min(a[0], b[0]) - band, x1 = Math.max(a[0], b[0]) + band, y0 = Math.min(a[1], b[1]) - band, y1 = Math.max(a[1], b[1]) + band;
    const hits: { t: number; door: boolean }[] = [];
    for (let gx = Math.floor(x0 / C); gx <= Math.floor(x1 / C); gx++) for (let gy = Math.floor(y0 / C); gy <= Math.floor(y1 / C); gy++) {
      for (const pt of grid.get(`${gx},${gy}`) ?? []) {
        const vx = pt.x - a[0], vy = pt.y - a[1], t = vx * ux + vy * uy, d = vx * nx + vy * ny;
        if (t < 0 || t > L || d < -0.005 / u || d > band) continue;
        if (d > 0.005 / u && !inWall(pt.x, pt.y)) continue;
        hits.push({ t, door: pt.door });
      }
    }
    if (hits.length < 3) return;
    hits.sort((p1, p2) => p1.t - p2.t);
    let s0 = hits[0], prev = hits[0], doors = 0, n = 0;
    const flush = (endT: number) => {
      const w = (endT - s0.t) * u;
      if (w >= 0.4 && w <= 6 && w < L * u - 0.05) out.push({ ring: ri, edge: ei, t0: s0.t, t1: endT, door: doors * 2 >= n, thk: Math.round(thk * 1000) });
    };
    for (const h of hits) {
      if ((h.t - prev.t) * u > 0.3) { flush(prev.t); s0 = h; doors = 0; n = 0; }
      if (h.door) doors++; n++; prev = h;
    }
    flush(prev.t);
  }));
  return out;
}

const SLAB_EDGE_HINT = /parapet|railing|balcon|chajja|slab.?edge/i;

/** keep: optional filter, e.g. only paths inside the chosen plan region (so sections/elevations in the same file are not counted). */
/**
 * The floor as one connected island of structure. Elements: closed wall outlines and wall lines, column outlines,
 * beam outlines and straight beam lines, slab-edge lines, doors / windows, railings. Two elements belong together
 * when their boxes come within `gap` (1 m) of each other. The island with the most wall area inside the region is the
 * floor. `on(p)` answers for an element path (true / false), undefined for anything else (texts, generic lines);
 * `near(pts)` tells whether a point set lies within a metre of the floor's elements.
 */
export type ReadNote = { kind: "dropped" | "detail" | "cloud" | "wall-column" | "label-stair" | "bay" | "unwalled" | "beam-size"; box: [number, number, number, number]; n?: number; text?: string };
export function floorIsland(model: DxfModel, roles: Record<string, LayerRole>, u: number, keep?: (p: DxfPath) => boolean, force: [number, number, number, number][] = []): { on: (p: DxfPath) => boolean | undefined; near: (pts: Pt[]) => boolean; count: number; dropped: number; notes: ReadNote[] } {
  const forced = (b: [number, number, number, number]) => force.some((f) => b[0] >= f[0] - 1 && b[2] <= f[2] + 1 && b[1] >= f[1] - 1 && b[3] <= f[3] + 1);
  const gap = 3 / u, axisTol = 0.02;            // 3 m: a doorway, a stairwell, a lift opening or a balcony between two walls still joins them
  // a captioned detail / section / legend ("…示意", "…大样", "…详图", "DETAIL", "SECTION", "LEGEND") drawn next to the plan:
  // the geometry standing over its caption is that detail, never the floor
  const capRe = /示意图?$|大样$|详图$|节点$|做法$|\bdetail\b|\bsection\b|\blegend\b|\btypical\b/i;
  const capBoxes = (model.texts ?? []).filter((t) => capRe.test(t.text.trim()) && t.text.trim().length <= 40).map((t) => { const w = Math.max(1.5 / u, t.text.trim().length * t.h * 0.6); return [t.x - w, t.y - 0.6 / u, t.x + w, t.y + 6 / u] as [number, number, number, number]; });
  const inCaption = (b: [number, number, number, number]) => capBoxes.some((c) => b[0] >= c[0] && b[2] <= c[2] && b[1] >= c[1] && b[3] <= c[3]);
  const straight = (p: DxfPath) => { if (p.closed || p.pts.length !== 2) return true; const dx = Math.abs(p.pts[1][0] - p.pts[0][0]), dy = Math.abs(p.pts[1][1] - p.pts[0][1]); return Math.min(dx, dy) <= axisTol * Math.max(dx, dy); };
  type El = { p: DxfPath; box: [number, number, number, number]; strong: boolean; wallA: number; link?: boolean };
  const els: El[] = [];
  const detail = new Set<DxfPath>();
  const dwSet = new Set<DxfPath>(model.dw ?? []);
  for (const p of [...model.paths, ...(model.dw ?? []), ...(model.rails ?? [])]) {
    const r = roles[p.layer] ?? "ignore";
    const isDw = dwSet.has(p), rail = isRailLayer(p.layer) || (model.rails ?? []).includes(p);
    let kind: "wall" | "col" | "beam" | "slab" | "dw" | "link" | null = null;
    if (r === "walls" || r === "upstand") kind = "wall"; else if (r === "columns") kind = "col"; else if (r === "beams") kind = "beam"; else if (r === "slab" || (r === "ignore" && (SLAB_EDGE_HINT.test(p.layer) || rail))) kind = "slab"; else if (isDw || r === "opening") kind = "dw";
    // generic straight lines (brick walls, sills, slab edges, stair treads on unnamed layers) link elements across
    // balconies and partitions; they are connectors only — neither kept nor dropped by the island
    else if (r === "ignore" && !MISC_NOISE.test(p.layer) && straight(p) && polyLength(p.pts, p.closed) * u >= 0.5) kind = "link";
    if (!kind) continue;
    if (p.pts.length < 2) continue;
    const L = polyLength(p.pts, p.closed) * u; if (L < 0.15) continue;
    // a single slanting line on a beam / slab layer is a leader or a section mark, not a connector
    if ((kind === "beam" || kind === "slab") && !straight(p)) continue;
    if (kind === "link") { const xs0 = p.pts.map((q) => q[0]), ys0 = p.pts.map((q) => q[1]); const b0: [number, number, number, number] = [Math.min(...xs0), Math.min(...ys0), Math.max(...xs0), Math.max(...ys0)]; if (!inCaption(b0) && (!keep || keep(p))) els.push({ p, box: b0, strong: false, wallA: 0, link: true }); continue; }
    const xs = p.pts.map((q) => q[0]), ys = p.pts.map((q) => q[1]);
    const box: [number, number, number, number] = [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
    if (inCaption(box) && !forced(box)) { detail.add(p); continue; }
    els.push({ p, box, strong: kind !== "beam" || p.closed, wallA: kind === "wall" && p.closed ? Math.abs(polyArea(p.pts)) : kind === "wall" ? L * 0.2 / u : 0 });
  }
  const capNotes: ReadNote[] = capBoxes.filter((c) => [...detail].some((p) => p.pts.some((q) => q[0] >= c[0] && q[0] <= c[2] && q[1] >= c[1] && q[1] <= c[3]))).map((c) => ({ kind: "detail", box: c }));
  if (!els.length) return { on: (p) => (detail.has(p) ? false : undefined), near: () => true, count: 0, dropped: detail.size, notes: capNotes };
  // union-find over box nearness, with a coarse grid so big drawings stay fast
  const parent = els.map((_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  const cell = gap * 2, grid = new Map<string, number[]>();
  const keyOf = (x: number, y: number) => `${Math.floor(x / cell)}:${Math.floor(y / cell)}`;
  els.forEach((e, i) => { for (let x = e.box[0]; x <= e.box[2] + cell; x += cell) for (let y = e.box[1]; y <= e.box[3] + cell; y += cell) { const k = keyOf(x, y); const a = grid.get(k); if (a) a.push(i); else grid.set(k, [i]); } });
  const touch = (a: El, b: El) => a.box[0] <= b.box[2] + gap && b.box[0] <= a.box[2] + gap && a.box[1] <= b.box[3] + gap && b.box[1] <= a.box[3] + gap;
  for (const ids of grid.values()) for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) { const a = els[ids[i]], b = els[ids[j]]; if (find(ids[i]) !== find(ids[j]) && touch(a, b)) parent[find(ids[i])] = find(ids[j]); }
  // the floor: the island with the most wall area inside the region (seeded by the region, grown beyond it)
  const inReg = (e: El) => !keep || keep(e.p);
  const area = new Map<number, number>();
  els.forEach((e, i) => { if (inReg(e)) { const g = find(i); area.set(g, (area.get(g) ?? 0) + e.wallA); } });
  let main = -1, best = -1; for (const [g, a] of area) if (a > best) { best = a; main = g; }
  if (main < 0) return { on: (p) => (detail.has(p) ? false : undefined), near: () => true, count: 0, dropped: detail.size, notes: capNotes };
  const onEl = new Map<DxfPath, boolean>();
  let count = 0, dropped = 0;
  // what was left out, grouped by island (one note per island inside the region) — the review screen shows these
  const droppedBy = new Map<number, { box: [number, number, number, number]; n: number }>();
  els.forEach((e, i) => { if (e.link) return; const g = find(i); const ok = (g === main && (inReg(e) || e.strong)) || forced(e.box); onEl.set(e.p, ok); if (ok) count++; else { dropped++; if (inReg(e)) { const d = droppedBy.get(g); if (d) { d.n++; d.box = [Math.min(d.box[0], e.box[0]), Math.min(d.box[1], e.box[1]), Math.max(d.box[2], e.box[2]), Math.max(d.box[3], e.box[3])]; } else droppedBy.set(g, { box: [...e.box] as [number, number, number, number], n: 1 }); } } });
  const mainBoxes = els.filter((e, i) => (find(i) === main || forced(e.box)) && !e.link).map((e) => e.box);
  const near = (pts: Pt[]) => pts.some((q) => mainBoxes.some((b) => q[0] >= b[0] - gap && q[0] <= b[2] + gap && q[1] >= b[1] - gap && q[1] <= b[3] + gap));
  const notes: ReadNote[] = [...capNotes, ...[...droppedBy.values()].map((d) => ({ kind: "dropped" as const, box: d.box, n: d.n }))];
  return { on: (p) => (detail.has(p) && !forced([p.pts[0][0], p.pts[0][1], p.pts[0][0], p.pts[0][1]]) ? false : onEl.get(p)), near, count, dropped: dropped + detail.size, notes };
}

/**
 * The beam schedule of a drawing: beam elevations / tables titled "B12A" with the size "(600X900)" written beside, a
 * schedule table row "B1 | 450 X 900 BEAM DEPTH", and beam cross-sections "17A-17A" with their width and depth
 * dimensions. Several schedules in one file are all listed (with where they are written).
 */
export function beamSchedule(model: DxfModel, u: number): { name: string; sz: { b: number; d: number }; x: number; y: number }[] {
  const all = model.texts ?? [];
  // "(600X900)" beside a beam elevation title, or a schedule table row "B1 | 450 X 900 BEAM DEPTH"
  const pure = all.filter((t) => t.text.trim().length <= 40 && (/^\(?\s*\d{2,4}\s*[xX×*]\s*\d{2,4}\s*\)?$/.test(t.text.trim()) || /^\d{2,4}\s*[xX×*]\s*\d{2,4}\s*(mm\s*)?(beam|depth|deep|size|\(|$)/i.test(t.text.trim())));
  const isName = (s2: string) => /^[A-Z]{0,3}B[A-Z]?\d{1,3}[A-Z]{0,2}$/i.test(s2) || /^B\d{1,3}[A-Z]{0,2}$/i.test(s2);
  const names = all.filter((t) => isName(t.text.trim()));
  const sched: { name: string; sz: { b: number; d: number }; x: number; y: number }[] = [];
  for (const p of pure) {
    const sz = beamSizeFromLayer(p.text); if (!sz) continue;
    const hh = Math.max(p.h, 0.2 / u) * 1.6;
    const c = names.filter((n) => Math.abs(n.y - p.y) <= hh && p.x - n.x <= 8 / u && p.x - n.x >= -0.5 / u)
      .sort((a, b) => Math.hypot(a.x - p.x, a.y - p.y) - Math.hypot(b.x - p.x, b.y - p.y))[0];
    if (c) sched.push({ name: c.text.trim().toUpperCase(), sz, x: c.x, y: c.y });
  }
  // beam cross-sections "17A-17A" / "L1-L1" with their width (horizontal dimension) and depth (vertical dimension)
  // drawn just above the section title → beam B17A / LB1
  {
    const dims = all.filter((t) => t.kind === "dim" && /^\d{2,4}$/.test(t.text.trim()));
    for (const st of all) {
      const m = st.text.trim().toUpperCase().match(/^([A-Z]{0,2}\d{1,3}[A-Z]{0,2})-([A-Z]{0,2}\d{1,3}[A-Z]{0,2})$/);
      if (!m || m[1] !== m[2]) continue;
      const win = dims.filter((t) => Math.abs(t.x - st.x) <= 3 / u && t.y - st.y >= 0 && t.y - st.y <= 5 / u);
      const vert = win.filter((t) => Math.abs(Math.abs(t.r ?? 0) - Math.PI / 2) < 0.2).map((t) => Number(t.text)).filter((v) => v >= 150 && v <= 2500);
      const hor = win.filter((t) => Math.abs(t.r ?? 0) < 0.2).sort((a, b) => Math.hypot(a.x - st.x, a.y - st.y) - Math.hypot(b.x - st.x, b.y - st.y)).map((t) => Number(t.text)).filter((v) => v >= 100 && v <= 1200);
      if (!vert.length || !hor.length) continue;
      const sz = { b: hor[0], d: Math.max(...vert) };
      if (sz.d <= sz.b) continue;
      const id = m[1];
      const keys = /^L\d/.test(id) ? [`L${id.startsWith("LB") ? id.slice(2) : id.slice(1)}`.replace(/^L/, "LB"), id] : id.startsWith("B") ? [id] : [`B${id}`, id];
      for (const k of keys) sched.push({ name: k, sz, x: st.x, y: st.y });
    }
  }
  return sched;
}

/** The layer roles the app suggests for a drawing (no estimator choices) — for reading what a drawing contains. */
export function suggestedRoles(model: DxfModel): Record<string, LayerRole> {
  const r: Record<string, LayerRole> = {}; for (const l of model.layers) r[l.name] = l.suggested; return r;
}

/** The layer roles as used: a role the layer's own content rules out (DxfLayerInfo.vetoed) counts as "ignore", also
 *  when it was saved on the plan or taught for that layer name by another drawing. */
export function effectiveRoles(model: DxfModel, roles: Record<string, LayerRole>): Record<string, LayerRole> {
  let out: Record<string, LayerRole> | null = null;
  for (const l of model.layers) if (l.vetoed && roles[l.name] === l.vetoed) { out ??= { ...roles }; out[l.name] = "ignore"; }
  return out ?? roles;
}

export function dxfAuto(model: DxfModel, rolesIn: Record<string, LayerRole>, unitToM: number, keep?: (p: DxfPath) => boolean, minOpeningM2 = 0.4, separate: Pt[][] = [], opts: { minWallMm?: number; dict?: Dictionary; force?: [number, number, number, number][]; beamDepthMm?: number; projectBeams?: Record<string, { b: number; d: number }> } = {}): DxfAuto {
  const u = unitToM, u2 = unitToM * unitToM;
  const roles = effectiveRoles(model, rolesIn);
  // revision clouds (a ring of small arcs round a note) and the leader lines hooked to them are mark-ups, never walls
  const clouds = model.paths.filter((p) => isRevCloud(p.pts, u)).map((p) => { const xs = p.pts.map((q) => q[0]), ys = p.pts.map((q) => q[1]); const m = 0.3 / u; return [Math.min(...xs) - m, Math.min(...ys) - m, Math.max(...xs) + m, Math.max(...ys) + m] as [number, number, number, number]; });
  const inCloud = (q: Pt) => clouds.some((b) => q[0] >= b[0] && q[0] <= b[2] && q[1] >= b[1] && q[1] <= b[3]);
  // the leader of a cloud is a slanting line with one end at the cloud; the walls the cloud is drawn round stay
  const slanted = (p: DxfPath) => { const a = p.pts[0], b = p.pts[p.pts.length - 1], dx = Math.abs(b[0] - a[0]), dy = Math.abs(b[1] - a[1]); return Math.min(dx, dy) > 0.05 * Math.max(dx, dy); };
  const markup = (p: DxfPath) => clouds.length > 0 && (isRevCloud(p.pts, u) || (!p.closed && p.pts.length <= 3 && slanted(p) && (inCloud(p.pts[0]) || inCloud(p.pts[p.pts.length - 1]))));
  // THE FLOOR IS ONE CONNECTED STRUCTURE: walls, columns, beams, slab edges, doors and windows of a floor stand within
  // a metre of one another (brick walls between shear walls carry beams, sills and slab edges, so the chain never
  // breaks); details, legends, sketches and notes drawn beside the plan do not touch it. The structure with the most
  // wall area inside the region is the floor; every other island is left out, and a wall / column / slab edge that
  // continues outside the region joins the floor (a hand-drawn box that cuts the building is widened by what it cuts).
  const island = floorIsland(model, roles, u, keep, opts.force ?? []);
  // "part of this floor" boxes answered on the review screen override every later guess too
  const forcedPts = (pts: Pt[]) => (opts.force ?? []).some((f) => pts.some((q) => q[0] >= f[0] && q[0] <= f[2] && q[1] >= f[1] && q[1] <= f[3]));
  const notes: ReadNote[] = [...island.notes];
  for (const c of clouds) notes.push({ kind: "cloud", box: c });
  const keep0 = keep;
  keep = (p: DxfPath) => island.on(p) ?? (!keep0 || keep0(p));
  const of = (r: LayerRole) => model.paths.filter((p) => (roles[p.layer] ?? "ignore") === r && (!keep || keep(p)) && !markup(p));
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
  // a shape on a column layer that is not a column is a wall (shear wall, L / C core) only when it is wall-thin
  // (mean thickness 2A/P ≤ 0.8 m): pool / tank / slab outlines drawn on a column layer are not walls
  const colWalls = colAll.filter((c) => !c.isCol && c.area > 0.05 && (2 * c.area) / Math.max(1e-9, c.perimeter) <= 0.8).map((c) => c.p.pts);

  // walls: closed outlines merged (duplicates / overlaps once) → wall tops + face length; loose lines add their length
  // drawn outside the floor slab (a detail sketch or legend beside the plan) they are not walls of this floor
  const slabEarly = outermost(loops("slab"));
  let onFloor = (_pts: Pt[]) => true;
  { const wp = of("walls");
    if (slabEarly.length && wp.length) {
      const xs = wp.flatMap((p) => p.pts.map((q) => q[0])), ys = wp.flatMap((p) => p.pts.map((q) => q[1]));
      const wallBox = (Math.max(...xs) - Math.min(...xs)) * (Math.max(...ys) - Math.min(...ys));
      if (slabEarly.reduce((s2, x) => s2 + x.a, 0) >= 0.25 * wallBox) {
        const rings = slabEarly.map((x) => x.p.pts);
        onFloor = (pts: Pt[]) => { const c: Pt = [pts.reduce((a, q) => a + q[0], 0) / pts.length, pts.reduce((a, q) => a + q[1], 0) / pts.length]; return rings.some((r) => inside(c, r)) || nearRings(c, rings, 0.8 / u); };
      }
    } }
  const wallPaths = of("walls").filter((p) => onFloor(p.pts));
  for (const c of colAll) if (c.isCol && !onFloor(c.p.pts)) c.isCol = false;
  // walls drawn only as loose lines (no closed outlines): rebuild the outlines from pairs of parallel lines
  let openWallLen = 0, closedWallLen = 0;
  for (const p of wallPaths) { const L = polyLength(p.pts, p.closed); if (p.closed) closedWallLen += L; else openWallLen += L; }
  const paired = openWallLen * u > 20 && openWallLen > 1.5 * closedWallLen ? pairedWallStrips(wallPaths.filter((p) => !p.closed).map((p) => p.pts), u, Math.max(75, Number(opts.minWallMm) || 0)) : null;
  // balcony parapets: a wall with a railing drawn along it is a low wall (upstand) on the slab edge, not a
  // full-height wall — measured as an upstand (both faces × parapet height), and the slab edge under it gets an edge beam
  const railSegs: [Pt, Pt][] = [];
  for (const p of [...(model.rails ?? []), ...model.paths.filter((q) => isRailLayer(q.layer))]) {
    if (keep && !keep(p)) continue;
    for (let i = 1; i < p.pts.length; i++) if (Math.hypot(p.pts[i][0] - p.pts[i - 1][0], p.pts[i][1] - p.pts[i - 1][1]) * u >= 0.2) railSegs.push([p.pts[i - 1], p.pts[i]]);
  }
  const isParapet = (poly: Pt[]) => {
    if (!railSegs.length || poly.length < 4) return false;
    // long axis of the wall piece and its thickness
    let ai = 0, al = 0; for (let i = 0; i < poly.length; i++) { const q = poly[(i + 1) % poly.length], p = poly[i]; const L = Math.hypot(q[0] - p[0], q[1] - p[1]); if (L > al) { al = L; ai = i; } }
    const A = poly[ai], B = poly[(ai + 1) % poly.length], ux = (B[0] - A[0]) / al, uy = (B[1] - A[1]) / al;
    let thk = 0; for (const q of poly) thk = Math.max(thk, Math.abs((q[0] - A[0]) * -uy + (q[1] - A[1]) * ux));
    if (thk * u > 0.35 || al * u < 0.3) return false;
    const reach = thk / 2 + 0.35 / u, cA = -uy * (thk / 2), cB = ux * (thk / 2);
    const side = Math.sign(poly.reduce((acc, q) => acc + ((q[0] - A[0]) * -uy + (q[1] - A[1]) * ux), 0)) || 1;
    const mx = A[0] + cA * side, my = A[1] + cB * side;      // centre line start
    let cover = 0;
    for (const [r0, r1] of railSegs) {
      const rl = Math.hypot(r1[0] - r0[0], r1[1] - r0[1]); if (!rl) continue;
      if (Math.abs(ux * (r1[1] - r0[1]) / rl - uy * (r1[0] - r0[0]) / rl) > 0.05) continue;
      const off = Math.abs((r0[0] - mx) * -uy + (r0[1] - my) * ux); if (off > reach) continue;
      const p0 = (r0[0] - mx) * ux + (r0[1] - my) * uy, p1 = (r1[0] - mx) * ux + (r1[1] - my) * uy;
      cover += Math.max(0, Math.min(al, Math.max(p0, p1)) - Math.max(0, Math.min(p0, p1)));
    }
    return cover >= 0.5 * al;
  };
  const wallPolys: Pt[][] = [], parapetPolys: Pt[][] = [];
  // thin walls built in block (option "walls under N mm in block"): closed wall outlines thinner than that are left out
  const minWall = Number(opts.minWallMm) || 0;
  const thinClosed = (poly: Pt[]) => { if (minWall <= 75) return false; const per = polyLength(poly, true); return per > 0 && ((2 * Math.abs(polyArea(poly))) / per) * u * 1000 < minWall - 5; };
  // a closed wall loop lying inside another one (odd nesting, at least 0.5 m²) is the inside of a core — a hole
  const closedW = wallPaths.filter((p) => p.closed).map((p) => p.pts);
  const areaW = closedW.map((p) => Math.abs(polyArea(p)));
  const wallHoles: Pt[][] = [];
  for (const [i, poly] of closedW.entries()) {
    const depth = closedW.filter((q, j) => j !== i && areaW[j] > areaW[i] && poly.every((pt) => inside(pt, q))).length;
    if (depth % 2 === 1 && areaW[i] * u2 >= 0.5) { wallHoles.push(poly); continue; }
    if (thinClosed(poly)) continue; (isParapet(poly) ? parapetPolys : wallPolys).push(poly);
  }
  for (const poly of paired?.strips ?? []) if (onFloor(poly)) (isParapet(poly) ? parapetPolys : wallPolys).push(poly);
  // a column touching a wall (hidden column / 构造柱 at a wall end or junction) is part of that wall: it is formed with
  // the wall panels and gets no column set of its own
  { const wallRef = [...wallPolys, ...colWalls];
    const touches = (pts: Pt[]) => pts.some((q) => nearRings(q, wallRef, 0.03 / u) || wallRef.some((w) => inside(q, w)));
    for (const c of colAll) if (c.isCol && wallRef.length && touches(c.p.pts)) { c.isCol = false; colWalls.push(c.p.pts); const xs = c.p.pts.map((q) => q[0]), ys = c.p.pts.map((q) => q[1]); notes.push({ kind: "wall-column", box: [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)] }); } }
  const U = wallUnion([...wallPolys, ...colWalls], wallHoles);
  const UP = parapetPolys.length ? wallUnion(parapetPolys) : null;
  let looseLen = 0, unpairedLen = 0; const loose: Pt[][] = [];
  for (const p of wallPaths) {
    if (p.closed) continue;
    // paired mode: a line with no partner is not a wall face (door ticks, window / sill lines, hatch ends)
    if (paired) { const mid: Pt = [(p.pts[0][0] + p.pts[p.pts.length - 1][0]) / 2, (p.pts[0][1] + p.pts[p.pts.length - 1][1]) / 2]; if (!nearRings(mid, U.rings, 0.02 / u) && !(UP && nearRings(mid, UP.rings, 0.02 / u))) unpairedLen += polyLength(p.pts, false) * u; continue; }
    const L = polyLength(p.pts, false);
    const mid: Pt = [(p.pts[0][0] + p.pts[p.pts.length - 1][0]) / 2, (p.pts[0][1] + p.pts[p.pts.length - 1][1]) / 2];
    if (U.rings.length && nearRings(mid, U.rings, 0.02 / u) && nearRings(p.pts[0], U.rings, 0.02 / u)) continue;   // lies on a wall already counted
    looseLen += L; loose.push(p.pts);
  }

  // openings: closed loops + boxes marked with an X
  // IS 1200-5: openings under 0.4 m² are not deducted
  // generic layers (not walls, not services / annotation): lifts, ducts and stairs are often drawn on them
  const misc = model.paths.filter((p) => (roles[p.layer] ?? "ignore") === "ignore" && (!keep || keep(p)) && !MISC_NOISE.test(p.layer) && island.near(p.pts));
  // lifts, shafts, ducts, cut-outs named on the plan (P.LIFT, S.LIFT, SHAFT, DUCT, OTS …): the space round the name,
  // bounded by the walls; boxes with an X on the generic layers — both are holes in the slab
  const extraOpen: Pt[][] = [];
  const sunkX: { depth: number; perimeter: number; area: number; box: [number, number, number, number] }[] = [];   // sunk slabs marked with a dashed X
  {
    const tx = (model.texts ?? []).filter((t) => isOpeningLabel(t.text, opts.dict) && t.text.length <= 30 && (!keep || keep({ layer: "", pts: [[t.x, t.y]], closed: false })));
    // lift doors are open gaps in the core walls: bridged (up to 1.3 m), and lines on the generic layers (door / sill
    // lines across the shaft front) close it too
    if (tx.length && U.rings.length) for (const sp of labelledSpaces(U.rings, [...loose, ...misc.map((p) => (p.closed ? [...p.pts, p.pts[0]] : p.pts))], tx.map((t) => [t.x, t.y] as Pt), u, 20, 0.65)) {
      if (sp.area < 0.5 || sp.area > 20) continue;
      const [x0, y0, x1, y1] = sp.box; extraOpen.push([[x0, y0], [x1, y0], [x1, y1], [x0, y1]]);
    }
    for (const b of xMarkedBoxes(misc, 0.02 / u)) {
      const w = Math.abs(b[2][0] - b[0][0]) * u, h = Math.abs(b[2][1] - b[0][1]) * u;
      if (w >= 0.4 && h >= 0.4 && w * h >= 0.25 && w * h <= 12) extraOpen.push(b);
    }
    // structural slab plans: a bay crossed by an X drawn on the beam layers is a cut-out / lift / void — unless a sunk
    // or level mark ("300 SUNK", "+225 LVL", a sunk / level hatch) says it is a lowered or raised slab
    // When the drawing keeps its linetypes, the X itself says which: an X of continuous lines is a cut-out, an X of
    // broken (dashed / hidden) lines is a sunk slab — the drop depth from the "300 SUNK" note in it
    const lvlMark = /sunk|lvl|level|drop|^\s*[+-]\s*\d{2,4}\b/i;
    const ltKnown = model.paths.some((p) => p.dashed);
    const xLines = of("beams").filter((p) => !p.closed && p.pts.length === 2);
    for (const b of ltKnown ? xMarkedBoxes(xLines.filter((p) => p.dashed), 0.02 / u, 0.15 / u) : []) {
      const xs = b.map((q) => q[0]), ys = b.map((q) => q[1]), bx = [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
      const w = (bx[2] - bx[0]) * u, h = (bx[3] - bx[1]) * u;
      if (w < 0.4 || h < 0.4 || w * h > 150) continue;
      const note = (model.texts ?? []).find((t) => t.x >= bx[0] && t.x <= bx[2] && t.y >= bx[1] && t.y <= bx[3] && /sunk|drop/i.test(t.text));
      sunkX.push({ depth: Number(note?.text.match(/(\d{2,3})/)?.[1] ?? 0), perimeter: 2 * (w + h), area: w * h, box: bx as [number, number, number, number] });
    }
    for (const b of xMarkedBoxes(ltKnown ? xLines.filter((p) => !p.dashed) : xLines, 0.02 / u)) {
      const xs = b.map((q) => q[0]), ys = b.map((q) => q[1]), bx = [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
      const w = (bx[2] - bx[0]) * u, h = (bx[3] - bx[1]) * u;
      if (w < 0.4 || h < 0.4 || w * h > 150) continue;
      const inB = (x: number, y: number) => x >= bx[0] && x <= bx[2] && y >= bx[1] && y <= bx[3];
      if (!ltKnown && (model.texts ?? []).some((t) => inB(t.x, t.y) && lvlMark.test(t.text.trim()))) continue;
      // a hatch in the box (sunk / level / beam-bottom slab patterns) marks slab; cut-outs and lifts are plain crosses
      if (!ltKnown && (model.fills ?? []).some((f) => f.kind === "hatch" && (roles[f.layer] ?? "ignore") !== "opening" && (roles[f.layer] ?? "ignore") !== "columns" && !/lift|cut|cop|duct|shaft|void|open/i.test(f.layer) && f.pts.every((q) => inB(q[0], q[1])) && Math.abs(polyArea(f.pts)) * u2 >= 0.3 * w * h)) continue;
      extraOpen.push(b);
    }
  }
  const openL = outermost([...loops("opening"), ...xMarkedBoxes(of("opening"), 0.02 / u).map((pts) => ({ layer: "opening", pts, closed: true }) as DxfPath), ...extraOpen.map((pts) => ({ layer: "opening", pts, closed: true }) as DxfPath)]).filter((x) => x.a * u2 >= minOpeningM2);

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
  const sized = new Map<string, { b: number; d: number; len: number; bottom: number; count: number; inner?: number; outer?: number; lintel?: number }>();
  const beamRings: Pt[][] = [];
  const beamRingDepth: number[] = [];   // mm, one per beam ring (3D model)
  const beamParts: { k: string; b: number; d: number; ring: Pt[]; polys: Pt[][]; bb: number[] }[] = [];
  let unsizedLen = 0, loneBeamLen = 0;
  // a size written next to the beam ("B:125X750H", "IVP:100X375H", "B1 230x450") when the layer has none
  const sizeTexts: { t: DxfText; sz: { b: number; d: number } | null }[] = (model.texts ?? []).map((t) => ({ t, sz: beamSizeFromLayer(t.text) })).filter((x) => x.sz);
  const projUsed = new Set<string>();     // beam marks sized from another drawing of the project
  // a beam schedule (this drawing's own, else the one in another drawing of the project) — every "B12A" label on the
  // plan then carries that size (several schedules in one file: the nearest one)
  {
    const all = model.texts ?? [];
    const isName = (s2: string) => /^[A-Z]{0,3}B[A-Z]?\d{1,3}[A-Z]{0,2}$/i.test(s2) || /^B\d{1,3}[A-Z]{0,2}$/i.test(s2);
    const names = all.filter((t) => isName(t.text.trim()));
    const sched = beamSchedule(model, u);
    const proj = opts.projectBeams ?? {};
    if (sched.length || Object.keys(proj).length) {
      const used = new Set(sched.map((e) => `${e.x},${e.y}`));
      for (const n of names) {
        if (used.has(`${n.x},${n.y}`)) continue;                     // the schedule's own titles
        const k = n.text.trim().toUpperCase();
        const e = sched.filter((x) => x.name === k).sort((a, b) => Math.hypot(a.x - n.x, a.y - n.y) - Math.hypot(b.x - n.x, b.y - n.y))[0];
        if (e) sizeTexts.push({ t: n, sz: e.sz });
        else if (proj[k]) { sizeTexts.push({ t: n, sz: proj[k] }); projUsed.add(k); }
      }
    }
  }
  const sizeNear = (r: Pt[], wMm: number) => {
    const xs = r.map((q) => q[0]), ys = r.map((q) => q[1]), pad = 0.6 / u;
    const b = [Math.min(...xs) - pad, Math.min(...ys) - pad, Math.max(...xs) + pad, Math.max(...ys) + pad];
    const cx = (b[0] + b[2]) / 2, cy = (b[1] + b[3]) / 2;
    // the label of this beam: inside its box, and its width matches the drawn width
    const hits = sizeTexts.filter((x) => x.t.x >= b[0] && x.t.x <= b[2] && x.t.y >= b[1] && x.t.y <= b[3] && Math.abs(x.sz!.b - wMm) <= 0.5 * x.sz!.b);
    hits.sort((p1, p2) => Math.hypot(p1.t.x - cx, p1.t.y - cy) - Math.hypot(p2.t.x - cx, p2.t.y - cy));
    if (hits[0]) return hits[0].sz;
    // no label at this piece: a long beam is cut into pieces at every crossing and labelled once — look along its axis (≤ 8 m)
    const w = b[2] - b[0], h = b[3] - b[1], along = w >= h, reach = 8 / u, across = 0.8 / u;
    const b2 = along ? [b[0] - reach, Math.min(...ys) - across, b[2] + reach, Math.max(...ys) + across] : [Math.min(...xs) - across, b[1] - reach, Math.max(...xs) + across, b[3] + reach];
    const far = sizeTexts.filter((x) => x.t.x >= b2[0] && x.t.x <= b2[2] && x.t.y >= b2[1] && x.t.y <= b2[3] && Math.abs(x.sz!.b - wMm) <= 0.5 * x.sz!.b);
    far.sort((p1, p2) => Math.hypot(p1.t.x - cx, p1.t.y - cy) - Math.hypot(p2.t.x - cx, p2.t.y - cy));
    return far[0]?.sz ?? null;
  };
  // beam layers drawn as loose lines (structural beam plans: the two edges of every beam as separate lines, often on
  // two layers — hidden / visible edge): paired into strips at beam width, so each beam gets its own size from the
  // label next to it ("200x500", "200x1050 (H+0.5)"); lines with no partner keep the old rule
  const looseBeam: DxfPath[] = [];
  const beamLoops = new Map<string, Pt[][]>();
  for (const [layer, ps] of byLayer) {
    const L = closedLoops(ps, tol).filter((r) => r.length >= 3 && Math.abs(polyArea(r)) * u2 > 0.01);
    // real beam outlines are narrow strips; chained beam edge lines closing round a room are not outlines → pair the lines instead
    const narrow = L.filter((r) => (2 * Math.abs(polyArea(r))) / Math.max(1e-9, polyLength(r, true)) * u * 1000 <= 600);
    const openN = ps.filter((p) => !p.closed).length;
    if (narrow.length && narrow.length * 2 >= L.length) {
      beamLoops.set(layer, narrow);
      // a few beams drawn closed and the rest as loose edge lines (one layer, both styles): the loose ones are paired too
      if (!beamSizeFromLayer(layer) && openN >= 20 && openN > 4 * narrow.length) looseBeam.push(...ps.filter((p) => !p.closed));
    } else if (!beamSizeFromLayer(layer)) looseBeam.push(...ps.filter((p) => !p.closed));
    else unsizedLen += ps.reduce((s2, p) => s2 + polyLength(p.pts, p.closed), 0) * u;
  }
  if (looseBeam.length) {
    const st = pairedWallStrips(looseBeam.map((p) => p.pts), u, 75, 700);   // beams up to 700 wide (650 × 900 transfer / frame beams)
    // one strip per pair of edges (not merged: a chain of beams round a room would otherwise become one big outline)
    const rings = st.strips.filter((r) => r.length >= 3 && Math.abs(polyArea(r)) * u2 > 0.01);
    if (rings.length) beamLoops.set("(beam lines)", rings);
    // lines that found no partner
    for (const p of looseBeam) { const mid: Pt = [(p.pts[0][0] + p.pts[p.pts.length - 1][0]) / 2, (p.pts[0][1] + p.pts[p.pts.length - 1][1]) / 2]; if (!rings.length || !nearRings(mid, rings, 0.02 / u)) loneBeamLen += polyLength(p.pts, false) * u; }
  }
  const assumedBeams: { ring: Pt[]; b: number; d: number }[] = [];
  // a structural framing plan (several beams sized by their labels / the beam schedule): a beam strip with no size of
  // its own takes its drawn width and the depth most beams of that width have — flagged for the review
  // width of a strip from its area and perimeter (a rectangle L × w: P/2 = L + w, A = L·w) — exact for short pieces too
  const stripWidth = (r: Pt[]) => { const A = Math.abs(polyArea(r)) * u2, h = polyLength(r, true) * u / 2, disc = h * h - 4 * A; return disc >= 0 ? (h - Math.sqrt(disc)) / 2 : (2 * A) / Math.max(1e-9, 2 * h); };
  const labelled: { b: number; d: number }[] = [];
  for (const [layer, L] of beamLoops) { const lsz = beamSizeFromLayer(layer); for (const r of L) { const wEst = stripWidth(r) * 1000; const sz = lsz ?? sizeNear(r, wEst); if (sz && wEst >= 0.4 * sz.b && wEst <= 1.8 * sz.b) labelled.push(sz); } }
  // widths drawn again and again (rounded to 25 mm): the beam widths of a framing plan with no sizes written at all
  const widthCount = new Map<number, number>();
  for (const [layer, L] of beamLoops) if (!beamSizeFromLayer(layer)) for (const r of L) { const w = Math.round(stripWidth(r) * 1000 / 25) * 25; if (w >= 150 && w <= 700) widthCount.set(w, (widthCount.get(w) ?? 0) + 1); }
  const commonW = [...widthCount].filter(([, n]) => n >= 4).map(([w]) => w);
  const stripsN = [...widthCount.values()].reduce((a2, b2) => a2 + b2, 0);
  // a framing plan: beams sized by labels / a schedule, or many beam strips and few walls (a column-and-beam frame)
  const framing = labelled.length >= 5 || (stripsN >= 20 && commonW.length > 0 && wallPaths.length < stripsN);
  const widthsOk = labelled.length >= 5 ? labelled.map((x) => x.b) : commonW;
  const depthFor = (bMm: number) => {
    const same = labelled.filter((x) => Math.abs(x.b - bMm) <= 25), pool = same.length ? same : labelled;
    const c = new Map<number, number>(); for (const x of pool) c.set(x.d, (c.get(x.d) ?? 0) + 1);
    return [...c].sort((a2, b2) => b2[1] - a2[1])[0]?.[0] ?? (opts.beamDepthMm ?? 600);
  };
  // stair flights drawn on the beam layer: their tread lines pair up like beams — not beams
  const treadBoxes = framing ? treadFlightBoxes(beamPaths, u) : [];
  const onTreads = (r: Pt[]) => { const cx = r.reduce((a2, q) => a2 + q[0], 0) / r.length, cy = r.reduce((a2, q) => a2 + q[1], 0) / r.length; return treadBoxes.some((b) => cx >= b[0] && cx <= b[2] && cy >= b[1] && cy <= b[3]); };
  for (const [layer, L] of beamLoops) {
    const lsz = beamSizeFromLayer(layer);
    for (const r of L) {
      if (onTreads(r)) continue;
      // a beam outline is a narrow strip about as wide as the beam (not a room enclosed by chained beam lines)
      const wEst = stripWidth(r) * 1000;
      let sz = lsz ?? sizeNear(r, wEst);
      // only at a width the schedule has: a strip between a beam face and a sunk / cut-out box line is not a beam
      if ((!sz || wEst < 0.4 * sz.b || wEst > 1.8 * sz.b) && framing && wEst >= 150 && wEst <= 700 && widthsOk.some((w) => Math.abs(w - wEst) <= 15)) {
        const bw = widthsOk.reduce((a2, w) => (Math.abs(w - wEst) < Math.abs(a2 - wEst) ? w : a2), widthsOk[0]);
        sz = { b: bw, d: depthFor(bw) };
        assumedBeams.push({ ring: r, b: sz.b, d: sz.d });
      }
      if (!sz || wEst < 0.4 * sz.b || wEst > 1.8 * sz.b) { if (!framing) unsizedLen += polyLength(r, true) * u; continue; }
      beamRings.push(r); beamRingDepth.push(sz.d);
      let clearA = Math.abs(polyArea(r)) * u2;
      let polys: Pt[][] = [r];
      try { if (solidU.length) { const diff = polygonClipping.difference([closeRing(r)] as Polygon, solidU); polys = diff.map((poly) => poly[0].slice(0, -1) as Pt[]); clearA = diff.reduce((s2, poly) => s2 + Math.abs(polyArea(poly[0].slice(0, -1) as Pt[])) - poly.slice(1).reduce((h, q) => h + Math.abs(polyArea(q.slice(0, -1) as Pt[])), 0), 0) * u2; } } catch { /* keep the full area */ }
      const k = `${sz.b}x${sz.d}`;
      beamParts.push({ k, b: sz.b, d: sz.d, ring: r, polys, bb: [Math.min(...r.map((q) => q[0])), Math.min(...r.map((q) => q[1])), Math.max(...r.map((q) => q[0])), Math.max(...r.map((q) => q[1]))] });
      const g = sized.get(k) ?? { b: sz.b, d: sz.d, len: 0, bottom: 0, count: 0, inner: 0, outer: 0, lintel: 0 };
      g.len += clearA / (sz.b / 1000); g.bottom += clearA; g.count++; sized.set(k, g);
    }
  }
  // single beam-layer lines with no partner: in a framing plan they are slab panel edges, sunk / cut-out boxes — not beams
  if (!framing) unsizedLen += loneBeamLen;
  if (assumedBeams.length) {
    const xs = assumedBeams.flatMap((x) => x.ring.map((q) => q[0])), ys = assumedBeams.flatMap((x) => x.ring.map((q) => q[1]));
    const by = new Map<string, number>(); for (const x of assumedBeams) by.set(`${x.b}×${x.d}`, (by.get(`${x.b}×${x.d}`) ?? 0) + 1);
    notes.push({ kind: "beam-size", box: [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)], n: assumedBeams.length, text: [...by].map(([k, n]) => `${n} × ${k}`).join(", ") });
  }

  // slab: slab layer outlines; if none, the outer face of the walls (with columns and beams: a framed building's
  // slab runs out to its beams)
  let onFloor2 = (_r: Pt[]) => true;              // set once the floor outline is known: is this geometry on the floor?
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
    // doors and windows sit in the wall line: the slab runs on under them, so they close the outline too
    const dwLines = (model.dw ?? []).filter((p) => !keep || keep(p));
    const base = [...wallPaths, ...colWalls.map((pts) => ({ pts, closed: true })), ...frame, ...edgeHints, ...dwLines];
    let o = outlineFromWalls(base, 1 / u);
    // lobbies, lift lobbies, corridors and rooms behind wide openings are often bounded by lines on generic layers
    // (flat walls, sill / balcony lines, slab edges drawn on "ELE-01"-type layers): with them the outline closes round
    // the whole floor. Taken when it stays within the walls' extent (+ 2 m for balconies) — it must not run out into the site
    if (misc.length && wallPaths.length) {
      const o2 = outlineFromWalls([...base, ...misc], 1 / u);
      const wx = wallPaths.flatMap((p) => p.pts.map((q) => q[0])), wy = wallPaths.flatMap((p) => p.pts.map((q) => q[1]));
      const m2 = 2 / u, bx = [Math.min(...wx) - m2, Math.min(...wy) - m2, Math.max(...wx) + m2, Math.max(...wy) + m2];
      const within = o2.loops.every((l) => l.every((q) => q[0] >= bx[0] && q[0] <= bx[2] && q[1] >= bx[1] && q[1] <= bx[3]));
      if (within && o2.area > o.area * 1.02) o = o2;
    }
    const outer = o.loops.filter((l) => polyArea(l) > 0);
    // the floor is the biggest outline and the outlines touching it (wings, cores); "walls" standing more than a metre
    // outside it (installation details, legends and sketches drawn beside the plan inside its region) are not walls of
    // this floor, and an outline closed by such lines carries no wall: both are left out
    const byArea = [...outer].sort((p1, p2) => Math.abs(polyArea(p2)) - Math.abs(polyArea(p1)));
    const floor: Pt[][] = byArea.length ? [byArea[0]] : [];
    for (let grew = true; grew;) { grew = false; for (const o2 of byArea) if (!floor.includes(o2) && o2.some((q) => nearRings(q, floor, 0.5 / u) || floor.some((f0) => inside(q, f0)))) { floor.push(o2); grew = true; } }
    onFloor2 = (r: Pt[]) => !floor.length || forcedPts(r) || r.some((q) => floor.some((f0) => inside(q, f0)) || nearRings(q, floor, 1 / u));
    if (floor.length && U.rings.some((r, i) => !U.isHole?.[i] && !onFloor2(r))) {
      const keepR = U.rings.map((r, i) => !!U.isHole?.[i] || onFloor2(r));
      U.rings = U.rings.filter((_, i) => keepR[i]); if (U.isHole) U.isHole = U.isHole.filter((_, i) => keepR[i]);
      U.area = U.rings.reduce((s2, r, i) => s2 + (U.isHole?.[i] ? -1 : 1) * Math.abs(polyArea(r)), 0); U.perimeter = U.rings.reduce((s2, r) => s2 + polyLength(r, true), 0);
    }
    // an outline is a floor slab only when walls stand inside it (not just along its edge): at least 0.5 m² of wall
    // with its centre inside the outline — an empty box closed by section lines, notes or leaders beside the plan is not
    const walled = (pts: Pt[]) => { let a = 0; U.rings.forEach((r, i) => { if (U.isHole?.[i]) return; const c: Pt = [r.reduce((x, q) => x + q[0], 0) / r.length, r.reduce((x, q) => x + q[1], 0) / r.length]; if (inside(c, pts)) a += Math.abs(polyArea(r)); }); return a * u2 >= 0.5; };
    // a small bay with no wall inside it (a balcony or projection closed by beams and the wall line) is slab when its
    // edge runs along walls / beams for most of its length
    const structRings = [...U.rings, ...beamRings];
    const framed = (pts: Pt[]) => {
      if (Math.abs(polyArea(pts)) * u2 > 15 || !floor.some((f0) => pts.some((q) => nearRings(q, [f0], 0.3 / u)))) return false;
      let n = 0, hit = 0;
      for (let i = 0; i < pts.length; i++) { const a0 = pts[i], b0 = pts[(i + 1) % pts.length], L = Math.hypot(b0[0] - a0[0], b0[1] - a0[1]), steps = Math.max(1, Math.round((L * u) / 0.25)); for (let k = 0; k < steps; k++) { const t = (k + 0.5) / steps; n++; if (nearRings([a0[0] + (b0[0] - a0[0]) * t, a0[1] + (b0[1] - a0[1]) * t], structRings, 0.3 / u)) hit++; } }
      return n > 0 && hit >= 0.5 * n;
    };
    const kept = outer.filter((pts) => (walled(pts) || framed(pts) || forcedPts(pts)) && Math.abs(polyArea(pts)) * u2 >= 1);
    // small cantilever slabs outside the wall line (AC platforms, sunshades, 飘板 / 空调板): a closed outline on a beam or
    // slab layer, 0.3 … 8 m², touching the floor from outside — slab of its own (suspended formwork), with the
    // outermost of nested outlines taken (the inner one is the kerb / drop line)
    const bayCands = [...loops("beams"), ...loops("slab")].map((q) => q.pts).filter((pts) => { const A = Math.abs(polyArea(pts)) * u2; return pts.length >= 4 && pts.length <= 12 && A >= 0.3 && A <= 8; });
    const bays = bayCands.filter((pts) => {
      const c: Pt = [pts.reduce((x, q) => x + q[0], 0) / pts.length, pts.reduce((x, q) => x + q[1], 0) / pts.length];
      if (kept.some((k) => inside(c, k)) || !pts.some((q) => nearRings(q, kept, 0.3 / u))) return false;
      return !bayCands.some((o) => o !== pts && Math.abs(polyArea(o)) > Math.abs(polyArea(pts)) && pts.every((q) => inside(q, o) || nearRings(q, [o], 0.02 / u)));   // nested: outer only
    });
    for (const b2 of bays) { const xs = b2.map((q) => q[0]), ys = b2.map((q) => q[1]); notes.push({ kind: "bay", box: [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)] }); }
    for (const k2 of kept) if (!walled(k2)) { const xs = k2.map((q) => q[0]), ys = k2.map((q) => q[1]); notes.push({ kind: "unwalled", box: [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)] }); }
    kept.push(...bays);
    const use = kept.length ? kept : outer;
    if (use.length) { slab = use.map((pts) => ({ p: { layer: "slab", pts, closed: true } as DxfPath, a: Math.abs(polyArea(pts)) })); slabFromWalls = true; }
  }

  // beam faces: each long side of the clear part of a beam is
  //   • inner — slab on that side: side panel (depth − slab)
  //   • outer — no slab beyond it (slab edge, shaft, stair opening): full-depth side panel
  //   • against a wall / another beam — no panel.
  // A beam no wider than the wall it sits in, running from wall to wall in the wall's line, is a lintel: its sides are
  // the wall's own panels above the opening (top panels), not beam side panels (Indian practice, e.g. Royce One BOM).
  // point-in-shape tests with a bounding-box check first (this runs for every 10 cm of every beam side)
  type BoxPoly = { b: number[]; pts: Pt[]; holes: Pt[][] };
  const boxOf = (pts: Pt[]) => { let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity; for (const [x, y] of pts) { if (x < x0) x0 = x; if (y < y0) y0 = y; if (x > x1) x1 = x; if (y > y1) y1 = y; } return [x0, y0, x1, y1]; };
  const prep = (outer: Pt[], holes: Pt[][] = []): BoxPoly => ({ b: boxOf(outer), pts: outer, holes });
  const inBP = (q: Pt, list: BoxPoly[]) => list.some((p) => q[0] >= p.b[0] && q[0] <= p.b[2] && q[1] >= p.b[1] && q[1] <= p.b[3] && inside(q, p.pts) && !p.holes.some((h) => inside(q, h)));
  const solidBP = solidU.map((poly) => prep(poly[0].slice(0, -1) as Pt[], poly.slice(1).map((h) => h.slice(0, -1) as Pt[])));
  const inMP = (q: Pt, _mp: MultiPolygon) => inBP(q, solidBP);
  const slabBP = slab.map((x) => prep(x.p.pts));
  const inSlab = (q: Pt) => !slabBP.length || inBP(q, slabBP);
  const openBP = openL.map((o) => prep(o.p.pts));
  const inOpening = (q: Pt) => inBP(q, openBP);
  for (const bp of beamParts) {
    const g = sized.get(bp.k)!;
    const off = 0.05 / u, bw = bp.b / 1000 / u;
    for (const poly of bp.polys) {
      if (poly.length < 3) continue;
      let ax: Pt = [1, 0], best = 0;
      for (let i = 0; i < poly.length; i++) { const a = poly[i], c = poly[(i + 1) % poly.length]; const L = Math.hypot(c[0] - a[0], c[1] - a[1]); if (L > best) { best = L; ax = [(c[0] - a[0]) / L, (c[1] - a[1]) / L]; } }
      let inner = 0, outer = 0, endsOnWall = 0, ends = 0, lintelEnds = 0;
      for (let i = 0; i < poly.length; i++) {
        const a = poly[i], c = poly[(i + 1) % poly.length]; const L = Math.hypot(c[0] - a[0], c[1] - a[1]); if (L * u < 0.02) continue;
        const dx = (c[0] - a[0]) / L, dy = (c[1] - a[1]) / L; const m: Pt = [(a[0] + c[0]) / 2, (a[1] + c[1]) / 2];
        let n: Pt = [-dy, dx]; if (inside([m[0] + n[0] * off * 0.2, m[1] + n[1] * off * 0.2], poly)) n = [dy, -dx];   // outward normal
        const o: Pt = [m[0] + n[0] * off, m[1] + n[1] * off];
        const side = Math.abs(dx * ax[0] + dy * ax[1]) > 0.9;
        if (!side) {
          ends++;
          if (solidU.length && inMP(o, solidU)) {
            endsOnWall++;
            // same-width wall beyond this end: points just inside the beam's width are wall, just outside are not
            const t: Pt = [dx, dy], hw = bw / 2;
            const p1: Pt = [o[0] + t[0] * (hw - 0.03 / u), o[1] + t[1] * (hw - 0.03 / u)], p2: Pt = [o[0] - t[0] * (hw - 0.03 / u), o[1] - t[1] * (hw - 0.03 / u)];
            const q1: Pt = [o[0] + t[0] * (hw + 0.06 / u), o[1] + t[1] * (hw + 0.06 / u)], q2: Pt = [o[0] - t[0] * (hw + 0.06 / u), o[1] - t[1] * (hw + 0.06 / u)];
            if (inMP(p1, solidU) && inMP(p2, solidU) && !inMP(q1, solidU) && !inMP(q2, solidU)) lintelEnds++;
          }
          continue;
        }
        // walk the face in 10 cm steps: parts against a wall / column / crossing beam need no panel
        const steps = Math.max(1, Math.ceil((L * u) / 0.1)), stepL = (L * u) / steps;
        for (let k = 0; k < steps; k++) {
          const f = (k + 0.5) / steps; const q: Pt = [a[0] + (c[0] - a[0]) * f + n[0] * off, a[1] + (c[1] - a[1]) * f + n[1] * off];
          if (solidU.length && inMP(q, solidU)) continue;
          if (beamParts.some((x) => x !== bp && q[0] >= x.bb[0] && q[0] <= x.bb[2] && q[1] >= x.bb[1] && q[1] <= x.bb[3] && inside(q, x.ring))) continue;
          if (!inSlab(q) || inOpening(q)) outer += stepL; else inner += stepL;
        }
      }
      if (ends >= 2 && lintelEnds >= 2) g.lintel = (g.lintel ?? 0) + (inner + outer) / 2;
      else { g.inner = (g.inner ?? 0) + inner; g.outer = (g.outer ?? 0) + outer; }
    }
  }
  const beamSized = [...sized.values()].sort((a, b) => b.len - a.len);

  // "separate set" areas drawn by the user (a core cast with its own formwork): their walls and columns are left out
  const inSep = (q: Pt) => separate.some((poly) => poly.length >= 3 && inside(q, poly));
  const wallSeparate = separate.length ? U.rings.map((r, i) => (r.filter((q) => inSep(q)).length * 2 > r.length ? i : -1)).filter((i) => i >= 0) : [];
  const sepFaces = wallSeparate.reduce((s2, i) => s2 + polyLength(U.rings[i], true), 0) * u;
  const sepCols = colAll.filter((c) => c.isCol && inSep(c.p.pts[0]));
  // a column also drawn on a wall layer (or twice on column layers) is already in the wall outlines (its faces are laid out there): count it once
  const wallClosed = [...wallPaths.filter((p) => p.closed && p.pts.length >= 3).map((p) => p.pts), ...colWalls];   // incl. a second outline of the same column on a column layer
  const inWallOutline = (c: { p: DxfPath }) => {
    const xs = c.p.pts.map((q) => q[0]), ys = c.p.pts.map((q) => q[1]);
    const m: Pt = [(Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...ys) + Math.max(...ys)) / 2];
    return wallClosed.some((w) => inside(m, w)) && U.rings.some((r) => inside(m, r));
  };
  const cols = colAll.filter((c) => c.isCol && !sepCols.includes(c) && !inWallOutline(c)).map(({ w, d, perimeter, area, p, round }) => ({ w, d, perimeter, area, round, pts: p.pts }));
  return {
    slabArea: slab.reduce((s, x) => s + x.a, 0) * u2,
    slabPerimeter: slab.reduce((s, x) => s + polyLength(x.p.pts, true), 0) * u,
    openingArea: openL.reduce((s, x) => s + x.a, 0) * u2,
    openingPerimeter: openL.reduce((s, x) => s + polyLength(x.p.pts, true), 0) * u,
    wallLineLength: (U.perimeter + looseLen) * u - sepFaces,
    // outlines on column layers too big / not rectangular for a column (lift cores, L-shaped shear walls)
    // outer faces of lift cores / L-walls on the column layer (cast with the column set); the shaft faces inside a core
    // (holes of the merged outline) stay with the walls — as in the Cosmos column-set list (LIFT-1 = outer perimeter)
    columnWallEdges: colWalls.length ? U.rings.flatMap((r, i) => U.isHole?.[i] ? [] : r.map((a, e) => {
      const b = r[(e + 1) % r.length]; const mid: Pt = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
      if (!nearRings(mid, colWalls, 0.01 / u)) return "";
      // the side of this face that is not concrete: a lift shaft / duct (an opening, no slab) → shaft face, stays with the walls
      const L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1, nx = -(b[1] - a[1]) / L, ny = (b[0] - a[0]) / L, o = 0.06 / u;
      const p1: Pt = [mid[0] + nx * o, mid[1] + ny * o], p2: Pt = [mid[0] - nx * o, mid[1] - ny * o];
      const out = nearRings(p1, U.rings, 0) ? p2 : p1;
      if (openL.some((x) => inside(out, x.p.pts))) return "";
      return `${i}:${e}`;
    })).filter(Boolean) : [],
    wallSeparate, separateWall: { faces: sepFaces, cols: sepCols.length, colPerimeter: sepCols.reduce((s2, c) => s2 + c.perimeter, 0) },
    wallTopArea: U.area * u2,
    ...(paired ? { wallPairs: { byThk: paired.byThk, unpaired: unpairedLen } } : {}),
    beamLineLength: unsizedLen,
    beamSized, beamRings: beamRings.filter((r) => onFloor2(r)), beamRingDepth: beamRingDepth.filter((_, i) => onFloor2(beamRings[i])),
    // upstands / planters: closed outlines → perimeter = both faces; height from the layer name ("UPSTAND 250", "PLANTER 1050H")
    upstands: (() => {
      const out: { label: string; h: number; length: number; parapet?: boolean }[] = [];
      if (UP && UP.perimeter * u > 0.2) out.push({ label: "Balcony parapets (railing on the drawing)", h: 0, length: UP.perimeter * u, parapet: true });
      const byL = new Map<string, DxfPath[]>(); for (const p of of("upstand")) (byL.get(p.layer) ?? byL.set(p.layer, []).get(p.layer)!).push(p);
      for (const [layer, ps] of byL) {
        const lp = closedLoops(ps, tol).filter((r) => r.length >= 3);
        const len = (lp.length ? lp.reduce((s2, r) => s2 + polyLength(r, true), 0) : ps.reduce((s2, p) => s2 + polyLength(p.pts, p.closed) * 2, 0)) * u;
        const m = layer.match(/(\d{3,4})\s*(mm|h)?/i); const h = m ? Number(m[1]) : 0;
        if (len > 0.2) out.push({ label: layer.includes("$0$") ? layer.slice(layer.lastIndexOf("$0$") + 3) : layer, h: h >= 100 && h <= 2000 ? h : 0, length: len });
      }
      return out;
    })(),
    columns: cols.map(({ w, d, perimeter, area, round }) => ({ w, d, perimeter, area, round })), columnRings: cols.map((c) => c.pts),
    ...(projUsed.size ? { projectBeamsUsed: [...projUsed].sort() } : {}),
    slabFromWalls, slabLoops: slab.map((x) => x.p.pts), openingLoops: openL.map((x) => x.p.pts),
    wallRings: U.rings, wallLoose: loose.filter((l) => onFloor2(l)),
    // sunk slabs (toilets, balconies): their edge is formed with drop (suspended) formwork
    sunk: (() => {
      const out: { depth: number; perimeter: number; area: number }[] = [];
      const sl = model.paths.filter((p) => /sunk|降板|下沉|吊模/i.test(p.layer) && (!keep || keep(p)));
      const byL = new Map<string, DxfPath[]>(); for (const p of sl) (byL.get(p.layer) ?? byL.set(p.layer, []).get(p.layer)!).push(p);
      for (const [layer, ps] of byL) {
        const depth = Number(layer.match(/(\d{2,3})\s*mm/i)?.[1] ?? layer.match(/(\d{2,3})/)?.[1] ?? 0);
        for (const r of closedLoops(ps, tol)) { const a = Math.abs(polyArea(r)) * u2; if (a >= 0.5) out.push({ depth, perimeter: polyLength(r, true) * u, area: a }); }
      }
      for (const x of sunkX) if (!keep || keep({ layer: "", pts: [[(x.box[0] + x.box[2]) / 2, (x.box[1] + x.box[3]) / 2]], closed: false })) out.push({ depth: x.depth, perimeter: x.perimeter, area: x.area });
      return out;
    })(),
    wallOpenings: wallOpeningsOf(U.rings, (model.dw ?? []).filter((p) => !keep || keep(p)), u),
    dwGaps: dwGapsOf(U.rings, (model.dw ?? []).filter((p) => (!keep || keep(p)) && onFloor2(p.pts)), u),
    // wet rooms (toilet / kitchen / balcony names on the plan): the room around the label, bounded by the walls —
    // a concrete kerb (upstand / sunk-slab edge) runs along its walls and is formed on both faces
    wetRooms: (() => {
      const pts = (model.texts ?? []).filter((t) => WET_ROOM.test(t.text) && t.text.length <= 24 && (!keep || keep({ layer: "", pts: [[t.x, t.y]], closed: false })));
      if (!pts.length || !U.rings.length) return [];
      const labels = pts.map((t) => t.text.trim());
      // bounded by walls, parapets and the slab edge (balconies are open on one side); door gaps up to 1.1 m are bridged
      // block / brick partition walls (not formed, but the kerb runs under them) bound the rooms too
      const brick = model.paths.filter((p) => /brik|brick|block|masonry|砌块|砖/i.test(p.layer) && (roles[p.layer] ?? "ignore") !== "walls" && (!keep || keep(p))).map((p) => (p.closed ? [...p.pts, p.pts[0]] : p.pts));
      const bounds = [...loose, ...brick, ...slab.map((x) => [...x.p.pts, x.p.pts[0]]), ...(UP?.rings ?? []).map((r) => [...r, r[0]])];
      // a wet room is small; a "room" of 25 m²+ means the partition walls are not on this drawing (block walls left out)
      // and the space ran into the rest of the flat — not a kerb line, left out
      return labelledSpaces(U.rings, bounds, pts.map((t) => [t.x, t.y] as Pt), u, 40, 0.55).map((sp, i) => ({ label: labels[i] ?? "", area: sp.area, perimeter: sp.perimeter, box: sp.box })).filter((r) => r.area <= 25);
    })(),
    ...(() => {
      const sp = model.paths.filter((p) => /stair|staircase|\bstep|(^|[^a-z])strs([^a-z]|$)|楼梯/i.test(p.layer) && !/lift|elev|note|text|anno|iden/i.test(p.layer) && (!keep || keep(p)));
      let s = stairClusters(sp, u), src = sp;
      // tread lines on other layers — generic, mark-up ("COMMENTS"), or the beam layer of a framing plan: every
      // staircase whose treads are not on a stair layer (one drawing often puts each stair on a different layer); the
      // staircase is the walled space round its flights
      {
        const pool = [...misc, ...(framing ? beamPaths : [])];
        const clear = (b: number[]) => !s.some((o) => b[0] < o[2] && o[0] < b[2] && b[1] < o[3] && o[1] < b[3]);
        // layer by layer: lines of another layer (beam edges, grid) in between would break the even tread spacing
        const byLayer = new Map<string, DxfPath[]>();
        for (const p of pool) (byLayer.get(p.layer) ?? byLayer.set(p.layer, []).get(p.layer)!).push(p);
        const fl = mergeFlights([...byLayer.values()].flatMap((ps) => treadFlightBoxes(ps, u)), u).filter(clear);
        if (fl.length) {
          src = [...sp, ...pool];
          s = [...s, ...fl.map((b) => {
            const c: Pt = [(b[0] + b[2]) / 2, (b[1] + b[3]) / 2];
            const sp2 = U.rings.length ? labelledSpaces(U.rings, loose, [c], u, 60, 0.3)[0] : undefined;
            const fa = (b[2] - b[0]) * (b[3] - b[1]) * u2;
            if (sp2 && sp2.area >= fa * 0.9 && sp2.area <= 60) return sp2.box;
            const e = 0.15 / u; return [b[0] - e, b[1] - e, b[2] + e, b[3] + e] as [number, number, number, number];
          })];
        }
      }
      // a stair drawn only as a labelled room ("楼梯 另详" — flights detailed on another sheet; "LT1", "ST-1", "TB2/D/180"
      // stair slab labels): the walled space round the label is the staircase, with no measured flights
      {
        const lab = (model.texts ?? []).filter((t) => (!keep || keep({ pts: [[t.x, t.y]], layer: t.layer ?? "", closed: false } as DxfPath)) && meaningOf(t.text, opts.dict)?.key === "stair" && !/^(up|dn)$/i.test(t.text.trim()));
        for (const t of lab) {
          if (s.some((b) => t.x >= b[0] && t.x <= b[2] && t.y >= b[1] && t.y <= b[3])) continue;
          // the stairwell is closed by walls, and on its open side often only by a beam or the slab edge
          const stBounds = [...loose, ...beamRings.map((r) => [...r, r[0]]), ...looseBeam.map((p) => p.pts), ...slab.map((x) => [...x.p.pts, x.p.pts[0]])];
          const sp2 = U.rings.length ? labelledSpaces(U.rings, stBounds, [[t.x, t.y]], u, 60, 0.3)[0] : undefined;
          if (!sp2 || sp2.area < 5 || sp2.area > 45) continue;
          const w = (sp2.box[2] - sp2.box[0]) * u, h = (sp2.box[3] - sp2.box[1]) * u;
          if (Math.min(w, h) < 1.8 || Math.max(w, h) < 3.5 || Math.max(w, h) > 9) continue;
          s.push(sp2.box); notes.push({ kind: "label-stair", box: sp2.box, text: t.text.trim() });
        }
      }
      // a "stair" outside the floor slab (a detail sketch beside the plan) is not a staircase of this floor
      if (slab.length) s = s.filter((b) => { const c: Pt = [(b[0] + b[2]) / 2, (b[1] + b[3]) / 2]; return slab.some((x) => inside(c, x.p.pts)); });
      const meas = measureStairs(src, s, u);
      // the stairwell is the flights AND the mid-landing: the climb runs across the tread lines; the landing is at the
      // end away from the "UP" / "DN" arrows (both sit at the floor end of a dog-leg stair). A box that holds only the
      // tread lines is extended by a landing as deep as the flights are wide.
      const arrows = (model.texts ?? []).filter((t) => /^(up|dn|down)\b/i.test(t.text.trim()) && t.text.trim().length <= 6);
      s = s.map((b, i) => {
        const m = meas[i]; if (!m?.flights.length) return b;
        const a0 = m.flights[0].ang ?? 0; const horiz = Math.abs(Math.sin(a0)) < 0.09, vert = Math.abs(Math.cos(a0)) < 0.09;
        if (!horiz && !vert) return b;
        const run: "x" | "y" = horiz ? "y" : "x"; m.run = run;
        const lo = run === "x" ? b[0] : b[1], hi = run === "x" ? b[2] : b[3], mid = (lo + hi) / 2;
        const e = 1.5 / u;
        const near = arrows.filter((t) => t.x >= b[0] - e && t.x <= b[2] + e && t.y >= b[1] - e && t.y <= b[3] + e).map((t) => (run === "x" ? t.x : t.y));
        const floorLow = near.length ? near.reduce((x, y) => x + y, 0) / near.length <= mid : true;
        const avgW = m.flights.reduce((x, f) => x + f.width, 0) / m.flights.length / 1000 / u;        // drawing units
        const runLen = Math.max(...m.flights.map((f) => f.treads * f.tread)) / 1000 / u;
        const need = runLen + 0.8 * avgW;
        let nb = b;
        if (hi - lo < need) {
          const add = runLen + avgW - (hi - lo);
          nb = run === "x" ? (floorLow ? [b[0], b[1], b[2] + add, b[3]] : [b[0] - add, b[1], b[2], b[3]]) : (floorLow ? [b[0], b[1], b[2], b[3] + add] : [b[0], b[1] - add, b[2], b[3]]);
          m.box = nb;
        }
        const nlo = run === "x" ? nb[0] : nb[1], nhi = run === "x" ? nb[2] : nb[3], landAt = floorLow ? nhi - 0.1 / u : nlo + 0.1 / u;
        m.landPt = run === "x" ? [landAt, (nb[1] + nb[3]) / 2] : [(nb[0] + nb[2]) / 2, landAt];
        const up = arrows.find((t) => /^up\b/i.test(t.text.trim()) && t.x >= b[0] - e && t.x <= b[2] + e && t.y >= b[1] - e && t.y <= b[3] + e);
        if (up) m.upPt = [up.x, up.y];
        return nb;
      });
      return { stairCount: s.length, stairBoxes: s, stairsMeasured: meas };
    })(),
    ...(() => {
      const g = wallGaps(U.rings, u, paired ? 1.2 : 0);
      // a window in the gap (window / glazing lines between the two wall ends) has a sill wall under it
      const dwIn = (model.dw ?? []).filter((p) => p.kind === "window" && (!keep || keep(p)));
      const isWin = (a: Pt, b: Pt, thk: number) => {
        const L = Math.hypot(b[0] - a[0], b[1] - a[1]); if (!L) return false;
        const ux = (b[0] - a[0]) / L, uy = (b[1] - a[1]) / L, w = (thk / u) / 2 + 0.05 / u;
        let hit = 0;
        for (const p of dwIn) for (const q of p.pts) { const t2 = (q[0] - a[0]) * ux + (q[1] - a[1]) * uy, d2 = Math.abs((q[0] - a[0]) * -uy + (q[1] - a[1]) * ux); if (t2 > 0.05 * L && t2 < 0.95 * L && d2 <= w) { hit++; if (hit >= 2) return true; } }
        return false;
      };
      const win = g.filter((x) => isWin(x.a, x.b, x.thk));
      // slab edges with no full-height wall under them (balcony fronts under a parapet, open slab edges): edge beam.
      // Door / window gaps in the outer walls are left out (their beam is the lintel above).
      let edgeLen = 0; const edgeSegs: [Pt, Pt][] = [];
      const nearGap = (q: Pt) => g.some((x) => { const L = Math.hypot(x.b[0] - x.a[0], x.b[1] - x.a[1]) || 1; const t2 = ((q[0] - x.a[0]) * (x.b[0] - x.a[0]) + (q[1] - x.a[1]) * (x.b[1] - x.a[1])) / (L * L); const px = x.a[0] + (x.b[0] - x.a[0]) * Math.max(0, Math.min(1, t2)), py = x.a[1] + (x.b[1] - x.a[1]) * Math.max(0, Math.min(1, t2)); return Math.hypot(q[0] - px, q[1] - py) <= (x.thk / u) / 2 + 0.25 / u; });
      if (U.rings.length) for (const sl of slab) {
        const r = sl.p.pts;
        for (let i = 0; i < r.length; i++) {
          const a = r[i], b = r[(i + 1) % r.length], L = Math.hypot(b[0] - a[0], b[1] - a[1]), n = Math.max(1, Math.round((L * u) / 0.1));
          let run: number | null = null;
          const flush = (k: number) => { if (run != null) { edgeSegs.push([[a[0] + ((b[0] - a[0]) * run) / n, a[1] + ((b[1] - a[1]) * run) / n], [a[0] + ((b[0] - a[0]) * k) / n, a[1] + ((b[1] - a[1]) * k) / n]]); run = null; } };
          for (let k = 0; k < n; k++) { const q: Pt = [a[0] + ((b[0] - a[0]) * (k + 0.5)) / n, a[1] + ((b[1] - a[1]) * (k + 0.5)) / n]; if (!nearRings(q, U.rings, 0.03 / u) && !nearGap(q)) { edgeLen += (L * u) / n; if (run == null) run = k; } else flush(k); }
          flush(n);
        }
      }
      return {
        gapSpan: g.reduce((s, x) => s + x.span, 0), gapCount: g.length, gaps: g.map((x) => ({ a: x.a, b: x.b, span: x.span, thk: x.thk })),
        gapSoffit: g.reduce((s, x) => s + x.span * x.thk, 0),
        windowGaps: { count: win.length, span: win.reduce((s, x) => s + x.span, 0), top: win.reduce((s, x) => s + x.span * x.thk, 0) },
        edgeBeamLength: edgeLen, edgeBeams: edgeSegs.slice(0, 4000), parapetRings: UP?.rings ?? [],
        onFloor: (p) => (!keep || keep(p as DxfPath)) && island.near(p.pts),
        notes,
      };
    })(),
  };
}

/**
 * Finds the separate drawings (floor plans, sections…) in a DXF by grouping wall lines that lie close together.
 * Returns their boxes in drawing units, biggest first — the user clicks the typical floor instead of boxing it by hand.
 */
export type PlanCandidate = { box: [number, number, number, number]; count: number; w: number; h: number; title?: string; score: number; floors?: number; scope?: "formwork" };
/** The areas under formwork captions (the row of drawings right under "FOR Alu. Formwork"), as boxes. */
function formworkCaptionBoxes(texts: DxfText[], boxes: [number, number, number, number][], unitToM: number): [number, number, number, number][] {
  const M = 1 / unitToM, out: [number, number, number, number][] = [];
  for (const cap of texts) {
    if (!FORMWORK_CAPTION.test(cap.text) || cap.text.length > 60 || /not\s+(for|in)|excluded|conventional/i.test(cap.text)) continue;
    const under = boxes.filter((b) => b[3] <= cap.y + 2 * M && b[3] >= cap.y - 40 * M && Math.abs((b[0] + b[2]) / 2 - cap.x) <= 250 * M);
    if (!under.length) continue;
    const rowTop = Math.max(...under.map((b) => b[3]));
    const row = under.filter((b) => Math.abs(b[3] - rowTop) <= 15 * M);
    out.push([Math.min(...row.map((b) => b[0])) - 5 * M, Math.min(...row.map((b) => b[1])) - 40 * M, Math.max(...row.map((b) => b[2])) + 5 * M, rowTop + 2 * M]);
  }
  return out;
}

const BAD_TITLE = /section|elevation|site|roof|terrace|parking|basement|stilt|podium|detail|stair|lift|key\s*plan|location|schedule|foundation|footing|column\s*layout|centre\s*line|center\s*line|剖面|立面|屋面|地下|详图|大样|楼梯|总平面/i;
/** Floors from a title like "TYPICAL 1ST TO 14TH FLOOR PLAN" or "2nd-12th floor". */
export function floorsFromTitle(t: string): number | undefined {
  const m = t.match(/(\d{1,3})\s*(?:st|nd|rd|th)?\s*(?:floor\s*)?(?:to|-|–|upto|up to)\s*(\d{1,3})\s*(?:st|nd|rd|th)?/i);
  if (m) { const a = +m[1], b = +m[2]; if (b > a && b - a < 200) return b - a + 1; }
  // a list of floors: "2ND,6TH,10TH,14TH & 18TH FLOOR PLAN" → 5
  const ords = t.match(/\b\d{1,3}\s*(?:st|nd|rd|th)\b/gi);
  if (ords && ords.length >= 2) return ords.length;
  const n = t.match(/\((\d{1,3})\s*(?:nos|floors?)\)/i) ?? t.match(/(\d{1,3})\s*(?:nos\.?|floors)\b/i);
  if (n && +n[1] > 0 && +n[1] < 200) return +n[1];
  return undefined;
}
/** Title of a drawing: the biggest text inside or just below/above its box that reads like a drawing title. */
/** Words a drawing title has ("… FLOOR PLAN", "SECTION A-A", "4BHK UNIT", "AREA TABLE") — whole words, so "DRAWING ROOM" is not a "wing". */
const TITLE_WORDS = /plans?\b|\bsections?\b|\belevations?\b|\blayout\b|\bfloor\b|\bblock\b|\btower\b|\bwing\b|\bunit\b|\bbhk\b|\barea (table|statement)\b|\bschedule\b|平面图|剖面|立面图|深化图|大样|配模图|布置图|放线图|贴片尺寸|背楞|墙板|飘板|清单/i;
/**
 * The groups of lines inside one sheet frame, the frame and title-block border lines left out (they touch everything
 * near the margin): lines closer than `gap` belong together.
 */
function sheetGroups(model: DxfModel, f: Box, gap: number): { box: Box; hits: number }[] {
  const W = f[2] - f[0], H = f[3] - f[1];
  const nx = Math.ceil(W / gap) + 1, ny = Math.ceil(H / gap) + 1;
  if (nx * ny > 4_000_000) return [];
  const cell = new Int32Array(nx * ny).fill(-1);   // -1 empty, else count of points
  const cnt = new Int32Array(nx * ny);
  const mark = (x: number, y: number) => { const i = Math.floor((x - f[0]) / gap), j = Math.floor((y - f[1]) / gap); if (i < 0 || j < 0 || i >= nx || j >= ny) return; cell[j * nx + i] = 0; };
  for (const p of model.paths) {
    const b0 = p.pts[0]; if (b0[0] < f[0] || b0[0] > f[2] || b0[1] < f[1] || b0[1] > f[3]) continue;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity; for (const [x, y] of p.pts) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    if (x1 - x0 > 0.5 * W || y1 - y0 > 0.5 * H) continue;           // sheet border, title-block rules
    const i0 = Math.floor((b0[0] - f[0]) / gap), j0 = Math.floor((b0[1] - f[1]) / gap); if (i0 >= 0 && j0 >= 0 && i0 < nx && j0 < ny) cnt[j0 * nx + i0]++;
    const n = p.closed ? p.pts.length : p.pts.length - 1;
    for (let k = 0; k < n; k++) {
      const a = p.pts[k], c = p.pts[(k + 1) % p.pts.length], L = Math.hypot(c[0] - a[0], c[1] - a[1]), st = Math.max(1, Math.ceil(L / (gap * 0.5)));
      for (let q = 0; q <= st; q++) mark(a[0] + ((c[0] - a[0]) * q) / st, a[1] + ((c[1] - a[1]) * q) / st);
    }
  }
  const out: { box: Box; hits: number }[] = [];
  const comp = new Int32Array(nx * ny).fill(-1);
  for (let s0 = 0; s0 < nx * ny; s0++) {
    if (cell[s0] < 0 || comp[s0] >= 0) continue;
    const id = out.length; const st = [s0]; comp[s0] = id;
    let i0 = nx, j0 = ny, i1 = -1, j1 = -1, hits = 0;
    while (st.length) {
      const c = st.pop()!; const i = c % nx, j = (c - i) / nx; hits += cnt[c];
      if (i < i0) i0 = i; if (i > i1) i1 = i; if (j < j0) j0 = j; if (j > j1) j1 = j;
      for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) { const ii = i + di, jj = j + dj; if (ii < 0 || jj < 0 || ii >= nx || jj >= ny) continue; const q = jj * nx + ii; if (cell[q] >= 0 && comp[q] < 0) { comp[q] = id; st.push(q); } }
    }
    out.push({ box: [f[0] + i0 * gap, f[1] + j0 * gap, f[0] + (i1 + 1) * gap, f[1] + (j1 + 1) * gap], hits });
  }
  return out;
}

/** A floor / slab layout title with its level: "STRU. LAYOUT AT SLAB OVER 3RD TO 7TH FLOOR LVL", "TYPICAL FLOOR PLAN", "二层板配筋图". */
export function isLayoutTitle(t: string): boolean {
  const s = t.trim();
  if (s.length < 8 || s.length > 110 || /^\d+[.)]?\s/.test(s) || NOT_TITLE.test(s)) return false;
  if (/(楼|屋)?(板|梁|结构)(平面)?(布置|配筋|平法)?图/.test(s) && /(层|屋面)/.test(s)) return true;
  if (!/\b(layout|plans?|framing)\b/i.test(s) || !/\b(slab|floor|roof|framing|beam|level|lvl)\b/i.test(s)) return false;
  return /\b\d{1,2}\s*(st|nd|rd|th)\b|\b(ground|first|second|third|fourth|fifth|terrace|roof|typical|basement|podium|stilt|plinth|refuge)\b|\bg\.?f\.?\b/i.test(s);
}
/** Long notes / title-block lines that mention a plan but are not a title. */
const NOT_TITLE = /^(disclaimer|notes?\b|general notes|e\s*:|email|date\b|for (review|approval|construction)|proposed\b.*\bscheme\b)|^\d{1,2}[.)]?\s+(this|all|the|provide|clear|lap|concrete|conc|use|for|refer|design|building|structure|minimum|unless)\b/i;   // numbered general notes ("2 THIS BUILDING IS DESIGNED FOR …") are not titles
function titleFor(texts: DxfText[], box: [number, number, number, number], others: number[][] = []): string | undefined {
  const [x0, y0, x1, y1] = box, w = x1 - x0, h = y1 - y0;
  const inOther = (t: DxfText) => others.some((o) => t.x > o[0] && t.x < o[2] && t.y > o[1] && t.y < o[3] && !(t.x >= x0 && t.x <= x1 && t.y >= y0 && t.y <= y1));
  const near = texts.filter((t) => t.x >= x0 - w * 0.05 && t.x <= x1 + w * 0.05 && t.y >= y0 - h * 0.4 && t.y <= y1 + h * 0.25 && !inOther(t))
    .map((t) => ({ ...t, text: t.text.split(/\bscale\b/i)[0].replace(/\\[A-Za-z]/g, "").trim().slice(0, 80) }))
    .filter((t) => TITLE_WORDS.test(t.text) && (!/\b(lvl|level|slab|beam)\b/i.test(t.text) || /plans?\b|\bunit\b|bhk/i.test(t.text) || isLayoutTitle(t.text)) && !NOT_TITLE.test(t.text) && !/^回复|说明|问题|建议|仅用于|^\d+[.、]\s?\S/.test(t.text) && t.text.length >= 4 && t.text.length <= 90);
  const pri = (x: string) => (/plan|section|elevation|layout|平面图|剖面|立面图|深化图|配模图|布置图|放线图/i.test(x) ? 1 : 0);
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
    // "FLOOR HEIGHT = 3000", "F.T.F 3.15", "标准层高 =2900mm" (Chinese: standard storey height)
    const m = t.text.match(/(?:floor\s*(?:to\s*floor\s*)?height|f\s*\.?\s*t\s*\.?\s*f\s*\.?|floor\s*ht\.?|层高)\D{0,8}(\d{4}|\d\.\d{2,3})/i);
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
  let walls = model.paths.filter((p) => (roles[p.layer] ?? "ignore") === "walls");
  // a column-and-beam frame (few RC walls): the plan is where the columns and beams are
  const frame = model.paths.filter((p) => { const r = roles[p.layer] ?? "ignore"; return r === "columns" || r === "beams"; });
  if (frame.length > 2 * walls.length) walls = [...walls, ...frame];
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
      else if (/floor\s*plan|plan|block|tower|wing/i.test(title) || isLayoutTitle(title)) f = 1.5;
      o.floors = floorsFromTitle(title);
      // of several floor layouts, the one that stands for the most floors is the typical one ("3RD TO 7TH" over "2ND")
      if (o.floors && o.floors > 1 && f >= 1.5) f *= 1 + Math.min(o.floors, 12) * 0.1;
    }
    const aspect = Math.max(o.w, o.h) / Math.max(0.1, Math.min(o.w, o.h));
    if (aspect > 6) f *= 0.3;                                   // long thin strips: elevations / sections
    o.score = o.count * f;
  }
  // drawings the architect marked for the formwork ("FOR Alu. Formwork" over a row of sheets) come first
  const fw = formworkCaptionBoxes(texts, kept.map((o) => o.box), unitToM);
  for (const o of kept) if (fw.some((b) => o.box[0] >= b[0] - 1 && o.box[2] <= b[2] + 1 && o.box[1] >= b[1] - 1 && o.box[3] <= b[3] + 1)) { o.score *= 3; o.scope = "formwork"; }
  return kept.sort((a, b) => b.score - a.score).slice(0, 12);
}


/* ---------- separate drawings in one file ---------- */
export type PartKind = "plan" | "section" | "elevation" | "site" | "detail" | "other";
export type DrawingPart = { n: number; box: [number, number, number, number]; w: number; h: number; title: string; sub?: string; kind: PartKind; count: number; named?: "labels"; scope?: "formwork"; scopeNote?: string };

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
  if (/配模图|布置图|放线图|背楞$|墙板$|飘板$/.test(t)) return "plan";       // formwork layout sheets (wall / beam / deck / waler layouts)
  if (/贴片尺寸|清单/.test(t)) return "detail";
  if (/平面图|深化图|标准层/.test(t)) return "plan";
  if (/site|master|location|key\s*plan|layout\s*plan|parking/i.test(t)) return "site";
  if (/schedule|legend|notes?\b|title/i.test(t)) return "detail";
  if (/\b\d?\s*bhk\b|\bunit\b|\bflat\b|area (table|statement)/i.test(t) && !/floor\s*plan/i.test(t)) return "detail";
  if (/plans?\b|\bfloor\b|\bblock\b|\btower\b|\bwing\b|\blayout\b/i.test(t)) return "plan";
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
export function clusterBoxes(model: DxfModel, gap: number, vBoxes: Box[]): { box: Box; hits: number; outside: number }[] {
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
export function drawingParts(model: DxfModel, unitToM: number, rolesIn?: Record<string, LayerRole>): DrawingPart[] {
  const roles = rolesIn ? effectiveRoles(model, rolesIn) : rolesIn;
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
  const TITLE = TITLE_WORDS;
  const cands = roles ? planCandidates(model, roles, unitToM) : [];
  const plansIn = (b: Box) => cands.filter((c) => partKind(c.title ?? "plan") === "plan" && boxInter(c.box, b) >= 0.8 * boxArea(c.box) && !views.some((v) => boxInter(c.box, v.box) >= 0.8 * boxArea(c.box)));
  const frames = sheetFrames(model, unitToM);
  // floor / slab layout titles ("STRU. LAYOUT AT SLAB OVER 17TH TO 26TH FLOOR LVL", "FIRST FLOOR PLAN", "楼板配筋图"):
  // the drawing is the group of lines right above (or below) its title
  const sheetPlans = (f: Box): { box: Box; hits: number; title: string }[] => {
    const heads = texts.filter((t) => t.x >= f[0] && t.x <= f[2] && t.y >= f[1] && t.y <= f[3] && isLayoutTitle(t.text))
      .filter((t, i, a) => a.findIndex((u) => u.text === t.text) === i);
    if (!heads.length) return [];
    const parts = sheetGroups(model, f, 0.6 / unitToM).filter((s2) => s2.hits >= 40);
    // the groups within 6 m above / below each title that span its position
    const cand = heads.map((t) => ({ t, near: parts.filter((s2) => t.x >= s2.box[0] - (s2.box[2] - s2.box[0]) * 0.1 && t.x <= s2.box[2] + (s2.box[2] - s2.box[0]) * 0.1)
      .map((s2) => ({ s2, above: s2.box[1] >= t.y - 1 / unitToM, d: t.y < s2.box[1] ? s2.box[1] - t.y : t.y > s2.box[3] ? t.y - s2.box[3] : 0 }))
      .filter((x) => x.d <= 6 / unitToM) }));
    // titles are written below their drawings on most sheets, above on some: the side the unambiguous titles show
    let up = 0, down = 0;
    for (const c of cand) if (c.near.length === 1) { if (c.near[0].above) up++; else down++; }
    const side = up >= down;
    const out: { box: Box; hits: number; title: string }[] = [];
    for (const { t, near } of cand) {
      const pick = near.filter((x) => x.above === side).sort((a, b) => a.d - b.d)[0] ?? near.sort((a, b) => b.s2.hits - a.s2.hits)[0];
      if (!pick || out.some((o) => boxInter(o.box, pick.s2.box) >= 0.5 * boxArea(pick.s2.box))) continue;
      out.push({ box: pick.s2.box, hits: pick.s2.hits, title: t.text.split(/\bscale\b/i)[0].trim().slice(0, 100) });
    }
    return out;
  };
  const pointsIn = (b: Box) => { let n = 0; for (const p of model.paths) { const [x, y] = p.pts[0]; if (x >= b[0] && x <= b[2] && y >= b[1] && y <= b[3]) n++; } return n; };
  for (const c of big) {
    if (c.hits < minHits || !bigEnough(c.box)) continue;
    if (views.some((v) => boxInter(c.box, v.box) >= 0.85 * boxArea(c.box))) continue;  // already listed as a named drawing
    // several drawing sheets side by side, each in its own frame: every sheet is one drawing
    const fr = frames.filter((f) => boxInter(f, c.box) >= 0.9 * boxArea(f));
    if (fr.length >= 2 || (fr.length === 1 && sheetPlans(fr[0]).length)) {
      for (const f of fr) {
        const n = pointsIn(f); if (n < minHits) continue;
        // a sheet with floor / slab layouts on it (plan + beam details + notes + title block): each layout is a drawing
        const plans = sheetPlans(f);
        if (plans.length) raw.push(...plans); else raw.push({ box: f, hits: n });
      }
      for (const s2 of small) if (boxInter(s2.box, c.box) >= 0.9 * boxArea(s2.box) && s2.hits >= 40 && !fr.some((f) => boxInter(f, s2.box) >= 0.3 * boxArea(s2.box))) raw.push({ box: s2.box, hits: s2.hits });
      continue;
    }
    const inside = views.filter((v) => boxInter(c.box, v.box) >= 0.9 * boxArea(v.box));
    const covered = inside.reduce((s2, v) => s2 + boxArea(v.box), 0);
    if (c.outside < Math.max(minHits, c.hits * 0.12) && (inside.length >= 2 || covered >= 0.5 * boxArea(c.box))) continue; // only named drawings + a sheet frame
    // drawings placed close together: if the group carries several drawing titles (the biggest texts in it),
    // each piece goes to its nearest title
    const subs = small.filter((s2) => boxInter(s2.box, c.box) >= 0.9 * boxArea(s2.box));
    const tIn = texts.filter((t) => t.x >= c.box[0] && t.x <= c.box[2] && t.y >= c.box[1] && t.y <= c.box[3] && TITLE.test(t.text) && (!/\b(lvl|level|slab|beam)\b/i.test(t.text) || /plans?\b|\bunit\b|bhk/i.test(t.text)) && !NOT_TITLE.test(t.text) && t.text.length >= 4);
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
  let ordered = rows.flatMap((r) => r.sort((a, b) => a.box[0] - b.box[0])).filter(keepPart);
  // a sheet frame round one named drawing (a Revit view / block such as "底图" placed in a title-block frame): the
  // drawing takes the sheet's caption and the frame is dropped
  {
    const drop = new Set<typeof ordered[number]>();
    for (const o of ordered) {
      if (!o.title || /^Drawing \d+$/.test(o.title) || drop.has(o)) continue;
      const inner = ordered.filter((p) => p !== o && boxArea(p.box) >= 0.35 * boxArea(o.box) && boxArea(p.box) < boxArea(o.box) && boxInter(o.box, p.box) >= 0.95 * boxArea(p.box));
      if (inner.length !== 1) continue;
      const p = inner[0];
      const generic = !p.title || p.title === o.title || /^Drawing \d+$/.test(p.title) || /^底图|^base\b/i.test(p.title) || p.title === p.sub || (p.sub && p.title === viewLabel(p.sub));
      if (!generic) continue;
      p.sub = p.sub ?? (p.title && p.title !== o.title ? p.title : undefined); p.title = o.title; p.kind = partKind(`${p.title} ${p.sub ?? ""}`); p.count += o.count; drop.add(o);
    }
    ordered = ordered.filter((p) => !drop.has(p)).slice(0, 80);
  }
  ordered.forEach((p, i) => { p.n = i + 1; if (!p.title) p.title = `Drawing ${i + 1}`; });
  if (roles) nameUntitledPlans(ordered, model, roles);
  markFormworkScope(ordered, texts, unitToM);
  return ordered;
}
/**
 * Drawings with no title of their own (basement plans often have none): a drawing with walls and lifts / stairs /
 * lobbies written in it is a floor plan, and its level is the one all its "BASEMENT-2 TO BASEMENT-3" ramp / stair
 * labels share — settled ones first, the rest by elimination (each level once).
 */
function nameUntitledPlans(parts: DrawingPart[], model: DxfModel, roles: Record<string, LayerRole>) {
  const LV = /\b(basement|basemet|bsmt)\s*-?\s*(\d)\b|\b(ground|stilt|podium|terrace)\s+(?:floor|level|lvl)\b|\b(\d{1,2})\s*(?:st|nd|rd|th)\s*floor\b/gi;
  const levelsIn = (s: string) => { const out: string[] = []; for (const m of s.matchAll(LV)) out.push(m[2] ? `BASEMENT-${m[2]}` : m[3] ? m[3].toUpperCase() : `${m[4]} FLOOR`); return [...new Set(out)]; };
  const texts = model.texts ?? [];
  const guess = new Map<DrawingPart, string[]>();
  for (const p of parts) {
    if (!/^Drawing \d+$/.test(p.title) && p.kind !== "other") continue;
    const b = p.box; const inB = (x: number, y: number) => x >= b[0] && x <= b[2] && y >= b[1] && y <= b[3];
    let walls = 0; for (const q of model.paths) if (roles[q.layer] === "walls" && inB(q.pts[0][0], q.pts[0][1]) && ++walls >= 30) break;
    if (walls < 30) continue;
    const tIn = texts.filter((t) => inB(t.x, t.y));
    if (!tIn.some((t) => { const k = meaningOf(t.text)?.key; return k === "lift" || k === "stair" || k === "lobby"; })) continue;
    p.kind = "plan";
    const sets = tIn.map((t) => levelsIn(t.text)).filter((v) => v.length);
    if (!sets.length) continue;
    let common = sets[0].filter((v) => sets.every((s2) => s2.includes(v)));
    if (!common.length) common = [...new Set(sets.flat())];
    guess.set(p, common);
  }
  const taken = new Set(parts.filter((p) => !guess.has(p)).map((p) => p.title.toUpperCase()));
  for (let pass = 0; pass < 3; pass++) for (const [p, c] of guess) {
    const free = c.filter((v) => !taken.has(`${v} PLAN`) && ![...taken].some((t) => t.startsWith(v)));
    if (free.length === 1) { p.title = `${free[0]} PLAN`; p.named = "labels"; taken.add(p.title); guess.delete(p); }
  }
}
/** A caption that marks a group of drawings as the formwork set: "FOR Alu. Formwork", "ALUFORM DRAWINGS", "MIVAN SCOPE", 铝模 … */
export const FORMWORK_CAPTION = /form\s*-?\s*work|alu\.?\s*form|aluform|mivan|alu(?:mini|mi)?um\s*(?:form|shutter)|shuttering|铝模|铝合金模板/i;
/**
 * The architect often copies the floors to be cast with the aluminium formwork into their own row of sheets under a
 * big caption ("FOR Alu. Formwork"). Those drawings are the formwork scope: the row of drawings right under the caption,
 * and the small pieces (sections, details) under that row. They are preferred for the typical floor and the levels.
 */
function markFormworkScope(parts: DrawingPart[], texts: DxfText[], unitToM: number) {
  const inAny = (t: DxfText) => parts.some((p) => t.x >= p.box[0] && t.x <= p.box[2] && t.y >= p.box[1] && t.y <= p.box[3]);
  const caps = texts.filter((t) => FORMWORK_CAPTION.test(t.text) && t.text.length <= 60 && !/not\s+(for|in)|excluded|conventional/i.test(t.text) && !inAny(t));
  const M = 1 / unitToM;
  for (const cap of caps) {
    // the row right under the caption: drawings whose top is within 40 m below it, taken outwards from the one nearest
    // the caption while the gaps between neighbours stay under 25 m
    const under = parts.filter((p) => p.box[3] <= cap.y + 2 * M && p.box[3] >= cap.y - 40 * M && p.w >= 5 && p.h >= 5);
    if (!under.length) continue;
    const near = under.reduce((b, p) => (Math.abs((p.box[0] + p.box[2]) / 2 - cap.x) < Math.abs((b.box[0] + b.box[2]) / 2 - cap.x) ? p : b), under[0]);
    if (Math.abs((near.box[0] + near.box[2]) / 2 - cap.x) > 60 * M) continue;
    const row = new Set<DrawingPart>([near]);
    const rowTop = near.box[3];
    // (a plan drawn inside its sheet frame is not a row member of its own — the frame is)
    const nested = (p: DrawingPart) => under.some((q) => q !== p && p.box[0] >= q.box[0] && p.box[2] <= q.box[2] && p.box[1] >= q.box[1] && p.box[3] <= q.box[3]);
    const sameRow = under.filter((p) => Math.abs(p.box[3] - rowTop) <= 15 * M && !nested(p)).sort((a, b) => a.box[0] - b.box[0]);
    const idx = sameRow.indexOf(near);
    if (idx < 0) continue;
    for (let i = idx + 1; i < sameRow.length; i++) { if (sameRow[i].box[0] - sameRow[i - 1].box[2] > 25 * M) break; row.add(sameRow[i]); }
    for (let i = idx - 1; i >= 0; i--) { if (sameRow[i + 1].box[0] - sameRow[i].box[2] > 25 * M) break; row.add(sameRow[i]); }
    const xs0 = Math.min(...[...row].map((p) => p.box[0])), xs1 = Math.max(...[...row].map((p) => p.box[2])), yb = Math.min(...[...row].map((p) => p.box[1]));
    // small pieces inside the row's width and up to 40 m under it (sections / details of the same set)
    for (const p of parts) if (!row.has(p) && p.box[0] >= xs0 - 5 * M && p.box[2] <= xs1 + 5 * M && p.box[3] <= yb + 2 * M && p.box[3] >= yb - 40 * M) row.add(p);
    // pieces lying inside a row drawing (a plan inside its sheet frame)
    for (const p of parts) if (!row.has(p)) for (const r of row) if (p.box[0] >= r.box[0] && p.box[2] <= r.box[2] && p.box[1] >= r.box[1] && p.box[3] <= r.box[3]) { row.add(p); break; }
    for (const p of row) { p.scope = "formwork"; p.scopeNote = cap.text.trim(); }
  }
}
function keepPart(p: { title: string; w: number; h: number; count: number }) {
  // untitled strips (notes, title blocks, text rows) are not drawings
  return !!p.title || (Math.min(p.w, p.h) >= 4 && p.count >= 40);
}
