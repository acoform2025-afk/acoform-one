/**
 * Special-panel production drawings (A3): schedule + pin-hole check, then one shop drawing per special panel type —
 * front view with pin holes on every edge and the stiffener ribs, hole dimension chains, edge section and cutting list.
 */
import path from "node:path";
import { Circle, Document, Font, G, Image, Line, Page, Rect, Svg, Text, View } from "@react-pdf/renderer";
import { FAB, ruleText, type FabSpec } from "@/lib/design-engine/fabrication";

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
const ORANGE = "#ef9d2f", GRAY = "#6b6d68", RED = "#b91c1c", SKIN = "#e3ecfb";
export type FabInfo = { company: string; project: string; client: string; planName: string; drawingNo: string; rev: string; date: string };

const PW = 1191, PH = 842, M = 20, FOOT = 46;
const CW = Math.floor((PW - 2 * M - 12) / 2), CH = Math.floor((PH - 2 * M - FOOT - 26) / 2) - 6;
const chunk = <T,>(a: T[], n: number) => { const out: T[][] = []; for (let i = 0; i < a.length; i += n) out.push(a.slice(i, i + n)); return out; };
const T = (x: number, y: number, s: string, size = 6, color = "#111") => <Text x={x} y={y} style={{ fontSize: size, fontFamily: "Carlito", color }}>{s}</Text>;

function Footer({ info, page, pages }: { info: FabInfo; page: number; pages: number }) {
  return (
    <View fixed style={{ position: "absolute", left: M, right: M, bottom: M, height: FOOT - 6, borderTopWidth: 1.2, borderColor: ORANGE, flexDirection: "row", alignItems: "center", paddingTop: 4, fontSize: 7.5 }}>
      <Image src={LOGO} style={{ width: 70, height: 22, objectFit: "contain" }} />
      <View style={{ marginLeft: 10, flexGrow: 1 }}>
        <Text style={{ fontWeight: "bold", fontSize: 9 }}>SPECIAL PANEL PRODUCTION DRAWINGS — {info.planName}</Text>
        <Text style={{ color: GRAY }}>{info.project} · {info.client} · ACOFORM WORK PVT LTD. PATTERN · skin {FAB.skin} mm Al plate · rails {FAB.railDepth} deep · pin holes Ø{FAB.holeDia} +0.1 at {FAB.holeFromFace} from concrete face</Text>
      </View>
      <View style={{ width: 230, alignItems: "flex-end" }}>
        <Text>{info.company}</Text>
        <Text style={{ color: GRAY }}>Dwg {info.drawingNo} · Rev {info.rev} · {info.date} · Sheet {page}/{pages}</Text>
      </View>
    </View>
  );
}

