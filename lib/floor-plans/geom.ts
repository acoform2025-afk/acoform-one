/**
 * Geometry helpers for reading RCC plans the way ACOFORM measures them:
 *  - wallUnion: wall outlines merged (overlapping / duplicated pieces counted once) → wall tops & face length
 *  - outlineFromWalls: outer boundary of the walls (gaps such as windows and doors closed) → slab outline
 *  - xMarkedBoxes: lift / duct cut-outs drawn as a box with an X
 * All inputs and outputs are in drawing units.
 */
import polygonClipping, { type MultiPolygon, type Polygon } from "polygon-clipping";
import { polyArea, polyLength, type Pt } from "./calc";

export function wallUnion(polys: Pt[][]): { area: number; perimeter: number; rings: Pt[][] } {
  const input: Polygon[] = [];
  for (const p of polys) if (p.length >= 3 && Math.abs(polyArea(p)) > 0) input.push([[...p, p[0]] as [number, number][]]);
  if (!input.length) return { area: 0, perimeter: 0, rings: [] };
  let U: MultiPolygon = [];
  try {
    U = polygonClipping.union(input[0], ...input.slice(1));
  } catch {
    // a bad polygon: add them one by one, skipping the ones that fail
    for (const p of input) { try { U = polygonClipping.union(U.length ? U : p, p); } catch { /* skip */ } }
  }
  let area = 0, perimeter = 0; const rings: Pt[][] = [];
  for (const poly of U) poly.forEach((ring, i) => {
    const r = ring.slice(0, -1) as Pt[]; const a = Math.abs(polyArea(r));
    area += i === 0 ? a : -a; perimeter += polyLength(r, true); rings.push(r);
  });
  return { area, perimeter, rings };
}

/** Is point p inside (or within tol of) any of the rings (even-odd per polygon set)? */
export function nearRings(p: Pt, rings: Pt[][], tol: number): boolean {
  let inside = false;
  for (const r of rings) {
    for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
      const [xi, yi] = r[i], [xj, yj] = r[j];
      if (yi > p[1] !== yj > p[1] && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) inside = !inside;
      const dx = xj - xi, dy = yj - yi, L2 = dx * dx + dy * dy;
      const t = L2 ? Math.max(0, Math.min(1, ((p[0] - xi) * dx + (p[1] - yi) * dy) / L2)) : 0;
      if (Math.hypot(p[0] - (xi + t * dx), p[1] - (yi + t * dy)) <= tol) return true;
    }
  }
  return inside;
}

/**
 * Outer outline of a plan from its walls: walls are rasterised, gaps up to 2 × closeR are closed, the outside is
 * flood-filled, and the boundary of everything else is traced. unit = drawing units per metre.
 */
