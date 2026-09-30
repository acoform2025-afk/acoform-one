import path from "node:path";
import { Document, Font, G, Image, Line, Page, Path, Polygon, Svg, Text, View } from "@react-pdf/renderer";
import { stripOutline, type ShellGeometry } from "@/lib/floor-plans/shell";
import type { Pt } from "@/lib/floor-plans/calc";
import type { FaceMarks } from "@/lib/floor-plans/panel-marks";
import type { FaceLayout, PanelResult } from "@/lib/design-engine/floor-panels";
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
const ORANGE = "#ef9d2f", GRAY = "#6b6d68", DARK = "#1f2937", PANEL = "#c2410c", FILL = "#dc2626";
const d = (pts: Pt[], closed: boolean) => pts.map((p, i) => `${i ? "L" : "M"}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(" ") + (closed ? " Z" : "");

const PAGE_W = 1191, PAGE_H = 842, M = 18, SIDE = 300;
const DRAW_W = PAGE_W - 2 * M - SIDE - 10, DRAW_H = PAGE_H - 2 * M - 24;
const FIRST_ROWS = 52;

export type PanelSheetInfo = { company: string; project: string; client: string; planName: string; drawingNo: string; rev: string; date: string; options: string };

function FaceRows({ faces, size = 6.8 }: { faces: FaceLayout[]; size?: number }) {
  const W = ["16%", "13%", "56%", "15%"];
  const row = (c: string[], bold = false, bg?: string, key?: string) => (
    <View key={key} style={{ flexDirection: "row", backgroundColor: bg, borderBottomWidth: 0.3, borderColor: "#ccc" }} wrap={false}>
      {c.map((v, i) => <Text key={i} style={{ width: W[i], paddingVertical: 1.2, paddingHorizontal: 2.5, fontWeight: bold ? "bold" : "normal", textAlign: i === 1 || i === 3 ? "right" : "left" }}>{v}</Text>)}
    </View>
  );
  return (
    <View style={{ borderWidth: 0.5, borderColor: "#999", fontSize: size }}>
      {row(["Face", "Length", "Panels (from start of face)", "Top"], true, "#fdf3e4")}
      {faces.map((f) => row([f.code, String(f.length), panelString(f), f.top ? String(f.top) : "—"], false, undefined, f.code))}
    </View>
  );
}

export function PanelLayoutDocument({ g, marks, r, info }: { g: ShellGeometry; marks: FaceMarks[]; r: PanelResult; info: PanelSheetInfo }) {
  const [x0, y0, x1, y1] = g.box;
  const bw = Math.max(1, x1 - x0), bh = Math.max(1, y1 - y0);
  const sc = Math.min(DRAW_W / bw, DRAW_H / bh);
  const w = bw * sc, h = bh * sc;
  const px = (pt: number) => pt / sc;
  const pxPerM = g.mpp > 0 ? 1 / g.mpp : 0;
  const tick = px(2.2), fs = px(4.6);
  const s = r.summary;
  const faces = r.faces;
  const panels = faces.reduce((a, f) => a + f.panels.length, 0), fillers = faces.filter((f) => f.filler).length;
  // face labels: skip any that would overlap one already placed (the face is still in the schedule)
  const placed: [number, number, number, number][] = [];
  const labels = new Map<string, Pt>();
  for (const m of [...marks].sort((a, b) => Math.hypot(b.b[0] - b.a[0], b.b[1] - b.a[1]) - Math.hypot(a.b[0] - a.a[0], a.b[1] - a.a[1]))) {
    const at: Pt = [m.mid[0] + m.n[0] * tick * 2.2, m.mid[1] + m.n[1] * tick * 2.2];
    const hw = (m.code.length * fs * 0.55) / 2 + fs * 0.2, hh = fs * 0.6;
    const box: [number, number, number, number] = [at[0] - hw, at[1] - hh, at[0] + hw, at[1] + hh];
    if (placed.some((q) => box[0] < q[2] && box[2] > q[0] && box[1] < q[3] && box[3] > q[1])) continue;
    placed.push(box); labels.set(m.code, at);
  }

  return (
    <Document title={`Panel layout ${info.drawingNo}`} author={info.company}>
      <Page size="A3" orientation="landscape" style={{ fontFamily: "Carlito", fontSize: 8, color: "#222", padding: M }}>
        <View style={{ position: "absolute", left: M - 6, top: M - 6, right: M - 6, bottom: M - 6, borderWidth: 1, borderColor: DARK }} fixed />
        <View style={{ flexDirection: "row", height: PAGE_H - 2 * M - 4 }} wrap={false}>
          <View style={{ width: DRAW_W + 4, alignItems: "center", justifyContent: "center" }}>
            <Svg width={w} height={h} viewBox={`${x0} ${y0} ${bw} ${bh}`}>
              {(g.dxf.slab ?? []).map((l, i) => <Path key={`s${i}`} d={d(l.pts, l.closed)} stroke="#93c5fd" strokeWidth={px(0.4)} fill="none" />)}
              {(g.dxf.opening ?? []).map((l, i) => <Path key={`o${i}`} d={d(l.pts, l.closed)} stroke="#a78bfa" strokeWidth={px(0.4)} fill="#f5f3ff" />)}
              {(g.dxf.walls ?? []).map((l, i) => <Path key={`w${i}`} d={d(l.pts, l.closed)} stroke="#6b7280" strokeWidth={px(0.5)} fill="none" />)}
              {(g.dxf.columns ?? []).map((l, i) => <Path key={`c${i}`} d={d(l.pts, l.closed)} stroke="#6b7280" strokeWidth={px(0.5)} fill="#d1d5db" />)}
              {g.shapes.filter((x) => x.kind === "slab" || x.kind === "opening").map((x) => <Path key={x.id} d={d(x.pts, true)} stroke={x.kind === "slab" ? "#93c5fd" : "#a78bfa"} strokeWidth={px(0.4)} fill={x.kind === "slab" ? "none" : "#f5f3ff"} />)}
              {g.shapes.filter((x) => x.kind === "wall").map((x) => stripOutline(x.pts, pxPerM ? ((x.t ?? 150) / 2000) * pxPerM : px(1.5)).map((q, i) => (
                <Polygon key={`${x.id}-${i}`} points={q.map((p) => `${p[0]},${p[1]}`).join(" ")} stroke="#6b7280" strokeWidth={px(0.4)} fill="#e5e7eb" />
              )))}
              {g.shapes.filter((x) => x.kind === "column").map((x) => <Path key={x.id} d={d(x.pts, true)} stroke="#6b7280" strokeWidth={px(0.5)} fill="#d1d5db" />)}

              {/* panel faces */}
              {marks.map((m) => (
                <G key={m.code}>
                  <Line x1={m.a[0]} y1={m.a[1]} x2={(m.fillerFrom ?? m.b)[0]} y2={(m.fillerFrom ?? m.b)[1]} stroke={PANEL} strokeWidth={px(0.8)} />
                  {m.fillerFrom ? <Line x1={m.fillerFrom[0]} y1={m.fillerFrom[1]} x2={m.b[0]} y2={m.b[1]} stroke={FILL} strokeWidth={px(1.6)} /> : null}
                  {[m.a, ...m.joints, m.b].map((p, i) => <Line key={i} x1={p[0]} y1={p[1]} x2={p[0] + m.n[0] * tick} y2={p[1] + m.n[1] * tick} stroke={PANEL} strokeWidth={px(0.4)} />)}
                  {labels.has(m.code) ? <Text x={labels.get(m.code)![0]} y={labels.get(m.code)![1] + fs * 0.35} textAnchor="middle" fill={DARK} style={{ fontSize: fs, fontFamily: "Carlito", fontWeight: "bold" }}>{m.code}</Text> : null}
                </G>
              ))}
            </Svg>
          </View>

          <View style={{ width: SIDE, marginLeft: 6, borderLeftWidth: 1, borderColor: DARK, paddingLeft: 8, justifyContent: "space-between" }}>
            <View>
              <Text style={{ fontSize: 11, fontWeight: "bold", color: DARK }}>WALL PANEL LAYOUT — TYPICAL FLOOR</Text>
              <Text style={{ fontSize: 7, color: GRAY, marginBottom: 4 }}>{info.options}</Text>
              <View style={{ flexDirection: "row", borderWidth: 0.5, borderColor: ORANGE, backgroundColor: "#fdf3e4", marginBottom: 4 }}>
                {[["Faces", String(faces.length)], ["Wall panels", String(panels)], ["Fillers", String(fillers)], ["Std. area", `${s.standardPct}%`]].map(([k, v]) => (
                  <View key={k} style={{ flex: 1, padding: 3 }}><Text style={{ fontSize: 6, color: GRAY }}>{k.toUpperCase()}</Text><Text style={{ fontSize: 9, fontWeight: "bold" }}>{v}</Text></View>
                ))}
              </View>
              <View style={{ flexDirection: "row", fontSize: 6.8, marginBottom: 4 }}>
                <View style={{ flexDirection: "row", alignItems: "center", marginRight: 10 }}><View style={{ width: 12, height: 1.5, backgroundColor: PANEL, marginRight: 3 }} /><Text>Panel face, ticks = joints</Text></View>
                <View style={{ flexDirection: "row", alignItems: "center" }}><View style={{ width: 12, height: 3, backgroundColor: FILL, marginRight: 3 }} /><Text>Filler (custom width)</Text></View>
              </View>
              <FaceRows faces={faces.slice(0, FIRST_ROWS)} />
              {faces.length > FIRST_ROWS ? <Text style={{ fontSize: 6.5, color: GRAY, marginTop: 2 }}>+ {faces.length - FIRST_ROWS} more faces on the next page</Text> : null}
            </View>
            <View style={{ borderWidth: 1, borderColor: DARK, fontSize: 7.5 }}>
              <View style={{ flexDirection: "row", alignItems: "center", padding: 4, borderBottomWidth: 0.5, borderColor: DARK }}>
                <Image src={LOGO} style={{ width: 70, height: 22, objectFit: "contain" }} />
                <Text style={{ marginLeft: 6, fontSize: 9, fontWeight: "bold", color: DARK }}>{info.company}</Text>
              </View>
              {[["Project", info.project], ["Client", info.client], ["Drawing", `Panel layout — ${info.planName}`]].map(([k, v]) => (
                <View key={k} style={{ flexDirection: "row", borderBottomWidth: 0.5, borderColor: "#999" }}>
                  <Text style={{ width: "28%", padding: 2.5, color: GRAY }}>{k}</Text><Text style={{ width: "72%", padding: 2.5, fontWeight: "bold" }}>{v}</Text>
                </View>
              ))}
              <View style={{ flexDirection: "row" }}>
                {[["Dwg no.", info.drawingNo], ["Rev", info.rev], ["Date", info.date], ["Scale", "NTS"]].map(([k, v]) => (
                  <View key={k} style={{ width: "25%", padding: 2.5, borderRightWidth: 0.5, borderColor: "#999" }}>
                    <Text style={{ color: GRAY, fontSize: 6.5 }}>{k}</Text><Text style={{ fontWeight: "bold" }}>{v}</Text>
                  </View>
                ))}
              </View>
              <View style={{ height: 3, backgroundColor: ORANGE }} />
            </View>
          </View>
        </View>
      </Page>
      {faces.length > FIRST_ROWS ? (
        <Page size="A4" style={{ fontFamily: "Carlito", fontSize: 8, color: "#222", paddingTop: 30, paddingBottom: 36, paddingHorizontal: 30 }}>
          <Text style={{ fontSize: 11, fontWeight: "bold", color: DARK, marginBottom: 6 }} fixed>WALL FACE SCHEDULE (continued) — {info.drawingNo} {info.rev}</Text>
          <FaceRows faces={faces.slice(FIRST_ROWS)} size={7.5} />
          <Text style={{ marginTop: 6, fontSize: 7, color: GRAY }}>Panel widths in mm, laid from the start of each face. F = filler (custom width). Top = wall top panel height where the clear height exceeds the standard panel. Faces split by a door or window are numbered .1, .2 … Where labels would overlap on the drawing only one is printed.</Text>
          <Text style={{ position: "absolute", bottom: 16, right: 30, fontSize: 7, color: GRAY }} render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`} fixed />
        </Page>
      ) : null}
    </Document>
  );
}
