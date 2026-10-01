/**
 * Wall-face modulation drawings: an elevation of every wall face type showing the panel arrangement —
 * standard panels (width), wall-top pieces, fillers, opening pieces, tie positions and overall dimensions.
 * Identical faces are grouped into one type (M01 × n) so the set stays short and shop-friendly.
 */
import path from "node:path";
import { Document, Font, G, Image, Line, Page, Path, Polyline, Rect, Svg, Text, View } from "@react-pdf/renderer";
import type { BeamLayout, BomRow, ColumnLayout, FaceLayout, Fit, StairLayout } from "@/lib/design-engine/floor-panels";
import { panelString } from "@/lib/floor-plans/panel-marks";

const PUBLIC = path.join(process.cwd(), "public");
Font.register({
  family: "Carlito",
  fonts: [
    { src: path.join(PUBLIC, "fonts", "Carlito-Regular.ttf") },
    { src: path.join(PUBLIC, "fonts", "Carlito-Bold.ttf"), fontWeight: "bold" },
  ],
});
Font.registerHyphenationCallback((w) => [w]);
const LOGO = path.join(PUBLIC, "brand", "acoform-logo.png");
const ORANGE = "#ef9d2f", RED = "#d92d20", GRAY = "#6b6d68", PANEL = "#dfe7f3", TOP = "#fff4dc", FILL = "#fde2e0";

export type ModType = { code: string; face: FaceLayout; count: number; faces: string[] };
export type ModInfo = { company: string; project: string; client: string; planName: string; drawingNo: string; rev: string; date: string; stdHeight: number; tieH: number; tieV: number; note: string };

/** Group identical faces (same panels, filler, top, height) into types, most repeated first. */
export function modulationTypes(faces: FaceLayout[]): ModType[] {
  const m = new Map<string, ModType>();
  for (const f of faces) {
    const key = `${f.panels.join(",")}|${f.filler}|${f.top}|${f.height}`;
    const t = m.get(key);
    if (t) { t.count++; t.faces.push(f.code); } else m.set(key, { code: "", face: f, count: 1, faces: [f.code] });
  }
  const list = [...m.values()].sort((a, b) => b.count - a.count || b.face.length - a.face.length);
  list.forEach((t, i) => { t.code = `M${String(i + 1).padStart(2, "0")}`; });
  return list;
}

// A3 landscape 1191 × 842 pt
const PW = 1191, PH = 842, M = 20, FOOT = 46;
const COLS = 2, ROWS = 3;
const GAP = 8;
const CELL_W = Math.floor((PW - 2 * M - GAP * (COLS - 1)) / COLS) - 2, CELL_H = Math.floor((PH - 2 * M - FOOT - 30) / ROWS) - 8;

