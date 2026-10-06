/**
 * Turns a measured floor plan (take-off + DXF layers) into the inputs of the floor panel layout:
 * wall faces, slab polygons (with ducts as holes), beam runs and the number of wall corners.
 */
import { DEFAULT_RULES, type MeasureRules } from "./rules";
import { computeTotals, OPENING_DEFAULTS, polyArea, polyLength, UNIT_TO_M, type Pt, type Takeoff, type Totals, autoStairRows } from "./calc";
import { isRailLayer } from "./layer-rules";
import { closedLoops, drawingParts, dxfAuto, dxfFrame, separateAreas, type DxfModel } from "./dxf";
import { nearRings, wallUnion } from "./geom";
import { buildShell } from "./shell";
import type { BeamRun, ColumnRun, DeckPoly, Face, OpeningCut, StairGeo } from "@/lib/design-engine/floor-panels";

/** Point inside the wall outlines (even–odd, metres). */
const inRingsM = (q: Pt, rings: Pt[][]) => {
  let c = false;
  for (const r of rings) for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const [xi, yi] = r[i], [xj, yj] = r[j]; if ((yi > q[1]) !== (yj > q[1]) && q[0] < ((xj - xi) * (q[1] - yi)) / (yj - yi) + xi) c = !c; }
  return c;
};

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
  const archItems: { k: "rail" | "parapet" | "proj"; a?: Pt; b?: Pt; ring?: Pt[] }[] = [];
  let frame: ReturnType<typeof dxfFrame> | null = null;
  if (model && t.dxf) {
    const f = dxfFrame(model, 2400); frame = f; const reg = t.dxf.region;
    // small detail sketches / legends / sections drawn inside the plan region (installation details beside the plan)
    // are their own drawings — the plan is read without them
    let details: [number, number, number, number][] = [];
    if (reg) {
      try {
        const regA = (reg[2] - reg[0]) * (reg[3] - reg[1]);
        details = drawingParts(model, UNIT_TO_M[t.dxf.units], t.dxf.layerRoles).filter((d) => d.kind !== "plan").map((d) => { const a = f.toPx([d.box[0], d.box[1]]), b = f.toPx([d.box[2], d.box[3]]); return [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[0], b[0]), Math.max(a[1], b[1])] as [number, number, number, number]; })
          .filter((b) => b[0] >= reg[0] - 2 && b[1] >= reg[1] - 2 && b[2] <= reg[2] + 2 && b[3] <= reg[3] + 2 && (b[2] - b[0]) * (b[3] - b[1]) < 0.15 * regA);
      } catch { details = []; }
    }
    const inDetail = (x: number, y: number) => details.some((b) => x >= b[0] && x <= b[2] && y >= b[1] && y <= b[3]);
    // boxes the user marked on the review screen (plan metres): "not part of this floor" / "part of this floor"
    const exM = t.dxf.excludeM ?? [], inM = t.dxf.includeM ?? [];
    const inEx = (x: number, y: number) => exM.some((b) => x * mpp >= b[0] && x * mpp <= b[2] && y * mpp >= b[1] && y * mpp <= b[3]);
    const keep = reg || exM.length ? (p: { pts: [number, number][] }) => p.pts.every((q) => { const [x, y] = f.toPx(q); return (!reg || (x >= reg[0] && x <= reg[2] && y >= reg[1] && y <= reg[3] && !inDetail(x, y))) && !inEx(x, y); }) : undefined;
    // "part of this floor" boxes in drawing units for the reader
    const force = inM.map((b) => { const a = f.fromPx([b[0] / mpp, b[1] / mpp]), c = f.fromPx([b[2] / mpp, b[3] / mpp]); return [Math.min(a[0], c[0]), Math.min(a[1], c[1]), Math.max(a[0], c[0]), Math.max(a[1], c[1])] as [number, number, number, number]; });
    auto = dxfAuto(model, t.dxf.layerRoles, UNIT_TO_M[t.dxf.units], keep, t.params.minOpeningM2 != null && String(t.params.minOpeningM2) !== "" ? Number(t.params.minOpeningM2) : rules.minOpeningM2, separateAreas(t.shapes, f), { minWallMm: Number(t.params.minWallMm) || 0, force, beamDepthMm: Number(t.params.beamDepthMm) || undefined });
    // architecture around the formwork, for the 3D model only: balcony railings, parapet walls, sunshades / projections
    const roles = t.dxf.layerRoles ?? {};
    const kindOf = (layer: string): "rail" | "parapet" | "proj" | null => {
      const r = roles[layer]; if (r === "walls" || r === "slab" || r === "columns" || r === "beams" || r === "upstand") return null;
      if (isRailLayer(layer)) return "rail";
      const n = layer.toLowerCase();
      if (/parapet|kerb|curb/.test(n)) return "parapet";
      if (/projection|chajj|chhajj|sunshade|sun-shade|canopy|(^|[-_ ])shade|ledge|weather/.test(n)) return "proj";
      return null;
    };
    const tm = (q: Pt): Pt => { const [x, y] = f.toPx(q); return [x * mpp, y * mpp]; };
    for (const p of [...(model.rails ?? []), ...model.paths]) {
      if (archItems.length > 6000) break;
      const k = kindOf(p.layer); if (!k || (auto?.onFloor ? !auto.onFloor(p) : keep && !keep(p))) continue;
      const pts = p.pts.map(tm);
      if (k === "proj" && p.closed && pts.length >= 3) { archItems.push({ k, ring: pts }); continue; }
      for (let i = 0; i < pts.length - (p.closed ? 0 : 1); i++) {
        const a = pts[i], b = pts[(i + 1) % pts.length], dx = Math.abs(b[0] - a[0]), dy = Math.abs(b[1] - a[1]);
        if (Math.hypot(dx, dy) < 0.1) continue;
        // a slanting line on a projection layer is the cross marking an opening / shaft, not a sunshade
        if (k === "proj" && Math.min(dx, dy) > 0.1 * Math.max(dx, dy)) continue;
        // a long slanting single line is a leader / section line crossing the plan, not a railing or parapet
        if (p.pts.length === 2 && Math.min(dx, dy) > 0.05 * Math.max(dx, dy) && Math.hypot(dx, dy) > 2.5) continue;
        archItems.push({ k, a, b });
      }
    }
  }
  let corners = 0, extCorners = 0;          // internal (room) corners → IC, external (outside) corners → EC
  let solidPx: Pt[][] = [];

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
  const openings: OpeningCut[] = [];
  // doors / windows found inside the walls of the drawing, per outline edge
  const cutsOf = new Map<string, { f0: number; f1: number; door: boolean; thk: number; mid: Pt }[]>();
  const dwSeen: { mid: Pt; thk: number }[] = [];
  const uM = t.dxf ? UNIT_TO_M[t.dxf.units] : 0.001;
  for (const o of auto?.wallOpenings ?? []) {
    const r = auto!.wallRings![o.ring]; const a = r[o.edge], b = r[(o.edge + 1) % r.length];
    const Ld = Math.hypot(b[0] - a[0], b[1] - a[1]); if (!Ld) continue;
    const tm = (o.t0 + o.t1) / 2, mid: Pt = [a[0] + ((b[0] - a[0]) * tm) / Ld, a[1] + ((b[1] - a[1]) * tm) / Ld];
    const k = `${o.ring}:${o.edge}`; (cutsOf.get(k) ?? cutsOf.set(k, []).get(k)!).push({ f0: o.t0 / Ld, f1: o.t1 / Ld, door: o.door, thk: o.thk, mid });
  }
  const colEdges = new Set(auto?.columnWallEdges ?? []);
  const addRun = (pts: Pt[], closed: boolean, twoSided: boolean, ring?: number) => {
    const seg = pts.length - (closed ? 0 : 1);
    for (let i = 0; i < seg; i++) {
      const a = pts[i], b = pts[(i + 1) % pts.length];
      const L = mm(Math.hypot(b[0] - a[0], b[1] - a[1]));
      if (L < 100) continue;
      n++;
      const side = twoSided && mpp > 0 ? ((t.params.wallThkMm ?? 150) / 2000) / mpp : 0;
      const cuts = ring != null ? (cutsOf.get(`${ring}:${i}`) ?? []).sort((x, y) => x.f0 - y.f0) : [];
      if (cuts.length) {
        // the face is broken by doors / windows: full-height pieces between them, a piece over each opening
        // (and under each window) — the same pieces as an opening drawn by hand
        const at = (f: number): Pt => [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f];
        let pos = 0, k = 0;
        const piece = (f0: number, f1: number) => { const len = (f1 - f0) * L; if (len >= 60) faces.push({ code: `F${n}.${++k}`, length: len, height: H, geo: { a: at(f0), b: at(f1), off: side } }); };
        cuts.forEach((c, ci) => {
          piece(pos, c.f0);
          const w = (c.f1 - Math.max(pos, c.f0)) * L;
          const head = c.door ? OPENING_DEFAULTS.doorH : OPENING_DEFAULTS.windowSill + OPENING_DEFAULTS.windowH, sill = c.door ? 0 : OPENING_DEFAULTS.windowSill;
          if (w > 0) {
            const g3 = (z0: number) => ({ a: at(Math.max(pos, c.f0)), b: at(c.f1), off: side, z0 });
            if (H - head >= 50) faces.push({ code: `F${n}-O${ci + 1}H`, length: w, height: H - head, part: "above", geo3: g3(head) });
            if (sill >= 50) faces.push({ code: `F${n}-O${ci + 1}S`, length: w, height: sill, part: "below", geo3: g3(0) });
          }
          if (!dwSeen.some((d) => Math.hypot(d.mid[0] - c.mid[0], d.mid[1] - c.mid[1]) * uM * 1000 <= Math.max(d.thk, c.thk) + 100)) {
            dwSeen.push({ mid: c.mid, thk: c.thk });
            openings.push({ kind: c.door ? "door" : "window", w: (c.f1 - c.f0) * L, h: c.door ? OPENING_DEFAULTS.doorH : OPENING_DEFAULTS.windowH, t: c.thk || (t.params.wallThkMm ?? 150) });
          }
          pos = Math.max(pos, c.f1);
        });
        piece(pos, 1);
        continue;
      }
      faces.push({ code: `F${n}`, length: L, height: H, geo: { a, b, off: side }, ...(ring != null && colEdges.has(`${ring}:${i}`) ? { set: "column" as const } : {}) });
      if (twoSided) faces.push({ code: `F${n}B`, length: L, height: H, geo: { a, b, off: -side } });
    }
    // a corner of a wall outline is internal (concrete on 3 of 4 sides → internal corner IC) or external (1 of 4 → external corner EC)
    const kind = (a: Pt, v: Pt, c: Pt): "int" | "ext" => {
      if (ring == null || !solidPx.length || !(mpp > 0)) return "int";
      const d = 0.04 / mpp, l1 = Math.hypot(a[0] - v[0], a[1] - v[1]) || 1, l2 = Math.hypot(c[0] - v[0], c[1] - v[1]) || 1;
      const u1: Pt = [(a[0] - v[0]) / l1, (a[1] - v[1]) / l1], u2: Pt = [(c[0] - v[0]) / l2, (c[1] - v[1]) / l2];
      let n = 0; for (const s1 of [1, -1]) for (const s2 of [1, -1]) if (nearRings([v[0] + (u1[0] * s1 + u2[0] * s2) * d, v[1] + (u1[1] * s1 + u2[1] * s2) * d], solidPx, 0)) n++;
      return n >= 3 ? "int" : "ext";
    };
    // a corner next to a wall end (face ≤ 250 mm) is closed by the stop-end, not by an external corner angle
    const isEnd = (p: Pt, q: Pt) => mm(Math.hypot(q[0] - p[0], q[1] - p[1])) <= 250;
    const count = (a: Pt, v: Pt, c: Pt) => { if (Math.abs(angleAt(a, v, c) - 90) < 30) { if (kind(a, v, c) === "int") corners++; else if (!isEnd(a, v) && !isEnd(v, c)) extCorners++; } };
    for (let i = 1; i < pts.length - (closed ? 0 : 1); i++) count(pts[i - 1], pts[i], pts[(i + 1) % pts.length]);
    if (closed && pts.length > 2) count(pts[pts.length - 1], pts[0], pts[1]);
  };
  if (auto && (auto.wallRings?.length || auto.wallLoose?.length)) {
    const sep = new Set(auto.wallSeparate ?? []);
    solidPx = (auto.wallRings ?? []).map((r) => r.map(px));
    (auto.wallRings ?? []).forEach((r, ri) => { if (!sep.has(ri)) addRun(r.map(px), true, false, ri); });
    for (const l of auto.wallLoose ?? []) addRun(l.map(px), false, both);
  } else {
    for (const l of g.dxf.walls ?? []) addRun(l.pts, l.closed, both);
  }

  // doors / windows: cut them out of the faces they sit on
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
    // the staircase well (flights + mid landing) is not decked: the stair has its own formwork
    ...(frame ? (auto?.stairBoxes ?? []).map((bx): Pt[] => { const p = toM(frame!.toPx([bx[0], bx[1]])), q = toM(frame!.toPx([bx[2], bx[3]])); const x0 = Math.min(p[0], q[0]), y0 = Math.min(p[1], q[1]), x1 = Math.max(p[0], q[0]), y1 = Math.max(p[1], q[1]); return [[x0, y0], [x1, y0], [x1, y1], [x0, y1]]; }).filter((r) => (r[1][0] - r[0][0]) >= 1.5 && (r[2][1] - r[1][1]) >= 1.5) : []),
  ];
  const sw: DeckPoly[] = auto?.slabFromWalls ? fromAuto(auto.slabLoops).map((pts, i) => ({ code: `SW${i + 1}`, pts, holes })) : [];
  // closed loops on the slab layers: a loop under 1 m², or one outside the floor outline when that outline came from the
  // walls (label boxes, detail sketches beside the plan), is not a slab
  const slabLoopsM = closedLoops((g.dxf.slab ?? []).map((l) => ({ layer: "s", ...l })), tolPx).filter((pts) => pts.length > 2).map((pts) => pts.map(toM))
    .filter((pts) => Math.abs(polyArea(pts)) >= 1 && (!sw.length || pts.some((q) => sw.some((d) => inRingsM(q, [d.pts])))));
  const decks: DeckPoly[] = [
    ...sw,
    ...g.shapes.filter((s) => s.kind === "slab").map((s) => ({ code: s.code, pts: s.pts.map(toM), holes })),
    ...slabLoopsM.map((pts, i) => ({ code: `SL${i + 1}`, pts, holes })),
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
    for (const b of auto.beamSized) beams.push({ code: `B${b.b}x${b.d}`, length: b.len * 1000, b: b.b, d: b.d, sides: 2, bottom: true, ...(b.inner != null ? { inner: b.inner * 1000, outer: (b.outer ?? 0) * 1000, lintel: (b.lintel ?? 0) * 1000 } : {}) });
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
  // staircases measured from the drawing's tread lines (no typed rows): real flights, not the assumed dog-leg
  if (!stairs.length) for (const [i, st] of autoStairRows(auto, t.params.floorHeight).entries()) {
    const r = st.row;
    stairs.push({ code: `ST${i + 1}`, label: `Staircase ${i + 1} (measured) — ${st.desc}`, width: r.width_mm, risers: r.risers, riser: r.riser_mm, tread: r.tread_mm, waist: r.waist_mm, openSides: r.open_sides ?? 1, landingM2: r.landing_m2 ?? 0, flights: r.flights, sets: 1, assumed: false });
  }
  const measured = (lbl: string, calc: string) => /soffit/.test(calc) && (/flight/.test(lbl) || /measured/.test(lbl));
  // when the stairs are known flight by flight (typed or read from the drawing) they get real panels; the company
  // allowance line (used for the quote) must not also add a stair set to the parts list
  const realStairs = stairs.length > 0;
  const stairSets = (totals.items ?? []).filter((i) => i.group === "extra" && i.area > 0 && !measured(i.label, i.calc) && !(realStairs && /stair/i.test(i.label))).map((i) => ({ code: i.code, label: i.label, area: i.area }));
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
  for (const c of auto?.columns ?? []) addCol(c.w * 1000, c.d * 1000, H, c.round ?? c.area < 0.85 * c.w * c.d, c.perimeter * 1000, 1);
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
  // 3D model: columns (drawn + DXF), beams with their depth, staircase boxes
  const zoneCols: Pt[][] = [
    ...(frame ? (auto?.columnRings ?? []).map((r) => r.map((q) => toM(frame!.toPx(q)))) : []),
    ...(mpp > 0 ? g.shapes.filter((x) => x.kind === "column" && x.pts.length >= 2).map((x) => { if (x.pts.length >= 3) return x.pts.map((q) => toM(q)); const xs = x.pts.map((q) => q[0]), ys = x.pts.map((q) => q[1]); const a = toM([Math.min(...xs), Math.min(...ys)]), b = toM([Math.max(...xs), Math.max(...ys)]); return [a, [b[0], a[1]], b, [a[0], b[1]]] as Pt[]; }) : []),
  ];
  const zoneBeam3: { ring: Pt[]; d: number }[] = frame ? (auto?.beamRings ?? []).map((r, i) => ({ ring: r.map((q) => toM(frame!.toPx(q))), d: auto?.beamRingDepth?.[i] ?? (t.params.beamDepthMm ?? 600) })) : [];
  const zoneStairs: [number, number, number, number][] = frame ? (auto?.stairBoxes ?? []).map((bx) => { const p = toM(frame!.toPx([bx[0], bx[1]])), q = toM(frame!.toPx([bx[2], bx[3]])); return [Math.min(p[0], q[0]), Math.min(p[1], q[1]), Math.max(p[0], q[0]), Math.max(p[1], q[1])] as [number, number, number, number]; }) : [];
  // which way each stair climbs and at which end its mid-landing is (read from the tread lines and the UP / DN arrows)
  const zoneStairOrient: ({ along: boolean; landHigh: boolean; upHigh?: boolean; spans?: [number, number][] } | null)[] = zoneStairs.map((zb, i) => {
    const m = (auto as { stairsMeasured?: { run?: "x" | "y"; landPt?: Pt; upPt?: Pt; flights: { span?: [number, number] }[] }[] } | undefined)?.stairsMeasured?.[i];
    if (!frame || !m?.run || !m.landPt) return null;
    const lp = toM(frame.toPx(m.landPt)), along = m.run === "x";
    const up = m.upPt ? toM(frame.toPx(m.upPt)) : null;
    // where each flight lies across the climb (metres, box-relative): from its tread lines, so a flight never runs into a wall
    const spans = m.flights.map((f) => f.span).filter((v): v is [number, number] => !!v).map((v) => {
      // the span is measured along the tread lines: x when the climb runs along y, y when it runs along x
      const a = toM(frame!.toPx(along ? [zb[0], v[0]] as Pt : [v[0], zb[1]] as Pt)), b = toM(frame!.toPx(along ? [zb[0], v[1]] as Pt : [v[1], zb[1]] as Pt));
      const va = along ? a[1] - zb[1] : a[0] - zb[0], vb = along ? b[1] - zb[1] : b[0] - zb[0];
      return [Math.min(va, vb), Math.max(va, vb)] as [number, number];
    });
    return { along, landHigh: along ? lp[0] > (zb[0] + zb[2]) / 2 : lp[1] > (zb[1] + zb[3]) / 2, upHigh: up ? (along ? up[1] > (zb[1] + zb[3]) / 2 : up[0] > (zb[0] + zb[2]) / 2) : undefined, spans: spans.length ? spans : undefined };
  });
  // doors / windows inside the walls, for the 3D model: the opening across the wall (metres), sill and head (mm)
  const zoneOpenings: { a: Pt; b: Pt; n: Pt; thk: number; door: boolean; sill: number; head: number; gap?: boolean; free?: boolean }[] = [];
  if (frame && auto?.wallRings) for (const op of auto.wallOpenings ?? []) {
    const r = auto.wallRings[op.ring]; if (!r) continue;
    const A = r[op.edge], B = r[(op.edge + 1) % r.length]; const Ld = Math.hypot(B[0] - A[0], B[1] - A[1]); if (!Ld) continue;
    const pa = toM(frame.toPx([A[0] + ((B[0] - A[0]) * op.t0) / Ld, A[1] + ((B[1] - A[1]) * op.t0) / Ld]));
    const pb = toM(frame.toPx([A[0] + ((B[0] - A[0]) * op.t1) / Ld, A[1] + ((B[1] - A[1]) * op.t1) / Ld]));
    const dx = pb[0] - pa[0], dy = pb[1] - pa[1], L = Math.hypot(dx, dy); if (L < 0.2) continue;
    const thk = (op.thk > 0 ? op.thk : (t.params.wallThkMm ?? 150)) / 1000;
    // into the wall: the side of the face where the wall outline is
    let nx = -dy / L, ny = dx / L;
    const mid: Pt = [(pa[0] + pb[0]) / 2, (pa[1] + pb[1]) / 2];
    if (!zoneWalls.length || !inRingsM([mid[0] + nx * thk * 0.5, mid[1] + ny * thk * 0.5], zoneWalls)) { nx = -nx; ny = -ny; }
    // both faces of one wall carry the same opening: once
    if (zoneOpenings.some((z) => Math.hypot((z.a[0] + z.b[0]) / 2 - mid[0], (z.a[1] + z.b[1]) / 2 - mid[1]) <= Math.max(z.thk, thk) + 0.05)) continue;
    zoneOpenings.push({ a: pa, b: pb, n: [nx, ny], thk, door: op.door, sill: op.door ? 0 : OPENING_DEFAULTS.windowSill, head: op.door ? OPENING_DEFAULTS.doorH : OPENING_DEFAULTS.windowSill + OPENING_DEFAULTS.windowH });
  }
  // doors / windows in a break of the wall: the opening across the gap (the face line on one side)
  if (frame) for (const dg of auto?.dwGaps ?? []) {
    const ca = toM(frame.toPx(dg.a)), cb = toM(frame.toPx(dg.b));
    const dx = cb[0] - ca[0], dy = cb[1] - ca[1], L = Math.hypot(dx, dy); if (L < 0.3) continue;
    const nx = -dy / L, ny = dx / L, h = dg.thk / 2;
    const mid: Pt = [(ca[0] + cb[0]) / 2, (ca[1] + cb[1]) / 2];
    if (zoneOpenings.some((z) => Math.hypot((z.a[0] + z.b[0]) / 2 + z.n[0] * z.thk / 2 - mid[0], (z.a[1] + z.b[1]) / 2 + z.n[1] * z.thk / 2 - mid[1]) < 0.3)) continue;
    zoneOpenings.push({ a: [ca[0] - nx * h, ca[1] - ny * h], b: [cb[0] - nx * h, cb[1] - ny * h], n: [nx, ny], thk: dg.thk, door: dg.door, sill: dg.door ? 0 : OPENING_DEFAULTS.windowSill, head: dg.door ? OPENING_DEFAULTS.doorH : OPENING_DEFAULTS.windowSill + OPENING_DEFAULTS.windowH, gap: true, ...(dg.free ? { free: true } : {}) });
  }
  // what the reader decided on its own, in plan metres, for the review screen
  const readNotes = frame && auto?.notes ? auto.notes.map((n) => { const a = toM(frame!.toPx([n.box[0], n.box[1]])), b = toM(frame!.toPx([n.box[2], n.box[3]])); return { ...n, box: [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[0], b[0]), Math.max(a[1], b[1])] as [number, number, number, number] }; }) : [];
  // for the training record: drawing units → plan metres, the reader's keep / drop decision, and the plan's own region
  const reg = t.dxf?.region;
  const readFrame = frame ? { toM: (q: Pt): Pt => toM(frame!.toPx(q)), inRegion: reg ? (q: Pt) => { const [x, y] = frame!.toPx(q); return x >= reg[0] && x <= reg[2] && y >= reg[1] && y <= reg[3]; } : undefined, onFloor: auto?.onFloor } : null;
  return { faces, decks, beams, corners, extCorners, upstands: auto?.upstands ?? [], openings, columns, totals, shell: g, stairSets, stairs, zoneWalls, zoneGaps, zoneBeams, zoneCols, zoneBeam3, zoneStairs, zoneStairOrient, zoneOpenings, zoneArch: archItems, sunk: auto?.sunk ?? [], readNotes, readFrame };
}
