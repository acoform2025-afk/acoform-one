/**
 * Staircase assembly drawing (A3 landscape, one sheet per staircase) — the way a formwork package shows a stair:
 *   PLAN with flights, landing, soffit-panel layout, props and the main dimensions;
 *   SECTION A–A along the flight: steps, waist, soffit panels along the slope, riser shutters, cheek, props, levels;
 *   EXPLODED VIEW of the formwork pieces (soffit, cheek, riser shutters, landing) with their tags;
 *   PARTS LIST per staircase and the ASSEMBLY SEQUENCE.
 * All sizes in mm. A dog-leg stair: flight 1 up one half of the stair well, landing across the far end, flight 2 back.
 */
import path from "node:path";
import { Document, Font, G, Image, Line, Page, Path, Polygon, Rect, Svg, Text, View, Circle } from "@react-pdf/renderer";
import type { StairLayout } from "@/lib/design-engine/floor-panels";

const PUBLIC = path.join(process.cwd(), "public");
Font.register({ family: "Carlito", fonts: [{ src: path.join(PUBLIC, "fonts", "Carlito-Regular.ttf") }, { src: path.join(PUBLIC, "fonts", "Carlito-Bold.ttf"), fontWeight: "bold" }] });
Font.registerHyphenationCallback((w) => [w]);
const LOGO = path.join(PUBLIC, "brand", "acoform-logo.png");
const ORANGE = "#ef9d2f", GRAY = "#6b6d68", INK = "#1f2937", CONC = "#e7e5e4", CONCS = "#78716c";
const C = { soffit: "#c9b79c", cheek: "#d9a066", riser: "#e7d3b8", landing: "#b9c7a0", prop: "#d97706", dim: "#2563eb" };

export type StairInfo = { company: string; project: string; client: string; planName: string; drawingNo: string; rev: string; date: string; system: string; floorMm: number; slabMm: number; propSpacing: number };

const PW = 1191, PH = 842, M = 20, FOOT = 46;
const fmt = (v: number) => Math.round(v).toLocaleString("en-IN");

/** Dimension line between two points (drawing units), text in the middle, offset sideways by `off` (drawing units). */
function Dim({ x1, y1, x2, y2, off, text, k, vertical }: { x1: number; y1: number; x2: number; y2: number; off: number; text: string; k: number; vertical?: boolean }) {
  const dx = x2 - x1, dy = y2 - y1, L = Math.hypot(dx, dy) || 1, nx = -dy / L, ny = dx / L;
  const a = [x1 + nx * off, y1 + ny * off], b = [x2 + nx * off, y2 + ny * off], t = 3 * k;
  const mx = (a[0] + b[0]) / 2 + nx * 4 * k, my = (a[1] + b[1]) / 2 + ny * 4 * k;
  const ang = (Math.atan2(dy, dx) * 180) / Math.PI;
  const rot = vertical ? -90 : ang > 90 || ang < -90 ? ang + 180 : ang;
  return (
    <G>
      <Line x1={x1} y1={y1} x2={a[0] + nx * 2 * k} y2={a[1] + ny * 2 * k} stroke={C.dim} strokeWidth={0.3 * k} />
      <Line x1={x2} y1={y2} x2={b[0] + nx * 2 * k} y2={b[1] + ny * 2 * k} stroke={C.dim} strokeWidth={0.3 * k} />
      <Line x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} stroke={C.dim} strokeWidth={0.45 * k} />
      <Line x1={a[0] - t * (dx / L + nx) / 2} y1={a[1] - t * (dy / L + ny) / 2} x2={a[0] + t * (dx / L + nx) / 2} y2={a[1] + t * (dy / L + ny) / 2} stroke={C.dim} strokeWidth={0.6 * k} />
      <Line x1={b[0] - t * (dx / L + nx) / 2} y1={b[1] - t * (dy / L + ny) / 2} x2={b[0] + t * (dx / L + nx) / 2} y2={b[1] + t * (dy / L + ny) / 2} stroke={C.dim} strokeWidth={0.6 * k} />
      <Text x={mx} y={my} style={{ fontSize: 6.5 * k }} fill={C.dim} textAnchor="middle" transform={`rotate(${rot} ${mx} ${my})`}>{text}</Text>
    </G>
  );
}

