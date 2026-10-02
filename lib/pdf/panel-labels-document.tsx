import path from "node:path";
import { Document, Font, Page, Path, Svg, Text, View } from "@react-pdf/renderer";
import type { PanelLabel } from "@/lib/floor-plans/labels";

const PUBLIC = path.join(process.cwd(), "public");
Font.register({
  family: "Carlito",
  fonts: [
    { src: path.join(PUBLIC, "fonts", "Carlito-Regular.ttf") },
    { src: path.join(PUBLIC, "fonts", "Carlito-Bold.ttf"), fontWeight: "bold" },
  ],
});
Font.registerHyphenationCallback((w) => [w]);

const MM = 72 / 25.4;
/** Thermal label sizes (mm). */
export const LABEL_SIZES = { "100x50": [100, 50], "100x75": [100, 75], "75x50": [75, 50] } as const;
export type LabelSize = keyof typeof LABEL_SIZES;

export type LabelInfo = { company: string; planName: string; project: string };

/** One label per page (thermal printers print page by page): QR left, panel details right. Black only. */
export function PanelLabelsDocument({ labels, qrs, info, size }: { labels: PanelLabel[]; qrs: { d: string; size: number }[]; info: LabelInfo; size: LabelSize }) {
  const [wMm, hMm] = LABEL_SIZES[size];
  const W = wMm * MM, H = hMm * MM, pad = 2.5 * MM, q = H - 2 * pad;          // QR as high as the label
  const big = hMm >= 70 ? 22 : 17, small = hMm >= 70 ? 8 : 6.5;
  return (
    <Document title={`Panel labels ${info.planName}`} author={info.company}>
      {labels.map((l, i) => (
        <Page key={i} size={[W, H]} style={{ fontFamily: "Carlito", color: "#000", padding: pad, flexDirection: "row" }}>
          <Svg width={q} height={q} viewBox={`-1 -1 ${qrs[i].size + 2} ${qrs[i].size + 2}`}>
            <Path d={qrs[i].d} fill="#000" />
          </Svg>
          <View style={{ flex: 1, marginLeft: 2 * MM, justifyContent: "space-between" }}>
            <View>
              <Text style={{ fontSize: small, fontWeight: "bold", letterSpacing: 0.5 }}>{info.company.toUpperCase()}</Text>
              <Text style={{ fontSize: big, fontWeight: "bold", marginTop: 1 }}>{l.code}</Text>
              <Text style={{ fontSize: small + 2, marginTop: 1 }}>{l.w && l.h ? `${l.w} × ${l.h} mm` : l.desc}</Text>
              <Text style={{ fontSize: small, marginTop: 1 }}>{l.family}{l.special ? " · SPECIAL" : ""}</Text>
            </View>
            <View>
              <View style={{ flexDirection: "row", alignItems: "center" }}>
                <Text style={{ fontSize: small + 3, fontWeight: "bold", borderWidth: 1, borderColor: "#000", paddingHorizontal: 3, paddingVertical: 1 }}>{l.no.includes("#") ? `#${l.no.split("#")[1]}` : l.no}</Text>
                {l.bundle ? <Text style={{ fontSize: small + 1, marginLeft: 4 }}>Bundle {l.bundle}</Text> : null}
              </View>
              <Text style={{ fontSize: small, marginTop: 2 }}>{info.project ? `${info.project} · ` : ""}{info.planName}</Text>
              <Text style={{ fontSize: small - 0.5, marginTop: 0.5 }}>{l.k} / {l.n}</Text>
            </View>
          </View>
        </Page>
      ))}
    </Document>
  );
}
