/**
 * Deck installation drawings (A3): key plan of the typical floor with every deck zone (M1, M2 …), every deck panel
 * in place, mid-beam lines and made-to-size specials; then one enlarged sheet section per zone with each panel's
 * number; then the numbering list (deck + wall panels). Coordinates in metres, plan axes (x right, y down).
 */
import path from "node:path";
import { Document, Font, G, Image, Line, Page, Path, Rect, Svg, Text, View } from "@react-pdf/renderer";
import type { Pt } from "@/lib/floor-plans/calc";
import type { Zone } from "@/lib/floor-plans/zones";

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
const ORANGE = "#ef9d2f", GRAY = "#6b6d68", ZONE = "#cfeef2", PANEL = "#e3ecfb", SPEC = "#fca5a5", WALL = "#3f6212", MB = "#2563eb", RED = "#b91c1c";

export type InstallInfo = { company: string; project: string; client: string; planName: string; drawingNo: string; rev: string; date: string };
export type WallPanelNo = { no: string; face: string; code: string; w: number; h: number };

const PW = 1191, PH = 842, M = 20, FOOT = 46;
const d = (pts: Pt[], closed = true) => pts.map((p, i) => `${i ? "L" : "M"}${p[0].toFixed(2)} ${p[1].toFixed(2)}`).join(" ") + (closed ? " Z" : "");
const chunk = <T,>(a: T[], n: number) => { const out: T[][] = []; for (let i = 0; i < a.length; i += n) out.push(a.slice(i, i + n)); return out; };

function Footer({ info, page, pages, title }: { info: InstallInfo; page: number; pages: number; title: string }) {
  return (
    <View fixed style={{ position: "absolute", left: M, right: M, bottom: M, height: FOOT - 6, borderTopWidth: 1.2, borderColor: ORANGE, flexDirection: "row", alignItems: "center", paddingTop: 4, fontSize: 7.5 }}>
      <Image src={LOGO} style={{ width: 70, height: 22, objectFit: "contain" }} />
      <View style={{ marginLeft: 10, flexGrow: 1 }}>
        <Text style={{ fontWeight: "bold", fontSize: 9 }}>{title} — TYPICAL FLOOR · {info.planName}</Text>
        <Text style={{ color: GRAY }}>{info.project} · {info.client}</Text>
      </View>
      <View style={{ width: 230, alignItems: "flex-end" }}>
        <Text>{info.company}</Text>
        <Text style={{ color: GRAY }}>Dwg {info.drawingNo} · Rev {info.rev} · {info.date} · Sheet {page}/{pages}</Text>
      </View>
    </View>
  );
}

/** Draws zones (and optionally walls) into a w × h box; box = the area of the plan to show (metres). */
function PlanSvg({ zones, walls, box, w, h, numbers, codes }: { zones: Zone[]; walls: Pt[][]; box: [number, number, number, number]; w: number; h: number; numbers: boolean; codes: boolean }) {
  const pad = Math.max(box[2] - box[0], box[3] - box[1]) * 0.03 + 0.2;
  const bx0 = box[0] - pad, by0 = box[1] - pad, bw = box[2] - box[0] + 2 * pad, bh = box[3] - box[1] + 2 * pad;
  const sc = Math.min(w / bw, h / bh);
  const lw = (pt: number) => pt / sc;
  const fs = (pt: number) => pt / sc;
  const inBox = (b: number[]) => b[2] >= bx0 && b[0] <= bx0 + bw && b[3] >= by0 && b[1] <= by0 + bh;
  // walls as one even-odd path (outer rings and their holes)
  const wallPath = walls.map((r) => d(r)).join(" ");
  return (
    <Svg width={bw * sc} height={bh * sc} viewBox={`${bx0} ${by0} ${bw} ${bh}`}>
      {zones.filter((z) => inBox(z.box)).map((z) => (
        <G key={z.code}>
          <Path d={z.rings.map((r) => d(r)).join(" ")} fill={ZONE} fillRule="evenodd" stroke="#0e7490" strokeWidth={lw(0.4)} />
          {z.specials.map((s, i) => <Path key={`s${i}`} d={s.rings.map((r) => d(r)).join(" ")} fill={SPEC} fillRule="evenodd" stroke={RED} strokeWidth={lw(0.3)} />)}
          {z.panels.map((p) => (
            <G key={p.no}>
              <Rect x={p.x0} y={p.y0} width={p.x1 - p.x0} height={p.y1 - p.y0} fill={p.custom ? SPEC : PANEL} stroke="#1f2937" strokeWidth={lw(0.25)} />
              {numbers && Math.min(p.x1 - p.x0, p.y1 - p.y0) * sc > 7 ? (
                <Text x={p.x0 + (p.x1 - p.x0) / 2 - fs(4.2)} y={p.y0 + (p.y1 - p.y0) / 2 + fs(1.6)} style={{ fontSize: fs(4.6), fontFamily: "Carlito", color: p.custom ? RED : "#111" }}>{p.no.split("-").pop()}</Text>
              ) : null}
            </G>
          ))}
          {z.mb.map(([a, b], i) => <Line key={`m${i}`} x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} stroke={MB} strokeWidth={lw(0.9)} />)}
        </G>
      ))}
      {wallPath ? <Path d={wallPath} fill="#6b8e23" fillOpacity={0.55} fillRule="evenodd" stroke={WALL} strokeWidth={lw(0.4)} /> : null}
      {codes ? zones.filter((z) => inBox(z.box)).map((z) => {
        const cx = (z.box[0] + z.box[2]) / 2, cy = (z.box[1] + z.box[3]) / 2;
        const size = Math.max(fs(6), Math.min(fs(16), Math.min(z.box[2] - z.box[0], z.box[3] - z.box[1]) * 0.35));
        return <Text key={`c${z.code}`} x={cx - size * 0.6} y={cy + size * 0.35} style={{ fontSize: size, fontFamily: "Carlito", fontWeight: "bold", color: RED }}>{z.code}</Text>;
      }) : null}
    </Svg>
  );
}