/** Fitted view: content in mm inside a box of w × h points. Returns the svg with a k (mm per point) for line widths / text. */
function View2({ box, w, h, children }: { box: [number, number, number, number]; w: number; h: number; children: (k: number) => React.ReactNode }) {
  const [x0, y0, x1, y1] = box, bw = x1 - x0, bh = y1 - y0, sc = Math.min(w / bw, h / bh), k = 1 / sc;
  return <Svg width={bw * sc} height={bh * sc} viewBox={`${x0} ${y0} ${bw} ${bh}`}>{children(k)}</Svg>;
}

function Box({ title, w, h, children }: { title: string; w: number; h: number; children: React.ReactNode }) {
  return (
    <View style={{ width: w, height: h, borderWidth: 0.8, borderColor: "#d6d3d1", padding: 6 }}>
      <Text style={{ fontSize: 9, fontWeight: "bold", color: INK }}>{title}</Text>
      <View style={{ flexGrow: 1, alignItems: "center", justifyContent: "center" }}>{children}</View>
    </View>
  );
}

/** Pieces of one staircase in mm. */
function geom(s: StairLayout, floorMm: number, slabMm: number) {
  const W = s.width, rise = s.riser, tread = s.tread, per = s.risers, run = (per - 1) * tread;
  const land = s.landing ? s.landing.l : Math.max(900, W);
  const twoFlights = s.flights > 1;
  const Lb = run + land, Wb = twoFlights ? 2 * W : W;
  const across = [...s.across.panels, ...(s.across.filler ? [s.across.filler] : [])];
  const lAcross = s.landing ? [...s.landing.across.panels, ...(s.landing.across.filler ? [s.landing.across.filler] : [])] : [land];
  const lAlong = s.landing ? s.landing.along : [W];
  const hyp = Math.hypot(rise, tread), cos = tread / hyp;
  const topOf = per * rise;                    // landing level (from the floor)
  return { W, rise, tread, per, run, land, Lb, Wb, across, lAcross, lAlong, hyp, cos, topOf, twoFlights, floorMm, slabMm, waist: s.waist };
}

