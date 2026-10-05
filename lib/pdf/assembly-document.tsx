/**
 * Formwork assembly diagram (A3 landscape), as in a professional formwork package (e.g. Guangzhou Motian
 * 'Formwork assembly diagram'): one plan sheet per part family on the greyed base plan, every piece drawn at its
 * place with its code — 0 setting-out plan, 1 wall & column panels, 2 corners · soffit corners · kickers,
 * 3 beam side & bottom panels, 4 deck panels · keels · prop heads, 5 walers & ties, 6 stairs, 7 notes.
 * Big floors are split into tiles (several sheets per family) so that the codes stay readable; each sheet
 * carries its part list and a key plan. Geometry in metres (plan x right, y down).
 */
import path from "node:path";
import { Document, Font, G, Image, Line, Page, Path, Rect, Svg, Text, View, Circle } from "@react-pdf/renderer";
import type { Pt } from "@/lib/floor-plans/calc";
import { countOf, type AsmFamily, type AsmItem, type AsmModel } from "./assembly-data";

const PUBLIC = path.join(process.cwd(), "public");
Font.register({ family: "Carlito", fonts: [{ src: path.join(PUBLIC, "fonts", "Carlito-Regular.ttf") }, { src: path.join(PUBLIC, "fonts", "Carlito-Bold.ttf"), fontWeight: "bold" }] });
Font.registerHyphenationCallback((w) => [w]);
const LOGO = path.join(PUBLIC, "brand", "acoform-logo.png");
const ORANGE = "#ef9d2f", GRAY = "#6b6d68", WALLF = "#e4e2df", WALLS = "#8a8782", RED = "#b91c1c";

export type AsmInfo = { company: string; project: string; client: string; planName: string; drawingNo: string; rev: string; date: string; system: string; floor?: string };

const PW = 1191, PH = 842, M = 20, FOOT = 46, LIST_W = 170, HEAD_H = 34;
/** One sheet per part family: the paper grows (A3 → A2 → A1 → A0 landscape) until the whole floor fits at a readable scale. */
const PAPERS: { name: string; w: number; h: number }[] = [{ name: "A3", w: 1191, h: 842 }, { name: "A2", w: 1684, h: 1191 }, { name: "A1", w: 2384, h: 1684 }, { name: "A0", w: 3370, h: 2384 }];
function paperFor(box: [number, number, number, number], minSc: number): { name: string; w: number; h: number } {
  const bw = box[2] - box[0] + 0.5, bh = box[3] - box[1] + 0.5;
  for (const p of PAPERS) { const W = p.w - 2 * M - LIST_W - 8, H = p.h - 2 * M - FOOT - HEAD_H - 4; if (Math.min(W / bw, H / bh) >= minSc) return p; }
  return PAPERS[PAPERS.length - 1];
}
const d = (pts: Pt[], closed = true) => pts.map((p, i) => `${i ? "L" : "M"}${p[0].toFixed(3)} ${p[1].toFixed(3)}`).join(" ") + (closed ? " Z" : "");
const FILL: Record<string, string> = { std: "#3b82f6", top: "#60a5fa", fill: "#dc2626", col: "#7c3aed", ic: "#16a34a", ec: "#dc2626", sc: "#0891b2", kick: "#92400e", bside: "#db2777", bbot: "#f472b6", deck: "#22c55e", dspec: "#ef4444", keel: "#2563eb", head: "#dc2626", waler: "#ea580c", tie: "#1f2937", stair: "#22c55e", lsoff: "#16a34a", cheek: "#7c3aed", cpp: "#f59e0b", tz: "#dc2626", stp: "#0891b2", cchan: "#0891b2", riser: "#db2777" };
const fillOf = (k: string) => FILL[k] ?? "#64748b";