function Elevation({ t, sc, tieH, tieV, stdHeight }: { t: ModType; sc: number; tieH: number; tieV: number; stdHeight: number }) {
  const f = t.face;
  const H = f.height, main = Math.min(stdHeight, H), top = f.top;
  const W = f.length * sc, Hh = H * sc;
  const padL = 26, padB = 26, padT = 8;
  const w = W + padL + 10, h = Hh + padB + padT;
  const y0 = padT + Hh;                        // ground line (pt)
  const X = (mm: number) => padL + mm * sc, Y = (mm: number) => y0 - mm * sc;
  const pieces: { x: number; w: number }[] = []; let run = 0;
  for (const pw of f.panels) { pieces.push({ x: run, w: pw }); run += pw; }
  // ties: at panel joints (incl. face ends) every tieH, rows every tieV starting 300 mm up
  const joints = [0, ...pieces.map((p) => p.x + p.w)];
  const tieRows: number[] = []; for (let z = 300; z < H - 150; z += tieV) tieRows.push(z);
  const tieX: number[] = []; let last = -1e9;
  for (const j of joints) if (j - last >= tieH * 0.6 || j === joints[joints.length - 1]) { tieX.push(j); last = j; }
  const fs = 6.2;
  return (
    <Svg width={w} height={h}>
      {pieces.map((p, i) => (
        <G key={i}>
          <Rect x={X(p.x)} y={Y(main)} width={p.w * sc} height={main * sc} fill={PANEL} stroke="#1f2937" strokeWidth={0.6} />
          {top > 0 ? <Rect x={X(p.x)} y={Y(H)} width={p.w * sc} height={top * sc} fill={TOP} stroke="#1f2937" strokeWidth={0.6} /> : null}
          {p.w * sc > 9 ? <Text x={X(p.x + p.w / 2) - 6} y={Y(main / 2)} style={{ fontSize: fs, fontFamily: "Carlito" }}>{String(p.w)}</Text> : null}
          {top > 0 && p.w * sc > 9 && top * sc > 6 ? <Text x={X(p.x + p.w / 2) - 6} y={Y(main + top / 2) + 2} style={{ fontSize: fs - 0.8, fontFamily: "Carlito", color: GRAY }}>{String(top)}</Text> : null}
        </G>
      ))}
      {f.filler > 0 ? (
        <G>
          <Rect x={X(run)} y={Y(H)} width={f.filler * sc} height={H * sc} fill={FILL} stroke={RED} strokeWidth={0.7} />
          {f.filler * sc > 7 ? <Text x={X(run) + 1} y={Y(H / 2)} style={{ fontSize: fs - 0.6, fontFamily: "Carlito", color: RED }}>{`F${f.filler}`}</Text> : null}
        </G>
      ) : null}
      {tieRows.flatMap((z) => tieX.map((x) => <Rect key={`${x}-${z}`} x={X(x) - 1.2} y={Y(z) - 1.2} width={2.4} height={2.4} fill="#111" />))}
      {/* overall length dimension */}
      <Line x1={X(0)} y1={y0 + 10} x2={X(f.length)} y2={y0 + 10} stroke="#111" strokeWidth={0.5} />
      <Line x1={X(0)} y1={y0 + 6} x2={X(0)} y2={y0 + 14} stroke="#111" strokeWidth={0.5} />
      <Line x1={X(f.length)} y1={y0 + 6} x2={X(f.length)} y2={y0 + 14} stroke="#111" strokeWidth={0.5} />
      <Text x={X(f.length / 2) - 12} y={y0 + 21} style={{ fontSize: 7, fontFamily: "Carlito" }}>{String(f.length)}</Text>
      {/* height dimension */}
      <Line x1={padL - 10} y1={Y(0)} x2={padL - 10} y2={Y(H)} stroke="#111" strokeWidth={0.5} />
      <Line x1={padL - 14} y1={Y(0)} x2={padL - 6} y2={Y(0)} stroke="#111" strokeWidth={0.5} />
      <Line x1={padL - 14} y1={Y(H)} x2={padL - 6} y2={Y(H)} stroke="#111" strokeWidth={0.5} />
      {top > 0 ? <Line x1={padL - 14} y1={Y(main)} x2={padL - 6} y2={Y(main)} stroke="#111" strokeWidth={0.5} /> : null}
      <Text x={1} y={Y(H / 2)} style={{ fontSize: 6.5, fontFamily: "Carlito" }}>{String(H)}</Text>
    </Svg>
  );
}

function Footer({ info, page, pages, title = "WALL MODULATION" }: { info: ModInfo; page: number; pages: number; title?: string }) {
  return (
    <View fixed style={{ position: "absolute", left: M, right: M, bottom: M, height: FOOT - 6, borderTopWidth: 1.2, borderColor: ORANGE, flexDirection: "row", alignItems: "center", paddingTop: 4, fontSize: 7.5 }}>
      <Image src={LOGO} style={{ width: 70, height: 22, objectFit: "contain" }} />
      <View style={{ marginLeft: 10, flexGrow: 1 }}>
        <Text style={{ fontWeight: "bold", fontSize: 9 }}>{title} — TYPICAL FLOOR · {info.planName}</Text>
        <Text style={{ color: GRAY }}>{info.project} · {info.client} · {info.note}</Text>
      </View>
      <View style={{ width: 230, alignItems: "flex-end" }}>
        <Text>{info.company}</Text>
        <Text style={{ color: GRAY }}>Dwg {info.drawingNo} · Rev {info.rev} · {info.date} · Sheet {page}/{pages}</Text>
      </View>
    </View>
  );
}

const fitStr = (f: Fit) => [...f.panels.map(String), ...(f.filler ? [`F${f.filler}`] : [])].join(" + ") || "—";
const pageStyle = { fontFamily: "Carlito", fontSize: 8, padding: M, paddingBottom: M + FOOT } as const;
const chunk = <T,>(a: T[], n: number) => { const out: T[][] = []; for (let i = 0; i < a.length; i += n) out.push(a.slice(i, i + n)); return out; };
const T = (x: number, y: number, txt: string, size = 6.2, color = "#111") => <Text x={x} y={y} style={{ fontSize: size, fontFamily: "Carlito", color }}>{txt}</Text>;

