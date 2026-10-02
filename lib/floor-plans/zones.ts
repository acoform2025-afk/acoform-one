/**
 * Deck zones and numbered deck-panel layout (installation drawing), in the style of aluminium-formwork design
 * software: the slab is split into zones M1, M2 … (rooms / bays between walls and the beams over openings), each
 * zone is filled with deck panels in rows of the deck length with a mid beam (prop-head line) between rows, and
 * every panel gets a number (M12-07). Coordinates in metres (plan axes: x right, y down).
 */
import polygonClipping, { type MultiPolygon, type Polygon } from "polygon-clipping";
import { polyArea, type Pt } from "./calc";
import { fillRun, intervalsAt, overlap } from "@/lib/design-engine/floor-panels";

export type DeckPanel = { no: string; x0: number; y0: number; x1: number; y1: number; w: number; L: number; custom: boolean; code: string };
export type Zone = { code: string; rings: Pt[][]; area: number; box: [number, number, number, number]; along: "x" | "y"; panels: DeckPanel[]; mb: [Pt, Pt][]; specials: { rings: Pt[][]; area: number }[]; specialArea: number };

const ring = (pts: Pt[]): [number, number][] => { const r = pts.map((p) => [p[0], p[1]] as [number, number]); if (r.length && (r[0][0] !== r[r.length - 1][0] || r[0][1] !== r[r.length - 1][1])) r.push(r[0]); return r; };
const safeDiff = (a: MultiPolygon, ...b: MultiPolygon[]): MultiPolygon => {
  let out = a;
  for (const m of b) { if (!m.length) continue; try { out = polygonClipping.difference(out, m); } catch { /* skip a bad piece */ } }
  return out;
};

/**
 * Zones = slab outlines − walls − beams over openings (strips across the wall gaps) − ducts.
 * wallRings: merged wall outline rings (outer rings and their holes, any order — combined even-odd).
 */