export function outlineFromWalls(walls: { pts: Pt[]; closed: boolean }[], unit: number, closeR = 1.2): { area: number; loops: Pt[][] } {
  const pts = walls.flatMap((w) => w.pts);
  if (pts.length < 3) return { area: 0, loops: [] };
  const pad = (closeR + 0.5) * unit;
  const x0 = Math.min(...pts.map((p) => p[0])) - pad, y0 = Math.min(...pts.map((p) => p[1])) - pad;
  const x1 = Math.max(...pts.map((p) => p[0])) + pad, y1 = Math.max(...pts.map((p) => p[1])) + pad;
  let G = 0.025 * unit;                                             // 25 mm cells
  const maxCells = 4_000_000;
  if (((x1 - x0) / G) * ((y1 - y0) / G) > maxCells) G = Math.sqrt(((x1 - x0) * (y1 - y0)) / maxCells);
  const W = Math.ceil((x1 - x0) / G), H = Math.ceil((y1 - y0) / G), N = W * H;
  const g = new Uint8Array(N);
  const cell = (x: number, y: number) => { const i = Math.floor((x - x0) / G), j = Math.floor((y - y0) / G); if (i >= 0 && j >= 0 && i < W && j < H) g[j * W + i] = 1; };
  for (const w of walls) {
    const n = w.pts.length, segs = w.closed ? n : n - 1;
    for (let k = 0; k < segs; k++) {
      const a = w.pts[k], b = w.pts[(k + 1) % n];
      const st = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / (G / 2)));
      for (let s = 0; s <= st; s++) cell(a[0] + ((b[0] - a[0]) * s) / st, a[1] + ((b[1] - a[1]) * s) / st);
    }
  }
  const r = Math.max(1, Math.round((closeR * unit) / G));
  const dilate = (src: Uint8Array): Uint8Array => {
    const tmp = new Uint8Array(N), out = new Uint8Array(N);
    for (let j = 0; j < H; j++) {
      let last = -1e9; for (let i = 0; i < W; i++) { if (src[j * W + i]) last = i; if (i - last <= r) tmp[j * W + i] = 1; }
      last = 1e9; for (let i = W - 1; i >= 0; i--) { if (src[j * W + i]) last = i; if (last - i <= r) tmp[j * W + i] = 1; }
    }
    for (let i = 0; i < W; i++) {
      let last = -1e9; for (let j = 0; j < H; j++) { if (tmp[j * W + i]) last = j; if (j - last <= r) out[j * W + i] = 1; }
      last = 1e9; for (let j = H - 1; j >= 0; j--) { if (tmp[j * W + i]) last = j; if (last - j <= r) out[j * W + i] = 1; }
    }
    return out;
  };
  const wall = dilate(g);
  const outside = new Uint8Array(N);
  const stack: number[] = [];
  for (let i = 0; i < W; i++) stack.push(i, (H - 1) * W + i);
  for (let j = 0; j < H; j++) stack.push(j * W, j * W + W - 1);
  while (stack.length) {
    const c = stack.pop()!; if (outside[c] || wall[c]) continue; outside[c] = 1;
    const i = c % W;
    if (i > 0) stack.push(c - 1); if (i < W - 1) stack.push(c + 1); if (c >= W) stack.push(c - W); if (c < N - W) stack.push(c + W);
  }
  const outGrown = dilate(outside);                                 // erode the closed shape back to the wall faces
  const inside = new Uint8Array(N); let count = 0;
  for (let c = 0; c < N; c++) if (!outGrown[c]) { inside[c] = 1; count++; }
  // trace boundary edges (cell sides between inside and not-inside), counter-clockwise around inside
  const next = new Map<number, number[]>();
  const key = (i: number, j: number) => j * (W + 1) + i;
  const addE = (a: number, b: number) => { (next.get(a) ?? next.set(a, []).get(a)!).push(b); };
  const isIn = (i: number, j: number) => i >= 0 && j >= 0 && i < W && j < H && inside[j * W + i] === 1;
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
    if (!inside[j * W + i]) continue;
    if (!isIn(i, j - 1)) addE(key(i, j), key(i + 1, j));
    if (!isIn(i + 1, j)) addE(key(i + 1, j), key(i + 1, j + 1));
    if (!isIn(i, j + 1)) addE(key(i + 1, j + 1), key(i, j + 1));
    if (!isIn(i - 1, j)) addE(key(i, j + 1), key(i, j));
  }
  const loops: Pt[][] = [];
  for (const [start] of next) {
    while ((next.get(start)?.length ?? 0) > 0) {
      const loop: number[] = [start]; let cur = next.get(start)!.pop()!;
      for (let guard = 0; cur !== start && guard < 4 * N; guard++) { loop.push(cur); const nx = next.get(cur); if (!nx?.length) break; cur = nx.pop()!; }
      // simplify collinear, convert to drawing units
      const P = loop.map((k) => [x0 + (k % (W + 1)) * G, y0 + Math.floor(k / (W + 1)) * G] as Pt);
      const S: Pt[] = [];
      for (let i = 0; i < P.length; i++) {
        const a = P[(i - 1 + P.length) % P.length], b = P[i], c = P[(i + 1) % P.length];
        if ((b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]) !== 0) S.push(b);
      }
      if (S.length >= 3 && Math.abs(polyArea(S)) > 1 * unit * unit) loops.push(S);
    }
  }
  return { area: (count * G * G) / (unit * unit), loops };
}

