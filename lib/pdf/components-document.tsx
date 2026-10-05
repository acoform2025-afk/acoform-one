/**
 * Components & accessories catalogue (A3): the typical assembly in 3D, then every piece of the aluminium-formwork
 * system as a 3D picture with its typical size, material, what it does and the quantity in this project.
 * Pictures are the pre-rendered 3D models in public/parts (same models as the app's 3D catalogue).
 */
import path from "node:path";
import { Document, Font, Image, Page, Text, View } from "@react-pdf/renderer";
import { PARTS, PART_GROUPS } from "@/lib/design-engine/parts3d";

const PUBLIC = path.join(process.cwd(), "public");
Font.register({ family: "Carlito", fonts: [{ src: path.join(PUBLIC, "fonts", "Carlito-Regular.ttf") }, { src: path.join(PUBLIC, "fonts", "Carlito-Bold.ttf"), fontWeight: "bold" }] });
Font.registerHyphenationCallback((w) => [w]);
const LOGO = path.join(PUBLIC, "brand", "acoform-logo.png");
const IMG = (k: string) => path.join(PUBLIC, "parts", `${k}.png`);
const ORANGE = "#ef9d2f", GRAY = "#6b6d68", INK = "#1f2937";
const M = 20, FOOT = 46;

export type CompInfo = { company: string; project: string; client: string; planName: string; drawingNo: string; rev: string; date: string; system: string };
const LEGEND: [string, string][] = [["#7aa7e0", "Wall panels"], ["#f2c76b", "Wall-top panels"], ["#a78bfa", "Soffit corner"], ["#9fd3c7", "Deck panels"], ["#94a3b8", "Mid beam"], ["#e0782f", "Props"], ["#b4bac2", "Walers, ties, pins & wedges"]];

function Footer({ info }: { info: CompInfo }) {
  return (
    <View fixed style={{ position: "absolute", left: M, right: M, bottom: M, height: FOOT - 6, borderTopWidth: 1.2, borderColor: ORANGE, flexDirection: "row", alignItems: "center", paddingTop: 4, fontSize: 7.5 }}>
      <Image src={LOGO} style={{ width: 70, height: 22, objectFit: "contain" }} />
      <View style={{ marginLeft: 10, flexGrow: 1 }}>
        <Text style={{ fontWeight: "bold", fontSize: 9 }}>COMPONENTS &amp; ACCESSORIES · {info.planName}</Text>
        <Text style={{ color: GRAY }}>{info.project} · {info.client} · {info.system}</Text>
      </View>
      <View style={{ width: 230, alignItems: "flex-end" }}>
        <Text>{info.company}</Text>
        <Text style={{ color: GRAY }} render={({ pageNumber, totalPages }) => `Dwg ${info.drawingNo} · Rev ${info.rev} · ${info.date} · Sheet ${pageNumber}/${totalPages}`} />
      </View>
    </View>
  );
}

export function ComponentsDocument({ qty, info }: { qty: Record<string, number>; info: CompInfo }) {
  const pageStyle = { fontFamily: "Carlito", fontSize: 8, color: INK, padding: M, paddingBottom: M + FOOT };
  return (
    <Document title={`Components & accessories — ${info.planName}`} author={info.company}>
      <Page size="A3" orientation="landscape" style={pageStyle}>
        <Text style={{ fontSize: 14, fontWeight: "bold" }}>ALUMINIUM FORMWORK — TYPICAL ASSEMBLY</Text>
        <Text style={{ color: GRAY, marginBottom: 6 }}>One bay of wall and slab formwork as it stands before the pour · concrete not drawn · typical sizes</Text>
        <View style={{ flexDirection: "row", gap: 10 }}>
          <View style={{ width: 800, height: 600, borderWidth: 0.8, borderColor: "#d6d3d1", backgroundColor: "#f4f5f7" }}>
            <Image src={IMG("assembly")} style={{ width: 800, height: 600, objectFit: "contain" }} />
          </View>
          <View style={{ flex: 1, borderWidth: 0.8, borderColor: "#d6d3d1", padding: 10 }}>
            <Text style={{ fontSize: 10, fontWeight: "bold", marginBottom: 6 }}>WHAT YOU SEE</Text>
            {LEGEND.map(([c, t]) => (
              <View key={t} style={{ flexDirection: "row", alignItems: "center", marginBottom: 4 }}>
                <View style={{ width: 14, height: 9, backgroundColor: c, borderWidth: 0.4, borderColor: "#334155", marginRight: 6 }} /><Text>{t}</Text>
              </View>
            ))}
            <Text style={{ fontSize: 10, fontWeight: "bold", marginTop: 10, marginBottom: 4 }}>HOW IT GOES TOGETHER</Text>
            {[
              "Wall panels stand on the kicker / slab, face to face across the wall; pinned and wedged to each other at every rail joint.",
              "Tie rods pass through PVC sleeves between the two faces, with a cone at each concrete face and a wing nut with plate washer on each side.",
              "Wall-top panels make up the height; the soffit corner sits on them and turns the corner from wall to slab.",
              "Deck panels span from the soffit corner to the mid beam; the mid beam sits in the prop heads, which sit on adjustable props.",
              "Two rows of walers on brackets keep the wall straight; push-pull props (not shown) set it plumb.",
              "At striking, the deck panels and mid beams come down first; the prop heads and props stay up under the slab.",
            ].map((t, i) => <Text key={i} style={{ marginBottom: 3 }}>{i + 1}. {t}</Text>)}
            <Text style={{ marginTop: 8, color: GRAY }}>Tie system on this project: {info.system}. The quantities on the next sheets are from this plan&apos;s parts list.</Text>
          </View>
        </View>
        <Footer info={info} />
      </Page>
      <Page size="A3" orientation="landscape" style={pageStyle}>
        <Text style={{ fontSize: 14, fontWeight: "bold", marginBottom: 6 }}>COMPONENTS &amp; ACCESSORIES</Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
          {PART_GROUPS.flatMap((g) => PARTS.filter((p) => p.group === g)).map((p) => (
            <View key={p.key} wrap={false} style={{ width: 186, height: 238, borderWidth: 0.8, borderColor: "#d6d3d1" }}>
              <Image src={IMG(p.key)} style={{ width: 184, height: 138, objectFit: "contain", backgroundColor: "#f4f5f7" }} />
              <View style={{ padding: 4 }}>
                <Text style={{ fontSize: 6, color: GRAY }}>{p.group.toUpperCase()}</Text>
                <Text style={{ fontSize: 8.5, fontWeight: "bold" }}>{p.name}</Text>
                <Text style={{ fontSize: 7 }}>{p.size}</Text>
                <Text style={{ fontSize: 6.5, color: GRAY }}>{p.material}</Text>
                <Text style={{ fontSize: 6.5, marginTop: 1 }}>{p.use}</Text>
              </View>
              <Text style={{ position: "absolute", top: 4, right: 5, fontSize: 8, fontWeight: "bold", color: qty[p.key] ? "#c2410c" : GRAY }}>{qty[p.key] ? `${qty[p.key].toLocaleString("en-IN")} nos` : "—"}</Text>
            </View>
          ))}
        </View>
        <Footer info={info} />
      </Page>
    </Document>
  );
}