function Footer({ info, page, pages, title, scale }: { info: AsmInfo; page: number; pages: number; title: string; scale: string }) {
  return (
    <View fixed style={{ position: "absolute", left: M, right: M, bottom: M, height: FOOT - 6, borderTopWidth: 1.2, borderColor: ORANGE, flexDirection: "row", alignItems: "center", paddingTop: 4, fontSize: 7.5 }}>
      <Image src={LOGO} style={{ width: 70, height: 22, objectFit: "contain" }} />
      <View style={{ marginLeft: 10, flexGrow: 1 }}>
        <Text style={{ fontWeight: "bold", fontSize: 9 }}>FORMWORK ASSEMBLY DIAGRAM — {title} · {info.floor ?? "TYPICAL FLOOR"} · {info.planName}</Text>
        <Text style={{ color: GRAY }}>{info.project} · {info.client} · {info.system} · Scale {scale}</Text>
      </View>
      <View style={{ width: 230, alignItems: "flex-end" }}>
        <Text>{info.company}</Text>
        <Text style={{ color: GRAY }}>Dwg {info.drawingNo} · Rev {info.rev} · {info.date} · Sheet {page}/{pages}</Text>
      </View>
    </View>
  );
}

type K = { sc: number; lw: (pt: number) => number; fs: (pt: number) => number };
/** Base plan (walls grey, slab edge, columns, beams and stairs dashed) under the sheet's pieces. */
function Base({ m, k, light }: { m: AsmModel; k: K; light?: boolean }) {
  const b = m.base;
  return (
    <G>
      {b.slab.length ? <Path d={b.slab.map((r) => d(r)).join(" ")} fill="#ffffff" fillRule="evenodd" stroke="#b6b4b0" strokeWidth={k.lw(0.4)} /> : null}
      {b.walls.length ? <Path d={b.walls.map((r) => d(r)).join(" ")} fill={light ? "#f1f0ee" : WALLF} fillRule="evenodd" stroke={WALLS} strokeWidth={k.lw(0.3)} /> : null}
      {b.cols.map((r, i) => <Path key={`c${i}`} d={d(r)} fill="#c9c6c1" stroke={WALLS} strokeWidth={k.lw(0.3)} />)}
      {b.beams.map((r, i) => <Path key={`b${i}`} d={d(r)} fill="none" stroke="#9ca3af" strokeWidth={k.lw(0.3)} strokeDasharray={`${k.lw(3)} ${k.lw(2)}`} />)}
      {b.stairs.map((r, i) => <Path key={`s${i}`} d={d(r)} fill="none" stroke="#9ca3af" strokeWidth={k.lw(0.3)} strokeDasharray={`${k.lw(2)} ${k.lw(1.5)}`} />)}
    </G>
  );
}
/** Zone numbers (deck zones M1…) as red flags, like the section / zone marks of a layout drawing. */
function ZoneMarks({ m, k }: { m: AsmModel; k: K }) {
  return <G>{m.base.zones.map((z) => <Text key={z.code} x={z.at[0]} y={z.at[1] + k.fs(3)} textAnchor="middle" style={{ fontSize: k.fs(8), fontFamily: "Carlito", fontWeight: "bold", color: RED }}>{z.code}</Text>)}</G>;
}

const ang = (a: Pt, b: Pt) => { let g = (Math.atan2(b[1] - a[1], b[0] - a[0]) * 180) / Math.PI; if (g > 90) g -= 180; if (g <= -90) g += 180; return g; };
/** A label along a direction, kept upright. */
function Lbl({ at, deg, fs, text, color, bold }: { at: Pt; deg: number; fs: number; text: string; color?: string; bold?: boolean }) {
  return (
    <G transform={`translate(${at[0].toFixed(3)}, ${at[1].toFixed(3)}) rotate(${deg.toFixed(1)})`}>
      <Text x={0} y={fs * 0.35} textAnchor="middle" style={{ fontSize: fs, fontFamily: "Carlito", color: color ?? "#111827", fontWeight: bold ? "bold" : "normal" }}>{text}</Text>
    </G>
  );
}

