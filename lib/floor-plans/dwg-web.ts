/**
 * AutoCAD .dwg → slim .dxf, in the user's browser, with LibreDWG compiled to WebAssembly
 * (@mlightcad/libredwg-web, GPL-3). Big drawings need 500 MB+ to read — too much for the server,
 * fine for a desktop browser. Only what the take-off uses is written: model-space lines, polylines,
 * arcs and circles, with blocks (INSERT) exploded and layer names kept.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { doorWindowKind, isNoiseLayer, isRailLayer } from "./layer-rules";
import { SECTION_LAYER, sectionLevels, sectionMarker, type SectionLevels } from "./section-read";
import { cleanDxfText } from "./dxf";
type Xf = [number, number, number, number, number, number]; // a b c d e f  → x' = a x + c y + e ; y' = b x + d y + f
const ID: Xf = [1, 0, 0, 1, 0, 0];
const mul = (m: Xf, n: Xf): Xf => [m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1], m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3], m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5]];
const ap = (m: Xf, x: number, y: number): [number, number] => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
const ok = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

function arc(cx: number, cy: number, r: number, a0: number, a1: number): [number, number][] {
  let sweep = a1 - a0; while (sweep <= 0) sweep += Math.PI * 2;
  const n = Math.max(2, Math.ceil((sweep / (Math.PI * 2)) * 32));
  const out: [number, number][] = [];
  for (let i = 0; i <= n; i++) { const a = a0 + (sweep * i) / n; out.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]); }
  return out;
}
function bulged(vs: { x: number; y: number; bulge?: number }[], closed: boolean): [number, number][] {
  const out: [number, number][] = [];
  const n = vs.length;
  for (let i = 0; i < n; i++) {
    const p = vs[i], q = vs[(i + 1) % n];
    out.push([p.x, p.y]);
    if (!closed && i === n - 1) break;
    const b = p.bulge ?? 0;
    if (Math.abs(b) > 1e-9) {
      const d = Math.hypot(q.x - p.x, q.y - p.y); if (!d) continue;
      const th = 4 * Math.atan(b), r = d / (2 * Math.sin(th / 2));
      const mx = (p.x + q.x) / 2, my = (p.y + q.y) / 2, h = r * Math.cos(th / 2);
      const ux = (q.x - p.x) / d, uy = (q.y - p.y) / d;
      const cx = mx - uy * h, cy = my + ux * h;
      const a0 = Math.atan2(p.y - cy, p.x - cx);
      const steps = Math.max(2, Math.ceil((Math.abs(th) / (Math.PI * 2)) * 32));
      for (let k = 1; k < steps; k++) { const a = a0 + (th * k) / steps; out.push([cx + Math.abs(r) * Math.cos(a), cy + Math.abs(r) * Math.sin(a)]); }
    }
  }
  return out;
}

/** Layers that never carry formwork geometry (furniture, sanitary fittings, hatching, dimensions, trees, cars…) —
 *  left out so big drawings stay small. Walls, slabs, columns, beams, openings, stairs, levels and titles are kept. */
export const SKIP_LAYER = /furn|furniture|(^|[_\-\s$])fur($|[_\-\s])|p_fur|sanit|fixture|fitting|plumb|hatch|^dim|[_\-\s$]dim|dimension|tree|plant|landscap|vehicle|(^|[_\-\s])car($|[_\-\s])|people|human|tile|flooring|pattern|fixt|sanr|^a-genm|^a-detl|^a-glaz|^a-door|^a-flor-hral|^q-spcq|^q-case|^e-comm|^i-|-patt($|[_\-\s])/i;
/** Revit / AutoCAD views that are not plans (sections, elevations, 3D, schedules) — whole blocks are left out. */
export const SKIP_BLOCK = /section|elevation|(^|[^a-z])elev([^a-z]|$)|(^|[^a-z0-9])3d([^a-z0-9]|$)|isometric|schedule|legend|detail/i;

/** Marker layer: one TEXT per named drawing ("VIEW|x0|y0|x1|y1|name"), read back by readDxf as model.views. */
export const VIEW_LAYER = "ACOFORM-VIEWS";

