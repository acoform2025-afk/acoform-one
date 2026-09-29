import path from "node:path";
import { Document, Font, G, Image, Line, Page, Path, Polygon, Svg, Text, View } from "@react-pdf/renderer";
import { stripOutline, type ShellGeometry } from "@/lib/floor-plans/shell";
import type { Pt } from "@/lib/floor-plans/calc";

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
const ORANGE = "#ef9d2f", GRAY = "#6b6d68", DARK = "#1f2937";

export type ShellSheetInfo = {
  company: string; project: string; client: string; planName: string;
  drawingNo: string; rev: string; date: string; drawnBy: string; checkedBy: string;
  notes: string[]; floorHeight: number; slabMm: number;
  totals: [string, string][];
};

const d = (pts: Pt[], closed: boolean) => pts.map((p, i) => `${i ? "L" : "M"}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(" ") + (closed ? " Z" : "");

// A3 landscape: 1191 × 842 pt. Drawing on the left, schedules + title block on the right.
const PAGE_W = 1191, PAGE_H = 842, M = 18, SIDE = 300;
const DRAW_W = PAGE_W - 2 * M - SIDE - 10, DRAW_H = PAGE_H - 2 * M - 24;

function Cell({ w, children, bold, right }: { w: string; children: React.ReactNode; bold?: boolean; right?: boolean }) {
  return <Text style={{ width: w, paddingVertical: 1.5, paddingHorizontal: 3, fontWeight: bold ? "bold" : "normal", textAlign: right ? "right" : "left" }}>{children}</Text>;
}
function Table({ title, head, rows, widths }: { title: string; head: string[]; rows: (string | number)[][]; widths: string[] }) {
  if (!rows.length) return null;
  return (
    <View style={{ marginBottom: 6 }} wrap={false}>
      <Text style={{ fontSize: 8, fontWeight: "bold", color: DARK, marginBottom: 2 }}>{title}</Text>
      <View style={{ borderWidth: 0.5, borderColor: "#999", fontSize: 7 }}>
        <View style={{ flexDirection: "row", backgroundColor: "#fdf3e4", borderBottomWidth: 0.5, borderColor: "#999" }}>
          {head.map((h, i) => <Cell key={h} w={widths[i]} bold right={i > 0}>{h}</Cell>)}
        </View>
        {rows.slice(0, 22).map((r, ri) => (
          <View key={ri} style={{ flexDirection: "row", borderBottomWidth: ri === Math.min(rows.length, 22) - 1 ? 0 : 0.3, borderColor: "#ccc" }}>
            {r.map((c, i) => <Cell key={i} w={widths[i]} right={i > 0}>{String(c)}</Cell>)}
          </View>
        ))}
        {rows.length > 22 ? <Text style={{ padding: 2, color: GRAY }}>+ {rows.length - 22} more (see DXF / area list)</Text> : null}
      </View>
    </View>
  );
}

export function ShellPlanDocument({ g, info }: { g: ShellGeometry; info: ShellSheetInfo }) {
  const [x0, y0, x1, y1] = g.box;
  const bw = Math.max(1, x1 - x0), bh = Math.max(1, y1 - y0);
  const sc = Math.min(DRAW_W / bw, DRAW_H / bh);           // pt per plan px
  const w = bw * sc, h = bh * sc;
  const px = (pt: number) => pt / sc;                        // pt → plan px (line widths, text sizes)
  const pxPerM = g.mpp > 0 ? 1 / g.mpp : 0;
  const S = g.schedules;
  const fs = px(6.8);

  return (
    <Document title={`Shell plan ${info.drawingNo}`} author={info.company}>
      <Page size="A3" orientation="landscape" style={{ fontFamily: "Carlito", fontSize: 8, color: "#222", padding: M }}>
        {/* sheet border */}
        <View style={{ position: "absolute", left: M - 6, top: M - 6, right: M - 6, bottom: M - 6, borderWidth: 1, borderColor: DARK }} fixed />
        <View style={{ flexDirection: "row", height: PAGE_H - 2 * M - 4 }} wrap={false}>
          {/* drawing */}
          <View style={{ width: DRAW_W + 4, alignItems: "center", justifyContent: "center" }}>
            <Svg width={w} height={h} viewBox={`${x0} ${y0} ${bw} ${bh}`}>
              {/* DXF layers */}
              {(g.dxf.slab ?? []).map((l, i) => <Path key={`s${i}`} d={d(l.pts, l.closed)} stroke="#2563eb" strokeWidth={px(0.5)} fill="none" />)}
              {(g.dxf.opening ?? []).map((l, i) => (
                <G key={`o${i}`}>
                  <Path d={d(l.pts, l.closed)} stroke="#7c3aed" strokeWidth={px(0.5)} fill="#ede9fe" />
                  {l.closed ? <Line x1={Math.min(...l.pts.map((p) => p[0]))} y1={Math.min(...l.pts.map((p) => p[1]))} x2={Math.max(...l.pts.map((p) => p[0]))} y2={Math.max(...l.pts.map((p) => p[1]))} stroke="#7c3aed" strokeWidth={px(0.4)} /> : null}
                </G>
              ))}
              {(g.dxf.beams ?? []).map((l, i) => <Path key={`b${i}`} d={d(l.pts, l.closed)} stroke="#db2777" strokeWidth={px(0.5)} strokeDasharray={`${px(3)} ${px(2)}`} fill="none" />)}
              {(g.dxf.walls ?? []).map((l, i) => <Path key={`w${i}`} d={d(l.pts, l.closed)} stroke={DARK} strokeWidth={px(0.7)} fill="none" />)}
              {(g.dxf.columns ?? []).map((l, i) => <Path key={`c${i}`} d={d(l.pts, l.closed)} stroke={DARK} strokeWidth={px(0.6)} fill="#9ca3af" />)}

              {/* drawn elements */}
              {g.shapes.map((s) => {
                if (s.kind === "slab") return <Path key={s.id} d={d(s.pts, true)} stroke="#2563eb" strokeWidth={px(0.6)} fill="#eff6ff" />;
                if (s.kind === "loft") return <Path key={s.id} d={d(s.pts, true)} stroke="#65a30d" strokeWidth={px(0.6)} strokeDasharray={`${px(3)} ${px(2)}`} fill="#f7fee7" />;
                if (s.kind === "opening") {
                  const xs = s.pts.map((p) => p[0]), ys = s.pts.map((p) => p[1]);
                  return (
                    <G key={s.id}>
                      <Path d={d(s.pts, true)} stroke="#7c3aed" strokeWidth={px(0.6)} fill="#ede9fe" />
                      <Line x1={Math.min(...xs)} y1={Math.min(...ys)} x2={Math.max(...xs)} y2={Math.max(...ys)} stroke="#7c3aed" strokeWidth={px(0.5)} />
                      <Line x1={Math.min(...xs)} y1={Math.max(...ys)} x2={Math.max(...xs)} y2={Math.min(...ys)} stroke="#7c3aed" strokeWidth={px(0.5)} />
                    </G>
                  );
                }
                return null;
              })}
              {g.shapes.filter((s) => s.kind === "wall" || s.kind === "beam").map((s) => {
                const th = s.kind === "wall" ? s.t ?? 150 : s.b ?? 200;
                const half = pxPerM ? (th / 1000 / 2) * pxPerM : px(1.5);
                return stripOutline(s.pts, half).map((q, i) => (
                  <Polygon key={`${s.id}-${i}`} points={q.map((p) => `${p[0]},${p[1]}`).join(" ")}
                    stroke={s.kind === "wall" ? DARK : "#db2777"} strokeWidth={px(s.kind === "wall" ? 0.7 : 0.5)}
                    strokeDasharray={s.kind === "beam" ? `${px(3)} ${px(2)}` : undefined} fill={s.kind === "wall" ? "#d1d5db" : "none"} />
                ));
              })}
              {g.shapes.filter((s) => s.kind === "column").map((s) => <Path key={s.id} d={d(s.pts, true)} stroke={DARK} strokeWidth={px(0.6)} fill="#9ca3af" />)}
              {g.shapes.filter((s) => s.kind === "door" || s.kind === "window").map((s) => {
                const [a, b] = s.pts; const dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy) || 1;
                const tk = pxPerM ? ((s.t ?? 150) / 1000) * pxPerM * 0.8 : px(3);
                const nx = (-dy / L) * tk, ny = (dx / L) * tk;
                const col = s.kind === "door" ? "#0d9488" : "#0284c7";
                return (
                  <G key={s.id}>
                    <Line x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} stroke="#ffffff" strokeWidth={tk * 1.6} />
                    <Line x1={a[0] + nx} y1={a[1] + ny} x2={a[0] - nx} y2={a[1] - ny} stroke={col} strokeWidth={px(0.8)} />
                    <Line x1={b[0] + nx} y1={b[1] + ny} x2={b[0] - nx} y2={b[1] - ny} stroke={col} strokeWidth={px(0.8)} />
                    <Line x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} stroke={col} strokeWidth={px(0.5)} strokeDasharray={s.kind === "window" ? undefined : `${px(2)} ${px(1.5)}`} />
                  </G>
                );
              })}
              {/* tags */}
              {g.tags.map((tg, i) => (
                <Text key={i} x={tg.at[0]} y={tg.at[1]} textAnchor="middle" fill={tg.kind === "door" ? "#0f766e" : tg.kind === "window" ? "#0369a1" : tg.kind === "beam" ? "#be185d" : tg.kind === "slab" ? "#1d4ed8" : tg.kind === "loft" ? "#4d7c0f" : DARK}
                  style={{ fontSize: fs, fontFamily: "Carlito", fontWeight: "bold" }}>{tg.text}</Text>
              ))}
            </Svg>
          </View>

          {/* right column */}
          <View style={{ width: SIDE, marginLeft: 6, borderLeftWidth: 1, borderColor: DARK, paddingLeft: 8, justifyContent: "space-between" }}>
            <View>
              <Text style={{ fontSize: 11, fontWeight: "bold", color: DARK }}>SHELL PLAN — TYPICAL FLOOR</Text>
              <Text style={{ fontSize: 7.5, color: GRAY, marginBottom: 6 }}>
                Floor to floor {Math.round(info.floorHeight * 1000)} mm · slab {info.slabMm} mm · all dimensions in mm
              </Text>
              <Table title="DOOR & WINDOW SCHEDULE" head={["Code", "W", "H", "Sill", "Lintel"]} widths={["28%", "18%", "18%", "18%", "18%"]}
                rows={S.openings.map((o) => [o.code, o.w, o.h, o.kind === "Door" ? "—" : o.sill, o.lintel])} />
              <Table title="BEAM SCHEDULE" head={["Code", "Width", "Depth", "Length m"]} widths={["28%", "24%", "24%", "24%"]}
                rows={S.beams.map((b) => [b.code, b.b, b.d, b.len.toFixed(2)])} />
              <Table title="SLAB SCHEDULE" head={["Code", "Thk", "Level", "Area m²"]} widths={["28%", "24%", "24%", "24%"]}
                rows={[...S.slabs.map((s) => [s.code, s.t, s.lvl ? (s.lvl > 0 ? `+${s.lvl}` : s.lvl) : "±0", s.area.toFixed(2)]), ...S.lofts.map((l) => [l.code, l.t, `+${l.lvl}`, l.area.toFixed(2)])]} />
              <Table title="WALLS" head={["Thickness", "Length m"]} widths={["50%", "50%"]} rows={S.walls.map((x) => [`${x.t} mm`, x.len.toFixed(2)])} />
              <Table title="FORMWORK AREA (TYPICAL FLOOR)" head={["Item", "Area"]} widths={["62%", "38%"]} rows={info.totals} />

              {/* legend */}
              <Text style={{ fontSize: 8, fontWeight: "bold", color: DARK, marginTop: 2, marginBottom: 2 }}>LEGEND</Text>
              <View style={{ flexDirection: "row", flexWrap: "wrap", fontSize: 7 }}>
                {[["#d1d5db", "RCC wall"], ["#9ca3af", "Column"], ["#eff6ff", "Slab"], ["#ede9fe", "Duct / cut-out"], ["#f7fee7", "Loft / ledge"], ["#db2777", "Beam (dashed)"], ["#0d9488", "Door"], ["#0284c7", "Window"]].map(([c, l]) => (
                  <View key={l} style={{ flexDirection: "row", alignItems: "center", width: "50%", marginBottom: 2 }}>
                    <View style={{ width: 9, height: 6, backgroundColor: c, borderWidth: 0.5, borderColor: "#555", marginRight: 4 }} />
                    <Text>{l}</Text>
                  </View>
                ))}
              </View>
              {info.notes.length ? (
                <View style={{ marginTop: 5 }}>
                  <Text style={{ fontSize: 8, fontWeight: "bold", color: DARK, marginBottom: 1 }}>NOTES</Text>
                  {info.notes.slice(0, 10).map((n, i) => <Text key={i} style={{ fontSize: 7 }}>{i + 1}. {n}</Text>)}
                </View>
              ) : null}
            </View>

            {/* title block */}
            <View style={{ borderWidth: 1, borderColor: DARK, fontSize: 7.5 }}>
              <View style={{ flexDirection: "row", alignItems: "center", padding: 4, borderBottomWidth: 0.5, borderColor: DARK }}>
                <Image src={LOGO} style={{ width: 70, height: 22, objectFit: "contain" }} />
                <Text style={{ marginLeft: 6, fontSize: 9, fontWeight: "bold", color: DARK }}>{info.company}</Text>
              </View>
              {[["Project", info.project], ["Client", info.client], ["Drawing", `Shell plan — ${info.planName}`]].map(([k, v]) => (
                <View key={k} style={{ flexDirection: "row", borderBottomWidth: 0.5, borderColor: "#999" }}>
                  <Text style={{ width: "28%", padding: 2.5, color: GRAY }}>{k}</Text><Text style={{ width: "72%", padding: 2.5, fontWeight: "bold" }}>{v}</Text>
                </View>
              ))}
              <View style={{ flexDirection: "row", borderBottomWidth: 0.5, borderColor: "#999" }}>
                {[["Dwg no.", info.drawingNo], ["Rev", info.rev], ["Date", info.date], ["Scale", "NTS"]].map(([k, v]) => (
                  <View key={k} style={{ width: "25%", padding: 2.5, borderRightWidth: 0.5, borderColor: "#999" }}>
                    <Text style={{ color: GRAY, fontSize: 6.5 }}>{k}</Text><Text style={{ fontWeight: "bold" }}>{v}</Text>
                  </View>
                ))}
              </View>
              <View style={{ flexDirection: "row" }}>
                {[["Drawn", info.drawnBy], ["Checked", info.checkedBy], ["Client approval (sign / date)", ""]].map(([k, v], i) => (
                  <View key={k} style={{ width: i === 2 ? "46%" : "27%", height: 34, padding: 2.5, borderRightWidth: i === 2 ? 0 : 0.5, borderColor: "#999" }}>
                    <Text style={{ color: GRAY, fontSize: 6.5 }}>{k}</Text><Text style={{ fontWeight: "bold" }}>{v}</Text>
                  </View>
                ))}
              </View>
              <View style={{ height: 3, backgroundColor: ORANGE }} />
            </View>
          </View>
        </View>
      </Page>
    </Document>
  );
}
