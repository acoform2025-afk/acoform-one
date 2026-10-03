/**
 * 3D model of the typical floor for the browser viewer: walls (extruded wall outlines), wall panels on every
 * face, deck zones with every deck panel at the slab soffit, beams over openings and the slab.
 * Units: metres. Plan axes x (right), y (down on the plan) → 3D x, z; height = y up.
 */
import polygonClipping, { type MultiPolygon } from "polygon-clipping";
import type { Pt } from "./calc";
import type { FaceLayout } from "@/lib/design-engine/floor-panels";
import type { Zone } from "./zones";
import type { StairGeo, StairLayout } from "@/lib/design-engine/floor-panels";
import { inRings } from "@/lib/design-engine/design-check";

export type Poly2 = Pt[][];                         // outer ring + holes (metres)
export type Panel3Kind = "std" | "top" | "fill" | "deck" | "dspec" | "ic" | "ec" | "sc" | "kick" | "bside" | "bbot" | "col" | "stair" | "riser" | "cheek" | "lsoff";
export type Panel3 = { p: [number, number, number][]; k: Panel3Kind; c: string; z?: string };   // quad corners; z = zone / face the piece belongs to
export type Scene3 = {
  H: number; slab: number; box: [number, number, number, number];
  walls: Poly2[]; slabPoly: Poly2[]; beams: { a: Pt; b: Pt; w: number; d: number }[];
  cols: Pt[][]; beamSolids: { ring: Pt[]; d: number }[];
  steps: { c: [number, number, number]; s: [number, number, number]; rot: number }[];   // stair treads / landings as boxes (centre, size x·y·z, rotation about y)
  panels: Panel3[]; mb: [Pt, Pt][]; zones: { code: string; at: Pt }[]; stats: { wall: number; deck: number; special: number };
  issues?: { id: string; sev: "error" | "warn"; text: string; at: Pt; y: number }[];
  wallBits?: { poly: Poly2; z0: number; z1: number; infill?: boolean }[];   // infill: block / brick wall round a window (not formed)          // concrete under windows (sill) and over openings (lintel)
  glass?: { p: [number, number, number][]; door: boolean }[];     // window panes / door leaves in the openings
  arch?: { k: "rail" | "parapet" | "proj"; a?: Pt; b?: Pt; ring?: Pt[] }[];   // railings, parapets, sunshades (not formwork)
  acc?: Acc3;                                                       // accessories: props, heads, ties, walers, push-pull props, riser brackets
};
/** Accessories, each as a straight piece between two points (x, y, z; metres) — drawn as a rod / tube of its kind. */
export type Acc3 = {
  props: [number, number, number, number, number][];    // x, z, bottom y, top y, kind (0 deck · 1 beam · 2 stair)
  ties: [number, number, number, number, number][];     // x, y, z, normal x, normal z (tie end on a wall face)
  walers: [number, number, number, number, number][];   // x0, y, z0, x1, z1
  pushPull: [number, number, number, number, number, number][];   // wall point x, y, z → floor point x, 0, z
  brackets: [number, number, number][];                 // riser brackets
  heads: [number, number, number, number][];            // prop heads / drop heads: x, y, z, kind
};

const ring = (r: Pt[]): [number, number][] => { const o = r.map((p) => [p[0], p[1]] as [number, number]); if (o.length && (o[0][0] !== o[o.length - 1][0] || o[0][1] !== o[o.length - 1][1])) o.push(o[0]); return o; };
const strip = (m: MultiPolygon): Poly2[] => m.map((poly) => poly.map((r) => r.slice(0, -1) as Pt[]));

