/**
 * One floor, two drawings. The architect's plan gives the walls, doors, windows and the slab outline; the structural
 * consultant's layout of the slab above gives the beams, columns, sunk slabs and cut-outs. A plan can link the
 * structural layout (another plan of the same lead) and the two readings are merged into one floor: the structural
 * drawing wins for beams and columns, the architectural one for walls and openings, sunk slabs and cut-outs are
 * taken from both. The second drawing is moved onto the first by its slab outline (same scale, drawn in the same units).
 */
import type { DxfAuto, Pt } from "./calc";
import { minOf, maxOf } from "@/lib/util/minmax";

export type StructuralLink = {
  planId: string;            // the structural layout's plan (same lead)
  name?: string;
  dx: number; dy: number;    // shift added to the structural drawing's coordinates (its drawing units × scale)
  scale: number;             // structural units → this plan's units (1 when both are mm)
  auto?: boolean;            // dx / dy found from the slab outlines (false when typed in)
};

const bbox = (loops: Pt[][]): [number, number, number, number] | null => {
  const pts = loops.flat(); if (!pts.length) return null;
  return [minOf(pts.map((p) => p[0])), minOf(pts.map((p) => p[1])), maxOf(pts.map((p) => p[0])), maxOf(pts.map((p) => p[1]))];
};

/** The shift that puts the structural drawing's slab outline over the architectural one (centres of their boxes). */
export function alignByOutline(arch: Pt[][], str: Pt[][], scale = 1): { dx: number; dy: number } | null {
  const a = bbox(arch), s = bbox(str); if (!a || !s) return null;
  return { dx: (a[0] + a[2]) / 2 - ((s[0] + s[2]) / 2) * scale, dy: (a[1] + a[3]) / 2 - ((s[1] + s[3]) / 2) * scale };
}

/** How well the two outlines agree after the shift: width / height of the two boxes within 5 %. */
export function alignFitAuto(arch: DxfAuto, str: DxfAuto, scale: number, unitPerMm: number): { ok: boolean; note: string } {
  const s2 = alignByStructure(arch, str, scale, unitPerMm);
  if (s2 && s2.hits >= Math.max(3, 0.5 * s2.of)) return { ok: true, note: `aligned on the structure: ${s2.hits} of ${s2.of} columns / beams sit on walls or columns` };
  const f = alignFit(arch.slabLoops ?? [], str.slabLoops ?? [], scale);
  return { ok: f.ok, note: `${f.note}${s2 ? ` · only ${s2.hits} of ${s2.of} columns / beams meet a wall — check the region of either plan` : ""}` };
}
export function alignFit(arch: Pt[][], str: Pt[][], scale = 1): { ok: boolean; note: string } {
  const a = bbox(arch), s = bbox(str); if (!a || !s) return { ok: false, note: "no slab outline to align with" };
  const aw = a[2] - a[0], ah = a[3] - a[1], sw = (s[2] - s[0]) * scale, sh = (s[3] - s[1]) * scale;
  const dw = Math.abs(aw - sw) / Math.max(aw, 1), dh = Math.abs(ah - sh) / Math.max(ah, 1);
  return dw <= 0.05 && dh <= 0.05 ? { ok: true, note: "outlines match" } : { ok: false, note: `outlines differ: ${(aw / 1000).toFixed(1)}×${(ah / 1000).toFixed(1)} vs ${(sw / 1000).toFixed(1)}×${(sh / 1000).toFixed(1)} (drawing units ÷ 1000) — check the regions and the units` };
}

const inside = (p: Pt, ring: Pt[]): boolean => { let c = false; for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) { const a = ring[i], b = ring[j]; if (a[1] > p[1] !== b[1] > p[1] && p[0] < ((b[0] - a[0]) * (p[1] - a[1])) / (b[1] - a[1]) + a[0]) c = !c; } return c; };
const centre = (r: Pt[]): Pt => [r.reduce((s, q) => s + q[0], 0) / r.length, r.reduce((s, q) => s + q[1], 0) / r.length];
const polyArea = (r: Pt[]) => { let s = 0; for (let i = 0; i < r.length; i++) { const q = r[(i + 1) % r.length]; s += r[i][0] * q[1] - q[0] * r[i][1]; } return Math.abs(s) / 2; };
const polyLen = (r: Pt[]) => { let s = 0; for (let i = 0; i < r.length; i++) { const q = r[(i + 1) % r.length]; s += Math.hypot(q[0] - r[i][0], q[1] - r[i][1]); } return s; };