function Panel({ s, no }: { s: FabSpec; no: number }) {
  const viewW = CW * 0.6, viewH = CH - 40;
  const sc = Math.min((viewW - 60) / s.w, (viewH - 50) / s.h);
  const x0 = 40, y0 = 14, w = s.w * sc, h = s.h * sc;
  const X = (mm: number) => x0 + mm * sc, Y = (mm: number) => y0 + h - mm * sc;     // base at the bottom
  const r = Math.max(1.2, Math.min(3, (FAB.holeDia / 2) * sc));
  const inset = Math.max(2.2, 20 * sc);
  return (
    <View style={{ width: CW, height: CH, borderWidth: 0.5, borderColor: "#ccc", padding: 5, flexDirection: "row" }} wrap={false}>
      <View style={{ width: viewW }}>
        <Text style={{ fontSize: 9.5, fontWeight: "bold" }}>SP-{String(no).padStart(2, "0")}  {s.code} <Text style={{ fontWeight: "normal", color: GRAY }}>× {s.qty} nos · {s.w} × {s.h} · {s.kgEach.toFixed(2)} kg each</Text></Text>
        <Text style={{ fontSize: 7, color: GRAY }}>{s.description}</Text>
        <Svg width={viewW} height={viewH}>
          <Rect x={x0} y={y0} width={w} height={h} fill={SKIN} stroke="#1f2937" strokeWidth={0.8} />
          <Rect x={x0 + 1.5} y={y0 + 1.5} width={Math.max(0, w - 3)} height={Math.max(0, h - 3)} fill="none" stroke="#6b7280" strokeWidth={0.4} />
          {/* ribs */}
          {s.ribs.map((z, i) => s.ribAcross === "w"
            ? <Line key={i} x1={x0 + 2} y1={Y(z)} x2={x0 + w - 2} y2={Y(z)} stroke="#6b7280" strokeWidth={0.6} strokeDasharray="3 2" />
            : <Line key={i} x1={X(z)} y1={y0 + 2} x2={X(z)} y2={y0 + h - 2} stroke="#6b7280" strokeWidth={0.6} strokeDasharray="3 2" />)}
          {/* pin holes on the four edge rails */}
          {s.holesH.map((z, i) => <G key={`h${i}`}><Circle cx={x0 + inset} cy={Y(z)} r={r} fill="#fff" stroke={RED} strokeWidth={0.7} /><Circle cx={x0 + w - inset} cy={Y(z)} r={r} fill="#fff" stroke={RED} strokeWidth={0.7} /></G>)}
          {s.holesW.map((z, i) => <G key={`w${i}`}><Circle cx={X(z)} cy={y0 + inset} r={r} fill="#fff" stroke={RED} strokeWidth={0.7} /><Circle cx={X(z)} cy={y0 + h - inset} r={r} fill="#fff" stroke={RED} strokeWidth={0.7} /></G>)}
          {/* hole chain along the height (left) */}
          <Line x1={x0 - 14} y1={Y(0)} x2={x0 - 14} y2={Y(s.h)} stroke="#111" strokeWidth={0.4} />
          {[0, ...s.holesH, s.h].map((z, i) => <Line key={`dh${i}`} x1={x0 - 17} y1={Y(z)} x2={x0 - 11} y2={Y(z)} stroke="#111" strokeWidth={0.4} />)}
          {s.holesH.map((z, i) => <G key={`th${i}`}>{T(2, Y(z) + 2, String(z), 5.5)}</G>)}
          {/* hole chain along the width (bottom) */}
          <Line x1={X(0)} y1={y0 + h + 12} x2={X(s.w)} y2={y0 + h + 12} stroke="#111" strokeWidth={0.4} />
          {[0, ...s.holesW, s.w].map((z, i) => <Line key={`dw${i}`} x1={X(z)} y1={y0 + h + 9} x2={X(z)} y2={y0 + h + 15} stroke="#111" strokeWidth={0.4} />)}
          {s.holesW.map((z, i) => <G key={`tw${i}`}>{T(X(z) - 5, y0 + h + 23, String(z), 5.5)}</G>)}
          {T(X(s.w / 2) - 8, y0 + h + 33, `W ${s.w}`, 7)}
          {T(x0 + w + 6, Y(s.h / 2), `H ${s.h}`, 7)}
          {T(x0 + w + 6, Y(s.h / 2) + 10, "base ↓", 5.5, GRAY)}
        </Svg>
      </View>
      <View style={{ width: CW * 0.4 - 12, paddingLeft: 6, fontSize: 6.8 }}>
        <Text style={{ fontWeight: "bold", marginBottom: 2 }}>EDGE SECTION</Text>
        <Svg width={120} height={52}>
          <Rect x={10} y={10} width={90} height={FAB.skin * 0.8} fill="#9ca3af" />
          <Rect x={10} y={10} width={FAB.railT * 0.8} height={FAB.railDepth * 0.55} fill="#6b7280" />
          <Circle cx={10 + FAB.railT * 0.4} cy={10 + FAB.holeFromFace * 0.55} r={3} fill="#fff" stroke={RED} strokeWidth={0.6} />
          {T(18, 30, `rail ${FAB.railDepth} deep, hole Ø${FAB.holeDia} at ${FAB.holeFromFace} from concrete face`, 5.5)}
          {T(18, 8, `skin ${FAB.skin} mm`, 5.5)}
        </Svg>
        <Text style={{ fontWeight: "bold", marginTop: 4, marginBottom: 2 }}>CUTTING LIST (per panel)</Text>
        {s.cut.map((c) => <Text key={c.part}>{c.nos} × {c.part} — {c.size} mm · {c.kg.toFixed(2)} kg</Text>)}
        <Text style={{ marginTop: 3 }}>Total {s.kgEach.toFixed(2)} kg × {s.qty} = <Text style={{ fontWeight: "bold" }}>{(s.kgEach * s.qty).toFixed(1)} kg</Text></Text>
        <Text style={{ marginTop: 4, color: GRAY }}>Holes: height edges {s.holesH.length} each · width edges {s.holesW.length} each · {ruleText(s.kind)} (ACOFORM standard — same grid as the standard panels).</Text>
        <Text style={{ color: GRAY }}>Ribs: {s.ribs.length} @ {FAB.ribPitch} across the {s.ribAcross === "w" ? "width" : "height"}.</Text>
        {s.warnings.map((w) => <Text key={w} style={{ color: RED, marginTop: 2 }}>! {w}</Text>)}
      </View>
    </View>
  );
}