export function deckZones(slabs: { pts: Pt[]; holes: Pt[][] }[], wallRings: Pt[][], gaps: { a: Pt; b: Pt; thk: number }[], minArea = 0.25, solids: Pt[][] = []): { rings: Pt[][]; area: number; box: [number, number, number, number] }[] {
  let slab: MultiPolygon = [];
  for (const s of slabs) if (s.pts.length >= 3) { try { slab = slab.length ? polygonClipping.union(slab, [ring(s.pts)]) : [[ring(s.pts)]]; } catch { /* skip */ } }
  if (!slab.length) return [];
  let walls: MultiPolygon = [];
  for (const r of wallRings) if (r.length >= 3) { try { walls = walls.length ? polygonClipping.xor(walls, [ring(r)]) : [[ring(r)]]; } catch { /* skip */ } }
  const strips: MultiPolygon = [];
  for (const g of gaps) {
    const dx = g.b[0] - g.a[0], dy = g.b[1] - g.a[1], L = Math.hypot(dx, dy); if (!L) continue;
    const h = Math.max(0.1, g.thk || 0.15) / 2, nx = (-dy / L) * h, ny = (dx / L) * h;
    strips.push([ring([[g.a[0] + nx, g.a[1] + ny], [g.b[0] + nx, g.b[1] + ny], [g.b[0] - nx, g.b[1] - ny], [g.a[0] - nx, g.a[1] - ny]])] as Polygon);
  }
  const holes: MultiPolygon = slabs.flatMap((s) => s.holes.filter((h) => h.length >= 3).map((h) => [ring(h)] as Polygon));
  const solid: MultiPolygon = solids.filter((r) => r.length >= 3).map((r) => [ring(r)] as Polygon);
  const zones = safeDiff(slab, walls, strips, holes, ...solid.map((p) => [p] as MultiPolygon));
  const out: { rings: Pt[][]; area: number; box: [number, number, number, number] }[] = [];
  for (const poly of zones) {
    const rings = poly.map((r) => r.slice(0, -1) as Pt[]);
    const area = Math.abs(polyArea(rings[0])) - rings.slice(1).reduce((a, r) => a + Math.abs(polyArea(r)), 0);
    const xs = rings[0].map((p) => p[0]), ys = rings[0].map((p) => p[1]);
    const box: [number, number, number, number] = [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
    if (area < minArea || box[2] - box[0] < 0.3 || box[3] - box[1] < 0.3) continue;
    out.push({ rings, area, box });
  }
  // reading order: rows from the top of the plan, left to right
  out.sort((a, b) => a.box[1] - b.box[1]);
  const rows: (typeof out)[] = [];
  for (const z of out) { const r = rows.find((q) => z.box[1] < q[0].box[1] + (q[0].box[3] - q[0].box[1]) * 0.5); if (r) r.push(z); else rows.push([z]); }
  return rows.flatMap((r) => r.sort((a, b) => a.box[0] - b.box[0]));
}

function inPoly(p: Pt, poly: Pt[]) {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if (yi > p[1] !== yj > p[1] && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
}

/** Fill one zone with deck panels: rows of the deck length (mm) across the short side, a mid beam between rows. */
export function layoutZone(code: string, z: { rings: Pt[][]; area: number; box: [number, number, number, number] }, deckW: number[], deckLen: number, codeFor: (w: number, L: number) => string, mbGap = 100, tol = 25): Zone {
  const w = z.box[2] - z.box[0], h = z.box[3] - z.box[1];
  // rows run across the short side: the 1200 length spans the short direction, so rows step along the long side
  const along: "x" | "y" = w >= h ? "x" : "y";
  const sw = (p: Pt): Pt => (along === "x" ? p : [p[1], p[0]]);
  const outer = z.rings[0].map(sw), holes = z.rings.slice(1).map((r) => r.map(sw));
  const xs = outer.map((p) => p[0]); const s0 = Math.min(...xs), s1 = Math.max(...xs);
  const L = deckLen / 1000, G = mbGap / 1000;
  const panels: DeckPanel[] = []; const mb: [Pt, Pt][] = [];
  let n = 0;
  for (let sa = s0; sa < s1 - 0.05; sa += L + G) {
    const sb = Math.min(sa + L, s1), len = Math.round((sb - sa) * 1000 / 5) * 5;
    const ints = overlap(intervalsAt(sa + 0.02, outer, holes), intervalsAt(sb - 0.02, outer, holes));
    for (const [lo, hi] of ints) {
      const run = (hi - lo) * 1000;
      const { panels: ws, left } = deckW.length ? fillRun(run, deckW) : { panels: [], left: run };
      let t = lo;
      const put = (wmm: number, custom: boolean) => {
        const t1 = t + wmm / 1000;
        // a wall / column corner pushing into the row: leave this panel out (the spot becomes a special)
        const e = 0.03, inZone = (x: number, y: number) => inPoly([x, y], outer) && !holes.some((h) => inPoly([x, y], h));
        const xsS = [sa + e, (sa + sb) / 2, sb - e], ysS = [t + e, (t + t1) / 2, t1 - e];
        if (!xsS.every((x) => ysS.every((y) => inZone(x, y)))) { t = t1; return; }
        const a = sw([sa, t]), b = sw([sb, t1]);
        const cust = custom || len !== deckLen;
        panels.push({ no: `${code}-${String(++n).padStart(2, "0")}`, x0: Math.min(a[0], b[0]), y0: Math.min(a[1], b[1]), x1: Math.max(a[0], b[0]), y1: Math.max(a[1], b[1]), w: wmm, L: len, custom: cust, code: cust ? `DS-${wmm}-${len}` : codeFor(wmm, len) });
        t = t1;
      };
      for (const wm of ws) put(wm, false);
      const fl = left <= tol ? 0 : Math.round(left / 5) * 5;
      if (fl) put(fl, true);
    }
    if (sb < s1 - 0.05) {                                  // mid beam line between this row and the next
      const mid = sb + G / 2;
      for (const [lo, hi] of intervalsAt(mid, outer, holes)) mb.push([sw([mid, lo]), sw([mid, hi])]);
    }
  }
  // what the panels and mid beams do not cover (odd corners, narrow strips): made-to-size deck specials
  let rest: MultiPolygon = [z.rings.map(ring)];
  const cover: MultiPolygon = [
    ...panels.map((p) => [ring([[p.x0, p.y0], [p.x1, p.y0], [p.x1, p.y1], [p.x0, p.y1]])] as Polygon),
    ...mb.map(([a, b]) => { const h = G / 2 + 0.002; const v = a[0] === b[0]; return [ring(v ? [[a[0] - h, a[1]], [a[0] + h, a[1]], [b[0] + h, b[1]], [b[0] - h, b[1]]] : [[a[0], a[1] - h], [b[0], b[1] - h], [b[0], b[1] + h], [a[0], a[1] + h]])] as Polygon; }),
  ];
  try { if (cover.length) rest = polygonClipping.difference(rest, ...cover); } catch { rest = []; }
  const specials = rest.map((poly) => { const rings = poly.map((r) => r.slice(0, -1) as Pt[]); return { rings, area: Math.abs(polyArea(rings[0])) - rings.slice(1).reduce((x, r) => x + Math.abs(polyArea(r)), 0) }; }).filter((q) => q.area > 0.02);
  return { code, rings: z.rings, area: z.area, box: z.box, along, panels, mb, specials, specialArea: specials.reduce((x, q) => x + q.area, 0) };
}

/** Every wall panel numbered face by face (F12-01 …), in the order laid from the start of the face. */
export function wallPanelNumbers(faces: { code: string; height: number; panels: number[]; filler: number; top: number }[], stdHeight: number, codeFor: (w: number) => string) {
  const out: { no: string; face: string; code: string; w: number; h: number }[] = [];
  for (const f of faces) {
    let k = 0;
    for (const w of f.panels) {
      out.push({ no: `${f.code}-${String(++k).padStart(2, "0")}`, face: f.code, code: codeFor(w), w, h: stdHeight });
      if (f.top > 0) out.push({ no: `${f.code}-${String(k).padStart(2, "0")}T`, face: f.code, code: `WT-${w}-${f.top}`, w, h: f.top });
    }
    if (f.filler) out.push({ no: `${f.code}-${String(++k).padStart(2, "0")}F`, face: f.code, code: `WF-${f.filler}-${f.height}`, w: f.filler, h: f.height });
  }
  return out;
}