/** Rectangles drawn as a box with an X: pairs of straight lines that are the two diagonals of the same box. */
export function xMarkedBoxes(lines: { pts: Pt[]; closed: boolean }[], tol: number): Pt[][] {
  const segs = lines.filter((l) => !l.closed && l.pts.length === 2).map((l) => l.pts as [Pt, Pt]);
  const used = new Set<number>(); const out: Pt[][] = [];
  const bb = ([a, b]: [Pt, Pt]) => [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[0], b[0]), Math.max(a[1], b[1])];
  for (let i = 0; i < segs.length; i++) {
    if (used.has(i)) continue;
    const A = bb(segs[i]); if (A[2] - A[0] < tol * 10 || A[3] - A[1] < tol * 10) continue;
    for (let j = i + 1; j < segs.length; j++) {
      if (used.has(j)) continue;
      const B = bb(segs[j]);
      if (A.every((v, k) => Math.abs(v - B[k]) <= tol)) {
        const s1 = (segs[i][1][0] - segs[i][0][0]) * (segs[i][1][1] - segs[i][0][1]), s2 = (segs[j][1][0] - segs[j][0][0]) * (segs[j][1][1] - segs[j][0][1]);
        if (Math.sign(s1) !== Math.sign(s2)) { used.add(i); used.add(j); out.push([[A[0], A[1]], [A[2], A[1]], [A[2], A[3]], [A[0], A[3]]]); break; }
      }
    }
  }
  return out;
}

/**
 * Openings in wall lines (doors, windows, passages): two wall ends that face each other in line, with the same
 * thickness, 0.45–3.6 m apart. In aluminium formwork each one gets a beam / lintel over it up to the slab.
 * rings: merged wall outlines (drawing units); unitToM: metres per drawing unit.
 */
