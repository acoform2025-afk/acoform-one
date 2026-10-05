/**
 * 3D models of the aluminium-formwork components and accessories (typical sizes, mm, y up) — the catalogue the app
 * shows as spinning 3D pieces and prints as the "Components & accessories" sheet. Every piece is built from convex
 * faces (boxes, prisms, cylinders) so the same faces feed the WebGL viewer and the pre-rendered catalogue images.
 * `match` ties a component to the parts-list codes, so the catalogue can show how many this project needs.
 */
export type V3 = [number, number, number];
export type Face3 = { p: V3[]; c: string; mark?: boolean };       // mark: hole / slot decal on a surface
export type PartGroup = "Panels" | "Corners & edges" | "Deck support" | "Joints" | "Ties" | "Wall alignment" | "Safety" | "Staircase";
export type PartDef = { key: string; name: string; group: PartGroup; size: string; material: string; use: string; match?: RegExp; build: () => Face3[] };

const AL = "#c9ced6", ALD = "#aeb5bf", SKIN = "#dfe3e8", STEEL = "#8b929c", ZINC = "#b4bac2", PROP = "#e0782f", DARK = "#2b3038", PVC = "#eef0f2", WOOD = "#c99a5b", RED = "#c2410c";

class B {
  f: Face3[] = [];
  private t: (p: V3) => V3 = (p) => p;
  /** Draw with an extra transform (applied before the current one). */
  with(t: (p: V3) => V3, fn: () => void) { const o = this.t; this.t = (p) => o(t(p)); fn(); this.t = o; }
  poly(p: V3[], c: string, mark = false) { this.f.push({ p: p.map(this.t), c, mark }); }
  box(a: V3, b: V3, c: string) {
    const [x0, y0, z0] = a, [x1, y1, z1] = b;
    const P = (x: number, y: number, z: number): V3 => [x, y, z];
    this.poly([P(x0, y0, z0), P(x1, y0, z0), P(x1, y1, z0), P(x0, y1, z0)], c);
    this.poly([P(x0, y0, z1), P(x0, y1, z1), P(x1, y1, z1), P(x1, y0, z1)], c);
    this.poly([P(x0, y0, z0), P(x0, y1, z0), P(x0, y1, z1), P(x0, y0, z1)], c);
    this.poly([P(x1, y0, z0), P(x1, y0, z1), P(x1, y1, z1), P(x1, y1, z0)], c);
    this.poly([P(x0, y0, z0), P(x0, y0, z1), P(x1, y0, z1), P(x1, y0, z0)], c);
    this.poly([P(x0, y1, z0), P(x1, y1, z0), P(x1, y1, z1), P(x0, y1, z1)], c);
  }
  /** Convex profile (u, v) extruded along an axis from w0 to w1. */
  prism(prof: [number, number][], axis: "x" | "y" | "z", w0: number, w1: number, c: string) {
    const M = (u: number, v: number, w: number): V3 => (axis === "z" ? [u, v, w] : axis === "x" ? [w, u, v] : [u, w, v]);
    const n = prof.length;
    this.poly(prof.map(([u, v]) => M(u, v, w0)), c);
    this.poly([...prof].reverse().map(([u, v]) => M(u, v, w1)), c);
    for (let i = 0; i < n; i++) { const [a, b] = [prof[i], prof[(i + 1) % n]]; this.poly([M(a[0], a[1], w0), M(b[0], b[1], w0), M(b[0], b[1], w1), M(a[0], a[1], w1)], c); }
  }
  /** Cylinder / cone along an axis from point p0, length len (radius r at the start, r2 at the end). */
  cyl(p0: V3, axis: "x" | "y" | "z", r: number, len: number, c: string, r2 = r, n = 16) {
    const ring = (rr: number, d: number) => Array.from({ length: n }, (_, i) => {
      const a = (i / n) * Math.PI * 2, u = Math.cos(a) * rr, v = Math.sin(a) * rr;
      return (axis === "x" ? [p0[0] + d, p0[1] + u, p0[2] + v] : axis === "y" ? [p0[0] + u, p0[1] + d, p0[2] + v] : [p0[0] + u, p0[1] + v, p0[2] + d]) as V3;
    });
    const A = ring(r, 0), Bq = ring(r2, len);
    this.poly([...A].reverse(), c); this.poly(Bq, c);
    for (let i = 0; i < n; i++) { const j = (i + 1) % n; this.poly([A[i], A[j], Bq[j], Bq[i]], c); }
  }
  /** Hole / slot mark on a surface: a dark disc facing along ±axis. */
  hole(at: V3, axis: "x" | "y" | "z", r: number, n = 10) {
    const pts = Array.from({ length: n }, (_, i) => {
      const a = (i / n) * Math.PI * 2, u = Math.cos(a) * r, v = Math.sin(a) * r;
      return (axis === "x" ? [at[0], at[1] + u, at[2] + v] : axis === "y" ? [at[0] + u, at[1], at[2] + v] : [at[0] + u, at[1] + v, at[2]]) as V3;
    });
    this.poly(pts, DARK, true);
  }
}
const make = (fn: (b: B) => void) => () => { const b = new B(); fn(b); return b.f; };
const rotY = (deg: number) => { const a = (deg * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a); return (p: V3): V3 => [p[0] * c + p[2] * s, p[1], -p[0] * s + p[2] * c]; };
const rotX = (deg: number) => { const a = (deg * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a); return (p: V3): V3 => [p[0], p[1] * c - p[2] * s, p[1] * s + p[2] * c]; };
const move = (d: V3) => (p: V3): V3 => [p[0] + d[0], p[1] + d[1], p[2] + d[2]];