/** DwgDatabase (from libredwg-web `convert`) → DXF text. */
export function dwgDatabaseToDxf(db: any, maxEntities = 400_000): { dxf: string; count: number; markers: string[] } {
  const blocks = new Map<string, any>();
  for (const b of db?.tables?.BLOCK_RECORD?.entries ?? []) if (b?.name) blocks.set(b.name, b);
  const ms = blocks.get("*Model_Space") ?? blocks.get("*MODEL_SPACE");
  const top: any[] = ms?.entities ?? (db?.entities ?? []).filter((e: any) => !e.ownerBlockRecordSoftId || e.ownerBlockRecordSoftId === ms?.handle);
  const out: string[] = [];
  let count = 0;
  // named top-level blocks (Revit views such as "TOWER B … FIRST FLOOR PLAN", AutoCAD wblocks): their extents and names
  // are written as marker texts so the app can list and pick the separate drawings in the file
  let track: [number, number, number, number] | null = null;
  const views: { name: string; box: [number, number, number, number] }[] = [];
  const sections: SectionLevels[] = [];
  const secLines = new Map<string, { x0: number; x1: number; y: number }[]>();
  const dwKeep = new Map<string, boolean>(); let keptMarks = 0;
  // metres per drawing unit (sections are read in mm); unknown units: mm, as most building drawings
  const unitToM = ({ 1: 0.0254, 2: 0.3048, 4: 0.001, 5: 0.01, 6: 1 } as Record<number, number>)[Number(db?.header?.INSUNITS)] ?? 0.001;
  const grow = (x: number, y: number) => { if (track) { if (x < track[0]) track[0] = x; if (y < track[1]) track[1] = y; if (x > track[2]) track[2] = x; if (y > track[3]) track[3] = y; } };
  const f = (v: number) => (Math.round(v * 100) / 100).toString();
  const poly = (layer: string, pts: [number, number][], closed: boolean) => {
    const P = pts.filter((p) => ok(p[0]) && ok(p[1]));
    if (P.length < 2 || count >= maxEntities) return;
    count++;
    if (track) for (const [x, y] of P) grow(x, y);
    if (P.length === 2 && !closed) { out.push("0", "LINE", "8", layer, "10", f(P[0][0]), "20", f(P[0][1]), "30", "0", "11", f(P[1][0]), "21", f(P[1][1]), "31", "0"); return; }
    out.push("0", "LWPOLYLINE", "8", layer, "90", String(P.length), "70", closed ? "1" : "0");
    for (const [x, y] of P) out.push("10", f(x), "20", f(y));
  };
  const walk = (ents: any[], m: Xf, parentLayer: string | null, depth: number) => {
    for (const e of ents ?? []) {
      if (count >= maxEntities) return;
      const layer = String((e.layer === "0" || !e.layer) && parentLayer ? parentLayer : (e.layer ?? "0")).replace(/[\r\n]/g, " ");
      // sections are not drawn, but their floor lines give the slab thickness and floor height (read whatever layer
      // the section sits on); a section is often placed once per floor, so its lines are gathered by name first
      if (e.type === "INSERT" && depth === 0 && /section|(^|[^a-z])sec([^a-z]|$)/i.test(String(e.name))) {
        const b = blocks.get(e.name);
        if (b?.entities?.length) {
          const rot = ok(e.rotation) ? e.rotation : 0, sx = ok(e.xScale) && e.xScale ? e.xScale : 1, sy = ok(e.yScale) && e.yScale ? e.yScale : 1;
          const ip = e.insertionPoint ?? { x: 0, y: 0 }, bp = b.basePoint ?? { x: 0, y: 0 };
          const t: Xf = [Math.cos(rot) * sx, Math.sin(rot) * sx, -Math.sin(rot) * sy, Math.cos(rot) * sy, ip.x ?? 0, ip.y ?? 0];
          const nm = String(e.name).slice(0, 100), hl = secLines.get(nm) ?? secLines.set(nm, []).get(nm)!;
          horizontals(b.entities, mul(m, mul(t, [1, 0, 0, 1, -(bp.x ?? 0), -(bp.y ?? 0)])), 1, hl, null);
        }
        if (SKIP_BLOCK.test(String(e.name))) continue;
      }
      const T = (pts: [number, number][]) => pts.map(([x, y]) => ap(m, x, y));
      if ((SKIP_LAYER.test(layer) || isNoiseLayer(layer)) && e.type !== "TEXT" && e.type !== "MTEXT" && e.type !== "INSERT") {
        // door / window / glazing and railing lines are kept (straight lines only, ≥ 150 mm): they mark openings in
        // walls (windows get a sill wall) and balcony parapets. Everything else on these layers is left out.
        const keepKind = (dwKeep.get(layer) ?? (dwKeep.set(layer, !!doorWindowKind(layer) || isRailLayer(layer)), dwKeep.get(layer)!));
        if (!keepKind || keptMarks >= 60_000) continue;
        let P: [number, number][] = [];
        if (e.type === "LINE" && e.startPoint && e.endPoint) P = [[e.startPoint.x, e.startPoint.y], [e.endPoint.x, e.endPoint.y]];
        else if (e.type === "LWPOLYLINE" || e.type === "POLYLINE2D") P = (e.vertices ?? []).filter((v: any) => ok(v?.x) && ok(v?.y)).map((v: any) => [v.x, v.y]);
        const Q = T(P);
        for (let i = 1; i < Q.length; i++) if (Math.hypot(Q[i][0] - Q[i - 1][0], Q[i][1] - Q[i - 1][1]) * unitToM >= 0.15) { poly(layer, [Q[i - 1], Q[i]], false); keptMarks++; }
        continue;
      }
      // door / window blocks: walked, so their lines (on the block's layer) are kept as above
      if ((SKIP_LAYER.test(layer) || isNoiseLayer(layer)) && e.type !== "TEXT" && e.type !== "MTEXT" && !(e.type === "INSERT" && (dwKeep.get(layer) ?? (dwKeep.set(layer, !!doorWindowKind(layer) || isRailLayer(layer)), dwKeep.get(layer)!)))) continue;
      switch (e.type) {
        case "LINE": if (e.startPoint && e.endPoint) poly(layer, T([[e.startPoint.x, e.startPoint.y], [e.endPoint.x, e.endPoint.y]]), false); break;
        case "LWPOLYLINE": case "POLYLINE2D": case "POLYLINE3D": {
          const vs = (e.vertices ?? []).filter((v: any) => ok(v?.x) && ok(v?.y));
          if (vs.length < 2) break;
          // DWG LWPOLYLINE stores "closed" as bit 512 (bit 1 means extrusion); 2D/3D POLYLINE use bit 1 like DXF
          const closed = e.type === "LWPOLYLINE" ? ((e.flag ?? 0) & 512) !== 0 : ((e.flag ?? 0) & 1) === 1;
          poly(layer, T(bulged(vs, closed)), closed); break;
        }
        case "CIRCLE": if (e.center && e.radius > 0) poly(layer, T(arc(e.center.x, e.center.y, e.radius, 0, Math.PI * 2).slice(0, -1)), true); break;
        case "ARC": if (e.center && e.radius > 0) poly(layer, T(arc(e.center.x, e.center.y, e.radius, e.startAngle ?? 0, e.endAngle ?? Math.PI * 2)), false); break;
        case "TEXT": case "MTEXT": {
          if (depth > 1 || count >= maxEntities) break;
          const raw = String(e.text ?? e.contents ?? "");
          const txt = raw.replace(/\\P/g, " ").replace(/\\[LlOoKk]/g, "").replace(/\\[A-Za-z][^;\\]*;/g, "").replace(/[{}\r\n]/g, " ").replace(/\s+/g, " ").trim().slice(0, 160);
          const p = e.startPoint ?? e.insertionPoint ?? e.position;
          if (!txt || !p || !ok(p.x) || !ok(p.y)) break;
          const [x, y] = ap(m, p.x, p.y);
          count++;
          out.push("0", "TEXT", "8", layer, "10", f(x), "20", f(y), "30", "0", "40", f(Math.abs(Number(e.textHeight ?? e.height ?? 0)) || 0), "1", txt);
          break;
        }
        case "INSERT": {
          const b = blocks.get(e.name); if (!b || depth > 6 || !b.entities?.length) break;
          const rot = ok(e.rotation) ? e.rotation : 0, sx = ok(e.xScale) && e.xScale ? e.xScale : 1, sy = ok(e.yScale) && e.yScale ? e.yScale : 1;
          const ip = e.insertionPoint ?? { x: 0, y: 0 }, bp = b.basePoint ?? { x: 0, y: 0 };
          const t: Xf = [Math.cos(rot) * sx, Math.sin(rot) * sx, -Math.sin(rot) * sy, Math.cos(rot) * sy, ip.x ?? 0, ip.y ?? 0];
          if (SKIP_BLOCK.test(String(e.name))) break;
          const named = depth === 0 && !/^\*|^A\$C[0-9a-f]+$/i.test(String(e.name));
          const before = count;
          if (named) track = [Infinity, Infinity, -Infinity, -Infinity];
          walk(b.entities, mul(m, mul(t, [1, 0, 0, 1, -(bp.x ?? 0), -(bp.y ?? 0)])), layer, depth + 1);
          if (named && track && count - before >= 150 && track[2] > track[0]) views.push({ name: String(e.name).replace(/[\r\n|]/g, " ").slice(0, 120), box: track });
          if (named) track = null;
          break;
        }
        default: break;
      }
    }
  };
  // horizontal lines of a block (section views), for sectionLevels
  // level marks, grids, railings, annotation run past the building: not floor lines
  const NOT_FLOOR = /lev|grid|axis|anno|dim|text|hral|rail|symb|title|sheet|view|elev|ovhd/i;
  const horizontals = (ents: any[], m: Xf, depth: number, out2: { x0: number; x1: number; y: number }[], parentLayer: string | null = null) => {
    for (const e of ents ?? []) {
      if (out2.length > 200_000) return;
      const layer = String((e.layer === "0" || !e.layer) && parentLayer ? parentLayer : (e.layer ?? "0"));
      if (NOT_FLOOR.test(layer)) continue;
      let pts: [number, number][] = [];
      if (e.type === "LINE" && e.startPoint && e.endPoint) pts = [[e.startPoint.x, e.startPoint.y], [e.endPoint.x, e.endPoint.y]];
      else if (e.type === "LWPOLYLINE" || e.type === "POLYLINE2D") pts = (e.vertices ?? []).filter((v: any) => ok(v?.x) && ok(v?.y)).map((v: any) => [v.x, v.y]);
      else if (e.type === "INSERT" && depth < 6) {
        const b = blocks.get(e.name); if (!b?.entities?.length) continue;
        const rot = ok(e.rotation) ? e.rotation : 0, sx = ok(e.xScale) && e.xScale ? e.xScale : 1, sy = ok(e.yScale) && e.yScale ? e.yScale : 1;
        const ip = e.insertionPoint ?? { x: 0, y: 0 }, bp = b.basePoint ?? { x: 0, y: 0 };
        horizontals(b.entities, mul(m, mul([Math.cos(rot) * sx, Math.sin(rot) * sx, -Math.sin(rot) * sy, Math.cos(rot) * sy, ip.x ?? 0, ip.y ?? 0], [1, 0, 0, 1, -(bp.x ?? 0), -(bp.y ?? 0)])), depth + 1, out2, layer);
        continue;
      }
      const P = pts.map(([x, y]) => ap(m, x, y));
      for (let i = 1; i < P.length; i++) { const a = P[i - 1], c = P[i]; if (Math.abs(c[0] - a[0]) > 0 && Math.abs(a[1] - c[1]) <= 0.001 * Math.abs(c[0] - a[0])) out2.push({ x0: Math.min(a[0], c[0]), x1: Math.max(a[0], c[0]), y: (a[1] + c[1]) / 2 }); }
    }
  };
  walk(top, ID, null, 0);
  for (const [nm, hl] of secLines) { const sl = sectionLevels(hl, unitToM, nm); if (sl) sections.push(sl); }
  // marker texts (section levels, named views): also added to the full DXF, which has no such summary of its own
  const markers: string[] = [];
  for (const s of sections) markers.push("0", "TEXT", "8", SECTION_LAYER, "10", "0", "20", "0", "30", "0", "40", "0", "1", sectionMarker(s));
  for (const v of views) markers.push("0", "TEXT", "8", VIEW_LAYER, "10", f(v.box[0]), "20", f(v.box[3]), "30", "0", "40", "0", "1", ["VIEW", ...v.box.map(f), v.name].join("|"));
  out.push(...markers);
  const units = Number(db?.header?.INSUNITS);
  const head = ["0", "SECTION", "2", "HEADER", "9", "$ACADVER", "1", "AC1015", "9", "$INSUNITS", "70", String(Number.isFinite(units) ? units : 0), "0", "ENDSEC", "0", "SECTION", "2", "ENTITIES",
    // first entity: tells the reader that door / window / railing lines are only marks (not part of the drawing extents,
    // so plan regions saved before these lines were kept stay in place)
    "0", "TEXT", "8", VIEW_LAYER, "10", "0", "20", "0", "30", "0", "40", "0", "1", "ACOFORM|marks-not-extents"];
  return { dxf: [...head, ...out, "0", "ENDSEC", "0", "EOF"].join("\r\n"), count, markers };
}

