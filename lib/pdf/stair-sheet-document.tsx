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
import { fillRun, type StairLayout } from "@/lib/design-engine/floor-panels";

const PUBLIC = path.join(process.cwd(), "public");
Font.register({ family: "Carlito", fonts: [{ src: path.join(PUBLIC, "fonts", "Carlito-Regular.ttf") }, { src: path.join(PUBLIC, "fonts", "Carlito-Bold.ttf"), fontWeight: "bold" }] });
Font.registerHyphenationCallback((w) => [w]);
const LOGO = path.join(PUBLIC, "brand", "acoform-logo.png");
const ORANGE = "#ef9d2f", GRAY = "#6b6d68", INK = "#1f2937", CONC = "#e7e5e4", CONCS = "#78716c";
const C = { soffit: "#c9b79c", cheek: "#d9a066", riser: "#e7d3b8", tread: "#f3e6cc", landing: "#b9c7a0", prop: "#d97706", dim: "#2563eb", cc: "#64748b", stp: "#a16207", tz: "#93c5fd" };

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
  // soffit across the flight: 200 edge | 400 … | filler | 200 edge
  const across = s.across.filler && s.across.panels.length > 1 ? [...s.across.panels.slice(0, -1), s.across.filler, s.across.panels[s.across.panels.length - 1]] : [...s.across.panels, ...(s.across.filler ? [s.across.filler] : [])];
  const lAcross = s.landing ? [...s.landing.across.panels, ...(s.landing.across.filler ? [s.landing.across.filler] : [])] : [land];
  const lAlong = s.landing ? s.landing.along : [W];
  const hyp = Math.hypot(rise, tread), cos = tread / hyp;
  const topOf = per * rise;                    // landing level (from the floor)
  return { W, rise, tread, per, run, land, Lb, Wb, across, lAcross, lAlong, hyp, cos, topOf, twoFlights, floorMm, slabMm, waist: s.waist, closed: s.closed ?? true };
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
          {/* dog-tooth side panels on both sides of every flight, C-channel at the foot */}
          {(g.twoFlights ? [0, g.W, g.W, g.Wb] : [0, g.W]).map((v, i) => <Line key={`dt${i}`} x1={0} y1={v + (i % 2 ? -30 : 30)} x2={g.run} y2={v + (i % 2 ? -30 : 30)} stroke={C.cheek} strokeWidth={2.2 * k} />)}
          {(g.twoFlights ? [0, g.W] : [0]).map((v) => <Rect key={`cc${v}`} x={-70} y={v} width={70} height={g.W} fill={C.cc} />)}
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
          {/* dog-tooth side panel outline (in front of the section plane): soffit line + teeth along the steps */}
          <Path d={`M0 ${wv} L${g.run} ${-(g.run * k1 - wv)} L${g.run} ${-(g.per - 1) * g.rise} ${Array.from({ length: g.per - 1 }, (_, i) => { const j = g.per - 2 - i; return `L${(j + 1) * g.tread} ${-(j + 1) * g.rise} L${j * g.tread} ${-(j + 1) * g.rise} L${j * g.tread} ${-j * g.rise}`; }).join(" ")} Z`} fill="none" stroke={C.cheek} strokeWidth={0.9 * k} strokeDasharray={`${5 * k} ${3 * k}`} />
          {/* step panels: L-shaped (riser leg + tread cover) on a closed stair, riser shutters on an open one */}
          {Array.from({ length: g.per - 1 }, (_, i) => <Line key={`r${i}`} x1={i * g.tread - 15} y1={-(i * g.rise)} x2={i * g.tread - 15} y2={-((i + 1) * g.rise) - (g.closed ? 30 : 0)} stroke="#9a3412" strokeWidth={30} />)}
          {g.closed ? Array.from({ length: g.per - 1 }, (_, i) => <G key={`tc${i}`}><Line x1={i * g.tread - 30} y1={-((i + 1) * g.rise) - 15} x2={(i + 1) * g.tread - 15} y2={-((i + 1) * g.rise) - 15} stroke="#9a3412" strokeWidth={30} />{i % 2 === 1 ? <Circle cx={(i + 0.5) * g.tread} cy={-((i + 1) * g.rise) - 15} r={22} fill="#ffffff" /> : null}</G>) : null}
          <Line x1={g.run - 15} y1={-((g.per - 1) * g.rise)} x2={g.run - 15} y2={-g.topOf} stroke="#9a3412" strokeWidth={30} />
          {/* C-channel at the foot, stop panel at the top end of the waist */}
          <Rect x={-80} y={-10} width={80} height={wv + 40} fill={C.cc} />
          <Line x1={g.run + 20} y1={-(g.run * k1 - wv)} x2={g.run + 20} y2={-((g.per - 1) * g.rise)} stroke={C.stp} strokeWidth={40} />
          <Text x={-120} y={wv + 260} style={{ fontSize: 6.5 * k }} fill={C.cc} textAnchor="end">C-channel CC</Text>

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
  // dog-tooth side panels pulled out 900 on both sides: soffit edge + one tooth per step
  const dt = (y: number) => {
    const pts: number[][] = [[0, y, -wv], [g.run, y, g.run * k1 - wv], [g.run, y, (g.per - 1) * g.rise]];
    for (let j = g.per - 2; j >= 0; j--) pts.push([(j + 1) * g.tread, y, (j + 1) * g.rise], [j * g.tread, y, (j + 1) * g.rise], [j * g.tread, y, j * g.rise]);
    return pts;
  };
  items.push({ pts: dt(-900), fill: C.cheek, label: `DT ${s.cheekH}×${s.slope} (×2)`, at: [g.run / 2, -900, g.run * k1 / 2 + s.cheekH + 250] });
  items.push({ pts: dt(g.W + 900), fill: C.cheek });
  // step panels lifted 700: L-shaped (riser + tread) on a closed stair, riser shutters on an open one
  for (let i = 0; i < g.per - 1; i++) {
    const z0 = i * g.rise + 700, z1 = (i + 1) * g.rise + 700, x0 = i * g.tread;
    items.push({ pts: [[x0, 0, z0], [x0, g.W, z0], [x0, g.W, z1], [x0, 0, z1]], fill: C.riser, label: i === 0 ? (g.closed ? `TS L-step ${g.W}: ${g.tread}+${g.rise} (${g.per - 1} nos)` : `RS ${g.W}×${g.rise} (${g.per} nos)`) : undefined, at: [x0, -300, z0 + 250] });
    if (g.closed) items.push({ pts: [[x0, 0, z1], [x0 + g.tread, 0, z1], [x0 + g.tread, g.W, z1], [x0, g.W, z1]], fill: C.tread });
  }
  // C-channel at the foot (dropped), stop panel at the top
  items.push({ pts: [[-500, 0, -wv - 700], [-500, g.W, -wv - 700], [-500, g.W, -700], [-500, 0, -700]], fill: C.cc, label: "CC C-channel", at: [-500, -250, -wv - 700] });
  const zt = g.run * k1 - wv;
  items.push({ pts: [[g.run + 400, 0, zt], [g.run + 400, g.W, zt], [g.run + 400, g.W, (g.per - 1) * g.rise], [g.run + 400, 0, (g.per - 1) * g.rise]], fill: C.stp, label: "STP stop panel", at: [g.run + 400, g.W + 250, (g.per - 1) * g.rise + 200] });
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
  // the same codes and counts as the floor parts list (design-engine/floor-panels.ts)
  const r5 = (v: number) => Math.round(v / 5) * 5;
  for (const L of s.along) {
    for (const [i, w] of s.across.panels.entries()) add(`SS-${w}-${L}`, (i === 0 || i === s.across.panels.length - 1) && w === 200 ? "Stair soffit edge panel 200 (free edge / anti-penetration)" : "Stair soffit panel", `${w} × ${L}`, n);
    if (s.across.filler) add(`SS-${s.across.filler}-${L}`, "Stair soffit filler", `${s.across.filler} × ${L}`, n);
    add(`DT-${s.cheekH}-${L}`, "Dog-tooth side panel (teeth form the step ends)", `${s.cheekH} × ${L}`, n * 2);
  }
  const rw = r5(s.width), rh = r5(s.riser), tw = r5(s.tread), pieces = Math.max(1, Math.ceil(rw / 1200)), pw = r5(rw / pieces);
  if (s.closed ?? true) {
    add(`TS-${pw}-${tw}x${rh}`, "L-shaped step panel (riser + tread cover, Ø20 vents every 2nd tread)", `${pw} · ${tw}+${rh}`, n * (s.risers - 1) * pieces);
    add(`RS-${pw}-${rh}`, "Riser shutter, top step", `${pw} × ${rh}`, n * pieces);
  } else add(`RS-${pw}-${rh}`, "Riser shutter", `${pw} × ${rh}`, n * s.risers * pieces);
  add("RBR", "Riser bracket / step clamp (step panel to dog-tooth)", "—", 2 * n * s.risers);
  const ccf = fillRun(rw, [1400, 1200, 900, 600, 300]), cc = [...ccf.panels, ...(ccf.left >= 50 ? [r5(ccf.left)] : [])];
  for (const L of cc) add(`CC-${L}`, "Stair C-channel at the foot of the flight", `L ${L}`, n);
  add(`STP-${rw}-${s.cheekH}`, "Stop panel, top of the flight", `${rw} × ${s.cheekH}`, n);
  const wallSides = Math.max(0, 2 - s.openSides);
  if (wallSides) {
    add("TZ-400", "Trapezoidal wall panel 400 (top cut to the slope)", "400 × varies", n * wallSides * Math.max(1, Math.floor(((s.risers - 1) * s.tread) / 400)));
    add("TRI", "Triangular wall panel at the foot", "varies", n * wallSides);
  }
  if (s.landing) {
    const la = [...s.landing.across.panels, ...(s.landing.across.filler ? [s.landing.across.filler] : [])];
    for (const L of s.landing.along) for (const w of la) add(`LS-${w}-${L}`, "Landing soffit panel", `${w} × ${L}`, n);
  }
  add("PROP-ST", "Stair prop with swivel head", "adjustable", s.props * Math.max(1, n));
  if (s.closed ?? true) add("PIN-ST", "Pins & wedges on step panels (@ 200)", "—", n * (s.risers - 1) * pieces * (2 * Math.ceil(pw / 200) + 2 * Math.ceil((tw + rh) / 200)));
  return [...out.values()];
}