/**
 * A framed aluminium panel W (x) × L (y): 4 mm skin at z 0–4 (concrete face at z = 0), 65 mm edge rails with pin
 * holes 40 mm from the skin, ribs at ≤ 300 mm. Used for wall, deck, beam and stair panels.
 */
function panel(b: B, W: number, L: number, o: { rib?: number; holeStep?: number; skin?: string } = {}) {
  const T = 4, F = 65, R = 6, rib = o.rib ?? 300, hs = o.holeStep ?? 150;
  b.box([0, 0, 0], [W, L, T], o.skin ?? SKIN);
  b.box([0, 0, T], [R, L, F], AL); b.box([W - R, 0, T], [W, L, F], AL);
  b.box([R, 0, T], [W - R, R, F], AL); b.box([R, L - R, T], [W - R, L, F], AL);
  for (let y = rib; y < L - 100; y += rib) b.box([R, y - 3, T], [W - R, y + 3, 50], ALD);
  for (let y = hs / 2; y < L; y += hs) { b.hole([-0.6, y, 44], "x", 8); b.hole([W + 0.6, y, 44], "x", 8); }
  for (let x = 100; x < W - 50; x += 100) { b.hole([x, -0.6, 44], "y", 8); b.hole([x, L + 0.6, 44], "y", 8); }
}

/** An L-shaped corner piece: two skins (legs a along x, c along z) with rails at their free edges, length L along y. */
function corner(b: B, a: number, c: number, L: number) {
  const T = 4, F = 65, R = 6;
  b.box([0, 0, -T], [a, L, 0], SKIN);                     // leg 1 skin (concrete at z < 0)
  b.box([-T, 0, -T], [0, L, c], SKIN);                    // leg 2 skin (concrete at x < 0)
  b.box([a - R, 0, 0], [a, L, F], AL);                    // rail at the end of leg 1
  b.box([0, 0, c - R], [F, L, c], AL);                    // rail at the end of leg 2
  for (let y = 0; y <= L; y += Math.min(300, L)) { const y0 = Math.min(Math.max(0, y - 3), L - 6); b.prism([[0, 0], [a - R, 0], [0, c - R]], "y", y0, y0 + 6, ALD); }
  for (let y = 75; y < L; y += 150) { b.hole([a + 0.6, y, 40], "x", 8); b.hole([40, y, c + 0.6], "z", 8); }
}

/** Adjustable prop of overall height h: base plate, outer tube, collar nut with handles, inner tube, pin, top plate. */
function prop(b: B, h: number) {
  const outer = Math.min(1600, h * 0.55);
  b.box([-75, 0, -75], [75, 8, 75], DARK); b.cyl([0, 8, 0], "y", 30, outer, PROP);
  b.cyl([0, outer - 10, 0], "y", 42, 70, DARK, 42, 6); b.box([42, outer + 10, -6], [130, outer + 40, 6], DARK); b.box([-130, outer + 10, -6], [-42, outer + 40, 6], DARK);
  b.cyl([0, outer, 0], "y", 24, h - 8 - outer, ZINC); b.box([-40, outer + 100, -5], [40, outer + 115, 5], RED); b.box([-60, h - 8, -60], [60, h, 60], DARK);
}