export function wallGaps(rings: Pt[][], unitToM: number, maxSide = 0): { span: number; thk: number; a: Pt; b: Pt }[] {
  type Cap = { c: Pt; n: Pt; t: number; used: boolean };
  const caps: Cap[] = [];
  for (const r of rings) {
    let sa = 0; for (let i = 0; i < r.length; i++) { const [x1, y1] = r[i], [x2, y2] = r[(i + 1) % r.length]; sa += x1 * y2 - x2 * y1; }
    const ccw = sa > 0;
    for (let i = 0; i < r.length; i++) {
      const p = r[i], q = r[(i + 1) % r.length];
      const dx = q[0] - p[0], dy = q[1] - p[1], L = Math.hypot(dx, dy), Lm = L * unitToM;
      if (Lm < 0.075 || Lm > 0.35) continue;
      const n: Pt = ccw ? [dy / L, -dx / L] : [-dy / L, dx / L];   // outward normal
      // an end cap: both neighbouring edges run away from it (roughly along -n)
      const pp = r[(i - 1 + r.length) % r.length], qq = r[(i + 2) % r.length];
      const e1 = [pp[0] - p[0], pp[1] - p[1]], e2 = [qq[0] - q[0], qq[1] - q[1]];
      const l1 = Math.hypot(e1[0], e1[1]), l2 = Math.hypot(e2[0], e2[1]);
      if (!l1 || !l2) continue;
      if ((e1[0] * n[0] + e1[1] * n[1]) / l1 > -0.9 || (e2[0] * n[0] + e2[1] * n[1]) / l2 > -0.9) continue;
      caps.push({ c: [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2], n, t: Lm, used: false });
    }
  }
  const out: { span: number; thk: number; a: Pt; b: Pt }[] = [];
  const cands: { i: number; j: number; d: number }[] = [];
  for (let i = 0; i < caps.length; i++) for (let j = i + 1; j < caps.length; j++) {
    const A = caps[i], B = caps[j];
    if (A.n[0] * B.n[0] + A.n[1] * B.n[1] > -0.98 || Math.abs(A.t - B.t) > 0.03) continue;
    const d: Pt = [B.c[0] - A.c[0], B.c[1] - A.c[1]];
    const along = (d[0] * A.n[0] + d[1] * A.n[1]) * unitToM, lat = Math.abs(d[0] * A.n[1] - d[1] * A.n[0]) * unitToM;
    if (along < 0.45 || along > 3.6 || lat > 0.05) continue;
    cands.push({ i, j, d: along });
  }
  cands.sort((x, y) => x.d - y.d);
  for (const k of cands) {
    const A = caps[k.i], B = caps[k.j];
    if (A.used || B.used) continue;
    A.used = B.used = true;
    out.push({ span: k.d, thk: (A.t + B.t) / 2, a: A.c, b: B.c });
  }
  // a wall end facing the side of another wall (door next to a cross wall): nearest hit straight ahead, ≤ maxSide
  if (maxSide > 0) for (const A of caps) {
    if (A.used) continue;
    let best = Infinity; let hit: Pt | null = null;
    for (const r of rings) for (let i = 0; i < r.length; i++) {
      const p = r[i], q = r[(i + 1) % r.length];
      const ex = q[0] - p[0], ey = q[1] - p[1];
      const den = A.n[0] * ey - A.n[1] * ex; if (Math.abs(den) < 1e-9) continue;
      const wx = p[0] - A.c[0], wy = p[1] - A.c[1];
      const tRay = (wx * ey - wy * ex) / den, u = (wx * A.n[1] - wy * A.n[0]) / den;
      if (u < 0 || u > 1 || tRay <= 1e-6) continue;
      const along = tRay * unitToM;
      if (along < best) { best = along; hit = [A.c[0] + A.n[0] * tRay, A.c[1] + A.n[1] * tRay]; }
    }
    if (hit && best >= 0.45 && best <= maxSide) { A.used = true; out.push({ span: best, thk: A.t, a: A.c, b: hit }); }
  }
  return out;
}

/**
 * Spaces named on the drawing (SHAFT, DUCT…): the free space around each label, bounded by the walls, found by a
 * flood fill on a 25 mm grid. Gaps in the walls up to 2 × close m are bridged (the fill runs on walls grown by
 * `close`, then grows back). Spaces that do not close within maxM2 are skipped. Areas in m², boxes in drawing units.
 */
