/**
 * Design check (model review + clash check), as in aluminium-formwork design software (YJK-LMB "结构模型审查和校验"):
 *  • wall faces: panels add up to the face, fillers not too narrow
 *  • clash between wall panels of different faces (two panel sets in the same space = gap too narrow for formwork)
 *  • wall panels running into concrete (face drawn on the wrong side / broken wall outline)
 *  • deck panels sitting on a wall or across a beam over an opening, deck panels overlapping each other
 *  • slab area left uncovered in a zone (needs a special / plywood), pin-hole problems of special panels
 * Geometry in metres (plan x right, y down); faces come in plan px with mpp.
 */
import type { Pt } from "@/lib/floor-plans/calc";
import type { Zone } from "@/lib/floor-plans/zones";
import type { FaceLayout } from "./floor-panels";
import { pinHoleCheck, type FabSpec } from "./fabrication";

export type IssueKind = "model" | "face-fit" | "wall-clash" | "wall-in-concrete" | "deck-on-wall" | "deck-on-beam" | "deck-overlap" | "uncovered" | "pin-hole";
export type Issue = { id: string; sev: "error" | "warn"; kind: IssueKind; where: string; detail: string; at?: Pt; z?: number };
export const ISSUE_LABEL: Record<IssueKind, string> = {
  model: "Model check",
  "face-fit": "Wall face fit",
  "wall-clash": "Wall panel clash / gap too narrow",
  "wall-in-concrete": "Wall panel inside concrete",
  "deck-on-wall": "Deck panel on a wall",
  "deck-on-beam": "Deck panel across a beam",
  "deck-overlap": "Deck panels overlapping",
  uncovered: "Slab not covered by panels",
  "pin-hole": "Pin holes of special panels",
};

const RAIL = 0.065, OFF = 0.005;

/** Even-odd point-in-polygon over a set of rings (merged wall outlines with their holes). */
export function inRings(p: Pt, rings: Pt[][]) {
  let c = false;
  for (const r of rings) for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    const [xi, yi] = r[i], [xj, yj] = r[j];
    if (yi > p[1] !== yj > p[1] && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
}
const segDist = (p: Pt, a: Pt, b: Pt) => {
  const dx = b[0] - a[0], dy = b[1] - a[1], L2 = dx * dx + dy * dy;
  const t = L2 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L2)) : 0;
  return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy);
};
type Box = [number, number, number, number];
const boxOf = (pts: Pt[]): Box => [Math.min(...pts.map((p) => p[0])), Math.min(...pts.map((p) => p[1])), Math.max(...pts.map((p) => p[0])), Math.max(...pts.map((p) => p[1]))];
const boxHit = (a: Box, b: Box, e = 0) => a[0] < b[2] + e && b[0] < a[2] + e && a[1] < b[3] + e && b[1] < a[3] + e;

/** Separating-axis overlap depth of two convex quads (0 = no overlap). */
function quadOverlap(A: Pt[], B: Pt[]) {
  let depth = Infinity;
  for (const P of [A, B]) for (let i = 0; i < P.length; i++) {
    const a = P[i], b = P[(i + 1) % P.length]; const nx = -(b[1] - a[1]), ny = b[0] - a[0]; const L = Math.hypot(nx, ny); if (!L) continue;
    const pr = (Q: Pt[]) => { const v = Q.map((q) => (q[0] * nx + q[1] * ny) / L); return [Math.min(...v), Math.max(...v)]; };
    const [a0, a1] = pr(A), [b0, b1] = pr(B);
    const d = Math.min(a1, b1) - Math.max(a0, b0); if (d <= 0) return 0;
    depth = Math.min(depth, d);
  }
  return depth === Infinity ? 0 : depth;
}