function PlanView({ s, info }: { s: StairLayout; info: StairInfo }) {
  const g = geom(s, info.floorMm, info.slabMm);
  const pad = 900;
  return (
    <View2 box={[-pad, -pad, g.Lb + pad, g.Wb + pad]} w={540} h={300}>
      {(k) => (
        <G>
          {/* surrounding walls (stair well) */}
          <Rect x={-200} y={-200} width={g.Lb + 400} height={g.Wb + 400} fill={CONC} stroke={CONCS} strokeWidth={0.6 * k} />
          <Rect x={0} y={0} width={g.Lb} height={g.Wb} fill="#ffffff" stroke={CONCS} strokeWidth={0.6 * k} />
          {/* flight 1 soffit panels (dashed outlines) and treads */}
          {(() => {
            const out: React.ReactNode[] = []; let v = 0;
            for (const w of g.across) { out.push(<Rect key={`a${v}`} x={0} y={v} width={g.run} height={Math.min(w, g.W - v)} fill={C.soffit} fillOpacity={0.35} stroke={C.soffit} strokeWidth={0.5 * k} strokeDasharray={`${4 * k} ${3 * k}`} />); v += w; }
            if (g.twoFlights) { v = g.W; for (const w of g.across) { out.push(<Rect key={`b${v}`} x={0} y={v} width={g.run} height={Math.min(w, g.Wb - v)} fill={C.soffit} fillOpacity={0.35} stroke={C.soffit} strokeWidth={0.5 * k} strokeDasharray={`${4 * k} ${3 * k}`} />); v += w; } }
            return out;
          })()}
          {Array.from({ length: g.per }, (_, i) => <Line key={`t1${i}`} x1={i * g.tread} y1={0} x2={i * g.tread} y2={g.W} stroke={INK} strokeWidth={0.4 * k} />)}
          {g.twoFlights ? Array.from({ length: g.per }, (_, i) => <Line key={`t2${i}`} x1={i * g.tread} y1={g.W} x2={i * g.tread} y2={g.Wb} stroke={INK} strokeWidth={0.4 * k} />) : null}
          {g.twoFlights ? <Line x1={0} y1={g.W} x2={g.run} y2={g.W} stroke={C.cheek} strokeWidth={2.2 * k} /> : null}
          {/* landing soffit panels */}
          {(() => { const out: React.ReactNode[] = []; const halves = g.twoFlights ? [0, g.W] : [0]; for (const v0 of halves) { let u = g.run; for (const w of g.lAcross) { let v = v0; for (const L of g.lAlong) { out.push(<Rect key={`l${u}-${v}`} x={u} y={v} width={Math.min(w, g.Lb - u)} height={Math.min(L, v0 + g.W - v)} fill={C.landing} fillOpacity={0.45} stroke="#6b7f4f" strokeWidth={0.5 * k} />); v += L; } u += w; } } return out; })()}
          {/* walking line arrows */}
          <Path d={`M${g.tread / 2} ${g.W / 2} L${g.run + g.land / 2} ${g.W / 2} L${g.run + g.land / 2} ${g.twoFlights ? g.W * 1.5 : g.W / 2} L${g.tread / 2} ${g.twoFlights ? g.W * 1.5 : g.W / 2}`} fill="none" stroke="#dc2626" strokeWidth={0.6 * k} />
          <Text x={g.tread * 0.6} y={g.W / 2 - 60} style={{ fontSize: 7 * k }} fill="#dc2626">UP</Text>
          {/* props (soffit + landing) */}
          {(() => {
            const out: React.ReactNode[] = []; const sp = info.propSpacing * 1000;
            const nAl = Math.max(1, Math.ceil(g.run / sp)), nAc = Math.max(1, Math.ceil(g.W / 1200));
            for (const f of g.twoFlights ? [0, 1] : [0]) for (let i = 0; i <= nAl; i++) for (let j = 0; j <= nAc; j++) out.push(<Circle key={`p${f}${i}${j}`} cx={150 + (i * (g.run - 300)) / nAl} cy={f * g.W + 150 + (j * (g.W - 300)) / nAc} r={45} fill={C.prop} />);
            const nA = Math.max(1, Math.ceil(g.land / 1200)), nB = Math.max(1, Math.ceil(g.Wb / 1200));
            for (let i = 0; i <= nA; i++) for (let j = 0; j <= nB; j++) out.push(<Circle key={`lp${i}${j}`} cx={g.run + 150 + (i * (g.land - 300)) / nA} cy={150 + (j * (g.Wb - 300)) / nB} r={45} fill={C.prop} />);
            return out;
          })()}
          {/* section mark */}
          <Line x1={-500} y1={g.W / 2} x2={-150} y2={g.W / 2} stroke={INK} strokeWidth={1.2 * k} />
          <Text x={-560} y={g.W / 2 + 35} style={{ fontSize: 9 * k, fontWeight: "bold" }} fill={INK}>A</Text>
          <Line x1={g.Lb + 150} y1={g.W / 2} x2={g.Lb + 500} y2={g.W / 2} stroke={INK} strokeWidth={1.2 * k} />
          <Text x={g.Lb + 520} y={g.W / 2 + 35} style={{ fontSize: 9 * k, fontWeight: "bold" }} fill={INK}>A</Text>
          {/* dimensions */}
          <Dim x1={0} y1={0} x2={g.run} y2={0} off={-380} k={k} text={`${per(g)} × ${g.tread} = ${fmt(g.run)}`} />
          <Dim x1={g.run} y1={0} x2={g.Lb} y2={0} off={-380} k={k} text={`landing ${fmt(g.land)}`} />
          <Dim x1={0} y1={g.Wb} x2={g.Lb} y2={g.Wb} off={420} k={k} text={`stair well ${fmt(g.Lb)}`} />
          <Dim x1={g.Lb} y1={0} x2={g.Lb} y2={g.W} off={-420} k={k} text={`${fmt(g.W)}`} vertical />
          {g.twoFlights ? <Dim x1={g.Lb} y1={g.W} x2={g.Lb} y2={g.Wb} off={-420} k={k} text={`${fmt(g.W)}`} vertical /> : null}
          <Dim x1={0} y1={0} x2={0} y2={g.Wb} off={650} k={k} text={`${fmt(g.Wb)}`} vertical />
        </G>
      )}
    </View2>
  );
}
const per = (g: ReturnType<typeof geom>) => g.per - 1;

