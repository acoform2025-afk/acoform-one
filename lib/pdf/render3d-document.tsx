/**
 * 3D views as a drawing (A3): the formwork model of the typical floor drawn in isometric, in colour, as vector
 * graphics — the same pieces and colours as the 3D viewer, so the site and the client get the 3D on paper.
 *   Sheet 1: assembled view from two sides + legend with the piece counts.
 *   Sheet 2: exploded view (deck lifted off the walls) + wall panels only + deck and supports only.
 * Hidden faces are handled with the painter's method (far pieces first). Geometry in metres (scene3d: y up).
 */
import path from "node:path";
import { Document, Font, Image, Line, Page, Polygon, Svg, Text, View } from "@react-pdf/renderer";
import type { Panel3Kind, Scene3 } from "@/lib/floor-plans/scene3d";

const PUBLIC = path.join(process.cwd(), "public");
Font.register({ family: "Carlito", fonts: [{ src: path.join(PUBLIC, "fonts", "Carlito-Regular.ttf") }, { src: path.join(PUBLIC, "fonts", "Carlito-Bold.ttf"), fontWeight: "bold" }] });
Font.registerHyphenationCallback((w) => [w]);
const LOGO = path.join(PUBLIC, "brand", "acoform-logo.png");
const ORANGE = "#ef9d2f", GRAY = "#6b6d68", INK = "#1f2937";
const M = 20, FOOT = 46;

export type RenderInfo = { company: string; project: string; client: string; planName: string; drawingNo: string; rev: string; date: string; system: string };

// the 3D viewer's colours
const COLOR: Record<Panel3Kind, string> = {
  std: "#7aa7e0", top: "#f2c76b", fill: "#ff3fb3", deck: "#9fd3c7", dspec: "#ff8ad1", ic: "#34d399", ec: "#10b981", sc: "#a78bfa", kick: "#fb923c",
  bside: "#d4a373", bbot: "#b08968", col: "#fcd34d", stair: "#c9b79c", riser: "#e7d3b8", cheek: "#d9a066", lsoff: "#b9c7a0", tread: "#f3e6cc", cchan: "#64748b", stp: "#a16207", tz: "#93c5fd",
};
const LEGEND: { k: Panel3Kind[]; label: string }[] = [
  { k: ["std"], label: "Standard wall panels" },
  { k: ["top"], label: "Wall-top pieces" },
  { k: ["fill"], label: "Wall fillers (non-standard width)" },
  { k: ["ic", "ec"], label: "Internal / external corners" },
  { k: ["sc"], label: "Soffit corners" },
  { k: ["kick"], label: "Kickers" },
  { k: ["deck"], label: "Deck panels" },
  { k: ["dspec"], label: "Deck fillers / specials" },
  { k: ["bside", "bbot"], label: "Beam sides / bottoms" },
  { k: ["col"], label: "Column panels" },
  { k: ["stair", "cheek", "riser", "tread", "lsoff", "cchan", "stp", "tz"], label: "Staircase pieces" },
];
const WALL_KINDS = new Set<Panel3Kind>(["std", "top", "fill", "ic", "ec", "kick", "col", "tz"]);
const DECK_KINDS = new Set<Panel3Kind>(["deck", "dspec", "sc", "bside", "bbot", "lsoff"]);

type V3 = [number, number, number];
type Item = { pts: V3[]; fill: string; stroke?: string; line?: boolean; w?: number };

const hex = (c: string) => [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)];
const shade = (c: string, f: number) => `#${hex(c).map((v) => Math.max(0, Math.min(255, Math.round(v * f))).toString(16).padStart(2, "0")).join("")}`;

/** Camera looking at the scene from direction (az degrees round the vertical, el degrees above the horizon). */
function camera(az: number, el: number) {
  const a = (az * Math.PI) / 180, e = (el * Math.PI) / 180;
  const cam: V3 = [Math.cos(e) * Math.cos(a), Math.sin(e), Math.cos(e) * Math.sin(a)];     // towards the viewer
  const r: V3 = [-Math.sin(a), 0, Math.cos(a)];                                            // screen right
  const up: V3 = [r[1] * cam[2] - r[2] * cam[1], r[2] * cam[0] - r[0] * cam[2], r[0] * cam[1] - r[1] * cam[0]];   // r × cam: screen up (y > 0)
  const dot = (p: V3, q: V3) => p[0] * q[0] + p[1] * q[1] + p[2] * q[2];
  return { cam, proj: (p: V3): [number, number] => [dot(p, r), -dot(p, up)], depth: (p: V3) => dot(p, cam) };
}