/** Adds marker texts (group code / value pairs) at the end of a DXF's ENTITIES section. */
export function addMarkers(dxf: string, markers: string[]): string {
  if (!markers.length) return dxf;
  const m = /\r?\n\s*2\r?\nENTITIES\r?\n/.exec(dxf); if (!m) return dxf;
  const end = /\r?\n\s*0\r?\nENDSEC\r?\n/g; end.lastIndex = m.index + m[0].length;
  const e = end.exec(dxf); if (!e) return dxf;
  return dxf.slice(0, e.index) + "\r\n" + markers.join("\r\n") + dxf.slice(e.index);
}

/**
 * Browser only: reads a .dwg with the WebAssembly reader (served from /wasm) and returns DXF text.
 * The whole drawing is written (LibreDWG's own DXF writer — the same reader the server uses): dimensions, hatches,
 * block attributes (beam / column marks), rotated texts, schedules inside blocks and arrayed blocks all stay, exactly
 * as in AutoCAD. `slim` is the old line-only reading, kept as the fallback when the full drawing is too big to store.
 */
export async function convertDwgInBrowser(bytes: Uint8Array): Promise<{ dxf: string; count: number; full: boolean; slim: string }> {
  const mod: any = await import("@mlightcad/libredwg-web");
  const lib = await mod.LibreDwg.create("/wasm");
  const dwg = lib.dwg_read_data(bytes, mod.Dwg_File_Type.DWG);
  if (!dwg) throw new Error("This DWG could not be read. In AutoCAD use Save As → DXF and upload the DXF instead.");
  let db: any;
  try { db = lib.convert(dwg); } finally { try { lib.dwg_free(dwg); } catch { /* ignore */ } }
  const r = dwgDatabaseToDxf(db); db = null;
  if (!r.count) throw new Error("No lines were found in this DWG's model space. Save As → DXF in AutoCAD and upload that.");
  let full: string | null = null;
  try {
    const out: Uint8Array | null = lib.dwg_write_dxf(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
    if (out?.length) { const t = new TextDecoder().decode(out); if (/\bENTITIES\b/.test(t)) full = cleanDxfText(t); }
  } catch { full = null; }
  if (!full) return { dxf: r.dxf, count: r.count, full: false, slim: r.dxf };
  return { dxf: addMarkers(full, r.markers), count: r.count, full: true, slim: r.dxf };
}