export function labelledSpaces(rings: Pt[][], loose: Pt[][], points: Pt[], unitToM: number, maxM2 = 8, close = 0.3): { area: number; box: [number, number, number, number]; perimeter: number }[] {
  const C = 0.025, G = C / unitToM, k = Math.max(0, Math.round(close / C));
  const R = (Math.sqrt(maxM2) * 1.6) / unitToM + k * G;
  const out: { area: number; box: [number, number, number, number]; perimeter: number }[] = [];
  const done: [number, number, number, number][] = [];
  for (const P of points) {
    if (done.some((b) => P[0] >= b[0] && P[0] <= b[2] && P[1] >= b[1] && P[1] <= b[3])) continue;
    const x0 = P[0] - R, y0 = P[1] - R, W = Math.ceil((2 * R) / G), H = W;
    const g = new Uint8Array(W * H);
    const mark = (a: Pt, b: Pt) => {
      const L = Math.hypot(b[0] - a[0], b[1] - a[1]); const st = Math.max(1, Math.ceil(L / (G / 2)));
      for (let s = 0; s <= st; s++) { const i = Math.floor((a[0] + ((b[0] - a[0]) * s) / st - x0) / G), j = Math.floor((a[1] + ((b[1] - a[1]) * s) / st - y0) / G); if (i >= 0 && j >= 0 && i < W && j < H) g[j * W + i] = 1; }
    };
    for (const r of rings) for (let i = 0; i < r.length; i++) mark(r[i], r[(i + 1) % r.length]);
    for (const l of loose) for (let i = 1; i < l.length; i++) mark(l[i - 1], l[i]);
    // grow walls by k cells (square), so gaps up to 2k cells are closed
    const grown = new Uint8Array(W * H);
    if (k > 0) {
      const tmp = new Uint8Array(W * H);
      for (let j = 0; j < H; j++) { let last = -1e9; for (let i = 0; i < W; i++) { if (g[j * W + i]) last = i; if (i - last <= k) tmp[j * W + i] = 1; } last = 1e9; for (let i = W - 1; i >= 0; i--) { if (g[j * W + i]) last = i; if (last - i <= k) tmp[j * W + i] = 1; } }
      for (let i = 0; i < W; i++) { let last = -1e9; for (let j = 0; j < H; j++) { if (tmp[j * W + i]) last = j; if (j - last <= k) grown[j * W + i] = 1; } last = 1e9; for (let j = H - 1; j >= 0; j--) { if (tmp[j * W + i]) last = j; if (last - j <= k) grown[j * W + i] = 1; } }
    } else grown.set(g);
    let si = Math.floor((P[0] - x0) / G), sj = Math.floor((P[1] - y0) / G);
    if (grown[sj * W + si]) {                                   // label sits on a grown wall: try a little up / right (text base point)
      let found = false;
      for (let d = 1; d <= 3 * k + 20 && !found; d++) for (const [di, dj] of [[d, d], [0, d], [d, 0], [-d, d], [d, -d]]) { const a = si + di, b = sj + dj; if (a > 0 && b > 0 && a < W - 1 && b < H - 1 && !grown[b * W + a]) { si = a; sj = b; found = true; break; } }
      if (!found) continue;
    }
    const limit = maxM2 / (C * C);
    const seen = new Uint8Array(W * H); const st = [sj * W + si]; seen[st[0]] = 1;
    let n = 0, open = false;
    while (st.length) {
      const c = st.pop()!; n++;
      if (n > limit) { open = true; break; }
      const i = c % W, j = (c - i) / W;
      if (i === 0 || j === 0 || i === W - 1 || j === H - 1) { open = true; break; }
      for (const d of [c - 1, c + 1, c - W, c + W]) if (!grown[d] && !seen[d]) { seen[d] = 1; st.push(d); }
    }
    if (open) continue;
    // grow the filled space back by k cells (not into the drawn walls)
    let reg = seen;
    for (let s = 0; s < k; s++) {
      const nx = reg.slice();
      for (let c = W; c < W * H - W; c++) if (!reg[c] && !g[c] && (reg[c - 1] || reg[c + 1] || reg[c - W] || reg[c + W])) nx[c] = 1;
      reg = nx;
    }
    let cnt = 0, i0 = W, j0 = H, i1 = 0, j1 = 0;
    for (let c = 0; c < W * H; c++) if (reg[c]) { cnt++; const i = c % W, j = (c - i) / W; if (i < i0) i0 = i; if (i > i1) i1 = i; if (j < j0) j0 = j; if (j > j1) j1 = j; }
    const bw = (i1 - i0 + 1) * C, bh = (j1 - j0 + 1) * C;
    const area = cnt * C * C + (bw + bh) * C;                 // + half a cell along each wall line
    if (area < 0.3) continue;
    const box: [number, number, number, number] = [x0 + i0 * G, y0 + j0 * G, x0 + (i1 + 1) * G, y0 + (j1 + 1) * G];
    done.push(box);
    out.push({ area, box, perimeter: 2 * (bw + bh) });
  }
  return out;
}