/* ---------- columns ---------- */
const C3W = Math.floor((PW - 2 * M - 2 * GAP) / 3) - 2, C3H = Math.floor((PH - 2 * M - FOOT - 30) / 2) - 8;
/** Panels along one side of the column plan (a → b), drawn just outside the concrete. */
function sideStrip(f: Fit, x: number, y: number, dx: number, dy: number, nx: number, ny: number, sp: number, th: number, key: string) {
  const out: React.ReactNode[] = []; let run = 0;
  const pcs = [...f.panels.map((w) => ({ w, fill: false })), ...(f.filler ? [{ w: f.filler, fill: true }] : [])];
  pcs.forEach((p, i) => {
    const x0 = x + dx * run * sp, y0 = y + dy * run * sp, x1 = x + dx * (run + p.w) * sp, y1 = y + dy * (run + p.w) * sp;
    const ox = nx * th, oy = ny * th;
    out.push(<Path key={`${key}${i}`} d={`M${x0} ${y0} L${x1} ${y1} L${x1 + ox} ${y1 + oy} L${x0 + ox} ${y0 + oy} Z`} fill={p.fill ? FILL : PANEL} stroke={p.fill ? RED : "#1f2937"} strokeWidth={0.5} />);
    const mx = (x0 + x1) / 2 + ox * 1.9, my = (y0 + y1) / 2 + oy * 1.9;
    if (p.w * sp > 10) out.push(<Text key={`${key}t${i}`} x={mx - 6} y={my + 2} style={{ fontSize: 5.6, fontFamily: "Carlito", color: p.fill ? RED : "#111" }}>{p.fill ? `F${p.w}` : String(p.w)}</Text>);
    run += p.w;
  });
  return out;
}
function ColumnCell({ c, n, stdHeight }: { c: ColumnLayout; n: number; stdHeight: number }) {
  const planBox = 118, sp = Math.min((planBox - 40) / Math.max(c.w, 1), (planBox - 40) / Math.max(c.d, 1));
  const cw = c.w * sp, cd = c.d * sp, px = 22 + (planBox - 40 - cw) / 2 + 8, py = 18 + (planBox - 40 - cd) / 2;
  const th = Math.max(4, 65 * sp);
  const H = c.h, main = Math.min(stdHeight, H);
  const se = Math.min((C3H - planBox - 70) / H, (C3W - 70) / Math.max(1, c.w + c.d));
  const elev = (f: Fit, len: number, x0: number, key: string) => {
    const pcs = [...f.panels.map((w) => ({ w, fill: false })), ...(f.filler ? [{ w: f.filler, fill: true }] : [])];
    let run = 0; const y0 = 12 + H * se; const out: React.ReactNode[] = [];
    for (const [i, p] of pcs.entries()) {
      const X = x0 + run * se;
      if (p.fill) out.push(<Rect key={`${key}${i}`} x={X} y={y0 - H * se} width={p.w * se} height={H * se} fill={FILL} stroke={RED} strokeWidth={0.5} />);
      else {
        out.push(<Rect key={`${key}${i}`} x={X} y={y0 - main * se} width={p.w * se} height={main * se} fill={PANEL} stroke="#1f2937" strokeWidth={0.5} />);
        if (c.top) out.push(<Rect key={`${key}t${i}`} x={X} y={y0 - H * se} width={p.w * se} height={c.top * se} fill={TOP} stroke="#1f2937" strokeWidth={0.5} />);
      }
      if (p.w * se > 9) out.push(<Text key={`${key}l${i}`} x={X + (p.w * se) / 2 - 5} y={y0 - (main * se) / 2} style={{ fontSize: 5.6, fontFamily: "Carlito", color: p.fill ? RED : "#111" }}>{p.fill ? `F${p.w}` : String(p.w)}</Text>);
      run += p.w;
    }
    for (let z = 300; z < H; z += 600) out.push(<Line key={`${key}c${z}`} x1={x0 - 3} y1={y0 - z * se} x2={x0 + len * se + 3} y2={y0 - z * se} stroke={ORANGE} strokeWidth={0.6} strokeDasharray="2 1.5" />);
    out.push(<Line key={`${key}d`} x1={x0} y1={y0 + 7} x2={x0 + len * se} y2={y0 + 7} stroke="#111" strokeWidth={0.4} />);
    out.push(<Text key={`${key}dt`} x={x0 + (len * se) / 2 - 6} y={y0 + 15} style={{ fontSize: 6, fontFamily: "Carlito" }}>{String(len)}</Text>);
    return out;
  };
  const eh = H * se + 46;
  return (
    <View style={{ width: C3W, height: C3H, padding: 4, borderWidth: 0.4, borderColor: "#ddd" }} wrap={false}>
      <Text style={{ fontSize: 9, fontWeight: "bold" }}>COL-{String(n).padStart(2, "0")} <Text style={{ fontWeight: "normal", color: GRAY }}>{c.code} · {c.round ? `Ø${c.w}` : `${c.w} × ${c.d}`} · H {c.h} · {c.qty} nos</Text></Text>
      {c.round ? (
        <Text style={{ marginTop: 20, color: GRAY }}>Round column — made as a custom form set Ø{c.w} × {c.h} (2 half shells, clamps every 600 mm: {c.clamps} per column).</Text>
      ) : (
        <>
          <Svg width={C3W - 10} height={planBox}>
            <Rect x={px} y={py} width={cw} height={cd} fill="#e5e7eb" stroke="#6b7280" strokeWidth={0.6} />
            {sideStrip(c.faceW, px, py, 1, 0, 0, -1, sp, th, "t")}
            {sideStrip(c.faceW, px, py + cd, 1, 0, 0, 1, sp, th, "b")}
            {sideStrip(c.faceD, px, py, 0, 1, -1, 0, sp, th, "l")}
            {sideStrip(c.faceD, px + cw, py, 0, 1, 1, 0, sp, th, "r")}
            {[[px - th, py - th], [px + cw, py - th], [px - th, py + cd], [px + cw, py + cd]].map(([x, y], i) => <Rect key={i} x={x} y={y} width={th} height={th} fill="#1f2937" />)}
            {T(px + cw / 2 - 8, py + cd / 2 + 2, "PLAN", 6, GRAY)}
          </Svg>
          <Text style={{ fontSize: 6.5, color: GRAY }}>Face A ({c.w}): {fitStr(c.faceW)} · Face B ({c.d}): {fitStr(c.faceD)} · 4 external corners · {c.clamps} clamps (orange) per column{c.top ? ` · top ${c.top}` : ""}</Text>
          <Svg width={C3W - 10} height={eh}>
            {elev(c.faceW, c.w, 20, "A")}
            {elev(c.faceD, c.d, 40 + c.w * se, "B")}
            {T(20, eh - 2, "FACE A (×2)", 6, GRAY)}{T(40 + c.w * se, eh - 2, "FACE B (×2)", 6, GRAY)}
          </Svg>
        </>
      )}
    </View>
  );
}

