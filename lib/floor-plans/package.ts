/**
 * Design package (in the structure of a professional formwork design package, e.g. Guangzhou Motian):
 *  • main panel list by AREA (the floor split into areas / flats, like 区域 1–5 or FLAT-A … D) with unit and total area
 *    and a "make as per drawing" mark for non-standard pieces
 *  • walers (back stiffeners) list
 *  • accessories list with loss % (support-head sets 2–3 included)
 *  • ZIP of all Excel lists
 */
import type { Pt } from "./calc";
import type { Zone } from "./zones";
import type { BomRow, FaceLayout } from "@/lib/design-engine/floor-panels";
import type { LayoutRules } from "@/lib/design-engine/layout-rules";
import { faceFrames, inRings } from "@/lib/design-engine/design-check";

export const cell = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
export const csvRow = (a: (string | number)[]) => a.map(cell).join(",");
export const csvText = (rows: string[]) => "﻿" + rows.join("\r\n");

/** Zones grouped into `k` areas (flats / wings): k-means on the zone centres, named A1 … Ak left → right. */
export function zoneAreas(zones: Zone[], k: number): Map<string, string> {
  const out = new Map<string, string>();
  if (!zones.length) return out;
  k = Math.max(1, Math.min(k, zones.length));
  const pts = zones.map((z) => ({ code: z.code, x: (z.box[0] + z.box[2]) / 2, y: (z.box[1] + z.box[3]) / 2, w: Math.max(0.5, z.area) }));
  // start from k points spread along x
  const sorted = [...pts].sort((a, b) => a.x - b.x);
  let cs = Array.from({ length: k }, (_, i) => ({ x: sorted[Math.floor(((i + 0.5) * sorted.length) / k)].x, y: sorted[Math.floor(((i + 0.5) * sorted.length) / k)].y }));
  let lab = pts.map(() => 0);
  for (let it = 0; it < 30; it++) {
    lab = pts.map((p) => cs.reduce((bi, c, i) => (Math.hypot(p.x - c.x, p.y - c.y) < Math.hypot(p.x - cs[bi].x, p.y - cs[bi].y) ? i : bi), 0));
    cs = cs.map((c, i) => { const m = pts.filter((_, j) => lab[j] === i); const W = m.reduce((s, p) => s + p.w, 0); return W ? { x: m.reduce((s, p) => s + p.x * p.w, 0) / W, y: m.reduce((s, p) => s + p.y * p.w, 0) / W } : c; });
  }
  const order = cs.map((c, i) => ({ c, i })).sort((a, b) => a.c.x - b.c.x || a.c.y - b.c.y).map((o) => o.i);
  pts.forEach((p, j) => out.set(p.code, `A${order.indexOf(lab[j]) + 1}`));
  return out;
}

/** Wall face → zone code (300 mm in front of the face middle, on the open side; outer faces → nearest zone). */
export function faceZones(zones: Zone[], faces: FaceLayout[], mpp: number, walls: Pt[][]) {
  const m = new Map<string, string>();
  for (const fr of faceFrames(faces, mpp, walls)) {
    const p: Pt = [(fr.a[0] + fr.b[0]) / 2 + fr.n[0] * 0.3, (fr.a[1] + fr.b[1]) / 2 + fr.n[1] * 0.3];
    const z = zones.find((q) => p[0] >= q.box[0] && p[0] <= q.box[2] && p[1] >= q.box[1] && p[1] <= q.box[3] && inRings(p, q.rings))
      ?? zones.reduce<Zone | null>((best, q) => { const d = Math.hypot((q.box[0] + q.box[2]) / 2 - p[0], (q.box[1] + q.box[3]) / 2 - p[1]); return !best || d < Math.hypot((best.box[0] + best.box[2]) / 2 - p[0], (best.box[1] + best.box[3]) / 2 - p[1]) ? q : best; }, null);
    if (z) m.set(fr.f.code, z.code);
  }
  return (code: string) => {
    if (m.has(code)) return m.get(code);
    const parent = code.replace(/-O\d+[HS]$/, "");
    for (const [k, v] of m) if (k === parent || k.startsWith(`${parent}.`)) return v;
    return undefined;
  };
}

