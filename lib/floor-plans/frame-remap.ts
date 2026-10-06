/**
 * A plan's region, drawn shapes and answers are stored in screen pixels (or plan metres measured from the screen's
 * corner) of the drawing frame, and the frame follows the drawing's extents. When the drawing is read again and its
 * extents change (e.g. the full drawing now keeps dimensions and schedules the old reading left out), every stored
 * position is moved onto the new frame, so the plan still shows the same part of the drawing.
 */
import { dxfFrame, type DxfModel } from "./dxf";
import type { Pt, Takeoff } from "./calc";

/** px = (x − x0)·s, py = (y1 − y)·s ; image w × h */
export type FrameAnchor = { x0: number; y1: number; s: number; w: number; h: number };

export function frameAnchor(model: DxfModel, maxSide = 2400): FrameAnchor {
  const f = dxfFrame(model, maxSide);
  const [x0, y1] = f.fromPx([0, 0]);
  return { x0, y1, s: 1 / f.unitsPerPx, w: f.width, h: f.height };
}

const same = (a: FrameAnchor, b: FrameAnchor) => Math.abs(a.x0 - b.x0) < 1e-6 && Math.abs(a.y1 - b.y1) < 1e-6 && Math.abs(a.s / b.s - 1) < 1e-9;

/** The takeoff with every stored position moved from frame `a` to frame `b` (unchanged when the frames are the same). */
export function remapTakeoff(t: Takeoff, a: FrameAnchor, b: FrameAnchor): Takeoff {
  if (same(a, b)) return t;
  const px = (p: Pt): Pt => [(p[0] / a.s + a.x0 - b.x0) * b.s, (b.y1 - (a.y1 - p[1] / a.s)) * b.s];
  const out: Takeoff = { ...t };
  // metres per pixel follows the new scale; plan metres = px · mpp, so a metre position moves by the frame's shift
  const mpp = t.metersPerPx;
  if (mpp) out.metersPerPx = (mpp * a.s) / b.s;
  const uM = mpp ? mpp * a.s : null;                // metres per drawing unit
  const m = (q: Pt): Pt => (uM ? [q[0] + (a.x0 - b.x0) * uM, q[1] + (b.y1 - a.y1) * uM] : q);
  const box = (r: [number, number, number, number], f: (q: Pt) => Pt): [number, number, number, number] => {
    const p = f([r[0], r[1]]), q = f([r[2], r[3]]);
    return [Math.min(p[0], q[0]), Math.min(p[1], q[1]), Math.max(p[0], q[0]), Math.max(p[1], q[1])];
  };
  if (t.image) out.image = { ...t.image, w: b.w, h: b.h };
  if (t.calib) out.calib = { ...t.calib, p1: px(t.calib.p1), p2: px(t.calib.p2) };
  out.shapes = (t.shapes ?? []).map((s) => ({ ...s, pts: s.pts.map(px) }));
  if (t.dxf) {
    out.dxf = { ...t.dxf };
    if (t.dxf.region) out.dxf.region = box(t.dxf.region, px);
    if (t.dxf.includeM) out.dxf.includeM = t.dxf.includeM.map((r) => box(r, m));
    if (t.dxf.excludeM) out.dxf.excludeM = t.dxf.excludeM.map((r) => box(r, m));
  }
  return out;
}