/* ---------- beams ---------- */
export type BeamType = { code: string; b: BeamLayout; count: number; codes: string[] };
export function beamTypes(beams: BeamLayout[]): BeamType[] {
  const m = new Map<string, BeamType>();
  for (const b of beams) {
    const key = `${b.length}|${b.b}|${b.d}|${b.sides}|${b.bottom}|${b.pieces.join(",")}`;
    const t = m.get(key); if (t) { t.count++; if (!t.codes.includes(b.code)) t.codes.push(b.code); } else m.set(key, { code: "", b, count: 1, codes: [b.code] });
  }
  const list = [...m.values()].sort((a, b) => b.count - a.count || b.b.length - a.b.length);
  list.forEach((t, i) => { t.code = `B${String(i + 1).padStart(2, "0")}`; });
  return list;
}
const BW = Math.floor((PW - 2 * M - GAP) / 2) - 2, BH = Math.floor((PH - 2 * M - FOOT - 30) / 4) - 8;
function BeamCell({ t, sc, slabMm }: { t: BeamType; sc: number; slabMm: number }) {
  const b = t.b; const side = b.side;
  const y0 = 14 + side * sc; let run = 0;
  const secS = Math.min(70 / Math.max(b.d, 1), 90 / Math.max(b.b + 300, 1));
  const sx = BW - 120, sy = 10;
  return (
    <View style={{ width: BW, height: BH, padding: 4, borderWidth: 0.4, borderColor: "#ddd" }} wrap={false}>
      <Text style={{ fontSize: 9, fontWeight: "bold" }}>{t.code} <Text style={{ fontWeight: "normal", color: GRAY }}>× {t.count} · {b.b ? `${b.b} × ${b.d}` : `D ${b.d}`} · {b.length} long · {b.sides} side{b.sides > 1 ? "s" : ""}{b.bottom ? " + bottom" : ""}{b.props ? ` · ${b.props} props` : ""} · marks {t.codes.slice(0, 6).join(", ")}</Text></Text>
      <Svg width={BW - 10} height={BH - 18}>
        {b.pieces.map((L, i) => {
          const X = 10 + run * sc; run += L;
          const cust = ![1200, 900, 600, 300].includes(L);
          return (
            <G key={i}>
              <Rect x={X} y={y0 - side * sc} width={L * sc} height={side * sc} fill={cust ? FILL : PANEL} stroke={cust ? RED : "#1f2937"} strokeWidth={0.5} />
              {L * sc > 12 ? T(X + (L * sc) / 2 - 6, y0 - (side * sc) / 2 + 2, String(L), 6, cust ? RED : "#111") : null}
            </G>
          );
        })}
        <Line x1={10} y1={y0 - side * sc - 3} x2={10 + b.length * sc} y2={y0 - side * sc - 3} stroke="#111" strokeWidth={1.4} />
        <Line x1={10} y1={y0 + 7} x2={10 + b.length * sc} y2={y0 + 7} stroke="#111" strokeWidth={0.4} />
        {T(10 + (b.length * sc) / 2 - 8, y0 + 15, String(b.length))}
        {T(10, y0 + 25, `SIDE PANELS ${side} high (D ${b.d} − slab ${slabMm})${b.bottom ? ` · BOTTOM ${b.b} wide, same lengths` : ""}`, 6, GRAY)}
        {/* section */}
        <Rect x={sx} y={sy} width={(b.b + 300) * secS} height={slabMm * secS} fill="#e5e7eb" stroke="#6b7280" strokeWidth={0.5} />
        <Rect x={sx + 150 * secS} y={sy + slabMm * secS} width={Math.max(b.b, 100) * secS} height={side * secS} fill="#e5e7eb" stroke="#6b7280" strokeWidth={0.5} />
        <Rect x={sx + 150 * secS - 3} y={sy + slabMm * secS} width={3} height={side * secS} fill={ORANGE} />
        {b.sides > 1 ? <Rect x={sx + (150 + Math.max(b.b, 100)) * secS} y={sy + slabMm * secS} width={3} height={side * secS} fill={ORANGE} /> : null}
        {b.bottom ? <Rect x={sx + 150 * secS - 3} y={sy + (slabMm + side) * secS} width={Math.max(b.b, 100) * secS + 6} height={3} fill={ORANGE} /> : null}
        {T(sx, sy + (slabMm + side) * secS + 12, "SECTION", 6, GRAY)}
      </Svg>
    </View>
  );
}