/** Strips (vertical panels seen from above) with tick marks between panels; stacked codes at the same place (panel + top panel) share one label. */
function Strips({ items, k, labels }: { items: AsmItem[]; k: K; labels: boolean }) {
  const t = Math.max(0.065, k.lw(1.6)), fs = k.fs(k.sc > 80 ? 5 : 3.6);
  const groups = new Map<string, AsmItem[]>();
  for (const it of items) { const key = `${it.a[0].toFixed(2)},${it.a[1].toFixed(2)}|${it.b[0].toFixed(2)},${it.b[1].toFixed(2)}`; const g = groups.get(key); if (g) g.push(it); else groups.set(key, [it]); }
  const out: React.ReactNode[] = [];
  let i = 0, shortN = 0;
  for (const g of groups.values()) {
    const it = g[0], n = it.n ?? [0, 0], L = Math.hypot(it.b[0] - it.a[0], it.b[1] - it.a[1]);
    const o1 = 0.005, o2 = o1 + t;
    const q: Pt[] = [[it.a[0] + n[0] * o1, it.a[1] + n[1] * o1], [it.b[0] + n[0] * o1, it.b[1] + n[1] * o1], [it.b[0] + n[0] * o2, it.b[1] + n[1] * o2], [it.a[0] + n[0] * o2, it.a[1] + n[1] * o2]];
    const c = fillOf(it.custom ? "fill" : it.k);
    out.push(<Path key={i++} d={d(q)} fill={c} fillOpacity={0.55} stroke={c} strokeWidth={k.lw(0.25)} />);
    if (!labels || L < 0.22 || it.k === "riser") continue;
    const codes = g.map((x) => x.code).filter((v, j, arr) => arr.indexOf(v) === j);
    const deg = ang(it.a, it.b), mid: Pt = [(it.a[0] + it.b[0]) / 2, (it.a[1] + it.b[1]) / 2];
    const row = L < fs * 0.5 * codes[0].length ? shortN++ % 2 : 0;      // short panels: labels on alternate rows so they do not overlap
    codes.slice(0, 2).forEach((code, j) => {
      const off = o2 + fs * (0.75 + (j + row * codes.length) * 1.05);
      out.push(<Lbl key={i++} at={[mid[0] + n[0] * off, mid[1] + n[1] * off]} deg={deg} fs={j ? fs * 0.85 : fs} text={code} color={it.custom ? RED : j ? "#475569" : "#111827"} />);
    });
  }
  return <G>{out}</G>;
}
/** Horizontal panels (deck, beam bottom, stair soffit) as rectangles with their code inside. */
function Rects({ items, k }: { items: AsmItem[]; k: K }) {
  return (
    <G>{items.map((it, i) => {
      const w = it.b[0] - it.a[0], h = it.b[1] - it.a[1], c = fillOf(it.custom ? "dspec" : it.k);
      const along = h > w, len = Math.max(w, h), short = Math.min(w, h);
      const fs = Math.min(k.fs(k.sc > 80 ? 6 : 4.4), Math.max(k.fs(2.2), (len * 0.9) / (0.48 * Math.max(6, it.code.length))), short * 0.8);
      return (
        <G key={i}>
          <Rect x={it.a[0]} y={it.a[1]} width={Math.max(0.01, w)} height={Math.max(0.01, h)} fill={c} fillOpacity={0.28} stroke={c} strokeWidth={k.lw(0.3)} />
          {fs >= k.fs(2.1) ? <Lbl at={[it.a[0] + w / 2, it.a[1] + h / 2]} deg={along ? -90 : 0} fs={fs} text={it.code} color={it.custom ? RED : "#111827"} /> : null}
        </G>
      );
    })}</G>
  );
}
/** Keels / walers as thick lines with their length code, prop heads and ties as dots. */
function LinesDots({ items, k, width, labels }: { items: AsmItem[]; k: K; width: number; labels: boolean }) {
  const fs = k.fs(3.4);
  return (
    <G>
      {items.filter((it) => it.shape === "line").map((it, i) => {
        const L = Math.hypot(it.b[0] - it.a[0], it.b[1] - it.a[1]), sw = it.k === "tie" ? k.lw(1.3) : Math.max(width, k.lw(1)), thick = sw * k.sc >= 6;
        const px = -(it.b[1] - it.a[1]) / L, py = (it.b[0] - it.a[0]) / L, off = thick ? 0 : sw / 2 + fs * 0.7;
        return (
          <G key={`l${i}`}>
            <Line x1={it.a[0]} y1={it.a[1]} x2={it.b[0]} y2={it.b[1]} stroke={fillOf(it.k)} strokeWidth={sw} strokeOpacity={it.k === "tie" ? 1 : 0.75} />
            {labels && L > 0.45 && it.k !== "tie" ? <Lbl at={[(it.a[0] + it.b[0]) / 2 + px * off, (it.a[1] + it.b[1]) / 2 + py * off]} deg={ang(it.a, it.b)} fs={thick ? Math.min(fs, sw * 0.8) : fs * 0.85} text={it.code} color={thick ? "#ffffff" : "#9a3412"} /> : null}
          </G>
        );
      })}
      {items.filter((it) => it.shape === "dot").map((it, i) => <Circle key={`d${i}`} cx={it.a[0]} cy={it.a[1]} r={it.k === "tie" ? Math.max(0.03, k.lw(0.6)) : Math.max(0.055, k.lw(1.2))} fill={fillOf(it.k)} />)}
    </G>
  );
}