const SEQ = [
  "Deck first: fix the props of the landing and the flights; set the landing soffit panels and the stair soffit panels up the slope from the C-channel at the foot (pins @ 300, edge panels 200 at the free edge).",
  "Wall side: fix the triangular and trapezoidal wall panels under the flight to the wall panels, top edge on the soffit line.",
  "Rebar of the flight and landing, then the electrical / plumbing sleeves; inspect before closing.",
  "Fix the dog-tooth side panels on both sides, pinned to the soffit panels (pins @ 300, ≥ 3 per joint) and to the wall panels.",
  "Fix the stop panel at the top of the flight (construction joint) where the flight is not cast with the landing.",
  "Fix the step panels from the bottom step up: L-step panel (riser + tread cover) pinned to the dog-tooth teeth (pins @ 200), riser brackets / step clamps both ends.",
  "Check line, level, riser and tread on every step; release agent on all faces. Pour from the bottom up, vibrate through the Ø20 vent holes until slurry shows.",
  "Strike: step panels and dog-tooth panels after initial set (approx. 12–24 h), soffit panels next, props stay until the slab support may be released.",
];

// ---------------------------------------------------------------------------------------------------------------
// Sheet 2 — panel construction and connection details (shop-drawing level, typical for aluminium formwork)
// ---------------------------------------------------------------------------------------------------------------
const AL = "#cbd5e1", ALS = "#475569";