function SectionView({ s, info }: { s: StairLayout; info: StairInfo }) {
  const g = geom(s, info.floorMm, info.slabMm);
  const H = g.floorMm, slab = g.slabMm, waist = g.waist;
  const k1 = g.rise / g.tread, wv = waist / g.cos;            // vertical thickness of the waist
  // y up → svg y down: Y(y) = -y
  const steps: string[] = [`M0 0`];
  for (let i = 0; i < g.per - 1; i++) { steps.push(`L${i * g.tread} ${-(i + 1) * g.rise}`, `L${(i + 1) * g.tread} ${-(i + 1) * g.rise}`); }
  steps.push(`L${g.Lb} ${-g.topOf}`, `L${g.Lb} ${-(g.topOf - 150)}`, `L${g.run} ${-(g.topOf - 150)}`, `L${g.run} ${-(g.run * k1 - wv)}`, `L0 ${wv}`, "Z");
  const pad = 900;
  const soff: React.ReactNode[] = [];
  let s0 = 0;
  for (const L of s.along) {
    const du0 = s0 * g.cos, du1 = Math.min(g.run, (s0 + L) * g.cos); s0 += L;
    const y0 = du0 * k1 - wv, y1 = du1 * k1 - wv;
    soff.push(<G key={`s${s0}`}><Line x1={du0} y1={-y0 + 25} x2={du1} y2={-y1 + 25} stroke={C.soffit} strokeWidth={60} /><Text x={(du0 + du1) / 2} y={-(y0 + y1) / 2 + 230} style={{ fontSize: 110 }} fill="#7c6a4f" textAnchor="middle">{`SS ${L}`}</Text></G>);
  }
  return (
    <View2 box={[-pad - 400, -(H + slab) - pad, g.Lb + pad, pad]} w={540} h={300}>
      {(k) => (
        <G>
          {/* floor slab below and above */}
          <Rect x={-pad} y={0} width={g.Lb + 2 * pad} height={slab} fill={CONC} stroke={CONCS} strokeWidth={0.5 * k} />
          <Rect x={g.Lb} y={-(H)} width={pad} height={slab} fill={CONC} stroke={CONCS} strokeWidth={0.5 * k} />
          {/* stair concrete (flight 1 + landing) */}
          <Path d={steps.join(" ")} fill={CONC} stroke={CONCS} strokeWidth={0.6 * k} />
          {/* formwork: soffit panels along the slope, riser shutters, cheek outline, landing soffit */}
          {soff}
          {Array.from({ length: g.per - 1 }, (_, i) => <Line key={`r${i}`} x1={i * g.tread - 15} y1={-(i * g.rise)} x2={i * g.tread - 15} y2={-((i + 1) * g.rise)} stroke="#9a3412" strokeWidth={30} />)}
          <Path d={`M0 ${wv} L${g.run} ${-(g.run * k1 - wv)} L${g.run} ${-(g.run * k1 - wv) - (s.cheekH)} L0 ${wv - s.cheekH} Z`} fill="none" stroke={C.cheek} strokeWidth={0.8 * k} strokeDasharray={`${5 * k} ${3 * k}`} />
          <Line x1={g.run} y1={-(g.topOf - 150) + 25} x2={g.Lb} y2={-(g.topOf - 150) + 25} stroke={C.landing} strokeWidth={60} />
          {/* props */}
          {(() => { const out: React.ReactNode[] = []; const n = Math.max(1, Math.ceil(g.run / (info.propSpacing * 1000))); for (let i = 0; i <= n; i++) { const u = 150 + (i * (g.run - 300)) / n, top = u * k1 - wv - 60; if (top > 250) out.push(<G key={`pp${i}`}><Line x1={u} y1={0} x2={u} y2={-top} stroke={C.prop} strokeWidth={45} /><Rect x={u - 90} y={-top - 40} width={180} height={40} fill="#6b7280" /></G>); } const nA = Math.max(1, Math.ceil(g.land / 1200)); for (let i = 0; i <= nA; i++) { const u = g.run + 150 + (i * (g.land - 300)) / nA; out.push(<G key={`lpp${i}`}><Line x1={u} y1={0} x2={u} y2={-(g.topOf - 150 - 60)} stroke={C.prop} strokeWidth={45} /><Rect x={u - 90} y={-(g.topOf - 150 - 20)} width={180} height={40} fill="#6b7280" /></G>); } return out; })()}
          {/* levels & dimensions */}
          <Dim x1={0} y1={0} x2={0} y2={-H} off={900} k={k} text={`floor to floor ${fmt(H)}`} vertical />
          <Dim x1={g.Lb + pad * 0.6} y1={0} x2={g.Lb + pad * 0.6} y2={-g.topOf} off={-120} k={k} text={`landing +${fmt(g.topOf)}`} vertical />
          <Dim x1={0} y1={-g.rise} x2={g.tread} y2={-g.rise} off={-200} k={k} text={`tread ${g.tread}`} />
          <Dim x1={g.tread} y1={-g.rise} x2={g.tread} y2={-2 * g.rise} off={-200} k={k} text={`riser ${g.rise}`} vertical />
          <Dim x1={0} y1={wv} x2={g.run} y2={-(g.run * k1 - wv)} off={-260} k={k} text={`soffit ${fmt(s.slope)} · ${s.angle}°`} />
          <Text x={g.run * 0.45} y={-(g.run * 0.45 * k1) + 420} style={{ fontSize: 7 * k }} fill={GRAY}>{`waist ${waist}`}</Text>
          <Text x={-pad + 40} y={-40} style={{ fontSize: 7 * k }} fill={GRAY}>FFL ±0</Text>
          <Text x={g.Lb + 40} y={-H - 40} style={{ fontSize: 7 * k }} fill={GRAY}>{`FFL +${fmt(H)}`}</Text>
        </G>
      )}
    </View2>
  );
}

