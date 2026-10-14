/**
 * Drawing check for a measured plan (the "underlay error check" of PKPM-LMB): looks at everything drawn or traced on the
 * measuring screen and lists what is wrong or doubtful, each with a place on the plan (box in plan pixels) so the screen
 * can zoom to it and select it. Pure geometry — no database, no drawing file.
 */
import type { Pt, Takeoff, Shape } from "./calc";

export type TakeoffCheck = { id: string; sev: "error" | "warn" | "info"; title: string; detail: string; box: [number, number, number, number]; shapeId?: string };

const area = (p: Pt[]) => { let a = 0; for (let i = 0; i < p.length; i++) { const q = p[(i + 1) % p.length]; a += p[i][0] * q[1] - q[0] * p[i][1]; } return Math.abs(a) / 2; };
const bbox = (p: Pt[]): [number, number, number, number] => [Math.min(...p.map((q) => q[0])), Math.min(...p.map((q) => q[1])), Math.max(...p.map((q) => q[0])), Math.max(...p.map((q) => q[1]))];
const inPoly = (pt: Pt, p: Pt[]) => { let c = false; for (let i = 0, j = p.length - 1; i < p.length; j = i++) { if ((p[i][1] > pt[1]) !== (p[j][1] > pt[1]) && pt[0] < ((p[j][0] - p[i][0]) * (pt[1] - p[i][1])) / (p[j][1] - p[i][1]) + p[i][0]) c = !c; } return c; };
const cross = (a: Pt, b: Pt, c: Pt) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
const segCross = (a: Pt, b: Pt, c: Pt, d: Pt) => { const d1 = cross(a, b, c), d2 = cross(a, b, d), d3 = cross(c, d, a), d4 = cross(c, d, b); return d1 * d2 < 0 && d3 * d4 < 0; };
const distSeg = (p: Pt, a: Pt, b: Pt) => { const dx = b[0] - a[0], dy = b[1] - a[1], l2 = dx * dx + dy * dy; const t = l2 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2)) : 0; return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy)); };
const selfCrosses = (p: Pt[]) => { for (let i = 0; i < p.length; i++) for (let j = i + 2; j < p.length; j++) { if (i === 0 && j === p.length - 1) continue; if (segCross(p[i], p[(i + 1) % p.length], p[j], p[(j + 1) % p.length])) return true; } return false; };
const pad = (b: [number, number, number, number], d: number): [number, number, number, number] => [b[0] - d, b[1] - d, b[2] + d, b[3] + d];
const name = (s: Shape) => s.label?.trim() || ({ slab: "Slab", opening: "Opening", wall: "Wall", column: "Column", beam: "Beam", door: "Door", window: "Window", loft: "Loft", separate: "Separate area" } as Record<string, string>)[s.kind];