const FAMILY: Record<string, string> = {
  deck: "Deck panels", wall: "Wall panels", "wall-top": "Wall top panels / column tops", filler: "Fillers & specials", end: "Wall ends & reveals",
  corner: "Corners, soffit corners & kickers", column: "Column panels (column set)", beam: "Beam side & bottom panels", upstand: "Upstand / planter panels", stair: "Staircase", drop: "Drop formwork (sunk slabs)",
};

/** Main panel list, one column per area (+ "whole floor" for pieces not tied to a room). */
export function mainListCsv(o: {
  bom: BomRow[]; zones: Zone[]; areaOf: Map<string, string>; wallPanels: { no: string; face: string; code: string; w: number; h: number }[];
  zoneOfFace: (face: string) => string | undefined; title: string; rules: LayoutRules | null;
}) {
  const areas = [...new Set(o.areaOf.values())].sort((a, b) => Number(a.slice(1)) - Number(b.slice(1)));
  // per code: count by area
  const byCode = new Map<string, Map<string, number>>();
  const bump = (code: string, area: string, n = 1) => { const m = byCode.get(code) ?? byCode.set(code, new Map()).get(code)!; m.set(area, (m.get(area) ?? 0) + n); };
  for (const z of o.zones) for (const p of z.panels) bump(p.code, o.areaOf.get(z.code) ?? "Floor");
  for (const w of o.wallPanels) { const z = o.zoneOfFace(w.face); bump(w.code, (z && o.areaOf.get(z)) || "Floor"); }
  const rows = [csvRow([`MAIN PANEL LIST BY AREA — ${o.title}`]), csvRow([`Areas: ${areas.map((a) => `${a} = rooms ${o.zones.filter((z) => o.areaOf.get(z.code) === a).map((z) => z.code).join(" ")}`).join(" · ")}`]),
    csvRow([o.rules ? `Formwork system: ${o.rules.system} · "Make as per drawing" = non-standard piece, see the special panel production drawings` : ""]), ""];
  rows.push(csvRow(["No.", "Code", "Description", "Width mm", "Height / length mm", ...areas, "Whole floor", "Total qty", "Unit m²", "Total m²", "Make"]));
  let no = 0, totQ = 0, totA = 0;
  for (const fam of Object.keys(FAMILY)) {
    const list = o.bom.filter((r) => r.group === fam && r.qty > 0);
    if (!list.length) continue;
    rows.push(csvRow([FAMILY[fam]]));
    for (const r of list) {
      const by = byCode.get(r.code);
      const placed = by ? [...by.values()].reduce((a, b) => a + b, 0) : 0;
      const qty = Math.round(r.qty);
      const floor = Math.max(0, qty - placed) + (by?.get("Floor") ?? 0);
      const unit = r.w && r.h ? (r.w * r.h) / 1e6 : qty ? r.area / qty : 0;
      rows.push(csvRow([++no, r.code, r.description, r.w || "", r.h || "", ...areas.map((a) => by?.get(a) ?? ""), floor || "", qty, unit ? unit.toFixed(4) : "", r.area.toFixed(2), r.custom ? "as per drawing" : "standard"]));
      totQ += qty; totA += r.area;
    }
  }
  rows.push("", csvRow(["", "TOTAL", "", "", "", ...areas.map(() => ""), "", totQ, "", totA.toFixed(2), ""]));
  return csvText(rows);
}