function ZoneTable({ z }: { z: Zone }) {
  const types = new Map<string, { code: string; w: number; L: number; nos: string[]; custom: boolean }>();
  for (const p of z.panels) { const k = p.code; const t = types.get(k) ?? { code: p.code, w: p.w, L: p.L, nos: [], custom: p.custom }; t.nos.push(p.no.split("-").pop()!); types.set(k, t); }
  const rows = [...types.values()].sort((a, b) => Number(a.custom) - Number(b.custom) || b.w - a.w);
  return (
    <View style={{ fontSize: 6.4 }}>
      {rows.map((t) => (
        <Text key={t.code} style={{ color: t.custom ? RED : "#111" }}>{t.code} ({t.w}×{t.L}) × {t.nos.length}: {t.nos.join(", ")}</Text>
      ))}
      {z.specialArea > 0.02 ? <Text style={{ color: RED }}>Made-to-size specials: {z.specialArea.toFixed(2)} m² (red, no number)</Text> : null}
    </View>
  );
}

export function InstallationDocument({ zones, walls, wallPanels, info }: { zones: Zone[]; walls: Pt[][]; wallPanels: WallPanelNo[]; info: InstallInfo }) {
  const all = zones.flatMap((z) => z.panels);
  const box: [number, number, number, number] = [
    Math.min(...zones.map((z) => z.box[0])), Math.min(...zones.map((z) => z.box[1])),
    Math.max(...zones.map((z) => z.box[2])), Math.max(...zones.map((z) => z.box[3])),
  ];
  // zone sheets: big zones alone, small ones four to a sheet
  const big = zones.filter((z) => z.panels.length > 60), small = zones.filter((z) => z.panels.length <= 60);
  const zonePages: Zone[][] = [...big.map((z) => [z]), ...chunk(small, 4)];
  const deckRows = all.map((p) => ({ no: p.no, zone: p.no.split("-")[0], code: p.code, size: `${p.w} × ${p.L}`, special: p.custom }));
  const listRows = [...deckRows.map((r) => [r.no, r.zone, r.code, r.size, r.special ? "special" : ""]), ...wallPanels.map((r) => [r.no, r.face, r.code, `${r.w} × ${r.h}`, /^WF|^WT/.test(r.code) ? "special" : ""])];
  const PER = 4 * 46;
  const listPages = chunk(listRows, PER);
  const totalPages = 1 + zonePages.length + listPages.length;
  let pg = 0;
  const stdCount = all.filter((p) => !p.custom).length;
  const specArea = zones.reduce((a, z) => a + z.specialArea, 0);
  const area = zones.reduce((a, z) => a + z.area, 0);
  const pageStyle = { fontFamily: "Carlito", fontSize: 8, padding: M, paddingBottom: M + FOOT } as const;
  return (
    <Document title={`Deck installation — ${info.planName}`} author={info.company}>
      <Page size="A3" orientation="landscape" style={pageStyle}>
        <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
          <Text style={{ fontSize: 13, fontWeight: "bold" }}>DECK LAYOUT — KEY PLAN ({zones.length} zones)</Text>
          <Text style={{ color: GRAY }}>{all.length} deck panels ({stdCount} standard, {all.length - stdCount} special size) · specials to size {specArea.toFixed(1)} m² · zones {area.toFixed(1)} m²</Text>
        </View>
        <Text style={{ color: GRAY, marginBottom: 4 }}>Green = walls · cyan = deck zone M1, M2 … · blue lines = mid beams / prop heads between panel rows · red = special size panels / made-to-size pieces. Panel rows run across the short side of each zone.</Text>
        <PlanSvg zones={zones} walls={walls} box={box} w={PW - 2 * M} h={PH - 2 * M - FOOT - 40} numbers={false} codes />
        <Footer info={info} page={++pg} pages={totalPages} title="DECK INSTALLATION" />
      </Page>
      {zonePages.map((list, i) => {
        const one = list.length === 1;
        const cw = one ? PW - 2 * M - 4 : (PW - 2 * M - 24) / 2, ch = one ? PH - 2 * M - FOOT - 30 : (PH - 2 * M - FOOT - 30) / 2 - 6;
        return (
          <Page key={i} size="A3" orientation="landscape" style={pageStyle}>
            <Text style={{ fontSize: 12, fontWeight: "bold", marginBottom: 4 }}>DECK INSTALLATION — ZONE{one ? "" : "S"} {list.map((z) => z.code).join(", ")}</Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
              {list.map((z, k) => (
                <View key={z.code} style={{ width: cw, height: ch, borderWidth: 0.4, borderColor: "#ddd", padding: 4, marginRight: !one && k % 2 === 0 ? 10 : 0, marginBottom: 6, flexDirection: "row" }} wrap={false}>
                  <View style={{ width: cw * 0.66 }}>
                    <Text style={{ fontSize: 10, fontWeight: "bold", color: RED }}>{z.code} <Text style={{ color: GRAY, fontWeight: "normal", fontSize: 8 }}>{z.area.toFixed(2)} m² · {z.panels.length} panels · rows along {z.along === "x" ? "width" : "depth"}</Text></Text>
                    <PlanSvg zones={[z]} walls={walls} box={z.box} w={cw * 0.66 - 8} h={ch - 26} numbers codes={false} />
                  </View>
                  <View style={{ width: cw * 0.34 - 10, paddingLeft: 4 }}>
                    <Text style={{ fontWeight: "bold", marginBottom: 2 }}>Panels in {z.code} (number on the plan = last digits)</Text>
                    <ZoneTable z={z} />
                  </View>
                </View>
              ))}
            </View>
            <Footer info={info} page={++pg} pages={totalPages} title="DECK INSTALLATION" />
          </Page>
        );
      })}
      {listPages.map((rows, i) => (
        <Page key={`l${i}`} size="A3" orientation="landscape" style={pageStyle}>
          <Text style={{ fontSize: 12, fontWeight: "bold", marginBottom: 4 }}>PANEL NUMBERING LIST {i === 0 ? `(${deckRows.length} deck panels · ${wallPanels.length} wall panels)` : "(continued)"}</Text>
          <View style={{ flexDirection: "row" }}>
            {chunk(rows, 46).map((col, c) => (
              <View key={c} style={{ width: "25%", paddingRight: 6, fontSize: 6.6 }}>
                <View style={{ flexDirection: "row", backgroundColor: "#fdf3e4", fontWeight: "bold" }}>
                  {["No.", "Zone / face", "Code", "Size"].map((h, j) => <Text key={h} style={{ width: ["24%", "18%", "34%", "24%"][j], padding: 1.5 }}>{h}</Text>)}
                </View>
                {col.map((r) => (
                  <View key={r[0]} style={{ flexDirection: "row", borderBottomWidth: 0.2, borderColor: "#ddd" }}>
                    {r.slice(0, 4).map((v, j) => <Text key={j} style={{ width: ["24%", "18%", "34%", "24%"][j], padding: 1.2, color: r[4] ? RED : "#111" }}>{v}</Text>)}
                  </View>
                ))}
              </View>
            ))}
          </View>
          <Footer info={info} page={++pg} pages={totalPages} title="PANEL NUMBERING" />
        </Page>
      ))}
    </Document>
  );
}