/* ---------- staircase ---------- */
const SW = PW - 2 * M, SH = Math.floor((PH - 2 * M - FOOT - 30) / 2) - 8;
function StairCell({ s }: { s: StairLayout }) {
  const span = s.risers * s.tread, rise = s.risers * s.riser;
  const k = Math.min(480 / span, (SH - 70) / (rise + s.waist * 2));
  const ox = 20, oy = 20 + rise * k;
  const pts: string[] = [`${ox},${oy}`]; let x = ox, y = oy;
  for (let i = 0; i < s.risers; i++) { y -= s.riser * k; pts.push(`${x},${y}`); x += s.tread * k; pts.push(`${x},${y}`); }
  const ang = Math.atan2(s.riser, s.tread), w = s.waist * k;
  const nx = Math.sin(ang) * w / Math.sin(Math.PI / 2), ny = Math.cos(ang) * w;
  const sx0 = ox + nx * 0, sy0 = oy + ny, sx1 = ox + span * k, sy1 = oy - rise * k + ny;
  // soffit panel joints along the slope
  const joints: { x: number; y: number; L: number }[] = []; let run = 0;
  for (const L of s.along) { const f = (run + L / 2) / s.slope; joints.push({ x: sx0 + (sx1 - sx0) * f, y: sy0 + (sy1 - sy0) * f, L }); run += L; }
  const ticks: number[] = []; run = 0; for (const L of s.along) { run += L; ticks.push(run / s.slope); }
  // plan of soffit panels: across (width) × along (slope)
  const across = [...s.across.panels.map((v) => ({ v, f: false })), ...(s.across.filler ? [{ v: s.across.filler, f: true }] : [])];
  const pk = Math.min(230 / s.width, (SH - 110) / s.slope);
  const px0 = 560, py0 = 16;
  return (
    <View style={{ width: SW, height: SH, padding: 4, borderWidth: 0.4, borderColor: "#ddd" }} wrap={false}>
      <Text style={{ fontSize: 9, fontWeight: "bold" }}>{s.code} <Text style={{ fontWeight: "normal", color: s.assumed ? RED : GRAY }}>{s.label} · {s.flights} flight{s.flights > 1 ? "s" : ""}{s.sets > 1 ? ` × ${s.sets} staircases` : ""} · {s.risers} risers {s.riser} / tread {s.tread} · width {s.width} · waist {s.waist} · {s.angle}° · sloped length {s.slope}</Text></Text>
      {s.assumed ? <Text style={{ fontSize: 7, color: RED }}>TYPICAL STAIR — sizes assumed from the floor height; enter the real stair in the take-off (Staircase rows) for an exact panel list. Priced as a set in the BOM.</Text> : null}
      <Svg width={SW - 10} height={SH - 30}>
        <Polyline points={[...pts, `${sx1},${sy1}`, `${sx0},${sy0}`, `${ox},${oy}`].join(" ")} fill="#e5e7eb" stroke="#6b7280" strokeWidth={0.6} />
        {/* soffit panels (orange line) with joints */}
        <Line x1={sx0} y1={sy0 + 2} x2={sx1} y2={sy1 + 2} stroke={ORANGE} strokeWidth={2.2} />
        {ticks.map((f, i) => <Line key={i} x1={sx0 + (sx1 - sx0) * f} y1={sy0 + (sy1 - sy0) * f - 1} x2={sx0 + (sx1 - sx0) * f} y2={sy0 + (sy1 - sy0) * f + 6} stroke="#111" strokeWidth={0.6} />)}
        {joints.map((j, i) => <G key={`j${i}`}>{T(j.x - 6, j.y + 14, String(j.L), 6, [1200, 900, 600, 300].includes(j.L) ? "#111" : RED)}</G>)}
        {/* riser shutters */}
        {Array.from({ length: s.risers }, (_, i) => <Line key={`r${i}`} x1={ox + i * s.tread * k - 1.5} y1={oy - i * s.riser * k} x2={ox + i * s.tread * k - 1.5} y2={oy - (i + 1) * s.riser * k} stroke="#2563eb" strokeWidth={2} />)}
        {T(ox, oy + ny + 30, `ELEVATION OF ONE FLIGHT · orange = soffit panels (${s.along.join(" + ")}) · blue = riser shutters ${s.width} × ${s.riser} (${s.risers} per flight)${s.openSides ? ` · open side cheek ${s.cheekH} high (${s.openSides} side${s.openSides > 1 ? "s" : ""})` : ""}`, 6.5, GRAY)}
        {/* plan of soffit panels */}
        {s.along.flatMap((L, r) => {
          const yy = py0 + s.along.slice(0, r).reduce((a, b) => a + b, 0) * pk; let xx = px0;
          return across.map((c, i) => { const el = (
            <G key={`${r}-${i}`}>
              <Rect x={xx} y={yy} width={c.v * pk} height={L * pk} fill={c.f || ![1200, 900, 600, 300].includes(L) ? FILL : PANEL} stroke={c.f ? RED : "#1f2937"} strokeWidth={0.5} />
              {c.v * pk > 14 && L * pk > 8 ? T(xx + 2, yy + (L * pk) / 2 + 2, `${c.v}×${L}`, 5.4) : null}
            </G>); xx += c.v * pk; return el; });
        })}
        {T(px0, py0 + s.slope * pk + 12, `SOFFIT PANELS (plan along the slope): across ${fitStr(s.across)} · along ${s.along.join(" + ")}`, 6.2, GRAY)}
        {s.landing ? (() => {
          const lk = Math.min(160 / s.landing.l, 120 / s.landing.w), lx = px0 + s.width * pk + 40; let yy = py0;
          return (
            <G>
              {s.landing.along.flatMap((L, r) => { let xx = lx; const row = [...s.landing!.across.panels.map((v) => ({ v, f: false })), ...(s.landing!.across.filler ? [{ v: s.landing!.across.filler, f: true }] : [])].map((c, i) => { const el = <Rect key={`l${r}-${i}`} x={xx} y={yy} width={c.v * lk} height={L * lk} fill={c.f ? FILL : PANEL} stroke={c.f ? RED : "#1f2937"} strokeWidth={0.5} />; xx += c.v * lk; return el; }); yy += L * lk; return row; })}
              {T(lx, py0 + s.landing.w * lk + 12, `LANDING SOFFIT ${s.landing.l} × ${s.landing.w}: ${fitStr(s.landing.across)}`, 6.2, GRAY)}
            </G>
          );
        })() : null}
        {T(px0, py0 + s.slope * pk + 24, `Props per flight: ${s.props} (soffit grid 1.2 m + landing) · riser brackets 2 per riser`, 6.5)}
      </Svg>
    </View>
  );
}