/** Dog-tooth side panel, elevation of one flight: skin cut to the step profile, edge frame, a stiffener at every tooth, pin holes. */
function DogToothDetail({ s }: { s: StairLayout }) {
  const g = geom(s, 3000, 150), k1 = g.rise / g.tread, wv = g.waist / g.cos, n = g.per - 1;
  const teeth = Array.from({ length: n }, (_, j) => `L${(j + 1) * g.tread} ${-(j + 1) * g.rise}`).join(" ");
  void teeth;
  const top: string[] = [];
  for (let j = 0; j < n; j++) top.push(`L${j * g.tread} ${-(j + 1) * g.rise}`, `L${(j + 1) * g.tread} ${-(j + 1) * g.rise}`);
  const d = `M0 ${wv} ${top.join(" ")} L${g.run} ${-(g.run * k1 - wv)} Z`;
  const holes: React.ReactNode[] = [];
  const Ls = g.hyp ? g.run / g.cos : g.run;
  for (let t = 150; t < Ls - 100; t += 300) { const u = t * g.cos, y = u * k1 - wv + 40 / g.cos; holes.push(<Circle key={`h${t}`} cx={u} cy={-y} r={9} fill="#ffffff" stroke={ALS} strokeWidth={4} />); }
  // joints between the pieces along the slope
  const joints: number[] = []; { let a = 0; for (const L of s.along.slice(0, -1)) { a += L; joints.push(a * g.cos); } }
  return (
    <View2 box={[-500, -(n * g.rise) - 500, g.run + 500, wv + 700]} w={540} h={380}>
      {(k) => (
        <G>
          <Path d={d} fill={C.cheek} fillOpacity={0.35} stroke={ALS} strokeWidth={0.9 * k} />
          {Array.from({ length: n }, (_, j) => <Line key={`st${j}`} x1={j * g.tread + 4} y1={-(j + 1) * g.rise} x2={j * g.tread + 4} y2={-(j * g.tread * k1 - wv)} stroke={ALS} strokeWidth={8} />)}
          {holes}
          {joints.map((u, i) => <Line key={`j${i}`} x1={u} y1={-(u * k1 - wv)} x2={u} y2={-(Math.ceil(u / g.tread) * g.rise)} stroke="#dc2626" strokeWidth={0.8 * k} strokeDasharray={`${4 * k} ${2 * k}`} />)}
          <Dim x1={0} y1={-g.rise} x2={g.tread} y2={-g.rise} off={-150} k={k} text={`${g.tread}`} />
          <Dim x1={0} y1={0} x2={0} y2={-g.rise} off={150} k={k} text={`${g.rise}`} vertical />
          <Dim x1={0} y1={wv} x2={g.run} y2={-(g.run * k1 - wv)} off={-220} k={k} text={`${fmt(s.slope)} along the slope · ${s.angle}°`} />
          <Text x={g.run / 2} y={wv + 560} style={{ fontSize: 7 * k }} fill={INK} textAnchor="middle">{`depth ${s.cheekH} square to the slope · 4 mm skin cut to the step profile · stiffener under every tooth · pin holes @300, 40 from the skin`}</Text>
          <Text x={g.run * 0.05} y={-(n * g.rise) - 120} style={{ fontSize: 6.5 * k }} fill="#dc2626">{s.along.length > 1 ? `red dashed = joints between the ${s.along.length} pieces (${s.along.join(" + ")})` : ""}</Text>
        </G>
      )}
    </View2>
  );
}

