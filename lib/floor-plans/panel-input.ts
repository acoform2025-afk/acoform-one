/**
 * Turns a measured floor plan (take-off + DXF layers) into the inputs of the floor panel layout:
 * wall faces, slab polygons (with ducts as holes), beam runs and the number of wall corners.
 */
import { computeTotals, UNIT_TO_M, type Pt, type Takeoff, type Totals } from "./calc";
import { dxfAuto, dxfFrame, type DxfModel } from "./dxf";
import { buildShell } from "./shell";
import type { BeamRun, DeckPoly, Face } from "@/lib/design-engine/floor-panels";

const angleAt = (a: Pt, b: Pt, c: Pt) => {
  const v1 = [a[0] - b[0], a[1] - b[1]], v2 = [c[0] - b[0], c[1] - b[1]];
  const l1 = Math.hypot(v1[0], v1[1]), l2 = Math.hypot(v2[0], v2[1]); if (!l1 || !l2) return 180;
  return (Math.acos(Math.max(-1, Math.min(1, (v1[0] * v2[0] + v1[1] * v2[1]) / (l1 * l2)))) * 180) / Math.PI;
};

export function panelInputs(t: Takeoff, model: DxfModel | null) {
  const g = buildShell(t, model);
  const mpp = g.mpp;
  const H = Math.max(0, t.params.floorHeight - t.params.slabMm / 1000) * 1000;
  const mm = (px: number) => px * mpp * 1000;
  const faces: Face[] = [];
  let corners = 0;

  // drawn walls: both faces of every segment
  for (const s of g.shapes.filter((x) => x.kind === "wall")) {
    const h = s.h && s.h > 0 ? s.h : H;
    const half = mpp > 0 ? ((s.t ?? t.params.wallThkMm ?? 150) / 2000) / mpp : 2;
    for (let i = 1; i < s.pts.length; i++) {
      const L = mm(Math.hypot(s.pts[i][0] - s.pts[i - 1][0], s.pts[i][1] - s.pts[i - 1][1]));
      const a = s.pts[i - 1], b = s.pts[i];
      faces.push({ code: `${s.code}.${i}A`, length: L, height: h, geo: { a, b, off: half } }, { code: `${s.code}.${i}B`, length: L, height: h, geo: { a, b, off: -half } });
      if (i > 1 && Math.abs(angleAt(s.pts[i - 2], s.pts[i - 1], s.pts[i]) - 90) < 30) corners += 2;
    }
  }
  // DXF wall lines inside the plan region: every straight run is one face
  let n = 0;
  const both = t.dxf?.wallsDrawn === "centre";
  for (const l of g.dxf.walls ?? []) {
    const pts = l.pts; const seg = pts.length - (l.closed ? 0 : 1);
    for (let i = 0; i < seg; i++) {
      const a = pts[i], b = pts[(i + 1) % pts.length];
      const L = mm(Math.hypot(b[0] - a[0], b[1] - a[1]));
      if (L < 100) continue;
      n++;
      const side = both && mpp > 0 ? ((t.params.wallThkMm ?? 150) / 2000) / mpp : 0;
      faces.push({ code: `F${n}`, length: L, height: H, geo: { a, b, off: side } });
      if (both) faces.push({ code: `F${n}B`, length: L, height: H, geo: { a, b, off: -side } });
    }
    for (let i = 1; i < pts.length - (l.closed ? 0 : 1); i++) if (Math.abs(angleAt(pts[i - 1], pts[i], pts[(i + 1) % pts.length]) - 90) < 30) corners++;
    if (l.closed && pts.length > 2 && Math.abs(angleAt(pts[pts.length - 1], pts[0], pts[1]) - 90) < 30) corners++;
  }

  // slabs (metres) with ducts as holes
  const toM = (p: Pt): Pt => [p[0] * mpp, p[1] * mpp];
  const holes: Pt[][] = [
    ...g.shapes.filter((s) => s.kind === "opening").map((s) => s.pts.map(toM)),
    ...(g.dxf.opening ?? []).filter((l) => l.closed).map((l) => l.pts.map(toM)),
  ];
  const decks: DeckPoly[] = [
    ...g.shapes.filter((s) => s.kind === "slab").map((s) => ({ code: s.code, pts: s.pts.map(toM), holes })),
    ...(g.dxf.slab ?? []).filter((l) => l.closed && l.pts.length > 2).map((l, i) => ({ code: `SL${i + 1}`, pts: l.pts.map(toM), holes })),
  ];

  // beams
  const beams: BeamRun[] = [];
  for (const s of g.shapes.filter((x) => x.kind === "beam")) {
    let L = 0; for (let i = 1; i < s.pts.length; i++) L += mm(Math.hypot(s.pts[i][0] - s.pts[i - 1][0], s.pts[i][1] - s.pts[i - 1][1]));
    beams.push({ code: s.code, length: L, b: s.b ?? t.params.beamWidthMm ?? 200, d: s.d ?? t.params.beamDepthMm ?? 600, sides: 2, bottom: true });
  }
  for (const [i, b] of (t.beams ?? []).entries()) if (b.length_m > 0 && b.qty > 0) beams.push({ code: b.label || `BT${i + 1}`, length: b.length_m * 1000 * b.qty, b: 0, d: b.depth_mm, sides: 1, bottom: false });
  for (const l of g.dxf.beams ?? []) {
    let L = 0; for (let i = 1; i < l.pts.length; i++) L += mm(Math.hypot(l.pts[i][0] - l.pts[i - 1][0], l.pts[i][1] - l.pts[i - 1][1]));
    if (L > 100) beams.push({ code: "BL", length: L, b: 0, d: t.params.beamDepthMm ?? 600, sides: 1, bottom: false });
  }

  // net soffit area — same as the area list
  let auto = null;
  if (model && t.dxf) {
    const f = dxfFrame(model, 2400); const reg = t.dxf.region;
    const keep = reg ? (p: { pts: [number, number][] }) => p.pts.every((q) => { const [x, y] = f.toPx(q); return x >= reg[0] && x <= reg[2] && y >= reg[1] && y <= reg[3]; }) : undefined;
    auto = dxfAuto(model, t.dxf.layerRoles, UNIT_TO_M[t.dxf.units], keep);
  }
  const totals: Totals = computeTotals(t, auto);
  return { faces, decks, beams, corners, totals, shell: g };
}
