import path from "node:path";
import { Document, Font, Image, Page, Text, View } from "@react-pdf/renderer";
import type { PanelResult } from "@/lib/design-engine/floor-panels";

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
const ORANGE = "#ef9d2f", GRAY = "#6b6d68";
const GROUP: Record<string, string> = { wall: "WALL PANELS", "wall-top": "WALL TOP PANELS", column: "COLUMN PANELS", filler: "FILLERS / SPECIALS", end: "WALL ENDS", corner: "CORNERS", deck: "DECK PANELS", beam: "BEAM PANELS", accessory: "PROPS & ACCESSORIES" };
const n0 = (v: number) => v.toLocaleString("en-IN", { maximumFractionDigits: 0 });
const n2 = (v: number) => v.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export type BomInfo = { company: string; planName: string; project: string; client: string; date: string; contactArea: number; options: string };

const W = { code: "17%", desc: "37%", size: "14%", qty: "9%", area: "11%", wt: "12%" };
function Row({ c, bold, bg }: { c: string[]; bold?: boolean; bg?: string }) {
  const ws = [W.code, W.desc, W.size, W.qty, W.area, W.wt];
  return (
    <View style={{ flexDirection: "row", backgroundColor: bg, borderBottomWidth: 0.4, borderColor: "#ccc" }} wrap={false}>
      {c.map((v, i) => <Text key={i} style={{ width: ws[i], paddingVertical: 2.5, paddingHorizontal: 4, textAlign: i >= 2 ? "right" : "left", fontWeight: bold ? "bold" : "normal" }}>{v}</Text>)}
    </View>
  );
}

export function PanelBomDocument({ r, info }: { r: PanelResult; info: BomInfo }) {
  const s = r.summary;
  const groups = [...new Set(r.bom.map((b) => b.group))];
  return (
    <Document title={`Panel BOM ${info.planName}`} author={info.company}>
      <Page size="A4" style={{ fontFamily: "Carlito", fontSize: 8.5, color: "#222", paddingTop: 36, paddingBottom: 40, paddingHorizontal: 32 }}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", borderBottomWidth: 1.5, borderColor: ORANGE, paddingBottom: 6 }} fixed>
          <Image src={LOGO} style={{ width: 110, height: 30, objectFit: "contain" }} />
          <View style={{ alignItems: "flex-end" }}>
            <Text style={{ fontSize: 12, fontWeight: "bold" }}>PANEL LAYOUT — BILL OF MATERIALS</Text>
            <Text style={{ color: GRAY }}>{info.company} · {info.date}</Text>
          </View>
        </View>
        <View style={{ marginTop: 8, marginBottom: 8 }}>
          <Text><Text style={{ fontWeight: "bold" }}>Project: </Text>{info.project}   <Text style={{ fontWeight: "bold" }}>Client: </Text>{info.client}</Text>
          <Text><Text style={{ fontWeight: "bold" }}>Drawing: </Text>{info.planName} (typical floor, one set)</Text>
          <Text style={{ color: GRAY }}>{info.options}</Text>
        </View>
        <View style={{ flexDirection: "row", marginBottom: 10, borderWidth: 0.75, borderColor: ORANGE, backgroundColor: "#fdf3e4" }}>
          {[["Panel area", `${n2(s.panelArea)} m²`], ["Total weight", `${n0(s.weight)} kg`], ["Average", `${s.kgPerM2} kg/m²`], ["Standard panels", `${s.standardPct}%`], ["Contact area", `${n2(info.contactArea)} m²`]].map(([k, v]) => (
            <View key={k} style={{ flex: 1, padding: 6 }}>
              <Text style={{ fontSize: 7, color: GRAY }}>{k.toUpperCase()}</Text>
              <Text style={{ fontSize: 11, fontWeight: "bold" }}>{v}</Text>
            </View>
          ))}
        </View>
        <View style={{ borderWidth: 0.75, borderColor: "#999" }}>
          <Row c={["CODE", "DESCRIPTION", "SIZE (mm)", "QTY", "AREA m²", "WEIGHT kg"]} bold bg="#fdf3e4" />
          {groups.map((g) => {
            const rows = r.bom.filter((b) => b.group === g);
            return (
              <View key={g}>
                <Row c={[GROUP[g] ?? g, "", "", n0(rows.reduce((a, b) => a + b.qty, 0)), n2(rows.reduce((a, b) => a + b.area, 0)), n0(rows.reduce((a, b) => a + b.weight, 0))]} bold bg="#f3f4f6" />
                {rows.map((b) => <Row key={b.code} c={[b.code + (b.custom ? " *" : ""), b.description, b.w ? `${b.w} × ${b.h}` : "—", n0(b.qty), b.area ? n2(b.area) : "—", b.weight ? n0(b.weight) : "—"]} />)}
              </View>
            );
          })}
          <Row c={["TOTAL", "", "", "", n2(s.panelArea), n0(s.weight)]} bold bg="#fdf3e4" />
        </View>
        {r.elements.length ? (
          <View style={{ marginTop: 10 }}>
            <Text style={{ fontSize: 9.5, fontWeight: "bold", marginBottom: 3 }}>COLUMNS, BEAMS & DECK — ELEMENT SCHEDULE</Text>
            <View style={{ borderWidth: 0.75, borderColor: "#999", fontSize: 7.5 }}>
              {[["ELEMENT", "CODE", "SIZE", "QTY", "AREA m²", "PANELS"], ...(["column", "beam", "deck"] as const).flatMap((k) => r.elements.filter((e) => e.kind === k)).map((e) => [e.kind === "deck" ? "Deck" : e.kind === "beam" ? "Beam" : "Column", e.code, e.size, String(e.qty), n2(e.area), e.detail])].map((c, i) => (
                <View key={i} style={{ flexDirection: "row", backgroundColor: i === 0 ? "#fdf3e4" : undefined, borderBottomWidth: 0.4, borderColor: "#ccc" }} wrap={false}>
                  {c.map((v, j) => <Text key={j} style={{ width: ["9%", "11%", "12%", "6%", "9%", "53%"][j], paddingVertical: 2, paddingHorizontal: 3, fontWeight: i === 0 ? "bold" : "normal", textAlign: j === 3 || j === 4 ? "right" : "left" }}>{v}</Text>)}
                </View>
              ))}
            </View>
          </View>
        ) : null}
        <Text style={{ marginTop: 6, fontSize: 7.5, color: GRAY }}>* custom-size item (weight taken at the custom kg/m² rate). Quantities are for one typical-floor set.</Text>
        {s.warnings.map((w) => <Text key={w} style={{ fontSize: 7.5, color: "#92400e" }}>• {w}</Text>)}
        <Text style={{ marginTop: 6, fontSize: 7.5, color: GRAY }}>Automatic first layout on standard aluminium-formwork rules. Final panel schedule as per approved shell plan and ACOFORM modulation drawings.</Text>
        <Text style={{ position: "absolute", bottom: 18, right: 32, fontSize: 7, color: GRAY }} render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`} fixed />
      </Page>
    </Document>
  );
}