export const PARTS: PartDef[] = [
  // ---------------- panels ----------------
  { key: "wall-panel", name: "Wall panel", group: "Panels", size: "600 × 2400 (widths 100–600)", material: "Aluminium 6061-T6, 4 mm skin, 65 mm rails", use: "Forms both faces of every RCC wall; pinned to the next panel through the rail holes.", match: /^WP-/, build: make((b) => panel(b, 600, 2400)) },
  { key: "wall-top", name: "Wall-top panel", group: "Panels", size: "600 × 300–600 (height to suit)", material: "Aluminium 6061-T6", use: "Sits on the wall panel to make up the floor height under the soffit corner.", match: /^WT-/, build: make((b) => panel(b, 600, 525)) },
  { key: "deck-panel", name: "Deck panel", group: "Panels", size: "600 × 1200 (widths 100–600)", material: "Aluminium 6061-T6, 4 mm skin", use: "Forms the slab soffit; rests on mid beams and soffit corners, pinned at the rails.", match: /^DP-/, build: make((b) => b.with((p) => [p[0], -p[2], p[1]], () => panel(b, 600, 1200))) },
  { key: "beam-side", name: "Beam side panel", group: "Panels", size: "450 × 1200", material: "Aluminium 6061-T6", use: "Forms the two faces of a beam below the slab. On a lintel beam over a door or window it continues the wall face: pinned to the wall panels at both ends through their rails, to the soffit corner (and the deck) along its top rail, and to the beam bottom panel's side rail along its bottom rail. At a column the side panel is pinned to the column panel's top rail / beam cap.", match: /^BS-/, build: make((b) => b.with(rotY(-90), () => b.with((p) => [p[1], p[0], p[2]], () => panel(b, 450, 1200)))) },
  { key: "beam-bottom", name: "Beam bottom panel", group: "Panels", size: "200–300 × 1200", material: "Aluminium 6061-T6", use: "Forms the underside of the beam, as wide as the beam. Its side rails are pinned to the bottom rails of the two beam side panels (an outside-corner joint: pins and wedges through the matching holes, no corner piece). Carried on beam prop heads at the prop spacing, ends 150 mm in from the walls.", match: /^BB-/, build: make((b) => b.with((p) => [p[0], 65 - p[2], p[1]], () => panel(b, 230, 1200))) },
  { key: "stop-end", name: "Stop end (wall end closure)", group: "Panels", size: "wall thickness × floor height", material: "Aluminium 6061-T6", use: "Closes the end of a wall between the two wall faces.", match: /^SE-/, build: make((b) => panel(b, 160, 2400, { holeStep: 300 })) },
  // ---------------- corners & edges ----------------
  { key: "ic", name: "Internal corner", group: "Corners & edges", size: "100 × 100 × 2400", material: "Aluminium 6061-T6", use: "Forms the inside corner where two walls meet; both legs pinned to the wall panels.", match: /^IC-/, build: make((b) => corner(b, 100, 100, 2400)) },
  { key: "ec", name: "External corner angle", group: "Corners & edges", size: "65 × 65 × 2400", material: "Aluminium angle 6 mm", use: "Joins the rails of two wall panels at an outside corner.", match: /^EC-/, build: make((b) => { b.box([0, 0, 0], [65, 2400, 6], AL); b.box([0, 0, 0], [6, 2400, 65], AL); for (let y = 75; y < 2400; y += 150) { b.hole([40, y, 6.6], "z", 8); b.hole([6.6, y, 40], "x", 8); } }) },
  { key: "sc", name: "Soffit corner (slab corner)", group: "Corners & edges", size: "100 × 100 × 1200", material: "Aluminium 6061-T6", use: "Joins the top of the wall panels to the deck panels round every room.", match: /^SC/, build: make((b) => b.with((p) => [p[1], -p[0], p[2]], () => corner(b, 100, 100, 1200))) },
  { key: "kicker", name: "Kicker", group: "Corners & edges", size: "150 × 1200", material: "Aluminium 6061-T6", use: "Fixed on the outside face at slab level; the next lift of wall panels starts on it.", match: /^K(CE|IC|K)?-|^KICK/, build: make((b) => { b.box([0, 0, 0], [1200, 150, 4], SKIN); b.box([0, 144, 4], [1200, 150, 65], AL); b.box([0, 0, 4], [1200, 6, 65], AL); for (let x = 0; x <= 1200; x += 300) { const x0 = Math.min(Math.max(0, x - 3), 1194); b.box([x0, 6, 4], [x0 + 6, 144, 65], ALD); } for (let x = 75; x < 1200; x += 150) { b.hole([x, 150.6, 40], "y", 8); b.hole([x, -0.6, 40], "y", 8); } b.hole([600, 75, -0.6], "z", 12); }) },
  // ---------------- deck support ----------------
  { key: "mid-beam", name: "Keel / mid beam", group: "Deck support", size: "150 × 100 × 1050–1800", material: "Aluminium extrusion, 4 mm top skin", use: "Runs wall to wall between the deck rows, its ends in the prop-head cradles; the deck panels pin to its sides and its top forms the slab with them.", match: /^MB-/, build: make((b) => { b.box([0, 94, 0], [1050, 100, 150], SKIN); b.box([0, 0, 0], [1050, 94, 6], AL); b.box([0, 0, 144], [1050, 94, 150], AL); b.box([0, 0, 6], [1050, 6, 144], ALD); for (const x of [0, 1044]) b.box([x, 6, 6], [x + 6, 94, 144], ALD); for (let x = 150; x < 1050; x += 300) b.box([x - 3, 6, 6], [x + 3, 94, 144], ALD); for (let x = 75; x < 1050; x += 150) { b.hole([x, 50, -0.6], "z", 8); b.hole([x, 50, 150.6], "z", 8); } for (const x of [40, 1010]) { b.hole([x, 50, -0.6], "z", 8); b.hole([x, 50, 150.6], "z", 8); } }) },
  { key: "prop-head", name: "Prop head (drop head)", group: "Deck support", size: "150 × 300 cradle, 150 × 150 top plate, 100 mm drop", material: "Steel stem and drop collar, aluminium cradle", use: "Sits on the prop. The keel (mid beam) ends rest in its cradle from both sides and its square top plate sits flush with the deck skin between them. Knocking the wedge drops the cradle 100 mm so keels and deck panels come away while the prop and head stay up (early striking).", match: /^PH-/, build: make((b) => {
    const cx = 150, cz = 75;                                   // half cradle length (along the keel) and half width
    b.cyl([0, -100, 0], "y", 24, 100, STEEL);                  // spigot into the prop
    b.box([-30, 0, -30], [30, 200, 30], STEEL);                // square stem
    b.box([-55, 0, -55], [55, 90, 55], ZINC);                  // drop collar on the stem
    b.prism([[55, 20], [130, 20], [130, 45], [55, 70]], "z", -12, 12, DARK);   // the drop wedge through the collar
    b.box([-cx, 100, -cz], [cx, 106, cz], AL);                 // cradle floor: a keel end sits on each half
    b.box([-cx, 106, -cz], [cx, 150, -cz + 6], AL); b.box([-cx, 106, cz - 6], [cx, 150, cz], AL);   // side lugs, pinned to the keel ends
    b.box([-75, 200, -75], [75, 208, 75], SKIN);               // square top plate flush with the deck skin
    b.box([-75, 106, -75], [75, 200, -69], AL); b.box([-75, 106, 69], [75, 200, 75], AL);           // the plate's carrier round the stem
    for (const z of [-cz, cz]) for (const x of [-110, -70, 70, 110]) b.hole([x, 128, z + (z < 0 ? -0.6 : 0.6)], "z", 8);
  }) },
  { key: "beam-prop-head", name: "Beam prop head", group: "Deck support", size: "100 × 250 plate", material: "Steel / aluminium", use: "Sits on the prop under the beam bottom panel; its plate is as wide as the beam and its cheeks are pinned to the beam bottom's rails. Spaced along the beam at the prop spacing (1.2 m).", match: /^BPH/, build: make((b) => { b.box([-125, 150, -50], [125, 158, 50], ZINC); b.box([-125, 158, -50], [-119, 220, 50], AL); b.box([119, 158, -50], [125, 220, 50], AL); b.box([-25, 0, -25], [25, 150, 25], STEEL); b.cyl([0, -100, 0], "y", 24, 100, STEEL); }) },
  { key: "prop", name: "Adjustable steel prop", group: "Deck support", size: "2.0 – 3.5 m", material: "Steel tube Ø60 / Ø48, painted", use: "Supports the prop heads, beams and stair soffit; set to height with the collar nut and pin.", match: /^PROP$/, build: make((b) => prop(b, 2958)) },
  // ---------------- joints ----------------
  { key: "pin", name: "Round pin", group: "Joints", size: "Ø16 × 70", material: "Steel, zinc plated", use: "Goes through the rail holes of two panels side by side; held by the wedge.", match: /^PIN$/, build: make((b) => { b.cyl([0, 0, 0], "x", 15, 6, STEEL); b.cyl([6, 0, 0], "x", 8, 64, ZINC); b.box([52, -3, -9], [62, 3, 9], DARK); }) },
  { key: "wedge", name: "Wedge", group: "Joints", size: "90 × 25 × 4", material: "Steel, zinc plated", use: "Driven through the pin slot to lock the panels tight.", match: /^WEDGE$/, build: make((b) => { b.prism([[0, 0], [90, 6], [90, 18], [0, 25]], "z", 0, 4, ZINC); b.box([-12, -2, -2], [0, 27, 6], STEEL); }) },
  { key: "long-pin", name: "Long pin", group: "Joints", size: "Ø16 × 130", material: "Steel, zinc plated", use: "Pins three thicknesses: soffit corner / kicker / beam side to the deck or wall panel.", match: /^LPIN$/, build: make((b) => { b.cyl([0, 0, 0], "x", 15, 6, STEEL); b.cyl([6, 0, 0], "x", 8, 124, ZINC); b.box([112, -3, -9], [122, 3, 9], DARK); }) },
  // ---------------- ties ----------------
  { key: "tie-rod", name: "Tie rod", group: "Ties", size: "Ø17 thread bar × 400–600", material: "High-tensile steel", use: "Holds the two wall faces at the wall thickness; passes through a PVC sleeve.", match: /^TIE$/, build: make((b) => { b.cyl([0, 0, 0], "x", 8.5, 500, STEEL); for (let x = 10; x < 500; x += 25) b.cyl([x, 0, 0], "x", 9.2, 4, DARK, 9.2, 10); }) },
  { key: "tie-cone", name: "Tie cone", group: "Ties", size: "Ø40 → Ø25 × 40", material: "PVC / nylon", use: "Seals the sleeve end at the panel face; leaves a neat cone hole to fill after striking.", match: /^CONE$/, build: make((b) => { b.cyl([0, 0, 0], "x", 20, 40, "#9ca3af", 12.5); b.hole([40.6, 0, 0], "x", 8.5); }) },
  { key: "pvc-sleeve", name: "PVC sleeve", group: "Ties", size: "Ø25 × wall thickness", material: "PVC (lost in the concrete)", use: "Keeps the tie rod free so it can be pulled out after the pour.", match: /^PVC/, build: make((b) => { b.cyl([0, 0, 0], "x", 12.5, 200, PVC); b.hole([200.6, 0, 0], "x", 8.5); }) },
  { key: "wing-nut", name: "Wing nut with plate washer", group: "Ties", size: "Plate 100 × 100", material: "Ductile iron / steel", use: "Tightens the tie rod against the panel rails on each face.", match: /^WNUT$/, build: make((b) => { b.box([0, -50, -50], [8, 50, 50], ZINC); b.cyl([8, 0, 0], "x", 22, 45, STEEL, 16, 6); b.box([10, 18, -5], [45, 60, 5], STEEL); b.box([10, -60, -5], [45, -18, 5], STEEL); b.hole([53.6, 0, 0], "x", 8.5); }) },
  { key: "flat-tie", name: "Flat tie (flat-tie system)", group: "Ties", size: "25 × 3 × wall + 130", material: "Steel strip (lost in the concrete)", use: "Alternative to the tie rod: slots over the panel pins at the joints, cut off after striking.", match: /^FTIE|^FLAT/, build: make((b) => { b.box([0, 0, 0], [330, 25, 3], ZINC); for (const x of [25, 305]) b.hole([x, 12.5, 3.6], "z", 8); }) },
  // ---------------- wall alignment ----------------
  { key: "waler", name: "Alignment waler", group: "Wall alignment", size: "RHS 100 × 50 × 2400", material: "Steel, galvanised", use: "Runs across the wall panels in two rows to keep the wall straight; clipped to the rails.", match: /^WALER/, build: make((b) => { b.box([0, 0, 0], [2400, 100, 50], ZINC); for (let x = 150; x < 2400; x += 300) b.hole([x, 50, 50.6], "z", 9); }) },
  { key: "waler-bracket", name: "Waler bracket / clip", group: "Wall alignment", size: "for RHS 100 × 50", material: "Steel, galvanised", use: "Hooks on the panel rail with a pin and holds the waler.", match: /^WCLIP/, build: make((b) => { b.box([0, 0, 0], [8, 160, 80], ZINC); b.box([8, 0, 0], [70, 8, 80], ZINC); b.box([8, 152, 0], [70, 160, 80], ZINC); b.box([62, 0, 0], [70, 40, 80], ZINC); b.cyl([-40, 120, 40], "x", 8, 50, STEEL); b.hole([-0.6, 40, 40], "x", 8); }) },
  { key: "push-pull", name: "Push-pull prop", group: "Wall alignment", size: "1.6 – 2.8 m", material: "Steel tube, painted", use: "Braces the wall panels to the slab to set them plumb; screw body adjusts the length.", match: /^PPP$/, build: make((b) => b.with(rotY(0), () => b.with((p) => { const a = (50 * Math.PI) / 180; return [p[0] * Math.cos(a), p[0] * Math.sin(a) + p[1], p[2]]; }, () => { b.cyl([0, 0, 0], "x", 24, 900, PROP); b.cyl([900, 0, 0], "x", 30, 250, DARK, 30, 6); b.cyl([1150, 0, 0], "x", 24, 900, PROP); b.box([-40, -20, -30], [0, 20, 30], DARK); b.box([2050, -20, -30], [2090, 20, 30], DARK); }))) },
  { key: "anchor", name: "Anchor bolt / base plate", group: "Wall alignment", size: "M16 × 120", material: "Steel", use: "Fixes the foot of the push-pull prop to the slab.", match: /^ANCH/, build: make((b) => { b.box([-60, 0, -40], [60, 8, 40], ZINC); b.box([-8, 8, -40], [8, 60, 40], ZINC); b.cyl([0, 20, 0], "y", 8, -140, STEEL); b.cyl([0, 8, 0], "y", 14, 12, DARK, 14, 6); }) },
  { key: "kicker-bracket", name: "Kicker bracket", group: "Wall alignment", size: "200 × 200", material: "Steel", use: "Holds the kicker / outside panels at the slab edge.", match: /^KBR/, build: make((b) => { b.box([0, 0, 0], [8, 200, 60], ZINC); b.box([0, 0, 0], [200, 8, 60], ZINC); b.prism([[8, 8], [190, 8], [8, 190]], "z", 26, 34, ZINC); b.hole([-0.6, 150, 30], "x", 8); }) },
  { key: "beam-clamp", name: "Beam side clamp", group: "Wall alignment", size: "for beams up to 600 deep", material: "Steel", use: "Ties the two beam side panels together under the beam bottom.", match: /^BCL/, build: make((b) => { b.box([0, 0, 0], [400, 40, 40], ZINC); b.box([0, 40, 0], [12, 300, 40], ZINC); b.box([388, 40, 0], [400, 300, 40], ZINC); b.cyl([406, 200, 20], "x", 8, 60, STEEL); }) },
  // ---------------- safety ----------------
  { key: "platform-bracket", name: "Working platform bracket", group: "Safety", size: "1000 × 1100", material: "Steel", use: "Hangs on the outside wall panels; carries the walkway planks and the guard-rail post.", match: /^PLAT/, build: make((b) => { b.box([0, 0, 0], [10, 1100, 50], ZINC); b.box([0, 1050, 0], [1000, 1100, 50], ZINC); b.with((p) => p, () => b.prism([[10, 150], [40, 150], [1000, 1060], [970, 1060]], "z", 15, 35, ZINC)); b.box([960, 1100, 0], [1000, 1250, 50], DARK); }) },
  { key: "guard-rail", name: "Guard-rail post", group: "Safety", size: "1100 high", material: "Steel tube Ø48", use: "Fits the platform bracket socket; carries the hand rail, mid rail and toe board.", match: /^GRAIL/, build: make((b) => { b.cyl([0, 0, 0], "y", 24, 1100, "#facc15"); for (const y of [500, 1000]) b.box([20, y - 20, -15], [70, y + 20, 15], DARK); b.box([-80, 0, -10], [80, 150, 10], "#facc15"); }) },
  { key: "plank", name: "Walkway plank", group: "Safety", size: "225 × 38 × 2400", material: "Timber / aluminium", use: "Deck of the outside working platform.", match: /^PLANK/, build: make((b) => b.box([0, 0, 0], [2400, 38, 225], WOOD)) },
  // ---------------- staircase ----------------
  { key: "dog-tooth", name: "Stair side panel (SPGUN / SPCOVER)", group: "Staircase", size: "325 deep × along the flight", material: "Aluminium 4 mm plate, welded frame", use: "Serrated side form of the flight — SPGUN on the wall side, SPCOVER on the open side; its teeth form the step ends.", match: /^SPGUN|^SPCOVER|^DT-/, build: make((b) => { const t = 300, r = 155, n = 5; b.prism([[0, -170], [n * t, n * r - 170], [n * t, n * r], [0, 0]], "z", 0, 4, SKIN); for (let i = 0; i < n; i++) b.prism([[i * t, i * r], [i * t, (i + 1) * r], [(i + 1) * t, (i + 1) * r]], "z", 0, 4, SKIN); for (let i = 0; i < n; i++) b.box([i * t, i * r - 165 + 10, 4], [i * t + 6, (i + 1) * r, 60], ALD); b.prism([[0, -170], [n * t, n * r - 170], [n * t, n * r - 164], [0, -164]], "z", 4, 65, AL); }) },
  { key: "l-step", name: "Step panel (SPTR)", group: "Staircase", size: "1395 × (250 + 158)", material: "Aluminium 4 mm, bent", use: "Riser and tread cover of one step (closed stair); Ø20 vent holes every 2nd tread.", match: / SPTR |^TS-/, build: make((b) => { b.box([0, 0, 0], [1000, 155, 4], SKIN); b.box([0, 155, 0], [1000, 159, 300], SKIN); b.box([0, 0, 4], [6, 155, 65], AL); b.box([994, 0, 4], [1000, 155, 65], AL); b.box([0, 159, 294], [1000, 200, 300], AL); b.hole([500, 159.6, 150], "y", 10); }) },
  { key: "sptrec", name: "Nosing angle (SPTREC)", group: "Staircase", size: "65 + 65 × 1395", material: "Aluminium angle", use: "Joins the step panels at every nosing and keeps the step edge sharp.", match: / SPTREC /, build: make((b) => { b.box([0, 0, 0], [1395, 6, 65], AL); b.box([0, -65, 0], [1395, 0, 6], AL); for (let x = 100; x < 1395; x += 200) { b.hole([x, 6.6, 40], "y", 7); b.hole([x, -40, -0.6], "z", 7); } }) },
  { key: "spcpp", name: "Stair prop strip (SPCPP)", group: "Staircase", size: "150 × flight width", material: "Aluminium extrusion", use: "Runs across the flight between the soffit deck rows; the stair props stand under it.", match: /SPCPP/, build: make((b) => { b.box([0, 94, 0], [1400, 100, 150], SKIN); b.box([0, 0, 0], [1400, 94, 6], AL); b.box([0, 0, 144], [1400, 94, 150], AL); for (const x of [0, 1394]) b.box([x, 6, 6], [x + 6, 94, 144], ALD); b.box([650, 0, 25], [750, 6, 125], DARK); for (let x = 75; x < 1400; x += 150) { b.hole([x, 50, -0.6], "z", 8); b.hole([x, 50, 150.6], "z", 8); } }) },
  { key: "stair-cc", name: "Stair C-channel", group: "Staircase", size: "1400 long", material: "Aluminium extrusion", use: "Closes the waist at the foot of the flight against the slab.", match: /^CC-/, build: make((b) => { b.box([0, 0, 0], [1400, 170, 6], AL); b.box([0, 0, 0], [1400, 6, 80], AL); b.box([0, 164, 0], [1400, 170, 80], AL); }) },
];