/* ---------- accessories ---------- */
function AccessoryTable({ rows }: { rows: BomRow[] }) {
  const W = ["10%", "30%", "40%", "8%", "6%", "6%"];
  return (
    <View style={{ borderWidth: 0.6, borderColor: "#999" }}>
      <View style={{ flexDirection: "row", backgroundColor: "#fdf3e4", fontWeight: "bold" }}>
        {["Code", "Item", "How counted", "Qty", "Unit", "kg"].map((h, i) => <Text key={h} style={{ width: W[i], padding: 3, textAlign: i >= 3 ? "right" : "left" }}>{h}</Text>)}
      </View>
      {rows.map((r, i) => (
        <View key={r.code + i} wrap={false}>
          {r.sub && r.sub !== rows[i - 1]?.sub ? <Text style={{ padding: 3, paddingTop: 5, fontWeight: "bold", color: ORANGE, borderTopWidth: 0.4, borderColor: "#ccc" }}>{r.sub.toUpperCase()}</Text> : null}
          <View style={{ flexDirection: "row", borderTopWidth: 0.3, borderColor: "#e5e5e5" }}>
            {[r.code, r.description, r.basis ?? "", Math.round(r.qty).toLocaleString("en-IN"), r.unit ?? "nos", r.weight ? Math.round(r.weight).toLocaleString("en-IN") : "—"].map((v, j) => <Text key={j} style={{ width: W[j], padding: 2.5, textAlign: j >= 3 ? "right" : "left", color: j === 2 ? GRAY : "#111" }}>{v}</Text>)}
          </View>
        </View>
      ))}
      <View style={{ flexDirection: "row", borderTopWidth: 0.8, borderColor: "#999", fontWeight: "bold" }}>
        <Text style={{ width: "88%", padding: 3 }}>TOTAL ACCESSORY WEIGHT</Text>
        <Text style={{ width: "12%", padding: 3, textAlign: "right" }}>{Math.round(rows.reduce((a, r) => a + r.weight, 0)).toLocaleString("en-IN")} kg</Text>
      </View>
    </View>
  );
}