/** Painter's-method drawing of the items in a box of w × h points. */
function IsoView({ items, az, el, w, h }: { items: Item[]; az: number; el: number; w: number; h: number }) {
  const c = camera(az, el);
  const light: V3 = [0.35, 0.85, 0.4];
  const drawn = items.map((it) => {
    const scr = it.pts.map(c.proj);
    const d = it.pts.reduce((s, p) => s + c.depth(p), 0) / it.pts.length + (it.line ? 0.02 : 0);
    let fill = it.fill;
    if (!it.line && it.pts.length >= 3) {
      const [p0, p1, p2] = it.pts, u = [p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]], v = [p2[0] - p0[0], p2[1] - p0[1], p2[2] - p0[2]];
      const n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]], L = Math.hypot(n[0], n[1], n[2]) || 1;
      const lam = Math.abs((n[0] * light[0] + n[1] * light[1] + n[2] * light[2]) / L);
      fill = shade(it.fill, 0.72 + 0.32 * lam);
    }
    return { scr, d, fill, it };
  }).sort((a, b) => a.d - b.d);
  const xs = drawn.flatMap((x) => x.scr.map((p) => p[0])), ys = drawn.flatMap((x) => x.scr.map((p) => p[1]));
  if (!xs.length) return <Text style={{ color: GRAY }}>Nothing to draw.</Text>;
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
  const pad = Math.max(x1 - x0, y1 - y0) * 0.03, bw = x1 - x0 + 2 * pad, bh = y1 - y0 + 2 * pad;
  const sc = Math.min(w / bw, h / bh), k = 1 / sc;
  return (
    <Svg width={bw * sc} height={bh * sc} viewBox={`${x0 - pad} ${y0 - pad} ${bw} ${bh}`}>
      {drawn.map((x, i) => x.it.line
        ? <Line key={i} x1={x.scr[0][0]} y1={x.scr[0][1]} x2={x.scr[1][0]} y2={x.scr[1][1]} stroke={x.fill} strokeWidth={(x.it.w ?? 1) * k} />
        : <Polygon key={i} points={x.scr.map((p) => `${p[0].toFixed(3)},${p[1].toFixed(3)}`).join(" ")} fill={x.fill} stroke={x.it.stroke ?? "#334155"} strokeWidth={0.25 * k} />)}
    </Svg>
  );
}

/** The pieces of the scene as drawable items; `lift` raises the deck layer (exploded view). */
function itemsOf(scene: Scene3, o: { walls?: boolean; deck?: boolean; stairs?: boolean; props?: boolean; concrete?: boolean; lift?: number }): Item[] {
  const out: Item[] = [];
  const lift = o.lift ?? 0;
  for (const p of scene.panels) {
    const isWall = WALL_KINDS.has(p.k), isDeck = DECK_KINDS.has(p.k) && !p.z?.startsWith("ST");
    const isStair = !!p.z?.startsWith("ST") && !isWall && !isDeck;
    if (isWall && !o.walls) continue;
    if (isDeck && !o.deck) continue;
    if (isStair && !o.stairs) continue;
    if (!isWall && !isDeck && !isStair) continue;
    const dy = isDeck ? lift : 0;
    const pts = (p.p[2] === p.p[3] ? p.p.slice(0, 3) : p.p).map((q) => [q[0], q[1] + dy, q[2]] as V3);
    out.push({ pts, fill: COLOR[p.k] });
  }
  // wall concrete: the tops of the walls (so the far faces do not show through the near walls)
  if (o.concrete) for (const poly of scene.walls) { const r = poly[0]; if (r && r.length >= 3) out.push({ pts: r.map((q) => [q[0], scene.H, q[1]] as V3), fill: "#a8a29e", stroke: "#78716c" }); }
  if (o.props && scene.acc) {
    for (const p of scene.acc.props) out.push({ pts: [[p[0], p[2], p[1]], [p[0], p[3] + lift * (p[4] === 2 ? 0 : 1) - 0.04, p[1]]], fill: "#d97706", line: true, w: 0.9 });
  }
  return out;
}

function Footer({ info, page, pages }: { info: RenderInfo; page: number; pages: number }) {
  return (
    <View fixed style={{ position: "absolute", left: M, right: M, bottom: M, height: FOOT - 6, borderTopWidth: 1.2, borderColor: ORANGE, flexDirection: "row", alignItems: "center", paddingTop: 4, fontSize: 7.5 }}>
      <Image src={LOGO} style={{ width: 70, height: 22, objectFit: "contain" }} />
      <View style={{ marginLeft: 10, flexGrow: 1 }}>
        <Text style={{ fontWeight: "bold", fontSize: 9 }}>3D VIEWS — TYPICAL FLOOR FORMWORK · {info.planName}</Text>
        <Text style={{ color: GRAY }}>{info.project} · {info.client} · {info.system}</Text>
      </View>
      <View style={{ width: 230, alignItems: "flex-end" }}>
        <Text>{info.company}</Text>
        <Text style={{ color: GRAY }}>Dwg {info.drawingNo} · Rev {info.rev} · {info.date} · Sheet {page}/{pages}</Text>
      </View>
    </View>
  );
}

