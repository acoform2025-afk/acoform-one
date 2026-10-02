/**
 * 3D model of the typical floor for the browser viewer: walls (extruded wall outlines), wall panels on every
 * face, deck zones with every deck panel at the slab soffit, beams over openings and the slab.
 * Units: metres. Plan axes x (right), y (down on the plan) → 3D x, z; height = y up.
 */
import polygonClipping, { type MultiPolygon } from "polygon-clipping";
import type { Pt } from "./calc";
import type { FaceLayout } from "@/lib/design-engine/floor-panels";
import type { Zone } from "./zones";

export type Poly2 = Pt[][];                         // outer ring + holes (metres)
export type Panel3 = { p: [number, number, number][]; k: "std" | "top" | "fill" | "deck" | "dspec"; c: string };   // quad corners
export type Scene3 = {
  H: number; slab: number; box: [number, number, number, number];
  walls: Poly2[]; slabPoly: Poly2[]; beams: { a: Pt; b: Pt; w: number; d: number }[];
  panels: Panel3[]; mb: [Pt, Pt][]; zones: { code: string; at: Pt }[]; stats: { wall: number; deck: number; special: number };
  issues?: { id: string; sev: "error" | "warn"; text: string; at: Pt; y: number }[];
};

const ring = (r: Pt[]): [number, number][] => { const o = r.map((p) => [p[0], p[1]] as [number, number]); if (o.length && (o[0][0] !== o[o.length - 1][0] || o[0][1] !== o[o.length - 1][1])) o.push(o[0]); return o; };
const strip = (m: MultiPolygon): Poly2[] => m.map((poly) => poly.map((r) => r.slice(0, -1) as Pt[]));

export function buildScene3(o: {
  zoneWalls: Pt[][]; zoneGaps: { a: Pt; b: Pt; thk: number }[]; decks: { pts: Pt[]; holes: Pt[][] }[];
  zones: Zone[]; faces: FaceLayout[]; mpp: number; floorHeight: number; slabMm: number; stdHeight: number; beamDepthMm: number;
}): Scene3 {
  const H = Math.max(0.5, o.floorHeight - o.slabMm / 1000), slab = o.slabMm / 1000;
  // walls: even-odd combination of the merged wall rings → proper polygons with holes
  let walls: MultiPolygon = [];
  for (const r of o.zoneWalls) if (r.length >= 3) { try { walls = walls.length ? polygonClipping.xor(walls, [ring(r)]) : [[ring(r)]]; } catch { /* skip */ } }
  let slabM: MultiPolygon = [];
  for (const d of o.decks) if (d.pts.length >= 3) { try { slabM = slabM.length ? polygonClipping.union(slabM, [ring(d.pts)]) : [[ring(d.pts)]]; } catch { /* skip */ } }
  const holes: MultiPolygon = o.decks.flatMap((d) => d.holes.filter((h) => h.length >= 3).map((h) => [ring(h)]));
  if (holes.length && slabM.length) { try { slabM = polygonClipping.difference(slabM, ...holes); } catch { /* keep */ } }

  const panels: Panel3[] = [];
  let wallN = 0, special = 0;
  // wall panels on each face (face geometry in plan px → metres), drawn 5 mm off the concrete
  const mpp = o.mpp;
  for (const f of o.faces) {
    if (!f.geo || !(mpp > 0)) continue;
    const { a: A, b: B, off } = f.geo;
    const dx = B[0] - A[0], dy = B[1] - A[1], L = Math.hypot(dx, dy); if (!L) continue;
    const ux = dx / L, uy = dy / L, nx = -uy, ny = ux;
    const s = off < 0 ? -1 : 1, offM = (off * mpp) + s * 0.005;
    const a: Pt = [A[0] * mpp + nx * offM, A[1] * mpp + ny * offM];
    const len = (L * mpp);
    const at = (mm: number): Pt => { const t = Math.min(len, mm / 1000); return [a[0] + ux * t, a[1] + uy * t]; };
    const quad = (x0: number, x1: number, z0: number, z1: number, k: Panel3["k"], c: string) => {
      const p0 = at(x0), p1 = at(x1);
      panels.push({ p: [[p0[0], z0, p0[1]], [p1[0], z0, p1[1]], [p1[0], z1, p1[1]], [p0[0], z1, p0[1]]], k, c });
    };
    const Hm = f.height / 1000, main = Math.min(o.stdHeight / 1000, Hm), top = f.top / 1000;
    let run = 0;
    for (const w of f.panels) {
      quad(run, run + w, 0, main, "std", `${f.code} · ${w} × ${o.stdHeight}`); wallN++;
      if (top > 0) { quad(run, run + w, main, main + top, "top", `${f.code} · top ${w} × ${f.top}`); special++; }
      run += w;
    }
    if (f.filler) { quad(run, run + f.filler, 0, Hm, "fill", `${f.code} · filler ${f.filler} × ${f.height}`); special++; }
  }
  // deck panels at the soffit (5 mm below)
  let deckN = 0;
  for (const z of o.zones) for (const p of z.panels) {
    const y = H - 0.005;
    panels.push({ p: [[p.x0, y, p.y0], [p.x1, y, p.y0], [p.x1, y, p.y1], [p.x0, y, p.y1]], k: p.custom ? "dspec" : "deck", c: `${p.no} · ${p.code}` });
    deckN++; if (p.custom) special++;
  }
  const xs: number[] = [], ys: number[] = [];
  for (const poly of slabM) for (const [x, y] of poly[0]) { xs.push(x); ys.push(y); }
  for (const poly of walls) for (const [x, y] of poly[0]) { xs.push(x); ys.push(y); }
  const box: [number, number, number, number] = xs.length ? [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)] : [0, 0, 10, 10];
  const r3 = (v: number) => Math.round(v * 1000) / 1000;
  for (const p of panels) p.p = p.p.map((v) => [r3(v[0]), r3(v[1]), r3(v[2])]) as Panel3["p"];
  return {
    H, slab, box, walls: strip(walls), slabPoly: strip(slabM),
    beams: o.zoneGaps.map((g) => ({ a: g.a, b: g.b, w: Math.max(0.1, g.thk), d: Math.max(slab, o.beamDepthMm / 1000) })),
    panels, mb: o.zones.flatMap((z) => z.mb), zones: o.zones.map((z) => ({ code: z.code, at: [(z.box[0] + z.box[2]) / 2, (z.box[1] + z.box[3]) / 2] as Pt })),
    stats: { wall: wallN, deck: deckN, special },
  };
}