export function ModulationDocument({ types, info, totalFaces, columns = [], beams = [], stairs = [], accessories = [], slabMm = 150 }: { types: ModType[]; info: ModInfo; totalFaces: number; columns?: ColumnLayout[]; beams?: BeamLayout[]; stairs?: StairLayout[]; accessories?: BomRow[]; slabMm?: number }) {
  const maxLen = Math.max(1, ...types.map((t) => t.face.length));
  const maxH = Math.max(1, ...types.map((t) => t.face.height));
  const sc = Math.min((CELL_W - 50) / maxLen, (CELL_H - 62) / maxH);   // one scale for every elevation
  const scaleTxt = `1:${Math.round(1 / (sc * 0.35278))}`;   // sc = pt per mm; 1 pt = 0.35278 mm on paper
  const pages = chunk(types, COLS * ROWS);
  const schedRows = types.slice(0, 60);
  const colPages = chunk(columns, 6);
  const bt = beamTypes(beams);
  const beamPages = chunk(bt, 8);
  const bsc = Math.min((BW - 150) / Math.max(1, ...bt.map((t) => t.b.length)), (BH - 60) / Math.max(1, ...bt.map((t) => t.b.side)));
  const stairPages = chunk(stairs, 2);
  const totalPages = (types.length ? 1 + pages.length : 0) + colPages.length + beamPages.length + stairPages.length + (accessories.length ? 1 : 0);
  let pg = 0;
  const head = (t: string, sub: string) => (
    <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 6 }}>
      <Text style={{ fontSize: 12, fontWeight: "bold" }}>{t}</Text>
      <Text style={{ color: GRAY }}>{sub}</Text>
    </View>
  );
  return (
    <Document title={`Modulation — ${info.planName}`} author={info.company}>
      {types.length ? (
      <Page size="A3" orientation="landscape" style={pageStyle}>
        <Text style={{ fontSize: 15, fontWeight: "bold" }}>WALL MODULATION SCHEDULE</Text>
        <Text style={{ color: GRAY, marginBottom: 8 }}>{totalFaces} wall faces grouped into {types.length} types. Wall panels {info.stdHeight} mm high + top pieces; F = filler (made to size); black dots = tie positions (@ {info.tieH} h × {info.tieV} v). All sizes in mm. Also in this set: {columns.length} column types, {bt.length} beam types, {stairs.length} staircase{stairs.length === 1 ? "" : "s"}, accessory schedule.</Text>
        <View style={{ borderWidth: 0.6, borderColor: "#999" }}>
          <View style={{ flexDirection: "row", backgroundColor: "#fdf3e4", fontWeight: "bold" }}>
            {["Type", "Nos", "Length", "Height", "Panels (width)", "Top", "Filler", "Faces"].map((h, i) => (
              <Text key={h} style={{ width: ["6%", "5%", "8%", "7%", "34%", "6%", "6%", "28%"][i], padding: 3 }}>{h}</Text>
            ))}
          </View>
          {schedRows.map((t, i) => (
            <View key={t.code} style={{ flexDirection: "row", borderTopWidth: 0.3, borderColor: "#ccc", backgroundColor: i % 2 ? "#fafafa" : "#fff" }} wrap={false}>
              <Text style={{ width: "6%", padding: 2.5, fontWeight: "bold" }}>{t.code}</Text>
              <Text style={{ width: "5%", padding: 2.5 }}>{t.count}</Text>
              <Text style={{ width: "8%", padding: 2.5 }}>{t.face.length}</Text>
              <Text style={{ width: "7%", padding: 2.5 }}>{t.face.height}</Text>
              <Text style={{ width: "34%", padding: 2.5 }}>{panelString(t.face)}</Text>
              <Text style={{ width: "6%", padding: 2.5 }}>{t.face.top || "—"}</Text>
              <Text style={{ width: "6%", padding: 2.5, color: t.face.filler ? RED : "#111" }}>{t.face.filler || "—"}</Text>
              <Text style={{ width: "28%", padding: 2.5, color: GRAY }}>{t.faces.slice(0, 14).join(", ")}{t.faces.length > 14 ? ` +${t.faces.length - 14}` : ""}</Text>
            </View>
          ))}
          {types.length > schedRows.length ? <Text style={{ padding: 3, color: GRAY }}>+ {types.length - schedRows.length} more types on the elevation sheets</Text> : null}
        </View>
        <Footer info={info} page={++pg} pages={totalPages} />
      </Page>) : null}
      {pages.map((list, pi) => (
        <Page key={`w${pi}`} size="A3" orientation="landscape" style={pageStyle}>
          {head("WALL FACE ELEVATIONS (viewed from the panel side)", `Scale ${scaleTxt} on A3 · black dots = ties · red = filler · cream = wall-top piece`)}
          <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
            {list.map((t, i) => (
              <View key={t.code} style={{ width: CELL_W, height: CELL_H, padding: 4, borderWidth: 0.4, borderColor: "#ddd", marginRight: i % COLS === COLS - 1 ? 0 : GAP, marginBottom: 6 }} wrap={false}>
                <Text style={{ fontSize: 9, fontWeight: "bold" }}>{t.code} <Text style={{ fontWeight: "normal", color: GRAY }}>× {t.count} · {t.face.length} long · {panelString(t.face)}{t.face.top ? ` · top ${t.face.top}` : ""}</Text></Text>
                <Text style={{ fontSize: 6.5, color: GRAY, marginBottom: 3 }}>Faces: {t.faces.slice(0, 18).join(", ")}{t.faces.length > 18 ? ` +${t.faces.length - 18}` : ""}</Text>
                <Elevation t={t} sc={sc} tieH={info.tieH} tieV={info.tieV} stdHeight={info.stdHeight} />
              </View>
            ))}
          </View>
          <Footer info={info} page={++pg} pages={totalPages} />
        </Page>
      ))}
      {colPages.map((list, pi) => (
        <Page key={`c${pi}`} size="A3" orientation="landscape" style={pageStyle}>
          {head("COLUMN MODULATION", "Plan: panels on each face + 4 external corners (black) · elevations of face A and face B · orange dashes = clamps @ 600 · red = filler")}
          <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
            {list.map((c, i) => <View key={c.code} style={{ marginRight: i % 3 === 2 ? 0 : GAP, marginBottom: 6 }}><ColumnCell c={c} n={pi * 6 + i + 1} stdHeight={info.stdHeight} /></View>)}
          </View>
          <Footer info={info} page={++pg} pages={totalPages} title="COLUMN MODULATION" />
        </Page>
      ))}
      {beamPages.map((list, pi) => (
        <Page key={`b${pi}`} size="A3" orientation="landscape" style={pageStyle}>
          {head("BEAM MODULATION", `Side elevation along the beam (same pieces both sides) + section · scale 1:${Math.round(1 / (bsc * 0.35278))} on A3 · red = filler · orange = formwork in section`)}
          <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
            {list.map((t, i) => <View key={t.code} style={{ marginRight: i % 2 === 1 ? 0 : GAP, marginBottom: 6 }}><BeamCell t={t} sc={bsc} slabMm={slabMm} /></View>)}
          </View>
          <Footer info={info} page={++pg} pages={totalPages} title="BEAM MODULATION" />
        </Page>
      ))}
      {stairPages.map((list, pi) => (
        <Page key={`s${pi}`} size="A3" orientation="landscape" style={pageStyle}>
          {head("STAIRCASE MODULATION", "Waist-slab soffit panels, riser shutters, side cheeks and landing soffit · sizes in mm")}
          {list.map((s) => <View key={s.code} style={{ marginBottom: 6 }}><StairCell s={s} /></View>)}
          <Footer info={info} page={++pg} pages={totalPages} title="STAIRCASE MODULATION" />
        </Page>
      ))}
      {accessories.length ? (
        <Page size="A3" orientation="landscape" style={pageStyle}>
          {head("ACCESSORY SCHEDULE — ONE TYPICAL-FLOOR SET", "Each line shows how it was counted. Standard Mivan practice; confirm against the engineering drawings.")}
          <AccessoryTable rows={accessories} />
          <Footer info={info} page={++pg} pages={totalPages} title="ACCESSORY SCHEDULE" />
        </Page>
      ) : null}
    </Document>
  );
}