export function takeoffChecks(t: Takeoff, mpp: number | null): TakeoffCheck[] {
  const out: TakeoffCheck[] = [];
  let k = 0; const id = () => `t${++k}`;
  const sh = t.shapes ?? [];
  const full: [number, number, number, number] = t.image ? [0, 0, t.image.w, t.image.h] : [0, 0, 1000, 1000];
  const m2 = (px2: number) => (mpp ? px2 * mpp * mpp : 0);
  const lenM = (px: number) => (mpp ? px * mpp : 0);

  if (!sh.length && !t.columns?.length && !t.beams?.length) {
    out.push({ id: id(), sev: "info", title: "Nothing drawn yet", detail: "Draw the slab outline first, then openings (stair, lift, ducts), walls, columns and beams.", box: full });
    return out;
  }
  if (!mpp) out.push({ id: id(), sev: "error", title: "Scale is not set", detail: "Choose “Set scale”, click the two ends of a dimension you know and type its real length. Until then no area can be worked out.", box: t.calib ? pad(bbox([t.calib.p1, t.calib.p2]), 40) : full });

  const slabs = sh.filter((s) => s.kind === "slab" || s.kind === "separate");
  const walls = sh.filter((s) => s.kind === "wall" && s.pts.length >= 2);
  if (!slabs.length) out.push({ id: id(), sev: "error", title: "No slab outline", detail: "The floor area comes from the slab outline. Choose “Slab” and click each corner of the floor, then click the first point again to close it.", box: full });

  for (const s of sh) {
    const b = bbox(s.pts);
    const closed = s.kind === "slab" || s.kind === "opening" || s.kind === "separate" || s.kind === "loft" || s.kind === "column";
    if (closed && s.pts.length < 3) { out.push({ id: id(), sev: "error", title: `${name(s)} has fewer than 3 points`, detail: "A closed shape needs at least three corners. Delete it and draw it again.", box: pad(b, 30), shapeId: s.id }); continue; }
    if (closed && area(s.pts) < 4) { out.push({ id: id(), sev: "warn", title: `${name(s)} is almost flat (no area)`, detail: "All its corners lie on one line, so it adds nothing. Delete it or draw it again.", box: pad(b, 30), shapeId: s.id }); continue; }
    if (closed && s.pts.length >= 4 && selfCrosses(s.pts)) out.push({ id: id(), sev: "error", title: `${name(s)} outline crosses itself`, detail: "Two sides of this outline cross (a bow-tie), so its area is wrong. Select it and fix the corner order or draw it again.", box: pad(b, 30), shapeId: s.id });
    if ((s.kind === "wall" || s.kind === "beam") && s.pts.length >= 2 && Math.hypot(s.pts[0][0] - s.pts[s.pts.length - 1][0], s.pts[0][1] - s.pts[s.pts.length - 1][1]) < 3 && s.pts.length === 2) out.push({ id: id(), sev: "warn", title: `${name(s)} has no length`, detail: "Both ends are at the same point. Delete it or draw it again.", box: pad(b, 30), shapeId: s.id });
    if (mpp && s.kind === "wall" && s.pts.length >= 2) { const l = lenM(s.pts.reduce((a, p, i) => (i ? a + Math.hypot(p[0] - s.pts[i - 1][0], p[1] - s.pts[i - 1][1]) : 0), 0)); if (l > 0 && l < 0.25) out.push({ id: id(), sev: "info", title: `Very short wall (${(l * 1000).toFixed(0)} mm)`, detail: "Shorter than a wall can be. Probably a stray click.", box: pad(b, 30), shapeId: s.id }); }
  }

  const slabOk = slabs.filter((s) => s.pts.length >= 3 && area(s.pts) >= 4 && !(s.pts.length >= 4 && selfCrosses(s.pts)));
  if (mpp && slabOk.length) {
    const total = slabOk.filter((s) => s.kind === "slab").reduce((a, s) => a + m2(area(s.pts)), 0);
    if (total > 3000) out.push({ id: id(), sev: "warn", title: `Slab area is very large (${total.toFixed(0)} m²)`, detail: "Check the scale: one wrong dimension makes every area wrong.", box: bbox(slabOk.flatMap((s) => s.pts)) });
    else if (total > 0 && total < 8) out.push({ id: id(), sev: "warn", title: `Slab area is very small (${total.toFixed(1)} m²)`, detail: "Check the scale and that the whole floor outline is drawn.", box: bbox(slabOk.flatMap((s) => s.pts)) });
  }
  // two slab outlines on top of each other count the same floor twice
  const main = slabOk.filter((s) => s.kind === "slab");
  for (let i = 0; i < main.length; i++) for (let j = i + 1; j < main.length; j++) {
    const a = main[i], b = main[j];
    const cA: Pt = [a.pts.reduce((x, p) => x + p[0], 0) / a.pts.length, a.pts.reduce((x, p) => x + p[1], 0) / a.pts.length];
    const cB: Pt = [b.pts.reduce((x, p) => x + p[0], 0) / b.pts.length, b.pts.reduce((x, p) => x + p[1], 0) / b.pts.length];
    if ((inPoly(cA, b.pts) || inPoly(cB, a.pts)) && !(inPoly(cA, b.pts) && inPoly(cB, a.pts) === false && area(a.pts) < area(b.pts) * 0.3)) out.push({ id: id(), sev: "warn", title: `${name(a)} and ${name(b)} overlap`, detail: "Two slab outlines cover the same place, so that area is counted twice. If one is a sunken area or a balcony, draw it with its level; otherwise delete one.", box: pad(bbox([...a.pts, ...b.pts]), 20), shapeId: a.id });
  }
  const insideSlab = (p: Pt) => slabOk.some((s) => inPoly(p, s.pts));
  const near = (p: Pt, tol: number) => slabOk.some((s) => s.pts.some((q, i) => distSeg(p, q, s.pts[(i + 1) % s.pts.length]) < tol));

  if (slabOk.length) {
    for (const s of sh.filter((x) => x.kind === "opening")) {
      if (s.pts.length < 3) continue;
      const c: Pt = [s.pts.reduce((x, p) => x + p[0], 0) / s.pts.length, s.pts.reduce((x, p) => x + p[1], 0) / s.pts.length];
      if (!insideSlab(c) && !near(c, 40)) out.push({ id: id(), sev: "warn", title: `${name(s)} lies outside the slab`, detail: "An opening (stair, lift, duct) should be inside the slab outline. Outside it, it takes nothing off the slab. Move it or delete it.", box: pad(bbox(s.pts), 30), shapeId: s.id });
    }
    for (const s of sh.filter((x) => x.kind === "column")) {
      if (s.pts.length < 3) continue;
      const c: Pt = [s.pts.reduce((x, p) => x + p[0], 0) / s.pts.length, s.pts.reduce((x, p) => x + p[1], 0) / s.pts.length];
      if (!insideSlab(c) && !near(c, 60)) out.push({ id: id(), sev: "info", title: `${name(s)} stands outside the slab`, detail: "Fine for a column in a balcony or outside the floor plate; otherwise check its place.", box: pad(bbox(s.pts), 30), shapeId: s.id });
    }
  }
  // doors / windows must sit in a wall
  if (walls.length) {
    const thk = ((t.params?.wallThkMm ?? 150) / 1000) / (mpp || 0.01);
    for (const s of sh.filter((x) => (x.kind === "door" || x.kind === "window") && x.pts.length >= 2)) {
      const mid: Pt = [(s.pts[0][0] + s.pts[1][0]) / 2, (s.pts[0][1] + s.pts[1][1]) / 2];
      const d = Math.min(...walls.flatMap((w) => w.pts.slice(1).map((p, i) => distSeg(mid, w.pts[i], p))));
      if (d > Math.max(thk * 1.5, 25)) out.push({ id: id(), sev: "warn", title: `${name(s)} is not on a wall`, detail: `It is ${mpp ? (d * mpp).toFixed(2) + " m" : "some distance"} from the nearest wall, so no wall area is taken off for it. Drag its ends onto the wall line.`, box: pad(bbox(s.pts), 40), shapeId: s.id });
    }
  } else if (sh.some((x) => x.kind === "door" || x.kind === "window")) {
    out.push({ id: id(), sev: "info", title: "Doors / windows drawn but no walls", detail: "Doors and windows are taken off the walls. With no walls drawn nothing is deducted.", box: full });
  }
  // stair opening without stair sizes
  const stairShape = sh.find((x) => x.kind === "opening" && /stair/i.test(x.label ?? ""));
  if (stairShape && !(t.stairs ?? []).length) out.push({ id: id(), sev: "warn", title: "Stair drawn but no stair sizes", detail: "The stair opening is there, but the stair table (width, risers, tread, landing) is empty, so the stair formwork area is only an allowance. Fill in the stair table.", box: pad(bbox(stairShape.pts), 40), shapeId: stairShape.id });
  // duplicates
  const seen = new Map<string, Shape>();
  for (const s of sh) {
    const key = s.kind + ":" + s.pts.map((p) => `${Math.round(p[0] / 2)},${Math.round(p[1] / 2)}`).sort().join("|");
    const o = seen.get(key);
    if (o) out.push({ id: id(), sev: "warn", title: `${name(s)} drawn twice`, detail: "Two identical shapes sit on top of each other, so it is counted twice. Delete one.", box: pad(bbox(s.pts), 30), shapeId: s.id });
    else seen.set(key, s);
  }
  if (!t.params?.floorHeight) out.push({ id: id(), sev: "warn", title: "Floor height missing", detail: "Wall and column areas need the floor height. Set it in the plan settings.", box: full });
  return out;
}
