/**
 * Wall-face modulation drawings: an elevation of every wall face type showing the panel arrangement —
 * standard panels (width), wall-top pieces, fillers, opening pieces, tie positions and overall dimensions.
 * Identical faces are grouped into one type (M01 × n) so the set stays short and shop-friendly.
 */
import path from "node:path";
import { Document, Font, G, Image, Line, Page, Rect, Svg, Text, View } from "@react-pdf/renderer";
import type { FaceLayout } from "@/lib/design-engine/floor-panels";
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

function Footer({ info, page, pages }: { info: ModInfo; page: number; pages: number }) {
  return (
    <View fixed style={{ position: "absolute", left: M, right: M, bottom: M, height: FOOT - 6, borderTopWidth: 1.2, borderColor: ORANGE, flexDirection: "row", alignItems: "center", paddingTop: 4, fontSize: 7.5 }}>
      <Image src={LOGO} style={{ width: 70, height: 22, objectFit: "contain" }} />
      <View style={{ marginLeft: 10, flexGrow: 1 }}>
        <Text style={{ fontWeight: "bold", fontSize: 9 }}>WALL MODULATION — TYPICAL FLOOR · {info.planName}</Text>
        <Text style={{ color: GRAY }}>{info.project} · {info.client} · {info.note}</Text>
      </View>
      <View style={{ width: 230, alignItems: "flex-end" }}>
        <Text>{info.company}</Text>
        <Text style={{ color: GRAY }}>Dwg {info.drawingNo} · Rev {info.rev} · {info.date} · Sheet {page}/{pages}</Text>
      </View>
    </View>
  );
}

export function ModulationDocument({ types, info, totalFaces }: { types: ModType[]; info: ModInfo; totalFaces: number }) {
  const maxLen = Math.max(1, ...types.map((t) => t.face.length));
  const maxH = Math.max(1, ...types.map((t) => t.face.height));
  const sc = Math.min((CELL_W - 50) / maxLen, (CELL_H - 62) / maxH);   // one scale for every elevation
  const scaleTxt = `1:${Math.round(1 / (sc * 0.35278))}`;   // sc = pt per mm; 1 pt = 0.35278 mm on paper
  const perPage = COLS * ROWS;
  const pages: ModType[][] = [];
  for (let i = 0; i < types.length; i += perPage) pages.push(types.slice(i, i + perPage));
  const schedRows = types.slice(0, 60);
  const totalPages = pages.length + 1;
  return (
    <Document title={`Wall modulation — ${info.planName}`} author={info.company}>
      {/* sheet 1: schedule of face types */}
      <Page size="A3" orientation="landscape" style={{ fontFamily: "Carlito", fontSize: 8, padding: M, paddingBottom: M + FOOT }}>
        <Text style={{ fontSize: 15, fontWeight: "bold" }}>WALL MODULATION SCHEDULE</Text>
        <Text style={{ color: GRAY, marginBottom: 8 }}>{totalFaces} wall faces grouped into {types.length} types. Wall panels {info.stdHeight} mm high + top pieces; F = filler (made to size); black dots = tie positions (@ {info.tieH} h × {info.tieV} v). All sizes in mm.</Text>
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
        <Footer info={info} page={1} pages={totalPages} />
      </Page>
      {/* elevation sheets */}
      {pages.map((list, pi) => (
        <Page key={pi} size="A3" orientation="landscape" style={{ fontFamily: "Carlito", fontSize: 8, padding: M, paddingBottom: M + FOOT }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
            <Text style={{ fontSize: 12, fontWeight: "bold" }}>WALL FACE ELEVATIONS (viewed from the panel side)</Text>
            <Text style={{ color: GRAY }}>Scale {scaleTxt} on A3 · black dots = ties · red = filler · cream = wall-top piece</Text>
          </View>
          <View style={{ flexDirection: "row", flexWrap: "wrap", marginTop: 6 }}>
            {list.map((t, i) => (
              <View key={t.code} style={{ width: CELL_W, height: CELL_H, padding: 4, borderWidth: 0.4, borderColor: "#ddd", marginRight: i % COLS === COLS - 1 ? 0 : GAP, marginBottom: 6 }} wrap={false}>
                <Text style={{ fontSize: 9, fontWeight: "bold" }}>{t.code} <Text style={{ fontWeight: "normal", color: GRAY }}>× {t.count} · {t.face.length} long · {panelString(t.face)}{t.face.top ? ` · top ${t.face.top}` : ""}</Text></Text>
                <Text style={{ fontSize: 6.5, color: GRAY, marginBottom: 3 }}>Faces: {t.faces.slice(0, 18).join(", ")}{t.faces.length > 18 ? ` +${t.faces.length - 18}` : ""}</Text>
                <Elevation t={t} sc={sc} tieH={info.tieH} tieV={info.tieV} stdHeight={info.stdHeight} />
              </View>
            ))}
          </View>
          <Footer info={info} page={pi + 2} pages={totalPages} />
        </Page>
      ))}
    </Document>
  );
}
