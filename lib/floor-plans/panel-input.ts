/**
 * Turns a measured floor plan (take-off + DXF layers) into the inputs of the floor panel layout:
 * wall faces, slab polygons (with ducts as holes), beam runs and the number of wall corners.
 */
import { DEFAULT_RULES, type MeasureRules } from "./rules";
import { computeTotals, OPENING_DEFAULTS, polyArea, polyLength, UNIT_TO_M, type Pt, type Takeoff, type Totals } from "./calc";
import { closedLoops, dxfAuto, dxfFrame, type DxfModel } from "./dxf";
import { wallUnion } from "./geom";
import { buildShell } from "./shell";
import type { BeamRun, ColumnRun, DeckPoly, Face, OpeningCut, StairGeo } from "@/lib/design-engine/floor-panels";

const angleAt = (a: Pt, b: Pt, c: Pt) => {
  const v1 = [a[0] - b[0], a[1] - b[1]], v2 = [c[0] - b[0], c[1] - b[1]];
  const l1 = Math.hypot(v1[0], v1[1]), l2 = Math.hypot(v2[0], v2[1]); if (!l1 || !l2) return 180;
  return (Math.acos(Math.max(-1, Math.min(1, (v1[0] * v2[0] + v1[1] * v2[1]) / (l1 * l2)))) * 180) / Math.PI;
};