const inTile = (it: AsmItem, t: [number, number, number, number]) => Math.max(it.a[0], it.b[0]) >= t[0] - 0.3 && Math.min(it.a[0], it.b[0]) <= t[2] + 0.3 && Math.max(it.a[1], it.b[1]) >= t[1] - 0.3 && Math.min(it.a[1], it.b[1]) <= t[3] + 0.3;

function scaleText(sc: number) { const s = 1000 / ((sc * 25.4) / 72); const r = s > 100 ? Math.round(s / 10) * 10 : Math.round(s / 5) * 5; return `1:${Math.max(5, r)}`; }

/** The drawing of one tile: Svg sized to the drawing area, viewBox = the tile. */
function Sheet({ m, tile, w, h, children }: { m: AsmModel; tile: [number, number, number, number]; w: number; h: number; children: (k: K) => React.ReactNode }) {
  const pad = 0.25, bx0 = tile[0] - pad, by0 = tile[1] - pad, bw = tile[2] - tile[0] + 2 * pad, bh = tile[3] - tile[1] + 2 * pad;
  const sc = Math.min(w / bw, h / bh);
  const k: K = { sc, lw: (pt) => pt / sc, fs: (pt) => pt / sc };
  return (
    <Svg width={bw * sc} height={bh * sc} viewBox={`${bx0} ${by0} ${bw} ${bh}`}>
      <Rect x={bx0} y={by0} width={bw} height={bh} fill="#ffffff" />
      {children(k)}
    </Svg>
  );
}
function KeyPlan({ m, tile }: { m: AsmModel; tile: [number, number, number, number] }) {
  const b = m.base.box, bw = b[2] - b[0] || 1, bh = b[3] - b[1] || 1, W = 110, sc = Math.min(W / bw, 60 / bh);
  return (
    <View style={{ position: "absolute", right: M + 4, bottom: M + FOOT + 2, borderWidth: 0.5, borderColor: "#cbd5e1", backgroundColor: "#fff", padding: 2 }}>
      <Svg width={bw * sc} height={bh * sc} viewBox={`${b[0]} ${b[1]} ${bw} ${bh}`}>
        {m.base.walls.length ? <Path d={m.base.walls.map((r) => d(r)).join(" ")} fill="#9ca3af" fillRule="evenodd" /> : null}
        <Rect x={tile[0]} y={tile[1]} width={tile[2] - tile[0]} height={tile[3] - tile[1]} fill={RED} fillOpacity={0.15} stroke={RED} strokeWidth={0.4 / sc} />
      </Svg>
      <Text style={{ fontSize: 5.5, color: GRAY, textAlign: "center" }}>key plan</Text>
    </View>
  );
}
function PartList({ rows, title, total }: { rows: { code: string; n: number }[]; title: string; total?: string }) {
  const cols = rows.length > 46 ? 2 : 1, per = Math.ceil(rows.length / cols);
  return (
    <View style={{ position: "absolute", right: M, top: M + HEAD_H, width: LIST_W, bottom: M + FOOT + 72, borderWidth: 0.5, borderColor: "#cbd5e1", backgroundColor: "#ffffff", padding: 4, fontSize: 6.4 }}>
      <Text style={{ fontWeight: "bold", fontSize: 7.5, marginBottom: 2 }}>{title}</Text>
      {total ? <Text style={{ color: GRAY, marginBottom: 2 }}>{total}</Text> : null}
      <View style={{ flexDirection: "row" }}>
        {Array.from({ length: cols }, (_, c) => (
          <View key={c} style={{ flex: 1 }}>
            {rows.slice(c * per, (c + 1) * per).slice(0, 92).map((r) => (
              <View key={r.code} style={{ flexDirection: "row", justifyContent: "space-between", borderBottomWidth: 0.3, borderColor: "#eee" }}><Text>{r.code}</Text><Text>{r.n}</Text></View>
            ))}
          </View>
        ))}
      </View>
      {rows.length > 92 * cols ? <Text style={{ color: GRAY }}>… full list in the Excel part lists</Text> : null}
    </View>
  );
}
function Head({ no, t, sub, part }: { no: string; t: string; sub: string; part?: string }) {
  return (
    <View style={{ height: HEAD_H, marginBottom: 2 }}>
      <Text style={{ fontSize: 13, fontWeight: "bold" }}>{no} · {t}{part ? <Text style={{ color: RED }}>  {part}</Text> : null}</Text>
      <Text style={{ color: GRAY, fontSize: 7.5 }}>{sub}</Text>
    </View>
  );
}
function Legend({ rows }: { rows: [string, string][] }) {
  return (
    <View style={{ position: "absolute", left: M + 2, bottom: M + FOOT + 2, flexDirection: "row", flexWrap: "wrap", backgroundColor: "#ffffffcc", fontSize: 6.2, maxWidth: 700 }}>
      {rows.map(([k, label]) => <View key={k} style={{ flexDirection: "row", alignItems: "center", marginRight: 8 }}><View style={{ width: 8, height: 5, backgroundColor: fillOf(k), opacity: 0.7, marginRight: 2 }} /><Text>{label}</Text></View>)}
    </View>
  );
}

