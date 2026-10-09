/**
 * "Tentative area calculation" sheet — the same layout ACOFORM uses by hand:
 * rows SLAB / DUCT / WALL TOP · WALL LENGTH · BEAM LENGTH · STAIRCASE (· COLUMNS), each with the highlighted
 * drawing, the measured figure, and a numbered box with the calculation; total = 1+2+3+4, then + add %.
 */
import path from "node:path";
import { Document, Font, G, Line, Page, Path, Rect, Svg, Text, View } from "@react-pdf/renderer";
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

const RED = "#e0242b", GREEN = "#1db31d", BLUE = "#1f3fbf", GRAYL = "#9ca3af", INK = "#111";

export type SheetGeo = {
  box: [number, number, number, number];     // drawing units (y up)
  walls: Pt[][];                             // wall outlines (closed)
  wallLines: Pt[][];                         // loose wall lines
  slab: Pt[][]; ducts: Pt[][]; gaps: [Pt, Pt][]; stairs: [number, number, number, number][];
  columns: Pt[][];
  parapets?: Pt[][]; edgeBeams?: [Pt, Pt][];
  beams?: Pt[][]; beamDepths?: number[];      // beam outlines and their depths (mm) — the 3D view of a column-and-beam frame
};
export type SheetSection = { no: number; key: string; title: string; heading: string; lines: string[]; total: string; value: number; figure: string; panes: ("slab" | "duct" | "walltop" | "walls" | "beams" | "stairs" | "columns" | "none")[] };
export type SheetInfo = { title: string; project: string; client: string; planName: string; date: string; company: string; extraPct: number; contact: number; quote: number; nonTypical: { label: string; area: number }[]; set: number };

const d = (pts: Pt[], closed: boolean) => pts.map((p, i) => `${i ? "L" : "M"}${p[0].toFixed(0)} ${(-p[1]).toFixed(0)}`).join(" ") + (closed ? " Z" : "");
const n2 = (v: number) => v.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function Pane({ geo, kind, w, h }: { geo: SheetGeo | null; kind: SheetSection["panes"][number]; w: number; h: number }) {
  if (!geo || kind === "none") return null;
  const [x0, y0, x1, y1] = geo.box;
  const bw = Math.max(1, x1 - x0), bh = Math.max(1, y1 - y0), pad = Math.max(bw, bh) * 0.04;
  const sc = Math.min((w - 8) / (bw + 2 * pad), (h - 8) / (bh + 2 * pad));
  const lw = (pt: number) => pt / sc;
  const vb = `${x0 - pad} ${-y1 - pad} ${bw + 2 * pad} ${bh + 2 * pad}`;
  const walls = (color: string, width: number, fill?: string) => (
    <G>
      {geo.walls.map((r, i) => <Path key={`w${i}`} d={d(r, true)} stroke={color} strokeWidth={lw(width)} fill={fill ?? "none"} />)}
      {geo.wallLines.map((r, i) => <Path key={`l${i}`} d={d(r, false)} stroke={color} strokeWidth={lw(width)} fill="none" />)}
    </G>
  );
  return (
    <Svg width={(bw + 2 * pad) * sc} height={(bh + 2 * pad) * sc} viewBox={vb}>
      {kind === "slab" ? geo.slab.map((r, i) => <Path key={i} d={d(r, true)} stroke={GREEN} strokeWidth={lw(0.9)} fill="none" />) : null}
      {kind === "duct" ? geo.ducts.map((r, i) => <Path key={i} d={d(r, true)} stroke={GREEN} strokeWidth={lw(0.9)} fill="none" />) : null}
      {kind === "walltop" ? walls(GREEN, 0.5, "#c9f2c9") : null}
      {kind === "walls" ? walls(GREEN, 0.6) : null}
      {kind === "beams" ? (
        <G>
          {walls(GRAYL, 0.3)}
          {geo.gaps.map(([a, b], i) => <Line key={i} x1={a[0]} y1={-a[1]} x2={b[0]} y2={-b[1]} stroke={GREEN} strokeWidth={lw(1.6)} />)}
        </G>
      ) : null}
      {kind === "stairs" ? (
        <G>
          {walls(GRAYL, 0.3)}
          {geo.stairs.map((s, i) => <Rect key={i} x={s[0]} y={-s[3]} width={s[2] - s[0]} height={s[3] - s[1]} stroke={GREEN} strokeWidth={lw(1.4)} fill="#c9f2c9" />)}
        </G>
      ) : null}
      {kind === "columns" ? (
        <G>
          {walls(GRAYL, 0.3)}
          {geo.columns.map((r, i) => <Path key={i} d={d(r, true)} stroke={GREEN} strokeWidth={lw(1)} fill="#c9f2c9" />)}
        </G>
      ) : null}
    </Svg>
  );
}