/** L-shaped step panel in section: riser leg + tread cover, back flanges, vent hole. */
function StepDetail({ s }: { s: StairLayout }) {
  const tw = s.tread, rh = s.riser, F = 65, T = 4;
  return (
    <View2 box={[-160, -rh - 160, tw + 120, 160]} w={265} h={175}>
      {(k) => (
        <G>
          {/* skin */}
          <Path d={`M0 0 L0 ${-rh - T} L${tw} ${-rh - T} L${tw} ${-rh} L${T} ${-rh} L${T} 0 Z`} fill={AL} stroke={ALS} strokeWidth={0.6 * k} />
          {/* edge flanges 65 (pin holes) */}
          <Rect x={T} y={-F} width={F} height={5} fill={ALS} />
          <Rect x={tw - 5} y={-rh} width={5} height={F} fill={ALS} />
          <Rect x={T} y={-rh} width={5} height={F} fill={ALS} />
          <Circle cx={tw * 0.55} cy={-rh - 2} r={10} fill="#ffffff" stroke="#dc2626" strokeWidth={3} />
          <Dim x1={0} y1={-rh - T} x2={tw} y2={-rh - T} off={-90} k={k} text={`tread ${tw}`} />
          <Dim x1={0} y1={0} x2={0} y2={-rh} off={90} k={k} text={`riser ${rh}`} vertical />
          <Text x={tw * 0.55} y={-rh + 60} style={{ fontSize: 6 * k }} fill="#dc2626" textAnchor="middle">Ø20 vent (every 2nd tread)</Text>
          <Text x={tw * 0.2} y={-30} style={{ fontSize: 6 * k }} fill={INK}>4 mm skin · 65 flange</Text>
        </G>
      )}
    </View2>
  );
}

