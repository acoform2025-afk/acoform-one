/**
 * Assembly drawings (A3): one plan of the typical floor per panel family, as in a professional formwork package
 * (e.g. Guangzhou Motian 'Formwork assembly diagram'): 1 wall panels, 2 corners · soffit corners · kickers,
 * 3 beams, 4 deck panels, 5 supports (mid beams + prop heads), 6 drop formwork & walers note.
 * Geometry in metres (plan x right, y down).
 */
import path from "node:path";
import { Document, Font, G, Image, Line, Page, Path, Rect, Svg, Text, View, Circle } from "@react-pdf/renderer";
import type { Pt } from "@/lib/floor-plans/calc";
import type { Zone } from "@/lib/floor-plans/zones";

const PUBLIC = path.join(process.cwd(), "public");
Font.register({ family: "Carlito", fonts: [{ src: path.join(PUBLIC, "fonts", "Carlito-Regular.ttf") }, { src: path.join(PUBLIC, "fonts", "Carlito-Bold.ttf"), fontWeight: "bold" }] });
Font.registerHyphenationCallback((w) => [w]);
const LOGO = path.join(PUBLIC, "brand", "acoform-logo.png");
const ORANGE = "#ef9d2f", GRAY = "#6b6d68", WALLF = "#d6d3d1", WALLS = "#57534e";

export type AsmFace = { code: string; a: Pt; b: Pt; n: Pt; panels: number[]; filler: number; top: number; column: boolean };
export type AsmBeam = { code: string; size: string; pieces: number[]; sides: number; bottom: boolean; n: number };
export type AsmInfo = { company: string; project: string; client: string; planName: string; drawingNo: string; rev: string; date: string; system: string };
export type AsmData = { walls: Pt[][]; faces: AsmFace[]; zones: Zone[]; beamRings: Pt[][]; beams: AsmBeam[]; slab: Pt[][]; propSpacing: number; corners: { at: Pt; ext: boolean }[]; sunkNote: string; walerNote: string };

const PW = 1191, PH = 842, M = 20, FOOT = 46;
const d = (pts: Pt[], closed = true) => pts.map((p, i) => `${i ? "L" : "M"}${p[0].toFixed(3)} ${p[1].toFixed(3)}`).join(" ") + (closed ? " Z" : "");
const COLORS = ["#2563eb", "#16a34a", "#9333ea", "#ea580c", "#0891b2", "#be123c"];

function Footer({ info, page, pages, title }: { info: AsmInfo; page: number; pages: number; title: string }) {
  return (
    <View fixed style={{ position: "absolute", left: M, right: M, bottom: M, height: FOOT - 6, borderTopWidth: 1.2, borderColor: ORANGE, flexDirection: "row", alignItems: "center", paddingTop: 4, fontSize: 7.5 }}>
      <Image src={LOGO} style={{ width: 70, height: 22, objectFit: "contain" }} />
      <View style={{ marginLeft: 10, flexGrow: 1 }}>
        <Text style={{ fontWeight: "bold", fontSize: 9 }}>{title} — TYPICAL FLOOR · {info.planName}</Text>
        <Text style={{ color: GRAY }}>{info.project} · {info.client} · {info.system}</Text>
      </View>
      <View style={{ width: 230, alignItems: "flex-end" }}>
        <Text>{info.company}</Text>
        <Text style={{ color: GRAY }}>Dwg {info.drawingNo} · Rev {info.rev} · {info.date} · Sheet {page}/{pages}</Text>
      </View>
    </View>
  );
}

function Plan({ data, box, w, h, children }: { data: AsmData; box: number[]; w: number; h: number; children: (k: { lw: (pt: number) => number; fs: (pt: number) => number }) => React.ReactNode }) {
  const pad = Math.max(box[2] - box[0], box[3] - box[1]) * 0.03 + 0.3;
  const bx0 = box[0] - pad, by0 = box[1] - pad, bw = box[2] - box[0] + 2 * pad, bh = box[3] - box[1] + 2 * pad;
  const sc = Math.min(w / bw, h / bh);
  const k = { lw: (pt: number) => pt / sc, fs: (pt: number) => pt / sc };
  return (
    <Svg width={bw * sc} height={bh * sc} viewBox={`${bx0} ${by0} ${bw} ${bh}`}>
      {data.slab.length ? <Path d={data.slab.map((r) => d(r)).join(" ")} fill="#ffffff" fillRule="evenodd" stroke="#94a3b8" strokeWidth={k.lw(0.4)} /> : null}
      {children(k)}
      {data.walls.length ? <Path d={data.walls.map((r) => d(r)).join(" ")} fill={WALLF} fillRule="evenodd" stroke={WALLS} strokeWidth={k.lw(0.35)} /> : null}
    </Svg>
  );
}