/** Each wall face on the plan in metres: concrete face line a→b, unit direction u and the normal n pointing to the open (formwork) side. */
export function faceFrames(faces: FaceLayout[], mpp: number, walls: Pt[][]) {
  const out: { f: FaceLayout; a: Pt; b: Pt; u: Pt; n: Pt }[] = [];
  if (!(mpp > 0)) return out;
  for (const f of faces) {
    if (!f.geo) continue;
    const { a: A, b: B, off } = f.geo;
    const a: Pt = [A[0] * mpp, A[1] * mpp], b: Pt = [B[0] * mpp, B[1] * mpp];
    const dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy); if (L < 0.2) continue;
    const ux = dx / L, uy = dy / L; const nx = -uy, ny = ux;
    const offM = off * mpp;
    let s = off < 0 ? -1 : 1;
    const fa: Pt = [a[0] + nx * offM, a[1] + ny * offM], fb: Pt = [b[0] + nx * offM, b[1] + ny * offM];
    // ring edges carry off = 0: the open side is the one that is not concrete
    if (off === 0 && walls.length) {
      const mid: Pt = [(fa[0] + fb[0]) / 2, (fa[1] + fb[1]) / 2];
      if (inRings([mid[0] + nx * 0.03, mid[1] + ny * 0.03], walls) && !inRings([mid[0] - nx * 0.03, mid[1] - ny * 0.03], walls)) s = -1;
    }
    out.push({ f, a: fa, b: fb, u: [ux, uy], n: [nx * s, ny * s] });
  }
  return out;
}

export type CheckInput = {
  faces: FaceLayout[]; mpp: number; walls: Pt[][]; gaps: { a: Pt; b: Pt; thk: number }[]; zones: Zone[];
  specs: FabSpec[]; H: number; stdHeight: number; deckCount: number; slabCount: number;
};