/** Soffit panel cross-section (400) and the pin & wedge joint between two panels. */
function SoffitPinDetail() {
  const W = 400, F = 65, T = 4, R = 5;
  const panel = (x: number) => (
    <G key={x}>
      <Rect x={x} y={0} width={W} height={T} fill={AL} stroke={ALS} strokeWidth={1} />
      <Rect x={x} y={T} width={R} height={F - T} fill={AL} stroke={ALS} strokeWidth={1} />
      <Rect x={x + W - R} y={T} width={R} height={F - T} fill={AL} stroke={ALS} strokeWidth={1} />
      <Rect x={x + R} y={F - 6} width={22} height={6} fill={AL} stroke={ALS} strokeWidth={1} />
      <Rect x={x + W - R - 22} y={F - 6} width={22} height={6} fill={AL} stroke={ALS} strokeWidth={1} />
    </G>
  );
  return (
    <View2 box={[-60, -110, 2 * W + 60, 170]} w={560} h={175}>
      {(k) => (
        <G>
          {panel(0)}{panel(W)}
          {/* pin through both rails, wedge through the pin slot */}
          <Rect x={W - 45} y={40 - 8} width={90} height={16} rx={8} fill="#9ca3af" stroke={INK} strokeWidth={1} />
          <Rect x={W + 30} y={40 - 40} width={10} height={95} fill="#4b5563" />
          <Dim x1={0} y1={0} x2={W} y2={0} off={-55} k={k} text="400 (std; 200 at free edge)" />
          <Dim x1={2 * W} y1={0} x2={2 * W} y2={F} off={-30} k={k} text="65" vertical />
          <Text x={W} y={F + 55} style={{ fontSize: 6.5 * k }} fill={INK} textAnchor="middle">round pin through the rail holes (40 from skin) + flat wedge</Text>
          <Text x={W / 2} y={F + 95} style={{ fontSize: 6.5 * k }} fill={GRAY} textAnchor="middle">4 mm skin · 5 mm rails · ribs at max. 300</Text>
        </G>
      )}
    </View2>
  );
}