const SHEETS: { no: string; fam: AsmFamily | "base"; t: string; sub: string; legend: [string, string][]; minSc: number }[] = [
  { no: "0", fam: "base", t: "SETTING-OUT PLAN", sub: "Base plan of the floor: walls (grey), columns, beams (dashed), stairs, deck zones M1… and wall face codes W1… — the references used on every other sheet and in the part lists.", legend: [], minSc: 0 },
  { no: "1", fam: "wall", t: "WALL & COLUMN PANELS", sub: "Every wall panel drawn on its face with its code (panel width-height); second line = top / rocker panel above it. Red = filler and over/under-opening pieces (made to size), violet = column panels.", legend: [["std", "wall panel"], ["top", "top panel"], ["fill", "filler / opening piece"], ["col", "column panel"]], minSc: 52 },
  { no: "2", fam: "corner", t: "CORNERS, SOFFIT CORNERS & KICKERS", sub: "Internal corners (green) and external corners (red) at every wall corner, soffit corner along the top of every face (cyan), kicker along the slab edge (brown).", legend: [["ic", "internal corner"], ["ec", "external corner"], ["sc", "soffit corner"], ["kick", "kicker"]], minSc: 44 },
  { no: "3", fam: "beam", t: "BEAM SIDE & BOTTOM PANELS", sub: "Beam side panels on both faces of every beam (pink strips, code BS-height-width) and beam bottom panels (code BB-width-length) on beam prop heads (red dots).", legend: [["bside", "beam side panel"], ["bbot", "beam bottom panel"], ["head", "beam prop head"]], minSc: 48 },
  { no: "4", fam: "deck", t: "DECK PANELS, KEELS & PROP HEADS", sub: "Deck panels zone by zone with their codes (red = made-to-size pieces), keels / mid beams between the rows (blue, code with length) and prop heads in the keel line (red dots).", legend: [["deck", "deck panel"], ["dspec", "special deck"], ["keel", "keel / mid beam"], ["head", "prop head"]], minSc: 52 },
  { no: "5", fam: "waler", t: "WALERS & TIES", sub: "Walers (back stiffeners) on both faces of every wall with their lengths; wall ties drawn through the wall at the panel joints (the lowest row shown — the rows above repeat at the row spacing of the layout rules).", legend: [["waler", "waler (both faces)"], ["tie", "wall tie through the wall"]], minSc: 40 },
  { no: "6", fam: "stair", t: "STAIRCASE FORMWORK", sub: "Each stair at a large scale: flight soffit panels, side (cheek) panels, prop strips, special wall panels cut to the slope, stop panel and C-channel; step covers and nosing angles are listed in the stair sheet.", legend: [["stair", "flight / landing soffit"], ["cheek", "cheek panel"], ["cpp", "prop strip"], ["tz", "special wall panel"], ["stp", "stop panel / C-channel"], ["riser", "riser"], ["head", "stair prop head"]], minSc: 0 },
];