/** Exploded isometric of the formwork pieces of one flight + landing: soffit panels lifted, cheek pulled out, riser shutters raised. */
function ExplodedView({ s, info }: { s: StairLayout; info: StairInfo }) {
  const g = geom(s, info.floorMm, info.slabMm);
  const c30 = Math.cos(Math.PI / 6), s30 = 0.5;
  // iso projection: x along the flight, y across, z up → screen
  const P = (x: number, y: number, z: number) => [(x - y) * c30, (x + y) * s30 - z];
  const poly = (pts: number[][]) => pts.map((p) => P(p[0], p[1], p[2]).map((v) => v.toFixed(1)).join(",")).join(" ");
  const k1 = g.rise / g.tread, wv = g.waist / g.cos;
  const items: { pts: number[][]; fill: string; label?: string; at?: number[] }[] = [];
  // soffit panels (dropped 900 below their place)
  let s0 = 0, ai = 0;
  const seenL = new Set<string>();
  for (const L of s.along) {
    const du0 = s0 * g.cos + ai * 260, du1 = Math.min(g.run, (s0 + L) * g.cos) + ai * 260; s0 += L;
    let v = 0, bi = 0;
    for (const w of g.across) {
      const vv = v + bi * 220, v1 = Math.min(g.W, v + w) + bi * 220, z0 = (du0 - ai * 260) * k1 - wv - 1100, z1 = (du1 - ai * 260) * k1 - wv - 1100;
      const lab = `SS ${w}×${L}`, first = !seenL.has(lab); seenL.add(lab);
      items.push({ pts: [[du0, vv, z0], [du1, vv, z1], [du1, v1, z1], [du0, v1, z0]], fill: C.soffit, label: first ? lab : undefined, at: [(du0 + du1) / 2, (vv + v1) / 2, (z0 + z1) / 2] });
      v = Math.min(g.W, v + w); bi++;
    }
    ai++;
  }
  // cheek pulled 900 out on the open side
  if (s.openSides > 0) {
    const y = g.W + 900;
    items.push({ pts: [[0, y, -wv], [g.run, y, g.run * k1 - wv], [g.run, y, g.run * k1 - wv + s.cheekH], [0, y, -wv + s.cheekH]], fill: C.cheek, label: `CK ${s.cheekH}×${s.slope}`, at: [g.run / 2, y, g.run * k1 / 2 + s.cheekH] });
  }
  // riser shutters lifted 700
  for (let i = 0; i < g.per - 1; i++) items.push({ pts: [[i * g.tread, 0, i * g.rise + 700], [i * g.tread, g.W, i * g.rise + 700], [i * g.tread, g.W, (i + 1) * g.rise + 700], [i * g.tread, 0, (i + 1) * g.rise + 700]], fill: C.riser, label: i === 0 ? `RS ${g.W}×${g.rise} (${g.per - 1} nos)` : undefined, at: [i * g.tread, -300, i * g.rise + 900] });
  // landing soffit panels dropped 900
  let u = g.run + 900;
  for (const w of g.lAcross) {
    const u1 = u + w; let v = 0;
    for (const L of g.lAlong) { const v1 = v + L, lab = `LS ${w}×${L}`, first = !seenL.has(lab); seenL.add(lab); items.push({ pts: [[u, v, g.topOf - 1100], [u1, v, g.topOf - 1100], [u1, v1, g.topOf - 1100], [u, v1, g.topOf - 1100]], fill: C.landing, label: first ? lab : undefined, at: [(u + u1) / 2, (v + v1) / 2, g.topOf - 1100] }); v = v1 + 200; }
    u = u1 + 200;
  }
  const all = items.flatMap((it) => it.pts.map((p) => P(p[0], p[1], p[2])));
  const xs = all.map((p) => p[0]), ys = all.map((p) => p[1]);
  const box: [number, number, number, number] = [Math.min(...xs) - 600, Math.min(...ys) - 600, Math.max(...xs) + 600, Math.max(...ys) + 600];
  // painter's order: far first
  const order = items.map((it, i) => ({ it, i, d: it.pts.reduce((a, p) => a + p[0] + p[1] + p[2] * 0.2, 0) / it.pts.length })).sort((a, b) => a.d - b.d);
  return (
    <View2 box={box} w={560} h={300}>
      {(k) => (
        <G>
          {order.map(({ it, i }) => <Polygon key={i} points={poly(it.pts)} fill={it.fill} stroke={INK} strokeWidth={0.4 * k} />)}
          {order.filter(({ it }) => it.label && it.at).map(({ it, i }) => { const [x, y] = P(it.at![0], it.at![1], it.at![2]); return <Text key={`t${i}`} x={x} y={y} style={{ fontSize: 6 * k }} fill={INK} textAnchor="middle">{it.label}</Text>; })}
        </G>
      )}
    </View2>
  );
}