export function panelInputs(t: Takeoff, model: DxfModel | null, rules: MeasureRules = DEFAULT_RULES) {
  const g = buildShell(t, model);
  const mpp = g.mpp;
  const H = Math.max(0, t.params.floorHeight - t.params.slabMm / 1000) * 1000;
  const mm = (px: number) => px * mpp * 1000;
  const faces: Face[] = [];
  // net soffit area — same as the area list
  let auto: ReturnType<typeof dxfAuto> | null = null;
  let frame: ReturnType<typeof dxfFrame> | null = null;
  if (model && t.dxf) {
    const f = dxfFrame(model, 2400); frame = f; const reg = t.dxf.region;
    const keep = reg ? (p: { pts: [number, number][] }) => p.pts.every((q) => { const [x, y] = f.toPx(q); return x >= reg[0] && x <= reg[2] && y >= reg[1] && y <= reg[3]; }) : undefined;
    auto = dxfAuto(model, t.dxf.layerRoles, UNIT_TO_M[t.dxf.units], keep, t.params.minOpeningM2 != null && String(t.params.minOpeningM2) !== "" ? Number(t.params.minOpeningM2) : rules.minOpeningM2);
  }
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
  // DXF walls: every edge of the merged wall outlines is one face (overlapping / duplicated pieces once);
  // loose wall lines are faces too (both sides when walls are drawn as centre lines)
  let n = 0;
  const both = t.dxf?.wallsDrawn === "centre";
  const px = (q: Pt): Pt => (frame ? frame.toPx(q) : q);
  const addRun = (pts: Pt[], closed: boolean, twoSided: boolean) => {
    const seg = pts.length - (closed ? 0 : 1);
    for (let i = 0; i < seg; i++) {
      const a = pts[i], b = pts[(i + 1) % pts.length];
      const L = mm(Math.hypot(b[0] - a[0], b[1] - a[1]));
      if (L < 100) continue;
      n++;
      const side = twoSided && mpp > 0 ? ((t.params.wallThkMm ?? 150) / 2000) / mpp : 0;
      faces.push({ code: `F${n}`, length: L, height: H, geo: { a, b, off: side } });
      if (twoSided) faces.push({ code: `F${n}B`, length: L, height: H, geo: { a, b, off: -side } });
    }
    for (let i = 1; i < pts.length - (closed ? 0 : 1); i++) if (Math.abs(angleAt(pts[i - 1], pts[i], pts[(i + 1) % pts.length]) - 90) < 30) corners++;
    if (closed && pts.length > 2 && Math.abs(angleAt(pts[pts.length - 1], pts[0], pts[1]) - 90) < 30) corners++;
  };
  if (auto && (auto.wallRings?.length || auto.wallLoose?.length)) {
    for (const r of auto.wallRings ?? []) addRun(r.map(px), true, false);
    for (const l of auto.wallLoose ?? []) addRun(l.map(px), false, both);
  } else {
    for (const l of g.dxf.walls ?? []) addRun(l.pts, l.closed, both);
  }

  // doors / windows: cut them out of the faces they sit on
  const openings: OpeningCut[] = [];
  const ops = g.shapes.filter((s) => (s.kind === "door" || s.kind === "window") && s.pts.length >= 2).map((s) => {
    const isDoor = s.kind === "door";
    const h = s.h ?? (isDoor ? OPENING_DEFAULTS.doorH : OPENING_DEFAULTS.windowH);
    const sill = isDoor ? 0 : s.sill ?? OPENING_DEFAULTS.windowSill;
    return { s, isDoor, h, sill, p: s.pts[0], q: s.pts[s.pts.length - 1], t: s.t ?? t.params.wallThkMm ?? 150, used: false };
  });
  const cutFaces = (list: Face[]): Face[] => {
    if (!ops.length || !(mpp > 0)) return list;
    const out: Face[] = [];
    for (const f of list) {
      if (!f.geo) { out.push(f); continue; }
      const { a: A, b: B } = f.geo;
      const dx = B[0] - A[0], dy = B[1] - A[1], Lpx = Math.hypot(dx, dy);
      if (!Lpx) { out.push(f); continue; }
      const ux = dx / Lpx, uy = dy / Lpx;
      const cuts: { from: number; to: number; head: number; sill: number }[] = [];
      for (const o of ops) {
        const along = (p: Pt) => ((p[0] - A[0]) * ux + (p[1] - A[1]) * uy) * mpp * 1000;
        const across = (p: Pt) => Math.abs((p[0] - A[0]) * -uy + (p[1] - A[1]) * ux) * mpp * 1000;
        const reach = Math.max(o.t, t.params.wallThkMm ?? 150) + 60;
        if (across(o.p) > reach || across(o.q) > reach) continue;
        const [t0, t1] = [along(o.p), along(o.q)].sort((x, y) => x - y);
        const from = Math.max(0, t0), to = Math.min(f.length, t1);
        if (to - from < 100) continue;
        cuts.push({ from, to, head: o.sill + o.h, sill: o.sill }); o.used = true;
      }
      if (!cuts.length) { out.push(f); continue; }
      cuts.sort((x, y) => x.from - y.from);
      const pt = (mmv: number): Pt => { const k = mmv / f.length; return [A[0] + dx * k, A[1] + dy * k]; };
      let pos = 0, k = 0;
      const run = (x0: number, x1: number) => { if (x1 - x0 >= 60) out.push({ code: `${f.code}.${++k}`, length: x1 - x0, height: f.height, geo: { a: pt(x0), b: pt(x1), off: f.geo!.off } }); };
      for (const [i, c] of cuts.entries()) {
        run(pos, c.from);
        const w = c.to - Math.max(pos, c.from);
        if (w > 0) {
          if (f.height - c.head >= 50) out.push({ code: `${f.code}-O${i + 1}H`, length: w, height: f.height - c.head, part: "above" });
          if (c.sill >= 50) out.push({ code: `${f.code}-O${i + 1}S`, length: w, height: c.sill, part: "below" });
        }
        pos = Math.max(pos, c.to);
      }
      run(pos, f.length);
    }
    return out;
  };
  const cut = cutFaces([...faces]);                         // copy: cutFaces may return its input unchanged
  faces.length = 0; faces.push(...cut);
  for (const o of ops) if (o.used) openings.push({ kind: o.isDoor ? "door" : "window", w: Math.hypot(o.q[0] - o.p[0], o.q[1] - o.p[1]) * mpp * 1000, h: o.h, t: o.t });

  // slabs (metres) with ducts as holes
  const toM = (p: Pt): Pt => [p[0] * mpp, p[1] * mpp];
  const tolPx = mpp > 0 ? 0.005 / mpp : 0.5;               // 5 mm in plan px
  // ducts: drawn openings + the DXF duct / lift boxes (closed or marked with an X) the automatic reading found
  const fromAuto = (loops?: Pt[][]) => (frame && loops ? loops.map((l) => l.map((q) => toM(frame!.toPx(q)))) : []);
  const holes: Pt[][] = [
    ...g.shapes.filter((s) => s.kind === "opening").map((s) => s.pts.map(toM)),
    ...(auto ? fromAuto(auto.openingLoops) : closedLoops((g.dxf.opening ?? []).map((l) => ({ layer: "o", ...l })), tolPx).map((pts) => pts.map(toM))),
  ];
  const decks: DeckPoly[] = [
    ...(auto?.slabFromWalls ? fromAuto(auto.slabLoops).map((pts, i) => ({ code: `SW${i + 1}`, pts, holes })) : []),
    ...g.shapes.filter((s) => s.kind === "slab").map((s) => ({ code: s.code, pts: s.pts.map(toM), holes })),
    ...closedLoops((g.dxf.slab ?? []).map((l) => ({ layer: "s", ...l })), tolPx).filter((pts) => pts.length > 2).map((pts, i) => ({ code: `SL${i + 1}`, pts: pts.map(toM), holes })),
  ];

  // beams
  const beams: BeamRun[] = [];
  for (const s of g.shapes.filter((x) => x.kind === "beam")) {
    let L = 0; for (let i = 1; i < s.pts.length; i++) L += mm(Math.hypot(s.pts[i][0] - s.pts[i - 1][0], s.pts[i][1] - s.pts[i - 1][1]));
    beams.push({ code: s.code, length: L, b: s.b ?? t.params.beamWidthMm ?? 200, d: s.d ?? t.params.beamDepthMm ?? 600, sides: 2, bottom: true });
  }
  for (const [i, b] of (t.beams ?? []).entries()) if (b.length_m > 0 && b.qty > 0) {
    const sides = b.sides == null ? 1 : Math.max(1, Math.min(2, Math.round(b.sides))) as 1 | 2;
    beams.push({ code: b.label || `BT${i + 1}`, length: b.length_m * 1000 * b.qty, b: b.bottom ? Number(b.width_mm) || 0 : 0, d: b.depth_mm, sides, bottom: !!b.bottom });
  }
  if (auto?.beamSized?.length) {
    // beams sized by their layer names: each size its own run (clear length, both sides, bottom)
    for (const b of auto.beamSized) beams.push({ code: `B${b.b}x${b.d}`, length: b.len * 1000, b: b.b, d: b.d, sides: 2, bottom: true });
    if ((auto.beamLineLength ?? 0) > 0.1) beams.push({ code: "BL", length: auto.beamLineLength! * 1000, b: 0, d: t.params.beamDepthMm ?? 600, sides: 1, bottom: false });
  } else for (const l of g.dxf.beams ?? []) {
    let L = 0; for (let i = 1; i < l.pts.length; i++) L += mm(Math.hypot(l.pts[i][0] - l.pts[i - 1][0], l.pts[i][1] - l.pts[i - 1][1]));
    if (L > 100) beams.push({ code: "BL", length: L, b: 0, d: t.params.beamDepthMm ?? 600, sides: 1, bottom: false });
  }

  // beams / lintels over openings found in the wall lines (same rule as the area take-off)
  if (auto?.gaps?.length && t.params.autoLintels !== false && !auto.beamSized?.length && !(t.beams ?? []).some((b) => b.qty > 0 && b.length_m > 0)) {
    const D = Number(t.params.beamDepthMm) || 600;
    for (const gp of auto.gaps) {
      beams.push({ code: "LB", length: gp.span * 1000, b: Math.round((gp.thk ?? 0.15) * 1000), d: D, sides: 2, bottom: true });
    }
  }
  const totals: Totals = computeTotals(t, auto, rules);
  // staircases: measured flight by flight → real panels; known only as an area (allowance / lump sum) → a set,
  // with a typical dog-leg stair (2 flights, risers ≤ 170, tread 270, width 1200, waist 150) drawn for modulation
  const stairs: StairGeo[] = [];
  for (const [i, st] of (t.stairs ?? []).entries()) {
    const f = Math.round(Number(st.flights) || 0), n = Math.round(Number(st.risers) || 0);
    if (!f || !n || !(Number(st.width_mm) > 0)) continue;
    stairs.push({ code: st.label?.trim() || `ST${i + 1}`, label: st.label?.trim() || `Staircase ${i + 1}`, width: Number(st.width_mm), risers: n, riser: Number(st.riser_mm), tread: Number(st.tread_mm), waist: Number(st.waist_mm) || 150, openSides: Math.max(0, Math.min(2, Math.round(Number(st.open_sides) || 0))), landingM2: Number(st.landing_m2) || 0, flights: f, sets: 1, assumed: false });
  }
  const measured = (lbl: string, calc: string) => /soffit/.test(calc) && /flight/.test(lbl);
  const stairSets = (totals.items ?? []).filter((i) => i.group === "extra" && i.area > 0 && !measured(i.label, i.calc)).map((i) => ({ code: i.code, label: i.label, area: i.area }));
  const Hf = Math.round(t.params.floorHeight * 1000);
  for (const ss of stairSets.filter((x) => /stair/i.test(x.label))) {
    const per = Math.ceil(Hf / 2 / 170), cnt = Number(ss.label.match(/×\s*(\d+)/)?.[1]) || 1;
    stairs.push({ code: ss.code, label: `${ss.label} — typical (assumed)`, width: 1200, risers: per, riser: Math.round((Hf / 2 / per) * 10) / 10, tread: 270, waist: 150, openSides: 1, landingM2: 2.5 * 1.2, flights: 2, sets: cnt, assumed: true });
  }

  // columns (mm): drawn, typed in by size, and from the DXF column layer — same sizes grouped
  const colMap = new Map<string, ColumnRun>();
  const addCol = (w: number, d: number, h: number, round: boolean, perimeter: number, qty: number) => {
    if (!(w > 50 && d > 50) || qty <= 0) return;
    const [a, b] = [Math.round(w / 5) * 5, Math.round(d / 5) * 5];
    const key = `${round ? "R" : ""}${a}x${b}@${Math.round(h)}`;
    const c = colMap.get(key);
    if (c) c.qty += qty; else colMap.set(key, { code: round ? `CR${a}` : `C${a}x${b}`, w: a, d: b, h, qty, round, perimeter });
  };
  for (const s of g.shapes.filter((x) => x.kind === "column")) {
    if (!(mpp > 0)) break;
    const xs = s.pts.map((p) => p[0]), ys = s.pts.map((p) => p[1]);
    const w = (Math.max(...xs) - Math.min(...xs)) * mpp * 1000, d = (Math.max(...ys) - Math.min(...ys)) * mpp * 1000;
    const round = s.pts.length > 6 && Math.abs(polyArea(s.pts)) * mpp * mpp * 1e6 < 0.85 * w * d;
    addCol(w, d, s.h && s.h > 0 ? s.h : H, round, polyLength(s.pts, true) * mpp * 1000, 1);
  }
  for (const c of t.columns ?? []) addCol(c.w_mm, c.d_mm, H, false, 2 * (c.w_mm + c.d_mm), Math.round(c.qty || 0));
  for (const c of auto?.columns ?? []) addCol(c.w * 1000, c.d * 1000, H, c.area < 0.85 * c.w * c.d, c.perimeter * 1000, 1);
  const columns = [...colMap.values()].sort((a, b) => b.qty - a.qty);

  // inputs for the deck zones (installation drawing): walls and beams over openings in metres
  let zoneWalls: Pt[][] = [];
  if (auto?.wallRings?.length && frame) zoneWalls = auto.wallRings.map((r) => r.map((q) => toM(frame!.toPx(q))));
  else if (mpp > 0) {
    const rects: Pt[][] = [];
    for (const s of g.shapes.filter((x) => x.kind === "wall")) {
      const half = (s.t ?? t.params.wallThkMm ?? 150) / 2000;
      for (let i = 1; i < s.pts.length; i++) {
        const a = toM(s.pts[i - 1]), b = toM(s.pts[i]); const dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy); if (!L) continue;
        const nx = (-dy / L) * half, ny = (dx / L) * half, ex = (dx / L) * half, ey = (dy / L) * half;
        rects.push([[a[0] - ex + nx, a[1] - ey + ny], [b[0] + ex + nx, b[1] + ey + ny], [b[0] + ex - nx, b[1] + ey - ny], [a[0] - ex - nx, a[1] - ey - ny]]);
      }
    }
    zoneWalls = wallUnion(rects).rings;
  }
  // beams and columns in the slab (framed buildings): the deck stops at them (beam bottoms are their own panels)
  const zoneBeams: Pt[][] = frame ? [...(auto?.beamRings ?? []), ...(auto?.columnRings ?? [])].map((r) => r.map((q) => toM(frame!.toPx(q)))) : [];
  const zoneGaps = frame && auto?.beamSized?.length ? [] : frame && auto?.gaps ? auto.gaps.map((gp) => ({ a: toM(frame!.toPx(gp.a)), b: toM(frame!.toPx(gp.b)), thk: gp.thk ?? (t.params.wallThkMm ?? 150) / 1000 })) : [];
  return { faces, decks, beams, corners, openings, columns, totals, shell: g, stairSets, stairs, zoneWalls, zoneGaps, zoneBeams };
}