export function designCheck(o: CheckInput) {
  const issues: Issue[] = [];
  let seq = 0;
  const add = (i: Omit<Issue, "id">) => { issues.push({ id: `C${String(++seq).padStart(3, "0")}`, ...i }); };
  const Hm = o.H / 1000;

  // ── model checks
  if (!o.faces.length) add({ sev: "error", kind: "model", where: "Walls", detail: "No wall faces found — mark the wall layer (or draw the walls) on the measuring screen." });
  if (!o.slabCount) add({ sev: "error", kind: "model", where: "Slab", detail: "No slab outline found — mark the slab layer or draw the slab, so the deck can be laid." });
  if (o.H <= 0) add({ sev: "error", kind: "model", where: "Floor height", detail: "Floor height is missing or smaller than the slab — enter the floor-to-floor height." });
  else if (o.H > o.stdHeight + 1200) add({ sev: "warn", kind: "model", where: "Floor height", detail: `Clear height ${Math.round(o.H)} mm is more than the ${o.stdHeight} panel + 1200 top piece — check the floor height or use a taller standard panel.` });
  if (o.slabCount && !o.zones.length) add({ sev: "warn", kind: "model", where: "Deck zones", detail: "The slab could not be split into zones between the walls — check that the slab outline covers the walls." });
  const noGeo = o.faces.filter((f) => !f.geo && !/-O\d+[HS]$/.test(f.code)).length;
  if (noGeo) add({ sev: "warn", kind: "model", where: "Walls", detail: `${noGeo} wall faces have no position on the plan (typed-in lengths) — they are in the BOM but not checked for clashes.` });

  // ── wall faces: panels add up, fillers
  for (const f of o.faces) {
    if (f.length < 100) continue;
    const sum = f.panels.reduce((a, b) => a + b, 0) + f.filler;
    if (Math.abs(sum - f.length) > 30) add({ sev: "error", kind: "face-fit", where: f.code, detail: `Panels ${sum} mm do not match the face length ${Math.round(f.length)} mm (more than the 25 mm site tolerance).` });
    if (f.filler > 0 && f.filler < 100) add({ sev: "warn", kind: "face-fit", where: f.code, detail: `Filler only ${f.filler} mm wide — make it a solid aluminium / plywood strip bolted to the next panel.` });
    if (!f.panels.length && f.length >= 100 && f.filler > 0 && !/-O\d+[HS]$/.test(f.code)) add({ sev: "warn", kind: "face-fit", where: f.code, detail: `Face ${Math.round(f.length)} mm is filled only with a special piece — no standard panel fits.` });
  }

  // ── wall panel strips (plan rectangles of the panel + rail on the open side of each face)
  const strips = faceFrames(o.faces, o.mpp, o.walls).map((fr) => {
    const { a: fa, b: fb, n: [nx, ny], u: [ux, uy] } = fr;
    const e = 0.08;                                        // ignore the corner zone at both ends
    const p0: Pt = [fa[0] + ux * e, fa[1] + uy * e], p1: Pt = [fb[0] - ux * e, fb[1] - uy * e];
    const d0 = OFF, d1 = OFF + RAIL;
    const q: Pt[] = [[p0[0] + nx * d0, p0[1] + ny * d0], [p1[0] + nx * d0, p1[1] + ny * d0], [p1[0] + nx * d1, p1[1] + ny * d1], [p0[0] + nx * d1, p0[1] + ny * d1]];
    return { ...fr, q, box: boxOf(q), z0: 0, z1: fr.f.height / 1000 };
  });
  // panels inside concrete: sample the middle of the strip
  for (const s of strips) {
    if (!o.walls.length) break;
    const c = (t: number): Pt => { const m = OFF + RAIL / 2; return [s.a[0] + (s.b[0] - s.a[0]) * t + s.n[0] * m, s.a[1] + (s.b[1] - s.a[1]) * t + s.n[1] * m]; };
    const hits = [0.25, 0.5, 0.75].filter((t) => inRings(c(t), o.walls)).length;
    if (hits >= 2) add({ sev: "error", kind: "wall-in-concrete", where: s.f.code, detail: `Wall panels of ${s.f.code} (${Math.round(s.f.length)} mm) fall inside the concrete — the wall outline is broken or drawn twice here.`, at: c(0.5), z: Math.min(1.2, Hm / 2) });
  }
  // clashes between strips of different faces
  const seen = new Set<string>();
  let clashes = 0;
  for (let i = 0; i < strips.length && clashes < 300; i++) for (let j = i + 1; j < strips.length; j++) {
    const A = strips[i], B = strips[j];
    if (!boxHit(A.box, B.box) || A.z1 <= B.z0 || B.z1 <= A.z0) continue;
    const d = quadOverlap(A.q, B.q); if (d < 0.005) continue;
    const key = [A.f.code, B.f.code].sort().join("|"); if (seen.has(key)) continue; seen.add(key);
    // clear gap between the two concrete faces (parallel faces facing each other) or a crossing at a corner
    const mA: Pt = [(A.a[0] + A.b[0]) / 2, (A.a[1] + A.b[1]) / 2];
    const par = Math.abs(A.n[0] * B.n[0] + A.n[1] * B.n[1]) > 0.9;
    const gap = par ? segDist(mA, B.a, B.b) : 0;
    const at: Pt = [(A.box[0] + A.box[2] + B.box[0] + B.box[2]) / 4, (A.box[1] + A.box[3] + B.box[1] + B.box[3]) / 4];
    add({
      sev: "error", kind: "wall-clash", where: `${A.f.code} × ${B.f.code}`,
      detail: par ? `Clear gap only ${Math.round(gap * 1000)} mm between two walls — panels of both faces (2 × ${Math.round((OFF + RAIL) * 1000)} mm) do not fit. Fill with concrete / use a duct box or one-sided shutter.`
        : `Panels of the two faces cross each other (${Math.round(d * 1000)} mm) — check the corner piece at this junction.`,
      at, z: Math.min(1.2, Hm / 2),
    });
    clashes++;
  }

  // ── deck panels
  const deck = o.zones.flatMap((z) => z.panels.map((p) => ({ z, p, box: [p.x0, p.y0, p.x1, p.y1] as Box })));
  const strip = o.gaps.map((g) => ({ g, box: [Math.min(g.a[0], g.b[0]) - g.thk, Math.min(g.a[1], g.b[1]) - g.thk, Math.max(g.a[0], g.b[0]) + g.thk, Math.max(g.a[1], g.b[1]) + g.thk] as Box }));
  for (const { p, box } of deck) {
    const ins = 0.03;
    const pts: Pt[] = [[(p.x0 + p.x1) / 2, (p.y0 + p.y1) / 2], [p.x0 + ins, p.y0 + ins], [p.x1 - ins, p.y0 + ins], [p.x1 - ins, p.y1 - ins], [p.x0 + ins, p.y1 - ins]];
    const onWall = o.walls.length ? pts.filter((q) => inRings(q, o.walls)) : [];
    if (onWall.length) { add({ sev: "error", kind: "deck-on-wall", where: `${p.no} (${p.code})`, detail: `Deck panel ${p.no} sits on a wall — cut it back to the wall face (soffit corner).`, at: onWall[0], z: Hm }); continue; }
    for (const s of strip) {
      if (!boxHit(box, s.box)) continue;
      const hit = pts.find((q) => segDist(q, s.g.a, s.g.b) < Math.max(0.05, s.g.thk / 2) - 0.01);
      if (hit) { add({ sev: "error", kind: "deck-on-beam", where: `${p.no} (${p.code})`, detail: `Deck panel ${p.no} runs across the beam over an opening — stop it at the beam side.`, at: hit, z: Hm }); break; }
    }
  }
  // overlaps: sort by x and sweep
  const byX = [...deck].sort((a, b) => a.box[0] - b.box[0]);
  let overlaps = 0;
  for (let i = 0; i < byX.length && overlaps < 100; i++) for (let j = i + 1; j < byX.length && byX[j].box[0] < byX[i].box[2] - 0.005; j++) {
    const a = byX[i].box, b = byX[j].box;
    const w = Math.min(a[2], b[2]) - Math.max(a[0], b[0]), h = Math.min(a[3], b[3]) - Math.max(a[1], b[1]);
    if (w > 0.005 && h > 0.005) {
      add({ sev: "error", kind: "deck-overlap", where: `${byX[i].p.no} × ${byX[j].p.no}`, detail: `Deck panels overlap by ${Math.round(w * 1000)} × ${Math.round(h * 1000)} mm.`, at: [(Math.max(a[0], b[0]) + Math.min(a[2], b[2])) / 2, (Math.max(a[1], b[1]) + Math.min(a[3], b[3])) / 2], z: Hm });
      overlaps++;
    }
  }
  // uncovered slab in each zone
  for (const z of o.zones) {
    if (z.specialArea < 0.15) continue;
    const big = [...z.specials].sort((a, b) => b.area - a.area)[0];
    const xs = big.rings[0].map((p) => p[0]), ys = big.rings[0].map((p) => p[1]);
    add({ sev: "warn", kind: "uncovered", where: z.code, detail: `${z.specialArea.toFixed(2)} m² of zone ${z.code} (${z.area.toFixed(1)} m²) is not covered by standard deck panels — ${z.specials.length} piece(s) need special deck panels or plywood.`, at: [(Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...ys) + Math.max(...ys)) / 2], z: Hm });
  }
  // ── pin holes of special panels
  for (const p of pinHoleCheck(o.specs)) add({ sev: "warn", kind: "pin-hole", where: p.code, detail: p.issue });

  const kinds = Object.keys(ISSUE_LABEL) as IssueKind[];
  const summary = kinds.map((k) => ({ kind: k, label: ISSUE_LABEL[k], errors: issues.filter((i) => i.kind === k && i.sev === "error").length, warnings: issues.filter((i) => i.kind === k && i.sev === "warn").length }));
  return {
    issues, summary,
    checked: { faces: o.faces.length, strips: strips.length, deck: deck.length, zones: o.zones.length, specials: o.specs.length },
    errors: issues.filter((i) => i.sev === "error").length, warnings: issues.filter((i) => i.sev === "warn").length,
  };
}