type Part = { code: string; desc: string; size: string; qty: number };
function partsOf(s: StairLayout): Part[] {
  const n = s.flights;
  const out = new Map<string, Part>();
  const add = (code: string, desc: string, size: string, q: number) => { const p = out.get(code); if (p) p.qty += q; else out.set(code, { code, desc, size, qty: q }); };
  const across = [...s.across.panels, ...(s.across.filler ? [s.across.filler] : [])];
  for (const L of s.along) {
    for (const w of across) add(`SS-${w}-${L}`, "Stair soffit panel", `${w} × ${L}`, n);
    if (s.openSides > 0) add(`CK-${s.cheekH}-${L}`, "Cheek / stringer side form", `${s.cheekH} × ${L}`, n * s.openSides);
  }
  add(`RS-${s.width}-${s.riser}`, "Riser shutter", `${s.width} × ${s.riser}`, n * s.risers);
  add("RBR", "Riser bracket (riser shutter to cheek / wall)", "—", 2 * n * s.risers);
  if (s.landing) {
    const la = [...s.landing.across.panels, ...(s.landing.across.filler ? [s.landing.across.filler] : [])];
    for (const L of s.landing.along) for (const w of la) add(`LS-${w}-${L}`, "Landing soffit panel", `${w} × ${L}`, n);
  }
  add("PROP-ST", "Stair prop with swivel head", "adjustable", s.props * Math.max(1, n));
  return [...out.values()];
}

const SEQ = [
  "Fix the props of the landing and of flight 1 at the marked positions; set heights to the landing and soffit levels.",
  "Lay the landing soffit panels on the prop heads; pin them to the wall soffit corners / wall panels.",
  "Lay the stair soffit panels up the slope from the bottom; pin panel to panel (pins @ 300) and to the landing panels at the top.",
  "Fix the cheek (stringer) panels along the open side; pin them to the soffit panels.",
  "Set the riser shutters step by step from the bottom with riser brackets to the cheek / wall; check every riser and tread.",
  "Repeat for flight 2 from the landing upward.",
  "Check line and level, release agent on all faces, then cast with the floor slab. Treads are left open and finished by hand.",
  "Strip riser shutters and cheeks after initial set; soffit panels and props stay until the slab support is released.",
];