/** Walers (back stiffeners / alignment walers) on each wall face: one per tie row, cut to the face length. */
export function walersCsv(faces: FaceLayout[], rules: LayoutRules | null, title: string) {
  const tieV = rules?.tieV ?? 800;
  const flat = rules?.tie === "flat";
  const lens = new Map<number, { n: number; faces: string[] }>();
  let pieces = 0, metres = 0;
  for (const f of faces) {
    if (!f.geo || f.length < 300) continue;
    if (!flat && /B$/.test(f.code)) continue;                    // tie-rod system: walers on one face of the wall
    const rows = Math.max(2, Math.floor(f.height / tieV));
    let left = f.length;
    while (left > 0) {                                            // stock length 6 m
      const L = Math.ceil(Math.min(left, 6000) / 100) * 100;
      const e = lens.get(L) ?? { n: 0, faces: [] }; e.n += rows; if (e.faces.length < 12) e.faces.push(f.code); lens.set(L, e);
      pieces += rows; metres += (rows * L) / 1000; left -= 6000;
    }
  }
  const rows = [csvRow([`WALERS / BACK STIFFENERS LIST — ${title}`]), csvRow([`${flat ? "Flat-tie system: walers on both wall faces" : "Tie-rod system: alignment walers on one face"} · one waler per tie row (tie rows @ ${tieV} mm) · cut to the wall face, max 6 m`]), ""];
  rows.push(csvRow(["Code", "Length mm", "Qty", "Total m", "Wall faces (first 12)"]));
  for (const [L, e] of [...lens.entries()].sort((a, b) => b[0] - a[0])) rows.push(csvRow([`WL-${L}`, L, e.n, ((e.n * L) / 1000).toFixed(1), e.faces.join(" ")]));
  rows.push("", csvRow(["TOTAL", "", pieces, metres.toFixed(1), ""]));
  return csvText(rows);
}

/** Accessories (with loss %) and support-head sets. */
export function accessoriesCsv(bom: BomRow[], title: string, rules: LayoutRules | null) {
  const rows = [csvRow([`ACCESSORIES LIST — ${title}`]), csvRow([rules ? `Loss on small parts: ${rules.lossPct} % (included) · props / support heads kept for ${rules.supportSets} floor${rules.supportSets > 1 ? "s" : ""}` : ""]), ""];
  rows.push(csvRow(["Group", "Code", "Description", "Unit", "Qty", "Weight kg", "How counted"]));
  for (const r of bom.filter((x) => x.group === "accessory")) rows.push(csvRow([r.sub ?? "", r.code, r.description, r.unit ?? "nos", Math.round(r.qty * 10) / 10, r.weight, r.basis ?? ""]));
  return csvText(rows);
}

// ---------- minimal ZIP writer (stored, no compression) ----------
const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
const crc32 = (b: Uint8Array) => { let c = 0xffffffff; for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
export function zip(files: { name: string; data: Uint8Array }[]): Uint8Array {
  const enc = new TextEncoder();
  const parts: Uint8Array[] = []; const central: Uint8Array[] = []; let off = 0;
  for (const f of files) {
    const name = enc.encode(f.name), crc = crc32(f.data), size = f.data.length;
    const h = new DataView(new ArrayBuffer(30));
    h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint16(6, 0x0800, true); h.setUint16(8, 0, true);
    h.setUint16(10, 0, true); h.setUint16(12, 0x21, true); h.setUint32(14, crc, true); h.setUint32(18, size, true); h.setUint32(22, size, true);
    h.setUint16(26, name.length, true); h.setUint16(28, 0, true);
    parts.push(new Uint8Array(h.buffer), name, f.data);
    const c = new DataView(new ArrayBuffer(46));
    c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(8, 0x0800, true); c.setUint16(10, 0, true);
    c.setUint16(12, 0, true); c.setUint16(14, 0x21, true); c.setUint32(16, crc, true); c.setUint32(20, size, true); c.setUint32(24, size, true);
    c.setUint16(28, name.length, true); c.setUint32(42, off, true);
    central.push(new Uint8Array(c.buffer), name);
    off += 30 + name.length + size;
  }
  const cdSize = central.reduce((s, p) => s + p.length, 0);
  const e = new DataView(new ArrayBuffer(22));
  e.setUint32(0, 0x06054b50, true); e.setUint16(8, files.length, true); e.setUint16(10, files.length, true); e.setUint32(12, cdSize, true); e.setUint32(16, off, true);
  const all = [...parts, ...central, new Uint8Array(e.buffer)];
  const out = new Uint8Array(all.reduce((s, p) => s + p.length, 0)); let p = 0; for (const a of all) { out.set(a, p); p += a.length; }
  return out;
}