/** Stair C-channel at the foot of the flight. */
function CChannelDetail({ s }: { s: StairLayout }) {
  const wv = Math.round(s.waist / Math.cos(Math.atan2(s.riser, s.tread)));
  return (
    <View2 box={[-140, -wv - 80, 220, 80]} w={265} h={175}>
      {(k) => (
        <G>
          <Path d={`M0 0 L0 ${-wv} L80 ${-wv} L80 ${-wv + 6} L6 ${-wv + 6} L6 -6 L80 -6 L80 0 Z`} fill={AL} stroke={ALS} strokeWidth={0.8 * k} />
          <Dim x1={0} y1={0} x2={0} y2={-wv} off={60} k={k} text={`${wv}`} vertical />
          <Text x={100} y={-wv / 2} style={{ fontSize: 6.5 * k }} fill={INK}>waist end</Text>
        </G>
      )}
    </View2>
  );
}

const FAB: [string, string][] = [
  ["Material", "Aluminium alloy 6061-T6 / 6082-T6 extrusions and plate (all stair pieces)."],
  ["Skin", "4 mm plate (min. 3.5 mm). Dog-tooth skin cut to the step profile by CNC / laser / water-jet; L-step skin brake-bent from one sheet."],
  ["Frame", "Edge rails 65 mm deep, 5 mm wall, pin holes 40 mm from the skin on a 50 mm module."],
  ["Stiffeners", "Ribs at ≤ 300 mm (end ribs ≤ 150 mm); on the dog-tooth panel a stiffener under every tooth."],
  ["Welding", "MIG or TIG under argon, filler 5356 / 4043; continuous on rails, stitch on ribs; dress welds flush on the concrete face."],
  ["Joints", "Pin & wedge at ≤ 300 mm on soffit / side joints (min. 3 per joint), 200 mm on step panels."],
  ["Props", "Under the soffit at ≤ 1200 × 1200 mm, a prop at each end of every soffit run; landing as the slab."],
  ["Tolerance", "Riser / tread ± 3 mm per step, ± 5 mm over the flight. Check against the architect's stair detail before cutting."],
];

function DetailsPage({ s, info, si, total }: { s: StairLayout; info: StairInfo; si: number; total: number }) {
  return (
    <>
      <Text style={{ fontSize: 14, fontWeight: "bold" }}>STAIRCASE {s.code} — PANEL CONSTRUCTION &amp; CONNECTION DETAILS</Text>
      <Text style={{ color: GRAY, marginBottom: 6 }}>Dog-tooth stair system · {(s.closed ?? true) ? "closed stair (L-step panels with tread covers)" : "open stair (riser shutters, treads finished by hand)"} · sizes in mm · sheet {si * 2 + 2} of {total * 2}</Text>
      <View style={{ flexDirection: "row", gap: 8 }}>
        <Box title="DOG-TOOTH SIDE PANEL DT — elevation (one each side of every flight)" w={565} h={420}><DogToothDetail s={s} /></Box>
        <View style={{ width: 578, gap: 8 }}>
          <View style={{ flexDirection: "row", gap: 8 }}>
            <Box title={(s.closed ?? true) ? "L-STEP PANEL TS — section" : "RISER SHUTTER RS — section"} w={285} h={206}><StepDetail s={s} /></Box>
            <Box title="C-CHANNEL CC — section" w={285} h={206}><CChannelDetail s={s} /></Box>
          </View>
          <Box title="SOFFIT PANEL SS — section & PIN AND WEDGE joint" w={578} h={206}><SoffitPinDetail /></Box>
        </View>
      </View>
      <View style={{ marginTop: 8, borderWidth: 0.8, borderColor: "#d6d3d1", padding: 6 }}>
        <Text style={{ fontSize: 9, fontWeight: "bold", marginBottom: 3 }}>FABRICATION NOTES (typical aluminium-formwork practice — confirm with your panel supplier)</Text>
        {FAB.map(([a, b]) => (
          <View key={a} style={{ flexDirection: "row", paddingVertical: 1.5, borderBottomWidth: 0.3, borderColor: "#e5e5e5" }}>
            <Text style={{ width: 80, fontWeight: "bold" }}>{a}</Text><Text style={{ flex: 1 }}>{b}</Text>
          </View>
        ))}
        <Text style={{ marginTop: 5, color: GRAY }}>Wall side: triangular panel TRI at the foot and trapezoidal panels TZ-400 under the flight, their top edge cut to the soffit line, pinned to the wall panels. Free edge: 200 mm soffit edge panels carry the edge and stop concrete running through (anti-penetration).</Text>
      </View>
      <View fixed style={{ position: "absolute", left: M, right: M, bottom: M, height: FOOT - 6, borderTopWidth: 1.2, borderColor: ORANGE, flexDirection: "row", alignItems: "center", paddingTop: 4, fontSize: 7.5 }}>
        <Image src={LOGO} style={{ width: 70, height: 22, objectFit: "contain" }} />
        <View style={{ marginLeft: 10, flexGrow: 1 }}>
          <Text style={{ fontWeight: "bold", fontSize: 9 }}>STAIRCASE DETAILS · {info.planName}</Text>
          <Text style={{ color: GRAY }}>{info.project} · {info.client} · {info.system}</Text>
        </View>
        <View style={{ width: 230, alignItems: "flex-end" }}>
          <Text>{info.company}</Text>
          <Text style={{ color: GRAY }}>Dwg {info.drawingNo} · Rev {info.rev} · {info.date} · Sheet {si * 2 + 2}/{total * 2}</Text>
        </View>
      </View>
    </>
  );
}