export function AssemblyDocument({ m, info, notes }: { m: AsmModel; info: AsmInfo; notes: string[] }) {
  const pageStyle = { fontFamily: "Carlito", fontSize: 8, padding: M, paddingBottom: M + FOOT } as const;
  const box = m.base.box;
  type Pg = { sheet: (typeof SHEETS)[number]; tile: [number, number, number, number]; part?: string; items: AsmItem[]; rows: { code: string; n: number }[]; total?: string; wide?: boolean; paper: { name: string; w: number; h: number } };
  const pages: Pg[] = [];
  for (const s of SHEETS) {
    if (s.fam === "base") { const t: [number, number, number, number] = [box[0] - 1.1, box[1] - 1.1, box[2] + 0.3, box[3] + 0.3]; pages.push({ sheet: s, tile: t, items: [], rows: [], wide: true, paper: paperFor(t, 25) }); continue; }
    const items = m.items.filter((it) => it.fam === s.fam);
    if (!items.length) continue;
    const rows = countOf(m.items, s.fam);
    const total = `${items.filter((i) => i.shape !== "dot" && i.k !== "keel" && i.k !== "waler").length} panels · ${rows.length} codes`;
    if (s.fam === "stair") {
      const byStair = new Map<string, AsmItem[]>();
      for (const it of items) { const key = it.z ?? "ST"; const g = byStair.get(key); if (g) g.push(it); else byStair.set(key, [it]); }
      // stair prop heads carry no zone: attach them to the nearest stair box
      const boxes = [...byStair].map(([key, g]) => ({ key, b: [Math.min(...g.map((i) => Math.min(i.a[0], i.b[0]))), Math.min(...g.map((i) => Math.min(i.a[1], i.b[1]))), Math.max(...g.map((i) => Math.max(i.a[0], i.b[0]))), Math.max(...g.map((i) => Math.max(i.a[1], i.b[1])))] as [number, number, number, number] }));
      let n = 0;
      for (const bx of boxes) {
        if (bx.key === "ST") continue;
        const t: [number, number, number, number] = [bx.b[0] - 0.6, bx.b[1] - 0.6, bx.b[2] + 0.6, bx.b[3] + 0.6];
        const its = items.filter((it) => inTile(it, t));
        pages.push({ sheet: s, tile: t, part: `${bx.key}`, items: its, rows: countOf(its, "stair"), total: `${its.filter((i) => i.shape !== "dot").length} pieces`, paper: PAPERS[0] });
        if (++n >= 12) break;
      }
      continue;
    }
    // the whole floor on one sheet: bigger paper rather than several parts (a family split over sheets is hard to read)
    pages.push({ sheet: s, tile: box, items, rows, total, paper: paperFor(box, s.minSc) });
  }
  const notesPage = 1;
  const total = pages.length + notesPage;
  return (
    <Document title={`Formwork assembly diagram — ${info.planName}`} author={info.company}>
      {pages.map((pg, pi) => {
        const s = pg.sheet, w = pg.paper.w - 2 * M - LIST_W - 8, H = pg.paper.h - 2 * M - FOOT - HEAD_H - 4;
        const pad = 0.25, sc = Math.min(w / (pg.tile[2] - pg.tile[0] + 2 * pad), H / (pg.tile[3] - pg.tile[1] + 2 * pad));
        return (
          <Page key={pi} size={[pg.paper.w, pg.paper.h]} style={pageStyle}>
            <Head no={s.no} t={s.t} sub={s.sub} part={pg.part} />
            <Sheet m={m} tile={pg.tile} w={w} h={H}>{(k) => (
              <G>
                <Base m={m} k={k} light={s.fam !== "base"} />
                {s.fam === "base" ? (
                  <G>
                    {m.base.faces.map((f) => <Text key={f.code} x={f.at[0] + f.n[0] * 0.25} y={f.at[1] + f.n[1] * 0.25 + k.fs(1.2)} textAnchor="middle" style={{ fontSize: k.fs(3.4), fontFamily: "Carlito", color: "#1e3a8a" }}>{f.code}</Text>)}
                    <ZoneMarks m={m} k={k} />
                    <Line x1={box[0]} y1={box[1] - 0.6} x2={box[2]} y2={box[1] - 0.6} stroke="#111" strokeWidth={k.lw(0.4)} />
                    <Text x={(box[0] + box[2]) / 2} y={box[1] - 0.7} textAnchor="middle" style={{ fontSize: k.fs(7), fontFamily: "Carlito" }}>{Math.round((box[2] - box[0]) * 1000)}</Text>
                    <Line x1={box[0] - 0.6} y1={box[1]} x2={box[0] - 0.6} y2={box[3]} stroke="#111" strokeWidth={k.lw(0.4)} />
                    <Lbl at={[box[0] - 0.75, (box[1] + box[3]) / 2]} deg={-90} fs={k.fs(7)} text={String(Math.round((box[3] - box[1]) * 1000))} />
                  </G>
                ) : null}
                {s.fam === "deck" ? <Rects items={pg.items.filter((i) => i.shape === "rect")} k={k} /> : null}
                {s.fam === "beam" || s.fam === "stair" ? <Rects items={pg.items.filter((i) => i.shape === "rect")} k={k} /> : null}
                {pg.items.some((i) => i.shape === "strip") ? <Strips items={pg.items.filter((i) => i.shape === "strip")} k={k} labels={s.fam !== "corner" || k.sc > 60} /> : null}
                {pg.items.some((i) => i.shape !== "strip" && i.shape !== "rect") ? <LinesDots items={pg.items.filter((i) => i.shape === "line" || i.shape === "dot")} k={k} width={s.fam === "deck" ? m.keelW : 0.04} labels={s.fam !== "waler" || k.sc > 60} /> : null}
                {s.fam !== "base" ? <ZoneMarks m={m} k={k} /> : null}
              </G>
            )}</Sheet>
            {s.fam !== "base" ? <PartList rows={pg.rows} title={`Part list — sheet ${s.no}${pg.part ? ` (${pg.part})` : ""}`} total={pg.total} /> : (
              <View style={{ position: "absolute", right: M, top: M + HEAD_H, width: LIST_W, borderWidth: 0.5, borderColor: "#cbd5e1", backgroundColor: "#ffffff", padding: 4, fontSize: 6.6 }}>
                <Text style={{ fontWeight: "bold", fontSize: 7.5, marginBottom: 2 }}>Floor data</Text>
                <Text>Wall height (formed): {Math.round(m.H * 1000)} mm</Text>
                <Text>Slab: {Math.round(m.slab * 1000)} mm</Text>
                <Text>Deck zones: {m.base.zones.length}</Text>
                <Text>Wall faces: {m.base.faces.length}</Text>
                <Text>Prop spacing: {m.propSpacing.toFixed(2)} m</Text>
                <Text>Ties @ {m.tieH} mm · rows @ {m.tieV} mm</Text>
                <Text style={{ marginTop: 3, color: GRAY }}>Sheets: 1 wall panels · 2 corners · 3 beams · 4 deck · 5 walers · 6 stairs · 7 notes</Text>
              </View>
            )}
            {s.legend.length ? <Legend rows={s.legend} /> : null}
            {s.fam === "stair" ? <KeyPlan m={m} tile={pg.tile} /> : null}
            <Footer info={info} page={pi + 1} pages={total} title={`${s.no} ${s.t}`} scale={`${scaleText(sc)} on ${pg.paper.name}`} />
          </Page>
        );
      })}
      <Page size="A3" orientation="landscape" style={pageStyle}>
        <Head no="7" t="NOTES & ACCESSORIES" sub="Read with the part lists and the modulation / production drawings of the design package." />
        <View style={{ fontSize: 9.5, marginTop: 8, width: 760 }}>
          {notes.map((n, i) => <Text key={i} style={{ marginBottom: 5 }}>• {n}</Text>)}
        </View>
        <View style={{ position: "absolute", right: M, top: M + HEAD_H, width: 300, fontSize: 7, borderWidth: 0.5, borderColor: "#cbd5e1", padding: 5 }}>
          <Text style={{ fontWeight: "bold", fontSize: 8, marginBottom: 3 }}>Summary of the floor set</Text>
          {(["wall", "corner", "beam", "deck", "stair", "waler"] as AsmFamily[]).map((f) => {
            const rows = countOf(m.items, f); const n = rows.reduce((s, r) => s + r.n, 0);
            return <View key={f} style={{ flexDirection: "row", justifyContent: "space-between", borderBottomWidth: 0.3, borderColor: "#eee" }}><Text>{SHEETS.find((s) => s.fam === f)?.t}</Text><Text>{n} pcs · {rows.length} codes</Text></View>;
          })}
        </View>
        <Footer info={info} page={total} pages={total} title="7 NOTES" scale="— · A3" />
      </Page>
    </Document>
  );
}