export function AssemblyDocument({ data, info }: { data: AsmData; info: AsmInfo }) {
  const pts = [...data.walls.flat(), ...data.zones.flatMap((z) => z.rings[0]), ...data.slab.flat()];
  const box = pts.length ? [Math.min(...pts.map((p) => p[0])), Math.min(...pts.map((p) => p[1])), Math.max(...pts.map((p) => p[0])), Math.max(...pts.map((p) => p[1]))] : [0, 0, 10, 10];
  const W = PW - 2 * M, H = PH - 2 * M - FOOT - 46;
  const pageStyle = { fontFamily: "Carlito", fontSize: 8, padding: M, paddingBottom: M + FOOT } as const;
  const sheets = 6;
  const head = (t: string, sub: string) => (
    <View style={{ marginBottom: 4 }}>
      <Text style={{ fontSize: 13, fontWeight: "bold" }}>{t}</Text>
      <Text style={{ color: GRAY }}>{sub}</Text>
    </View>
  );
  // wall panels: drawn as strips along each face, alternating colours, width labels
  const wallSheet = (
    <Plan data={data} box={box} w={W} h={H}>{({ lw, fs }) => data.faces.map((f) => {
      const L = Math.hypot(f.b[0] - f.a[0], f.b[1] - f.a[1]); if (L < 0.05) return null;
      const ux = (f.b[0] - f.a[0]) / L, uy = (f.b[1] - f.a[1]) / L, o1 = 0.03, o2 = 0.13;
      let t = 0;
      const pieces = [...f.panels.map((p) => ({ w: p / 1000, fill: false })), ...(f.filler ? [{ w: f.filler / 1000, fill: true }] : [])];
      return (
        <G key={f.code}>
          {pieces.map((p, i) => {
            const a: Pt = [f.a[0] + ux * t, f.a[1] + uy * t]; t += p.w; const b: Pt = [f.a[0] + ux * t, f.a[1] + uy * t];
            const q: Pt[] = [[a[0] + f.n[0] * o1, a[1] + f.n[1] * o1], [b[0] + f.n[0] * o1, b[1] + f.n[1] * o1], [b[0] + f.n[0] * o2, b[1] + f.n[1] * o2], [a[0] + f.n[0] * o2, a[1] + f.n[1] * o2]];
            const c = p.fill ? "#dc2626" : f.column ? "#7c3aed" : COLORS[i % 2];
            return <Path key={i} d={d(q)} fill={c} fillOpacity={0.35} stroke={c} strokeWidth={lw(0.2)} />;
          })}
          <Text x={(f.a[0] + f.b[0]) / 2 + f.n[0] * 0.32} y={(f.a[1] + f.b[1]) / 2 + f.n[1] * 0.32} style={{ fontSize: fs(3.2), fontFamily: "Carlito", color: "#1f2937" }}>
            {f.code}: {[...f.panels.map(String), ...(f.filler ? [`F${f.filler}`] : [])].join("+")}{f.top ? ` /T${f.top}` : ""}
          </Text>
        </G>
      );
    })}</Plan>
  );
  const cornerSheet = (
    <Plan data={data} box={box} w={W} h={H}>{({ lw, fs }) => (
      <G>
        {data.faces.map((f) => <Line key={f.code} x1={f.a[0] + f.n[0] * 0.06} y1={f.a[1] + f.n[1] * 0.06} x2={f.b[0] + f.n[0] * 0.06} y2={f.b[1] + f.n[1] * 0.06} stroke="#0891b2" strokeWidth={lw(1.1)} />)}
        {data.slab.map((r, i) => <Path key={`k${i}`} d={d(r)} fill="none" stroke="#92400e" strokeWidth={lw(1.6)} strokeDasharray={`${lw(4)} ${lw(2)}`} />)}
        {data.corners.map((c, i) => <Rect key={`c${i}`} x={c.at[0] - 0.08} y={c.at[1] - 0.08} width={0.16} height={0.16} fill={c.ext ? "#dc2626" : "#16a34a"} />)}
        <Text x={box[0]} y={box[1] - fs(6)} style={{ fontSize: fs(6), fontFamily: "Carlito" }}> </Text>
      </G>
    )}</Plan>
  );
  const beamSheet = (
    <Plan data={data} box={box} w={W} h={H}>{({ lw }) => (
      <G>{data.beamRings.map((r, i) => <Path key={i} d={d(r)} fill="#fbcfe8" stroke="#be185d" strokeWidth={lw(0.5)} />)}</G>
    )}</Plan>
  );
  const deckSheet = (
    <Plan data={data} box={box} w={W} h={H}>{({ lw, fs }) => data.zones.map((z) => (
      <G key={z.code}>
        {z.panels.map((p) => <Rect key={p.no} x={p.x0} y={p.y0} width={p.x1 - p.x0} height={p.y1 - p.y0} fill={p.custom ? "#fecaca" : "#dcfce7"} stroke="#166534" strokeWidth={lw(0.2)} />)}
        {z.specials.map((s, i) => <Path key={i} d={s.rings.map((r) => d(r)).join(" ")} fill="#fca5a5" fillRule="evenodd" />)}
        <Text x={(z.box[0] + z.box[2]) / 2 - fs(5)} y={(z.box[1] + z.box[3]) / 2} style={{ fontSize: fs(8), fontFamily: "Carlito", fontWeight: "bold", color: "#b91c1c" }}>{z.code}</Text>
      </G>
    ))}</Plan>
  );
  const sp = Math.max(0.6, data.propSpacing);
  const supportSheet = (
    <Plan data={data} box={box} w={W} h={H}>{({ lw }) => data.zones.map((z) => (
      <G key={z.code}>
        <Path d={z.rings.map((r) => d(r)).join(" ")} fill="#f0f9ff" fillRule="evenodd" stroke="#0e7490" strokeWidth={lw(0.3)} />
        {z.mb.map(([a, b], i) => {
          const L = Math.hypot(b[0] - a[0], b[1] - a[1]); const n = Math.max(1, Math.ceil(L / sp));
          return (
            <G key={i}>
              <Line x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} stroke="#2563eb" strokeWidth={lw(1)} />
              {Array.from({ length: n + 1 }, (_, k) => <Circle key={k} cx={a[0] + ((b[0] - a[0]) * k) / n} cy={a[1] + ((b[1] - a[1]) * k) / n} r={0.07} fill="#dc2626" />)}
            </G>
          );
        })}
      </G>
    ))}</Plan>
  );
  const beamTable = (
    <View style={{ position: "absolute", right: M + 6, top: M + 40, width: 260, fontSize: 6.8, backgroundColor: "#ffffff", borderWidth: 0.5, borderColor: "#ddd", padding: 4 }}>
      <Text style={{ fontWeight: "bold" }}>Beam types</Text>
      {data.beams.slice(0, 40).map((b) => <Text key={b.code + b.size}>{b.code} {b.size}{b.n > 1 ? ` ×${b.n}` : ""}: {b.pieces.length} pieces/side · {b.sides} side{b.sides > 1 ? "s" : ""}{b.bottom ? " + bottom" : ""}</Text>)}
    </View>
  );
  const S = [
    { t: "1 · WALL PANELS — ASSEMBLY PLAN", sub: "Panels along every wall face (alternating blue / green), red = filler / special, violet = column set (cast first). Label: face: panel widths in order + top panel height.", el: wallSheet },
    { t: "2 · CORNERS, SOFFIT CORNERS & KICKERS", sub: "Cyan = soffit corner along the top of every wall face · brown dashed = external kicker along the slab edge · green squares = internal corners, red = external corners.", el: cornerSheet },
    { t: "3 · BEAMS — SIDE & BOTTOM PANELS", sub: "Pink = beam bottoms (beam side panels on both sides). Panel make-up of each beam type in the table.", el: beamSheet },
    { t: "4 · DECK PANELS", sub: "Deck panels room by room (numbered on the deck installation drawing), red = special size / made-to-size pieces.", el: deckSheet },
    { t: "5 · SUPPORTS — MID BEAMS & PROP HEADS", sub: `Blue = mid beam lines between deck rows, red dots = prop heads / props @ ≤ ${sp.toFixed(2)} m.`, el: supportSheet },
  ];
  return (
    <Document title={`Assembly plans — ${info.planName}`} author={info.company}>
      {S.map((s, i) => (
        <Page key={i} size="A3" orientation="landscape" style={pageStyle}>
          {head(s.t, s.sub)}
          {s.el}
          {i === 2 ? beamTable : null}
          <Footer info={info} page={i + 1} pages={sheets} title="ASSEMBLY PLANS" />
        </Page>
      ))}
      <Page size="A3" orientation="landscape" style={pageStyle}>
        {head("6 · NOTES — WALERS, DROP FORMWORK, ACCESSORIES", "See the Excel lists of the design package for quantities.")}
        <View style={{ fontSize: 10, marginTop: 10 }}>
          <Text>• {data.walerNote}</Text>
          <Text style={{ marginTop: 6 }}>• {data.sunkNote}</Text>
          <Text style={{ marginTop: 6 }}>• Pins, wedges, ties and sleeves include the loss % of the panel layout rules; props and prop heads include the extra sets kept under the floors below.</Text>
          <Text style={{ marginTop: 6 }}>• Check every special panel against the production drawings before cutting; walls marked as a separate set (core) are not in this package.</Text>
        </View>
        <Footer info={info} page={sheets} pages={sheets} title="ASSEMBLY PLANS" />
      </Page>
    </Document>
  );
}