// A3 landscape 1191 × 842
const PW = 1191, PH = 842, M = 22;
const KEY_W = 250, PANE_W = 175, INFO_W = 175, NUM_W = 30;
const HEAD = 14;

export function AreaSheetDocument({ geo, info, sections }: { geo: SheetGeo | null; info: SheetInfo; sections: SheetSection[] }) {
  return (
    <Document title={`Area calculation — ${info.planName}`} author={info.company}>
      <AreaSheetPage geo={geo} info={info} sections={sections} />
    </Document>
  );
}

/** Several sheets in one PDF (all blocks of a project, both wall options …). */
export function AreaSheetsDocument({ title, company, sheets }: { title: string; company: string; sheets: { geo: SheetGeo | null; info: SheetInfo; sections: SheetSection[] }[] }) {
  return (
    <Document title={title} author={company}>
      {sheets.map((sh, i) => <AreaSheetPage key={i} geo={sh.geo} info={sh.info} sections={sh.sections} />)}
    </Document>
  );
}

export function AreaSheetPage({ geo, info, sections }: { geo: SheetGeo | null; info: SheetInfo; sections: SheetSection[] }) {
  const rowsH = PH - 2 * M - 40 - 110;                      // title + total box
  const ROW = Math.min(122, Math.floor(rowsH / Math.max(1, sections.length)) - HEAD - 6);
  const gridX = KEY_W + 30;
  return (
      <Page size="A3" orientation="landscape" style={{ fontFamily: "Carlito", fontSize: 8, color: INK, padding: M }}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end" }}>
          <Text style={{ fontSize: 15 }}>{info.title}</Text>
          <Text style={{ fontSize: 8, color: "#555" }}>{info.project}{info.client ? ` · ${info.client}` : ""} · {info.planName} · {info.date}</Text>
        </View>
        <View style={{ marginTop: 6, borderWidth: 0.8, borderColor: "#333", height: PH - 2 * M - 28, padding: 14, flexDirection: "row" }}>
          {/* key plan */}
          <View style={{ width: KEY_W }}>
            <View style={{ borderWidth: 0.8, borderColor: "#333", height: 150, alignItems: "center", justifyContent: "center", marginTop: HEAD + 4 }}>
              {geo ? (
                <Svg width={KEY_W - 8} height={142} viewBox={`${geo.box[0]} ${-geo.box[3]} ${geo.box[2] - geo.box[0]} ${geo.box[3] - geo.box[1]}`}>
                  {geo.walls.map((r, i) => <Path key={i} d={d(r, true)} stroke={BLUE} strokeWidth={(geo.box[2] - geo.box[0]) / 700} fill="#dbe3ff" />)}
                  {geo.ducts.map((r, i) => <Path key={`d${i}`} d={d(r, true)} stroke={RED} strokeWidth={(geo.box[2] - geo.box[0]) / 600} fill="none" />)}
                </Svg>
              ) : <Text style={{ color: "#777" }}>Plan measured on screen</Text>}
            </View>
            <Text style={{ marginTop: 4, fontSize: 7.5, color: "#555" }}>Typical floor · per floor figures</Text>
          </View>
          {/* rows */}
          <View style={{ marginLeft: gridX - KEY_W, flexGrow: 1 }}>
            {sections.map((s) => (
              <View key={s.key} style={{ marginBottom: 6 }} wrap={false}>
                <View style={{ flexDirection: "row", marginBottom: 2 }}>
                  {[0, 1, 2].map((i) => {
                    const p = s.panes[i];
                    const label = i === 0 ? s.heading : p === "duct" ? "DUCT" : p === "walltop" ? "WALL TOP" : " ";
                    return <View key={i} style={{ width: PANE_W }}><Text style={{ color: RED, fontSize: 11 }}>{label}</Text></View>;
                  })}
                </View>
                <View style={{ flexDirection: "row", borderWidth: 0.8, borderColor: "#333", height: ROW }}>
                  {[0, 1, 2].map((i) => {
                    const kind = s.panes[i] ?? "none";
                    const fig = i === 0 ? s.figure : kind === "duct" ? (s.lines.find((l) => l.startsWith("DUCT AREA"))?.split("=")[1]?.trim() ?? "") : kind === "walltop" ? (s.lines.find((l) => l.startsWith("WALL TOP AREA"))?.split("=")[1]?.trim() ?? "") : "";
                    return (
                      <View key={i} style={{ width: PANE_W, borderRightWidth: 0.8, borderColor: "#333", alignItems: "center", justifyContent: "center", position: "relative" }}>
                        <Pane geo={geo} kind={kind} w={PANE_W} h={ROW - 16} />
                        {fig ? <Text style={{ position: "absolute", right: 0, bottom: 0, width: 60, borderTopWidth: 0.8, borderLeftWidth: 0.8, borderColor: "#333", textAlign: "center", fontSize: 7.5, paddingVertical: 2 }}>{fig}</Text> : null}
                      </View>
                    );
                  })}
                  <View style={{ width: INFO_W + NUM_W, flexDirection: "row" }}>
                    <Text style={{ width: NUM_W, height: 30, borderRightWidth: 0.8, borderBottomWidth: 0.8, borderColor: "#333", fontSize: 22, textAlign: "center" }}>{s.no}</Text>
                    <View style={{ width: INFO_W, padding: 6 }}>
                      <Text style={{ textAlign: "center", fontSize: 7.5, marginBottom: 8 }}>{s.title}</Text>
                      {s.lines.map((l, i) => <Text key={i} style={{ fontSize: 7.5 }}>{l}</Text>)}
                      <Text style={{ marginTop: 8, color: RED, fontSize: 7.5, textAlign: "center" }}>{s.total}</Text>
                    </View>
                  </View>
                </View>
              </View>
            ))}
            {/* total */}
            <View style={{ flexDirection: "row", justifyContent: "flex-end" }} wrap={false}>
              <View style={{ width: INFO_W + NUM_W, borderWidth: 0.8, borderColor: "#333", padding: 10, alignItems: "center" }}>
                <Text style={{ fontSize: 10 }}>TOTAL AREA FOR TYPICAL FLOOR</Text>
                <Text style={{ fontSize: 10, marginTop: 4 }}>={sections.map((s) => s.no).join("+")}</Text>
                <Text style={{ fontSize: 12, color: RED, marginTop: 6 }}>= {info.contact.toLocaleString("en-IN", { maximumFractionDigits: 3, minimumFractionDigits: 3 })} SQM</Text>
                {info.extraPct ? <Text style={{ fontSize: 12, color: RED, marginTop: 2 }}>ADD {info.extraPct}% = {Math.round(info.quote).toLocaleString("en-IN")} SQM</Text> : null}
                {info.nonTypical.length ? (
                  <View style={{ marginTop: 6, alignItems: "center" }}>
                    <Text style={{ fontSize: 8.5 }}>ADDITIONAL FOR NON-TYPICAL FLOORS</Text>
                    {info.nonTypical.map((x, i) => <Text key={i} style={{ fontSize: 8 }}>{x.label} = {n2(x.area)}</Text>)}
                    <Text style={{ fontSize: 11, color: RED, marginTop: 3 }}>FORMWORK SET = {Math.round(info.set).toLocaleString("en-IN")} SQM</Text>
                  </View>
                ) : null}
                <Text style={{ fontSize: 7, marginTop: 4, color: "#555" }}>One set is reused on all floors (typical floor basis).</Text>
              </View>
            </View>
          </View>
        </View>
      </Page>
  );
}