/**
 * Typical assembly of one bay: a 200 mm wall formed on both faces (wall panels + wall-top panels, pins and wedges at
 * the joints, tie rods with PVC sleeves, cones and wing nuts), soffit corner on the room side, deck panels on the
 * soffit corner and a mid beam, prop heads and props, two alignment walers. Concrete itself is not drawn.
 */
export function typicalAssembly(H = 2925): Face3[] {
  const b = new B();
  const put = (k: string, t: (p: V3) => V3) => { const part = PARTS.find((p) => p.key === k)!; for (const f of part.build()) b.f.push({ ...f, p: f.p.map(t) }); };
  const T = 200, top = H - 100 - 2400;
  // the aluminium pieces in the 3D-model colours so each family reads at a glance
  const tint = (base: string, fn: () => void) => {
    const n0 = b.f.length; fn();
    const sh = (f: number) => `#${[1, 3, 5].map((i) => Math.max(0, Math.min(255, Math.round(parseInt(base.slice(i, i + 2), 16) * f))).toString(16).padStart(2, "0")).join("")}`;
    for (let i = n0; i < b.f.length; i++) { const c = b.f[i].c; if (c === SKIN) b.f[i].c = sh(1.12); else if (c === AL) b.f[i].c = sh(1); else if (c === ALD) b.f[i].c = sh(0.85); }
  };
  tint("#7aa7e0", () => { for (const x of [0, 600, 1200]) {
    b.with(move([x, 0, 0]), () => panel(b, 600, 2400));                                   // room face
    b.with((p) => [x + p[0], p[1], -T - p[2]], () => panel(b, 600, 2400));                 // outer face
  } });
  tint("#f2c76b", () => { for (const x of [0, 600, 1200]) {
    b.with(move([x, 2400, 0]), () => panel(b, 600, top));
    b.with((p) => [x + p[0], 2400 + p[1], -T - p[2]], () => panel(b, 600, top + 100));
  } });
  tint("#a78bfa", () => { for (const x of [0, 600, 1200]) b.with(move([x, 0, 0]), () => b.with((p) => [p[1], H - p[0], p[2]], () => corner(b, 100, 100, 600))); });
  // deck: one row of panels from the soffit corner to the mid beam, a second row beyond it
  tint("#9fd3c7", () => { for (const x of [0, 600, 1200]) { put("deck-panel", (p) => [x + p[0], H + p[1], 100 + p[2]]); put("deck-panel", (p) => [x + p[0], H + p[1], 1450 + p[2]]); } });
  tint("#94a3b8", () => put("mid-beam", (p) => [375 + p[0], H - 100 + p[1], 1300 + p[2]]));
  for (const x of [225, 1575]) {
    put("prop-head", (p) => [x + p[0], H - 210 + p[1], 1375 + p[2]]);
    b.with(move([x, 0, 1375]), () => prop(b, H - 310));
  }
  // pins & wedges at the panel joints (room face)
  for (const x of [600, 1200]) for (const y of [225, 1125, 2025]) {
    put("pin", (p) => [x - 15 + p[0], y + p[1], 44 + p[2]]);
    put("wedge", (p) => [x + 45 + p[2], y - 45 + p[0], 32 + p[1]]);
  }
  // ties at the joints: rod, sleeve, cones, wing nuts on both faces
  for (const x of [600, 1200]) for (const y of [375, 1275, 2175]) {
    b.cyl([x, y, -T - 140], "z", 8.5, T + 280, STEEL);
    b.cyl([x, y, -T + 40], "z", 12.5, T - 80, PVC);
    b.cyl([x, y, 0], "z", 12.5, -40, "#9ca3af", 20); b.cyl([x, y, -T], "z", 12.5, 40, "#9ca3af", 20);
    put("wing-nut", (p) => { const q = rotY(-90)(p); return [x + q[0], y + q[1], 65 + q[2]]; });
    put("wing-nut", (p) => { const q = rotY(90)(p); return [x + q[0], y + q[1], -T - 65 + q[2]]; });
  }
  // alignment walers on the room face, held off the rails by the brackets
  for (const y of [600, H - 700]) { put("waler", (p) => [-300 + p[0], y + p[1], 140 + p[2]]); for (const x of [300, 1500]) b.box([x - 30, y - 10, 65], [x + 30, y + 110, 140], ZINC); }
  return b.f;
}

/** How many of each catalogue component this project's parts list needs (summed over the matching codes). */
export function partQty(bom: { code: string; qty: number }[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const p of PARTS) if (p.match) { const n = bom.filter((r) => p.match!.test(r.code)).reduce((s, r) => s + r.qty, 0); if (n) out[p.key] = n; }
  return out;
}
export const PART_GROUPS: PartGroup[] = ["Panels", "Corners & edges", "Deck support", "Joints", "Ties", "Wall alignment", "Safety", "Staircase"];