/** The architectural reading with the structural layout's beams, columns, sunk slabs and cut-outs merged in. */
export function mergeStructural(arch: DxfAuto, str: DxfAuto, link: { dx: number; dy: number; scale: number }, unitToM: number): DxfAuto {
  const T = (p: Pt): Pt => [p[0] * link.scale + link.dx, p[1] * link.scale + link.dy];
  const TR = (r: Pt[]) => r.map(T);
  const out: DxfAuto = { ...arch };
  // beams: the structural layout's, when it has any (the architect's beam lines are indicative)
  if ((str.beamRings?.length ?? 0) > 0 || (str.beamSized?.length ?? 0) > 0) {
    out.beamRings = (str.beamRings ?? []).map(TR); out.beamRingDepth = str.beamRingDepth; out.beamSized = str.beamSized;
    out.beamLineLength = str.beamLineLength; out.projectBeamsUsed = str.projectBeamsUsed;
  }
  // columns: the structural layout's
  if (str.columns.length) { out.columns = str.columns; out.columnRings = (str.columnRings ?? []).map(TR); }
  // sunk slabs and upstands: both drawings (the structural one usually states the depth)
  if (str.sunk?.length) out.sunk = [...(arch.sunk ?? []), ...str.sunk];
  if (str.upstands?.length) out.upstands = [...(arch.upstands ?? []), ...str.upstands.filter((u) => !(arch.upstands ?? []).some((v) => v.label === u.label && Math.abs(v.length - u.length) < 0.5))];
  // cut-outs: the structural ones that the architect's plan does not show
  const archOpen = arch.openingLoops ?? [];
  const added = (str.openingLoops ?? []).map(TR).filter((r) => !archOpen.some((o) => inside(centre(r), o) || inside(centre(o), r)));
  if (added.length) {
    out.openingLoops = [...archOpen, ...added];
    const u2 = unitToM * unitToM;
    out.openingArea = (arch.openingArea ?? 0) + added.reduce((s, r) => s + polyArea(r) * u2, 0);
    out.openingPerimeter = (arch.openingPerimeter ?? 0) + added.reduce((s, r) => s + polyLen(r) * unitToM, 0);
  }
  // the reader's notes of the structural drawing, moved onto this plan
  out.notes = [...(arch.notes ?? []), ...(str.notes ?? []).map((n) => ({ ...n, box: [n.box[0] * link.scale + link.dx, n.box[1] * link.scale + link.dy, n.box[2] * link.scale + link.dx, n.box[3] * link.scale + link.dy] as [number, number, number, number] }))];
  return out;
}

/** What the merge brought in, for the screen. */
export function mergeSummary(str: DxfAuto): string {
  const bits: string[] = [];
  const nb = str.beamRings?.length ?? 0; if (nb) bits.push(`${nb} beams`);
  if (str.columns.length) bits.push(`${str.columns.length} columns`);
  if (str.sunk?.length) bits.push(`${str.sunk.length} sunk slabs`);
  if (str.openingLoops?.length) bits.push(`${str.openingLoops.length} cut-outs`);
  return bits.length ? bits.join(", ") : "nothing readable (no beams, columns, sunk slabs or cut-outs found in its region)";
}

/** The shift to use: the saved one, or found from the two slab outlines when the link says "auto". */
export function linkFor(t: { structural?: { dx: number; dy: number; scale: number; auto?: boolean } }, arch: DxfAuto, str: { auto: DxfAuto; unitToM: number }, archUnitToM?: number): { dx: number; dy: number; scale: number } {
  const L = t.structural!;
  const scale = L.scale || (archUnitToM ? str.unitToM / archUnitToM : 1);
  if (L.auto !== false) {
    const unitPerMm = archUnitToM ? 0.001 / archUnitToM : 1;
    const s2 = alignByStructure(arch, str.auto, scale, unitPerMm);
    if (s2 && s2.hits >= Math.max(3, 0.5 * s2.of)) return { dx: s2.dx, dy: s2.dy, scale };
    const a = alignByOutline(arch.slabLoops ?? [], str.auto.slabLoops ?? [], scale); if (a) return { ...a, scale };
  }
  return { dx: L.dx, dy: L.dy, scale };
}

/**
 * Exact alignment from the structure itself: the structural layout's columns (or beam strips when it has no
 * columns) must sit on the architect's walls and columns. Every pair (structural point, architectural element centre)
 * proposes a shift; the shifts vote (50 mm cells), and the best few are scored by how many structural points land on
 * an architectural wall or column. The outline-centre shift is one of the candidates, so this never does worse.
 * unitPerMm: drawing units per mm of the architectural plan.
 */
export function alignByStructure(arch: DxfAuto, str: DxfAuto, scale: number, unitPerMm: number): { dx: number; dy: number; hits: number; of: number } | null {
  const ringsA = [...(arch.wallRings ?? []), ...(arch.columnRings ?? [])];
  if (!ringsA.length) return null;
  const S0 = (str.columnRings?.length ? str.columnRings : str.beamRings ?? []).map((r) => centre(r).map((v) => v * scale) as Pt);
  if (S0.length < 3) return null;
  const step = Math.max(1, Math.floor(S0.length / 40)), S = S0.filter((_, i) => i % step === 0);
  const boxes = ringsA.map((r) => { const xs = r.map((p) => p[0]), ys = r.map((p) => p[1]); return [minOf(xs), minOf(ys), maxOf(xs), maxOf(ys)] as [number, number, number, number]; });
  const tol = 60 * unitPerMm;
  const score = (dx: number, dy: number) => { let n = 0; for (const p of S) { const x = p[0] + dx, y = p[1] + dy; if (boxes.some((b) => x >= b[0] - tol && x <= b[2] + tol && y >= b[1] - tol && y <= b[3] + tol)) n++; } return n; };
  const cell = 50 * unitPerMm, votes = new Map<string, { n: number; dx: number; dy: number }>();
  const A = ringsA.map(centre); const stepA = Math.max(1, Math.floor(A.length / 400));
  for (let i = 0; i < A.length; i += stepA) for (const p of S) {
    const dx = A[i][0] - p[0], dy = A[i][1] - p[1], k = `${Math.round(dx / cell)}:${Math.round(dy / cell)}`;
    const v = votes.get(k); if (v) v.n++; else votes.set(k, { n: 1, dx, dy });
  }
  const cands = [...votes.values()].sort((a, b) => b.n - a.n).slice(0, 8);
  const outline = alignByOutline(arch.slabLoops ?? [], (str.slabLoops ?? []), scale); if (outline) cands.push({ n: 0, ...outline });
  let best: { dx: number; dy: number; hits: number } | null = null;
  for (const c of cands) { const h = score(c.dx, c.dy); if (!best || h > best.hits) best = { dx: c.dx, dy: c.dy, hits: h }; }
  return best ? { ...best, of: S.length } : null;
}