export function FabricationDocument({ specs, check, info }: { specs: FabSpec[]; check: { code: string; issue: string }[]; info: FabInfo }) {
  const pages = chunk(specs, 4);
  const total = 1 + pages.length;
  let pg = 0;
  const style = { fontFamily: "Carlito", fontSize: 8, padding: M, paddingBottom: M + FOOT } as const;
  const kg = specs.reduce((a, s) => a + s.kgEach * s.qty, 0), pcs = specs.reduce((a, s) => a + s.qty, 0);
  const COLW = ["7%", "16%", "33%", "12%", "7%", "10%", "15%"];
  return (
    <Document title={`Special panels — ${info.planName}`} author={info.company}>
      <Page size="A3" orientation="landscape" style={style}>
        <Text style={{ fontSize: 14, fontWeight: "bold" }}>SPECIAL PANEL SCHEDULE — PRODUCTION ORDER</Text>
        <Text style={{ color: GRAY, marginBottom: 6 }}>{specs.length} special panel types · {pcs} pieces · {kg.toFixed(0)} kg aluminium. Standard catalogue panels are not drawn. Holes follow the standard grid so they meet the pins of the standard panels.</Text>
        <View style={{ borderWidth: 0.6, borderColor: "#999" }}>
          <View style={{ flexDirection: "row", backgroundColor: "#fdf3e4", fontWeight: "bold" }}>
            {["Mark", "Code", "Description", "Size (mm)", "Nos", "kg each", "Total kg"].map((h, i) => <Text key={h} style={{ width: COLW[i], padding: 3 }}>{h}</Text>)}
          </View>
          {specs.slice(0, 70).map((s, i) => (
            <View key={s.code} style={{ flexDirection: "row", borderTopWidth: 0.3, borderColor: "#ddd" }} wrap={false}>
              {[`SP-${String(i + 1).padStart(2, "0")}`, s.code, s.description, `${s.w} × ${s.h}`, String(s.qty), s.kgEach.toFixed(2), (s.kgEach * s.qty).toFixed(1)].map((v, j) => <Text key={j} style={{ width: COLW[j], padding: 2.2, color: s.warnings.length && j === 1 ? RED : "#111" }}>{v}</Text>)}
            </View>
          ))}
          {specs.length > 70 ? <Text style={{ padding: 3, color: GRAY }}>+ {specs.length - 70} more types on the drawing sheets / in the Excel cutting list</Text> : null}
        </View>
        <Text style={{ fontSize: 10, fontWeight: "bold", marginTop: 8 }}>PIN-HOLE CHECK</Text>
        {check.length ? check.slice(0, 30).map((c, i) => <Text key={i} style={{ color: RED }}>• {c.code}: {c.issue}</Text>) : <Text>All special panels use the standard hole grid — holes line up with the neighbouring panels.</Text>}
        {check.length > 30 ? <Text style={{ color: GRAY }}>+ {check.length - 30} more on the drawing sheets</Text> : null}
        <Footer info={info} page={++pg} pages={total} />
      </Page>
      {pages.map((list, pi) => (
        <Page key={pi} size="A3" orientation="landscape" style={style}>
          <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
            {list.map((s, i) => <View key={s.code} style={{ marginRight: i % 2 === 0 ? 12 : 0, marginBottom: 6 }}><Panel s={s} no={pi * 4 + i + 1} /></View>)}
          </View>
          <Footer info={info} page={++pg} pages={total} />
        </Page>
      ))}
    </Document>
  );
}