export function StairSheetDocument({ stairs, info }: { stairs: StairLayout[]; info: StairInfo }) {
  const pageStyle = { fontFamily: "Carlito", fontSize: 8, color: INK, padding: M, paddingBottom: M + FOOT };
  return (
    <Document title={`Staircase assembly — ${info.planName}`} author={info.company}>
      {stairs.map((s, si) => {
        const parts = partsOf(s);
        return [
          <Page key={si} size="A3" orientation="landscape" style={pageStyle}>
            <Text style={{ fontSize: 14, fontWeight: "bold" }}>STAIRCASE {s.code} — FORMWORK ASSEMBLY</Text>
            <Text style={{ color: s.assumed ? "#dc2626" : GRAY, marginBottom: 6 }}>
              {s.label} · {s.flights} flight{s.flights > 1 ? "s" : ""} × {s.risers} risers {s.riser} / tread {s.tread} · width {s.width} · waist {s.waist} · slope {s.slope} at {s.angle}° · floor height {fmt(info.floorMm)} · slab {info.slabMm}
              {s.assumed ? " · TYPICAL STAIR (sizes assumed) — measure the real stair for an exact sheet" : ""}
            </Text>
            <View style={{ flexDirection: "row", gap: 8 }}>
              <Box title="PLAN — soffit panels (dashed), landing panels (green), props (orange), dog-tooth side panels (brown), C-channel (grey)" w={565} h={330}><PlanView s={s} info={info} /></Box>
              <Box title="EXPLODED VIEW — formwork pieces of one flight + landing" w={578} h={330}><ExplodedView s={s} info={info} /></Box>
            </View>
            <View style={{ flexDirection: "row", gap: 8, marginTop: 8 }}>
              <Box title="SECTION A–A — flight 1 and landing (dog-tooth panel dashed)" w={565} h={360}><SectionView s={s} info={info} /></Box>
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
                <Text style={{ marginTop: 6, color: GRAY }}>Pins and wedges at 300 mm on soffit / side panel joints (counted in the floor parts list), 200 mm on step panels. All sizes in mm; check the riser / tread against the architect&apos;s stair detail before production.</Text>
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
                <Text style={{ color: GRAY }}>Dwg {info.drawingNo} · Rev {info.rev} · {info.date} · Sheet {si * 2 + 1}/{stairs.length * 2}</Text>
              </View>
            </View>
          </Page>,
          <Page key={`d${si}`} size="A3" orientation="landscape" style={pageStyle}><DetailsPage s={s} info={info} si={si} total={stairs.length} /></Page>,
        ];
      })}
    </Document>
  );
}
void PW; void PH;