export function StairSheetDocument({ stairs, info }: { stairs: StairLayout[]; info: StairInfo }) {
  const pageStyle = { fontFamily: "Carlito", fontSize: 8, color: INK, padding: M, paddingBottom: M + FOOT };
  return (
    <Document title={`Staircase assembly — ${info.planName}`} author={info.company}>
      {stairs.map((s, si) => {
        const parts = partsOf(s);
        return (
          <Page key={si} size="A3" orientation="landscape" style={pageStyle}>
            <Text style={{ fontSize: 14, fontWeight: "bold" }}>STAIRCASE {s.code} — FORMWORK ASSEMBLY</Text>
            <Text style={{ color: s.assumed ? "#dc2626" : GRAY, marginBottom: 6 }}>
              {s.label} · {s.flights} flight{s.flights > 1 ? "s" : ""} × {s.risers} risers {s.riser} / tread {s.tread} · width {s.width} · waist {s.waist} · slope {s.slope} at {s.angle}° · floor height {fmt(info.floorMm)} · slab {info.slabMm}
              {s.assumed ? " · TYPICAL STAIR (sizes assumed) — measure the real stair for an exact sheet" : ""}
            </Text>
            <View style={{ flexDirection: "row", gap: 8 }}>
              <Box title="PLAN — soffit panels (dashed), landing panels (green), props (orange), cheek (brown)" w={565} h={330}><PlanView s={s} info={info} /></Box>
              <Box title="EXPLODED VIEW — formwork pieces of one flight + landing" w={578} h={330}><ExplodedView s={s} info={info} /></Box>
            </View>
            <View style={{ flexDirection: "row", gap: 8, marginTop: 8 }}>
              <Box title="SECTION A–A — flight 1 and landing" w={565} h={360}><SectionView s={s} info={info} /></Box>
              <View style={{ width: 578, height: 360, borderWidth: 0.8, borderColor: "#d6d3d1", padding: 6 }}>
                <Text style={{ fontSize: 9, fontWeight: "bold" }}>PARTS LIST — staircase {s.code} ({s.flights} flight{s.flights > 1 ? "s" : ""}{s.sets > 1 ? `, × ${s.sets} identical staircases` : ""})</Text>
                <View style={{ flexDirection: "row", borderBottomWidth: 0.8, marginTop: 4, paddingBottom: 2, fontWeight: "bold" }}>
                  <Text style={{ width: 95 }}>Code</Text><Text style={{ width: 230 }}>Description</Text><Text style={{ width: 100 }}>Size (mm)</Text><Text style={{ width: 50, textAlign: "right" }}>Qty</Text><Text style={{ width: 70, textAlign: "right" }}>All stairs</Text>
                </View>
                {parts.map((p) => (
                  <View key={p.code} style={{ flexDirection: "row", borderBottomWidth: 0.3, borderColor: "#e5e5e5", paddingVertical: 1.5 }}>
                    <Text style={{ width: 95 }}>{p.code}</Text><Text style={{ width: 230 }}>{p.desc}</Text><Text style={{ width: 100 }}>{p.size}</Text><Text style={{ width: 50, textAlign: "right" }}>{p.qty}</Text><Text style={{ width: 70, textAlign: "right" }}>{p.qty * s.sets}</Text>
                  </View>
                ))}
                <Text style={{ fontSize: 9, fontWeight: "bold", marginTop: 8 }}>ASSEMBLY SEQUENCE</Text>
                {SEQ.map((t, i) => <Text key={i} style={{ marginTop: 2 }}>{i + 1}. {t}</Text>)}
                <Text style={{ marginTop: 6, color: GRAY }}>Pins and wedges at 300 mm on every panel joint (counted in the floor parts list). All sizes in mm; check the riser / tread against the architect&apos;s stair detail before production.</Text>
              </View>
            </View>
            <View fixed style={{ position: "absolute", left: M, right: M, bottom: M, height: FOOT - 6, borderTopWidth: 1.2, borderColor: ORANGE, flexDirection: "row", alignItems: "center", paddingTop: 4, fontSize: 7.5 }}>
              <Image src={LOGO} style={{ width: 70, height: 22, objectFit: "contain" }} />
              <View style={{ marginLeft: 10, flexGrow: 1 }}>
                <Text style={{ fontWeight: "bold", fontSize: 9 }}>STAIRCASE ASSEMBLY · {info.planName}</Text>
                <Text style={{ color: GRAY }}>{info.project} · {info.client} · {info.system}</Text>
              </View>
              <View style={{ width: 230, alignItems: "flex-end" }}>
                <Text>{info.company}</Text>
                <Text style={{ color: GRAY }}>Dwg {info.drawingNo} · Rev {info.rev} · {info.date} · Sheet {si + 1}/{stairs.length}</Text>
              </View>
            </View>
          </Page>
        );
      })}
    </Document>
  );
}
void PW; void PH;