function Frame({ title, w, h, children }: { title: string; w: number; h: number; children: React.ReactNode }) {
  return (
    <View style={{ width: w, height: h, borderWidth: 0.8, borderColor: "#d6d3d1", padding: 6 }}>
      <Text style={{ fontSize: 9, fontWeight: "bold", color: INK }}>{title}</Text>
      <View style={{ flexGrow: 1, alignItems: "center", justifyContent: "center" }}>{children}</View>
    </View>
  );
}

export function Render3DDocument({ scene, info }: { scene: Scene3; info: RenderInfo }) {
  const pageStyle = { fontFamily: "Carlito", fontSize: 8, color: INK, padding: M, paddingBottom: M + FOOT };
  const all = itemsOf(scene, { walls: true, deck: true, stairs: true });
  const span = Math.max(scene.box[2] - scene.box[0], scene.box[3] - scene.box[1]);
  const lift = Math.max(4, scene.H * 2, span * 0.28);
  const exploded = itemsOf(scene, { walls: true, deck: true, stairs: true, concrete: true, lift });
  const wallsOnly = itemsOf(scene, { walls: true, stairs: true, concrete: true });
  const deckProps = itemsOf(scene, { deck: true, props: true });
  const nProps = scene.acc?.props.length ?? 0;
  return (
    <Document title={`3D views — ${info.planName}`} author={info.company}>
      <Page size="A3" orientation="landscape" style={pageStyle}>
        <Text style={{ fontSize: 14, fontWeight: "bold" }}>FORMWORK 3D — ASSEMBLED VIEWS</Text>
        <Text style={{ color: GRAY, marginBottom: 6 }}>Typical floor · clear height {Math.round(scene.H * 1000)} mm · {scene.stats.wall} wall panels · {scene.stats.deck} deck panels · {scene.stats.special} special pieces · colours as in the 3D viewer</Text>
        <View style={{ flexDirection: "row", gap: 8 }}>
          <Frame title="VIEW FROM SOUTH-EAST" w={820} h={698}><IsoView items={all} az={-35} el={38} w={800} h={670} /></Frame>
          <View style={{ width: 323, gap: 8 }}>
            <Frame title="VIEW FROM NORTH-WEST" w={323} h={300}><IsoView items={all} az={145} el={38} w={305} h={270} /></Frame>
            <View style={{ borderWidth: 0.8, borderColor: "#d6d3d1", padding: 8, height: 390 }}>
              <Text style={{ fontSize: 9, fontWeight: "bold", marginBottom: 4 }}>LEGEND</Text>
              {LEGEND.map((l) => { const n = scene.panels.filter((p) => l.k.includes(p.k)).length; return n ? (
                <View key={l.label} style={{ flexDirection: "row", alignItems: "center", marginBottom: 3 }}>
                  <View style={{ width: 14, height: 9, backgroundColor: COLOR[l.k[0]], borderWidth: 0.4, borderColor: "#334155", marginRight: 6 }} />
                  <Text style={{ flex: 1 }}>{l.label}</Text><Text style={{ width: 40, textAlign: "right" }}>{n}</Text>
                </View>) : null; })}
              <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 3 }}>
                <View style={{ width: 14, height: 2, backgroundColor: "#d97706", marginRight: 6 }} /><Text style={{ flex: 1 }}>Props (sheet 2)</Text><Text style={{ width: 40, textAlign: "right" }}>{nProps}</Text>
              </View>
              <Text style={{ marginTop: 8, color: GRAY }}>Numbers are pieces drawn on this floor. The parts list and the assembly drawings give the codes and sizes; open the 3D model in ACOFORM ONE to turn and zoom, or click a piece to see its code.</Text>
            </View>
          </View>
        </View>
        <Footer info={info} page={1} pages={2} />
      </Page>
      <Page size="A3" orientation="landscape" style={pageStyle}>
        <Text style={{ fontSize: 14, fontWeight: "bold" }}>FORMWORK 3D — EXPLODED VIEW AND LAYERS</Text>
        <Text style={{ color: GRAY, marginBottom: 6 }}>Deck layer lifted {lift.toFixed(1)} m off the walls to show both · wall concrete in grey · {nProps} props under the deck and stair</Text>
        <View style={{ flexDirection: "row", gap: 8 }}>
          <Frame title="EXPLODED — deck panels lifted off the wall panels" w={700} h={698}><IsoView items={exploded} az={-35} el={32} w={680} h={670} /></Frame>
          <View style={{ width: 443, gap: 8 }}>
            <Frame title="WALL PANELS, CORNERS & STAIR (no deck)" w={443} h={345}><IsoView items={wallsOnly} az={-35} el={45} w={425} h={315} /></Frame>
            <Frame title="DECK PANELS & PROPS (no walls)" w={443} h={345}><IsoView items={deckProps} az={-35} el={25} w={425} h={315} /></Frame>
          </View>
        </View>
        <Footer info={info} page={2} pages={2} />
      </Page>
    </Document>
  );
}