export function buildScene3(o: {
  zoneWalls: Pt[][]; zoneGaps: { a: Pt; b: Pt; thk: number }[]; decks: { pts: Pt[]; holes: Pt[][] }[];
  zones: Zone[]; faces: FaceLayout[]; mpp: number; floorHeight: number; slabMm: number; stdHeight: number; beamDepthMm: number;
  cols?: Pt[][]; beams3?: { ring: Pt[]; d: number }[]; stairs?: [number, number, number, number][];
  stairGeo?: StairGeo[]; kickerMm?: number; scMm?: [number, number]; icMm?: number; ecMm?: number;
  openings?: { a: Pt; b: Pt; n: Pt; thk: number; door: boolean; sill: number; head: number; gap?: boolean; free?: boolean }[];
  arch?: { k: "rail" | "parapet" | "proj"; a?: Pt; b?: Pt; ring?: Pt[] }[];
  stairLay?: StairLayout[];                 // the stair panels the layout chose (soffit / cheek / landing pieces)
  propSpacing?: number; tieH?: number; tieV?: number;   // m, mm, mm
}): Scene3 {
  const H = Math.max(0.5, o.floorHeight - o.slabMm / 1000), slab = o.slabMm / 1000;
  // walls: even-odd combination of the merged wall rings → proper polygons with holes
  let walls: MultiPolygon = [];
  for (const r of o.zoneWalls) if (r.length >= 3) { try { walls = walls.length ? polygonClipping.xor(walls, [ring(r)]) : [[ring(r)]]; } catch { /* skip */ } }
  // doors / windows inside the walls: a hole through the wall, sill wall under a window, lintel over the opening
  const wallBits: NonNullable<Scene3["wallBits"]> = [], glass: NonNullable<Scene3["glass"]> = [];
  const openPieces: { op: NonNullable<typeof o.openings>[number]; sill: number; head: number }[] = [];
  const glassOf = new Map<number, number>();          // opening → its pane
  for (const [oi, op] of (o.openings ?? []).entries()) {
    const e = 0.01, [nx, ny] = op.n;
    const at = (p: Pt, d: number): [number, number] => [p[0] + nx * d, p[1] + ny * d];
    const rect: [number, number][] = [at(op.a, -e), at(op.b, -e), at(op.b, op.thk + e), at(op.a, op.thk + e), at(op.a, -e)];
    if (!op.free) { try { walls = polygonClipping.difference(walls, [rect]); } catch { continue; } }
    const poly: Poly2 = [rect.slice(0, -1) as Pt[]];
    const sill = Math.min(op.sill / 1000, H), head = Math.min(op.head / 1000, H);
    const infill = op.free ? { infill: true } : {};
    if (sill > 0.02) wallBits.push({ poly, z0: 0, z1: sill, ...infill });
    if (H - head > 0.02) wallBits.push({ poly, z0: head, z1: H, ...infill });
    const m1 = at(op.a, op.thk / 2), m2 = at(op.b, op.thk / 2);
    glassOf.set(oi, glass.length);
    glass.push({ p: [[m1[0], sill, m1[1]], [m2[0], sill, m2[1]], [m2[0], head, m2[1]], [m1[0], head, m1[1]]], door: op.door });
    if (!op.free) openPieces.push({ op, sill, head });
  }
  let slabM: MultiPolygon = [];
  for (const d of o.decks) if (d.pts.length >= 3) { try { slabM = slabM.length ? polygonClipping.union(slabM, [ring(d.pts)]) : [[ring(d.pts)]]; } catch { /* skip */ } }
  const holes: MultiPolygon = o.decks.flatMap((d) => d.holes.filter((h) => h.length >= 3).map((h) => [ring(h)]));
  if (holes.length && slabM.length) { try { slabM = polygonClipping.difference(slabM, ...holes); } catch { /* keep */ } }
  // a door with open air on one side (no floor slab there) is a glazed door to the outside — shown as glass
  const inSlab = (q: Pt) => slabM.some((poly) => inRings(q, [poly[0].slice(0, -1) as Pt[]]) && !poly.slice(1).some((h) => inRings(q, [h.slice(0, -1) as Pt[]])));
  if (slabM.length) (o.openings ?? []).forEach((op, i) => {
    const gi = glassOf.get(i); if (!op.door || gi == null) return;
    const mid: Pt = [(op.a[0] + op.b[0]) / 2 + op.n[0] * op.thk / 2, (op.a[1] + op.b[1]) / 2 + op.n[1] * op.thk / 2];
    const d = op.thk / 2 + 0.4;
    if (!inSlab([mid[0] + op.n[0] * d, mid[1] + op.n[1] * d]) || !inSlab([mid[0] - op.n[0] * d, mid[1] - op.n[1] * d])) glass[gi].door = false;
  });

  const panels: Panel3[] = [];
  let wallN = 0, special = 0;
  // the short panels over each opening (head piece) and under each window (sill piece), on both faces of the wall
  for (const { op, sill, head } of openPieces) {
    const w = Math.round(Math.hypot(op.b[0] - op.a[0], op.b[1] - op.a[1]) * 1000);
    for (const d of [-0.005, op.thk + 0.005]) {
      const p0: Pt = [op.a[0] + op.n[0] * d, op.a[1] + op.n[1] * d], p1: Pt = [op.b[0] + op.n[0] * d, op.b[1] + op.n[1] * d];
      const q = (z0: number, z1: number, c: string) => { panels.push({ p: [[p0[0], z0, p0[1]], [p1[0], z0, p1[1]], [p1[0], z1, p1[1]], [p0[0], z1, p0[1]]], k: "fill", c }); special++; };
      if (H - head > 0.02) q(head, H, `over ${op.door ? "door" : "window"} · OH ${w} × ${Math.round((H - head) * 1000)}`);
      if (sill > 0.02) q(0, sill, `under window · OS ${w} × ${Math.round(sill * 1000)}`);
    }
  }
  // wall panels on each face (face geometry in plan px → metres), drawn 5 mm off the concrete
  const mpp = o.mpp;
  for (const f of o.faces) {
    const fg = f.geo ?? f.geo3;
    if (!fg || !(mpp > 0)) continue;
    const base = !f.geo && f.geo3 ? f.geo3.z0 / 1000 : 0;      // a piece over / under a door or window
    const { a: A, b: B, off } = fg;
    const dx = B[0] - A[0], dy = B[1] - A[1], L = Math.hypot(dx, dy); if (!L) continue;
    const ux = dx / L, uy = dy / L, nx = -uy, ny = ux;
    const s = off < 0 ? -1 : 1, offM = (off * mpp) + s * 0.005;
    const a: Pt = [A[0] * mpp + nx * offM, A[1] * mpp + ny * offM];
    const len = (L * mpp);
    const at = (mm: number): Pt => { const t = Math.min(len, mm / 1000); return [a[0] + ux * t, a[1] + uy * t]; };
    const quad = (x0: number, x1: number, z0: number, z1: number, k: Panel3["k"], c: string) => {
      const p0 = at(x0), p1 = at(x1);
      panels.push({ p: [[p0[0], base + z0, p0[1]], [p1[0], base + z0, p1[1]], [p1[0], base + z1, p1[1]], [p0[0], base + z1, p0[1]]], k, c, z: f.code });
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
  // soffit corner on every wall face: a vertical leg on the wall top and a horizontal leg under the slab into the room
  const scV = (o.scMm?.[1] ?? 125) / 1000, scH = (o.scMm?.[0] ?? 100) / 1000;
  for (const f of o.faces) {
    const fg = f.geo ?? (f.geo3 && f.geo3.z0 + f.height >= H * 1000 - 10 ? f.geo3 : undefined);   // pieces under a window sill have none
    if (!fg || !(mpp > 0)) continue;
    const { a: A, b: B, off } = fg;
    const dx = B[0] - A[0], dy = B[1] - A[1], L = Math.hypot(dx, dy); if (!L) continue;
    const ux = dx / L, uy = dy / L, nx = -uy, ny = ux, s = off < 0 ? -1 : 1, offM = (off * mpp) + s * 0.005;
    const a: Pt = [A[0] * mpp + nx * offM, A[1] * mpp + ny * offM], b: Pt = [a[0] + ux * L * mpp, a[1] + uy * L * mpp];
    const Hf = Math.min(H, (f.geo ? 0 : f.geo3!.z0 / 1000) + f.height / 1000);
    const c = `${f.code} · soffit corner ${o.scMm?.[0] ?? 100} × ${o.scMm?.[1] ?? 125}`;
    panels.push({ p: [[a[0], Hf - scV, a[1]], [b[0], Hf - scV, b[1]], [b[0], Hf, b[1]], [a[0], Hf, a[1]]], k: "sc", c, z: f.code });
    const ox = nx * s * scH, oy = ny * s * scH;      // horizontal leg, away from the concrete
    panels.push({ p: [[a[0], Hf, a[1]], [b[0], Hf, b[1]], [b[0] + ox, Hf, b[1] + oy], [a[0] + ox, Hf, a[1] + oy]], k: "sc", c, z: f.code });
  }
  // internal / external corners of the walls: a vertical piece at every corner (legs along both faces)
  const icL = (o.icMm ?? 100) / 1000, ecL = (o.ecMm ?? 65) / 1000;
  const seen = new Set<string>();
  for (const ring of o.zoneWalls) for (let i = 0; i < ring.length; i++) {
    const p = ring[i], key = `${Math.round(p[0] * 50)}:${Math.round(p[1] * 50)}`; if (seen.has(key)) continue; seen.add(key);
    let n = 0; for (let k = 0; k < 8; k++) { const ang = (k + 0.5) * Math.PI / 4; if (inRings([p[0] + Math.cos(ang) * 0.04, p[1] + Math.sin(ang) * 0.04], o.zoneWalls)) n++; }
    const ic = n >= 5 && n <= 7, ec = n >= 1 && n <= 3; if (!ic && !ec) continue;
    const prev = ring[(i - 1 + ring.length) % ring.length], next = ring[(i + 1) % ring.length];
    const leg = ic ? icL : ecL, k: Panel3Kind = ic ? "ic" : "ec", c = ic ? `internal corner ${o.icMm ?? 100} × ${o.icMm ?? 100}` : `external corner ${o.ecMm ?? 65}`;
    for (const q of [prev, next]) {
      const dx = q[0] - p[0], dy = q[1] - p[1], L = Math.hypot(dx, dy); if (!L) continue;
      const e: Pt = [p[0] + (dx / L) * Math.min(leg, L), p[1] + (dy / L) * Math.min(leg, L)];
      panels.push({ p: [[p[0], 0, p[1]], [e[0], 0, e[1]], [e[0], H, e[1]], [p[0], H, p[1]]], k, c });
    }
  }
  // external kicker along the slab edge (outside face of the slab, above the wall panels)
  const kick = (o.kickerMm ?? 0) / 1000;
  if (kick > 0) for (const poly of slabM) { const r = poly[0]; for (let i = 0; i < r.length - 1; i++) { const a = r[i], b = r[i + 1]; panels.push({ p: [[a[0], H, a[1]], [b[0], H, b[1]], [b[0], H + slab + kick, b[1]], [a[0], H + slab + kick, a[1]]], k: "kick", c: `kicker ${o.kickerMm} mm` }); } }
  // beams: side panels on every edge of the beam outline, bottom panel under it
  for (const b3 of o.beams3 ?? []) {
    const d = Math.max(slab, b3.d / 1000), h = d - slab; if (h <= 0.01 || b3.ring.length < 3) continue;
    const r = b3.ring;
    for (let i = 0; i < r.length; i++) { const a = r[i], b = r[(i + 1) % r.length]; if (Math.hypot(b[0] - a[0], b[1] - a[1]) < 0.15) continue; panels.push({ p: [[a[0], H - h, a[1]], [b[0], H - h, b[1]], [b[0], H, b[1]], [a[0], H, a[1]]], k: "bside", c: `beam ${Math.round(b3.d)} deep · side ${Math.round(h * 1000)}` }); }
    // bottom: the ring as a rectangle (beams are narrow strips)
    const xs = r.map((q) => q[0]), ys = r.map((q) => q[1]);
    panels.push({ p: [[Math.min(...xs), H - h, Math.min(...ys)], [Math.max(...xs), H - h, Math.min(...ys)], [Math.max(...xs), H - h, Math.max(...ys)], [Math.min(...xs), H - h, Math.max(...ys)]], k: "bbot", c: `beam ${Math.round(b3.d)} deep · bottom` });
  }
  // columns: a panel on every face
  for (const r of o.cols ?? []) for (let i = 0; i < r.length; i++) { const a = r[i], b = r[(i + 1) % r.length]; const L = Math.hypot(b[0] - a[0], b[1] - a[1]); if (L < 0.05) continue; panels.push({ p: [[a[0], 0, a[1]], [b[0], 0, b[1]], [b[0], H, b[1]], [a[0], H, a[1]]], k: "col", c: `column face ${Math.round(L * 1000)} × ${Math.round(H * 1000)}` }); }
  // deck panels at the soffit (5 mm below)
  let deckN = 0;
  for (const z of o.zones) for (const p of z.panels) {
    const y = H - 0.005;
    panels.push({ p: [[p.x0, y, p.y0], [p.x1, y, p.y0], [p.x1, y, p.y1], [p.x0, y, p.y1]], k: p.custom ? "dspec" : "deck", c: `${p.no} · ${p.code}`, z: z.code });
    deckN++; if (p.custom) special++;
  }
  // staircases: a dog-leg stair in each stair box — flight 1 up one half of the box, landing across the far end,
  // flight 2 back down the other half to the floor above (risers ≤ 170 mm, tread 270 mm)
  const steps: Scene3["steps"] = [];
  const acc: Acc3 = { props: [], ties: [], walers: [], pushPull: [], brackets: [], heads: [] };
  const FH = o.floorHeight;
  (o.stairs ?? []).forEach(([x0, y0, x1, y1], si) => {
    const along = x1 - x0 >= y1 - y0;                        // flights run along the long side of the box
    const Lb = along ? x1 - x0 : y1 - y0, Wb = along ? y1 - y0 : x1 - x0;
    if (Lb < 1.5 || Wb < 1) return;
    // measured flights when the drawing gave them (risers, tread, width), else a typical dog-leg
    const g = (o.stairGeo ?? []).filter((x) => !x.assumed)[si];
    const per = g ? Math.max(2, g.risers) : Math.max(2, Math.ceil(FH / 2 / 0.17)), rise = g ? g.riser / 1000 : FH / 2 / per;
    const land = g && g.landingM2 > 0 ? Math.min(Lb / 2, Math.max(0.9, g.landingM2 / Math.max(0.9, Wb))) : Math.min(1.5, Math.max(0.9, Wb / 2));
    const tread = g ? Math.min(g.tread / 1000, (Lb - land) / Math.max(1, per - 1)) : Math.min(0.3, (Lb - land) / Math.max(1, per - 1));
    const half = g ? Math.min(g.width / 1000, Wb / 2) : Wb / 2;
    const fl = g ? Math.max(1, Math.min(2, g.flights)) : 2;
    const P = (u: number, v: number): [number, number] => (along ? [x0 + u, y0 + v] : [x0 + v, y0 + u]);
    const box = (u: number, v: number, du: number, dv: number, yb: number, yt: number) => {
      const [cx, cz] = P(u + du / 2, v + dv / 2);
      steps.push({ c: [cx, (yb + yt) / 2, cz], s: along ? [du, yt - yb, dv] : [dv, yt - yb, du], rot: 0 });
    };
    const topOf = per * rise;                                 // height reached by one flight
    for (let k = 0; k < per - 1; k++) box(k * tread, 0, tread, half, 0, (k + 1) * rise);                       // flight 1
    box(Lb - land, 0, land, Wb, topOf - 0.15, topOf);                                                           // mid landing
    if (fl > 1) for (let k = 0; k < per - 1; k++) box(Lb - land - (k + 1) * tread, half, tread, half, topOf, topOf + (k + 1) * rise);   // flight 2
    // stair formwork: the sloping soffit panel under each flight, the riser panels, the landing soffit
    const Q = (u0: number, v0: number, u1: number, v1: number, y0: number, y1: number, k: Panel3Kind, c: string) => {
      const [ax, az] = P(u0, v0), [bx, bz] = P(u1, v0), [cx2, cz2] = P(u1, v1), [dx2, dz2] = P(u0, v1);
      panels.push({ p: [[ax, y0, az], [bx, y1, bz], [cx2, y1, cz2], [dx2, y0, dz2]], k, c, z: `ST${si + 1}` });
    };
    const waist = (g?.waist ?? 150) / 1000, run1 = (per - 1) * tread;
    const ST = `ST${si + 1}`;
    // the stair panels the layout chose: soffit panels across the flight width × lengths along the slope, cheeks
    // (stringers) on the open side, riser shutters on every step, landing soffit panels; props under all of it
    const sl = g ? (o.stairLay ?? []).filter((x) => !x.assumed)[si] : undefined;
    const acrW = sl ? [...sl.across.panels, ...(sl.across.filler ? [sl.across.filler] : [])] : [Math.round(half * 1000)];
    const hyp = Math.hypot(rise, tread), cos = tread / hyp, k1 = rise / tread;
    const algL = sl ? sl.along : [Math.round((run1 / cos) * 1000)];
    const cheekH = (sl?.cheekH ?? Math.round((waist / cos + rise) * 1000)) / 1000;
    // one flight: starts at u0 (plan), runs in direction ud, across v from vA to vB, its soffit starts at y0 and rises
    const flight = (fi: number, u0: number, ud: number, vA: number, vB: number, y0: number, openV: number | null) => {
      let s0 = 0;
      for (const L of algL) {
        const du0 = (s0 / 1000) * cos, du1 = Math.min(run1 + tread, ((s0 + L) / 1000) * cos); s0 += L;
        const ya = y0 + du0 * k1, yb = y0 + du1 * k1;
        let v = vA;
        for (const w of acrW) {
          const v1 = Math.min(vB, v + w / 1000); if (v1 - v < 0.01) break;
          const [ax, az] = P(u0 + ud * du0, v), [bx, bz] = P(u0 + ud * du1, v), [cx2, cz2] = P(u0 + ud * du1, v1), [dx2, dz2] = P(u0 + ud * du0, v1);
          panels.push({ p: [[ax, ya, az], [bx, yb, bz], [cx2, yb, cz2], [dx2, ya, dz2]], k: "stair", c: `${ST} flight ${fi} · soffit panel SS ${w} × ${L}`, z: ST }); special++;
          v = v1;
        }
        // cheek (stringer side form) on the open side of the flight: from the soffit up by the cheek height
        if (openV != null) {
          const [ax, az] = P(u0 + ud * du0, openV), [bx, bz] = P(u0 + ud * du1, openV);
          panels.push({ p: [[ax, ya, az], [bx, yb, bz], [bx, yb + cheekH, bz], [ax, ya + cheekH, az]], k: "cheek", c: `${ST} flight ${fi} · cheek (stringer) CK ${Math.round(cheekH * 1000)} × ${L}`, z: ST }); special++;
        }
      }
      // props under the soffit: rows every prop spacing along the flight, lines every 1.2 m across (+ both edges)
      const sp = o.propSpacing ?? 1.2, nAl = Math.max(1, Math.ceil(run1 / sp)), nAc = Math.max(1, Math.ceil((vB - vA) / 1.2));
      for (let i = 0; i <= nAl; i++) for (let j = 0; j <= nAc; j++) {
        const du = Math.min(run1, 0.15 + (i * (run1 - 0.3)) / nAl), v = vA + 0.15 + (j * (vB - vA - 0.3)) / nAc;
        const [x, z] = P(u0 + ud * du, v), top = y0 + du * k1 - 0.005;
        if (top > 0.3) { acc.props.push([x, z, 0, top, 2]); acc.heads.push([x, top, z, 2]); }
      }
    };
    flight(1, 0, 1, 0, half, -waist, fl > 1 ? half : null);
    for (let k = 0; k < per - 1; k++) {
      const [ax, az] = P(k * tread, 0), [bx, bz] = P(k * tread, half);
      panels.push({ p: [[ax, k * rise, az], [bx, k * rise, bz], [bx, (k + 1) * rise, bz], [ax, (k + 1) * rise, az]], k: "riser", c: `${ST} riser shutter RS ${Math.round(half * 1000)} × ${Math.round(rise * 1000)}`, z: ST });
      acc.brackets.push([ax, (k + 1) * rise, az], [bx, (k + 1) * rise, bz]);
    }
    // landing soffit: panels across the landing at its underside, props under it
    const ly = topOf - 0.15;
    {
      const lAcr = sl?.landing ? [...sl.landing.across.panels, ...(sl.landing.across.filler ? [sl.landing.across.filler] : [])] : [Math.round(land * 1000)];
      let u = Lb - land;
      for (const w of lAcr) {
        const u1 = Math.min(Lb, u + w / 1000); if (u1 - u < 0.01) break;
        Q(u, 0, u1, Wb, ly, ly, "lsoff", `${ST} landing soffit panel LS ${w} × ${Math.round(Wb * 1000)}`); special++;
        u = u1;
      }
      const nA = Math.max(1, Math.ceil(land / 1.2)), nB = Math.max(1, Math.ceil(Wb / 1.2));
      for (let i = 0; i <= nA; i++) for (let j = 0; j <= nB; j++) {
        const [x, z] = P(Lb - land + 0.15 + (i * (land - 0.3)) / nA, 0.15 + (j * (Wb - 0.3)) / nB);
        acc.props.push([x, z, 0, ly - 0.005, 2]); acc.heads.push([x, ly - 0.005, z, 2]);
      }
    }
    if (fl > 1) {
      flight(2, Lb - land, -1, half, Wb, topOf - waist, half);
      for (let k = 0; k < per - 1; k++) {
        const [ax, az] = P(Lb - land - k * tread, half), [bx, bz] = P(Lb - land - k * tread, Wb);
        panels.push({ p: [[ax, topOf + k * rise, az], [bx, topOf + k * rise, bz], [bx, topOf + (k + 1) * rise, bz], [ax, topOf + (k + 1) * rise, az]], k: "riser", c: `${ST} riser shutter RS ${Math.round((Wb - half) * 1000)} × ${Math.round(rise * 1000)}`, z: ST });
        acc.brackets.push([ax, topOf + (k + 1) * rise, az], [bx, topOf + (k + 1) * rise, bz]);
      }
    }
  });
  // ---- accessories (the same rules as the parts list) ----
  // deck props: a prop with a drop head under every mid-beam end and along it at the prop spacing
  const sp = o.propSpacing ?? 1.2, seenP = new Set<string>();
  const addProp = (x: number, z: number, top: number, kind: number) => { const k = `${Math.round(x * 20)}:${Math.round(z * 20)}:${kind}`; if (seenP.has(k)) return; seenP.add(k); acc.props.push([x, z, 0, top, kind]); acc.heads.push([x, top, z, kind]); };
  for (const zn of o.zones) for (const [a, b] of zn.mb) {
    const L = Math.hypot(b[0] - a[0], b[1] - a[1]); if (L < 0.2) continue;
    const n = Math.max(1, Math.ceil(L / sp));
    for (let i = 0; i <= n; i++) addProp(a[0] + ((b[0] - a[0]) * i) / n, a[1] + ((b[1] - a[1]) * i) / n, H - 0.07, 0);
  }
  // beam props: under every beam bottom along its length
  for (const b3 of o.beams3 ?? []) {
    const d = Math.max(slab, b3.d / 1000), h = d - slab; if (h <= 0.01 || b3.ring.length < 3) continue;
    const xs2 = b3.ring.map((q) => q[0]), ys2 = b3.ring.map((q) => q[1]);
    const x0 = Math.min(...xs2), x1 = Math.max(...xs2), y0 = Math.min(...ys2), y1 = Math.max(...ys2), along = x1 - x0 >= y1 - y0;
    const L = along ? x1 - x0 : y1 - y0, n = Math.max(1, Math.ceil(L / 1.2));
    for (let i = 0; i <= n; i++) { const t = 0.1 + (i * (L - 0.2)) / n; addProp(along ? x0 + t : (x0 + x1) / 2, along ? (y0 + y1) / 2 : y0 + t, H - h - 0.005, 1); }
  }
  // wall faces: ties at the panel joints in rows, walers (2 rows) and push-pull props on one face of each wall
  const tH = (o.tieH ?? 800) / 1000, tV = (o.tieV ?? 800) / 1000;
  for (const f of o.faces) {
    if (!f.geo || !(mpp > 0) || f.set === "column") continue;
    const { a: A, b: B, off } = f.geo;
    const dx = B[0] - A[0], dy = B[1] - A[1], Lp = Math.hypot(dx, dy); if (!Lp) continue;
    const ux = dx / Lp, uy = dy / Lp; let nx = -uy, ny = ux; const s2 = off < 0 ? -1 : 1;
    const a: Pt = [A[0] * mpp + nx * (off * mpp), A[1] * mpp + ny * (off * mpp)], L = Lp * mpp;
    // the face looks away from its wall: the side where the wall is not
    const probe: Pt = [a[0] + ux * L / 2 + nx * 0.03, a[1] + uy * L / 2 + ny * 0.03];
    if (inRings(probe, o.zoneWalls)) { nx = -nx; ny = -ny; }
    void s2;
    const hF = Math.min(H, f.height / 1000);
    const nT = Math.max(1, Math.ceil(L / tH)), rows = Math.max(1, Math.floor(hF / tV));
    for (let i = 0; i < nT; i++) {
      const t = ((i + 0.5) * L) / nT;
      for (let j = 0; j < rows; j++) acc.ties.push([a[0] + ux * t, Math.min(hF - 0.2, 0.3 + j * tV), a[1] + uy * t, nx, ny]);
    }
    // one face of each wall carries the walers / push-pull props (the face looking +x, or +y when square to it)
    const pick = nx > 0.01 || (Math.abs(nx) <= 0.01 && ny > 0);
    if (pick && L >= 0.6) {
      const o2 = 0.09;
      for (const y of [0.6, Math.max(1.2, hF - 0.7)]) acc.walers.push([a[0] + nx * o2, y, a[1] + ny * o2, a[0] + ux * L + nx * o2, a[1] + uy * L + ny * o2]);
      const nP = Math.floor(L / 3);
      for (let i = 1; i <= nP; i++) { const t = (i * L) / (nP + 1), wx = a[0] + ux * t + nx * o2, wz = a[1] + uy * t + ny * o2; acc.pushPull.push([wx, Math.min(2.1, hF - 0.4), wz, wx + nx * 1.6, wz + ny * 1.6, 0]); }
    }
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
    cols: (o.cols ?? []).filter((r) => r.length >= 3), beamSolids: (o.beams3 ?? []).filter((b) => b.ring.length >= 3).map((b) => ({ ring: b.ring, d: Math.max(slab, b.d / 1000) })), steps,
    panels, mb: o.zones.flatMap((z) => z.mb), zones: o.zones.map((z) => ({ code: z.code, at: [(z.box[0] + z.box[2]) / 2, (z.box[1] + z.box[3]) / 2] as Pt })),
    stats: { wall: wallN, deck: deckN, special },
    acc: { props: acc.props.map((v) => v.map(r3) as Acc3["props"][number]), ties: acc.ties.map((v) => v.map(r3) as Acc3["ties"][number]), walers: acc.walers.map((v) => v.map(r3) as Acc3["walers"][number]), pushPull: acc.pushPull.map((v) => v.map(r3) as Acc3["pushPull"][number]), brackets: acc.brackets.map((v) => v.map(r3) as Acc3["brackets"][number]), heads: acc.heads.map((v) => v.map(r3) as Acc3["heads"][number]) },
    arch: (o.arch ?? []).map((x) => ({ k: x.k, ...(x.a ? { a: [r3(x.a[0]), r3(x.a[1])] as Pt } : {}), ...(x.b ? { b: [r3(x.b[0]), r3(x.b[1])] as Pt } : {}), ...(x.ring ? { ring: x.ring.map((q) => [r3(q[0]), r3(q[1])] as Pt) } : {}) })),
    wallBits, glass: glass.map((g) => ({ ...g, p: g.p.map((v) => [r3(v[0]), r3(v[1]), r3(v[2])]) as [number, number, number][] })),
  };
}
