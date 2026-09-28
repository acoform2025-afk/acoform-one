import path from "node:path";
import { Document, Font, Image, Page, StyleSheet, Text, View } from "@react-pdf/renderer";

const PUBLIC = path.join(process.cwd(), "public");
Font.register({
  family: "Carlito",
  fonts: [
    { src: path.join(PUBLIC, "fonts", "Carlito-Regular.ttf") },
    { src: path.join(PUBLIC, "fonts", "Carlito-Bold.ttf"), fontWeight: "bold" },
  ],
});
const LOGO = path.join(PUBLIC, "brand", "acoform-logo.png");
const ORANGE = "#ef9d2f", GRAY = "#6b6d68", DARK = "#3d3f3b", LINE = "#dcdcd8", LIGHT = "#f6f6f5";

const s = StyleSheet.create({
  page: { fontFamily: "Carlito", fontSize: 10, color: "#222", paddingTop: 88, paddingBottom: 56, paddingHorizontal: 40, lineHeight: 1.35 },
  header: { position: "absolute", top: 22, left: 40, right: 40, flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingBottom: 8, borderBottomWidth: 2, borderBottomColor: ORANGE },
  logo: { width: 150, height: 27.3 },
  hr: { alignItems: "flex-end", maxWidth: 300 },
  hName: { fontSize: 10.5, fontWeight: "bold", color: DARK },
  hLine: { fontSize: 7.8, color: GRAY, textAlign: "right" },
  footer: { position: "absolute", bottom: 20, left: 40, right: 40, flexDirection: "row", justifyContent: "space-between", fontSize: 7.5, color: GRAY, borderTopWidth: 0.75, borderTopColor: ORANGE, paddingTop: 5 },
  title: { fontSize: 16, fontWeight: "bold", color: DARK, textAlign: "center", marginBottom: 10, letterSpacing: 1 },
  cols: { flexDirection: "row", gap: 10, marginBottom: 10 },
  panel: { flex: 1, borderWidth: 0.75, borderColor: LINE, borderRadius: 3 },
  ph: { backgroundColor: GRAY, color: "#fff", fontWeight: "bold", fontSize: 8.5, paddingVertical: 3, paddingHorizontal: 7 },
  pb: { paddingVertical: 5, paddingHorizontal: 7 },
  kv: { flexDirection: "row", marginBottom: 1.5 },
  k: { width: 72, color: GRAY, fontSize: 9 },
  v: { flex: 1, fontSize: 9 },
  table: { borderWidth: 0.75, borderColor: LINE },
  thead: { flexDirection: "row", backgroundColor: GRAY, color: "#fff", fontWeight: "bold", fontSize: 9 },
  tr: { flexDirection: "row", borderTopWidth: 0.5, borderTopColor: LINE },
  c: { paddingVertical: 3, paddingHorizontal: 5 },
  r: { textAlign: "right" },
  total: { flexDirection: "row", backgroundColor: ORANGE, color: "#fff", fontWeight: "bold" },
  h2: { fontSize: 10.5, fontWeight: "bold", color: DARK, marginTop: 12, marginBottom: 4, paddingBottom: 2, borderBottomWidth: 0.75, borderBottomColor: ORANGE },
  small: { fontSize: 8, color: GRAY },
  signs: { flexDirection: "row", gap: 12, marginTop: 18 },
  sign: { flex: 1, borderWidth: 0.75, borderColor: LINE, borderRadius: 3, padding: 8, height: 80, justifyContent: "space-between" },
});

export type ChallanData = {
  dc_number: string; dispatch_date: string; vehicle_no: string | null; driver_name: string | null; driver_phone: string | null;
  transporter: string | null; notes: string | null;
  project_code: string; customer_name: string; site_address: string | null;
  company: { company_name: string | null; company_address: string | null; company_phone: string | null; company_website: string | null; gst_number: string | null };
  lines: { panel_code: string; quantity: number; unit_weight_kg: number }[];
  qr_codes: { panel_code: string; qr_code: string }[];
};

const dmy = (iso: string) => { const [y, m, d] = iso.slice(0, 10).split("-"); return `${d}/${m}/${y}`; };
const n2 = (n: number) => n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const tc = (t: string) => (t === t.toLowerCase() ? t.replace(/\b\w/g, (c) => c.toUpperCase()) : t);

function KV({ k, v }: { k: string; v: string | null | undefined }) {
  if (!v) return null;
  return <View style={s.kv}><Text style={s.k}>{k}</Text><Text style={s.v}>{v}</Text></View>;
}

export function ChallanDocument({ d }: { d: ChallanData }) {
  const name = tc(d.company.company_name ?? "Aco Form Work Pvt Ltd");
  const totalQty = d.lines.reduce((a, l) => a + l.quantity, 0);
  const totalKg = d.lines.reduce((a, l) => a + l.quantity * l.unit_weight_kg, 0);
  return (
    <Document title={d.dc_number} author={name} subject="Delivery Challan">
      <Page size="A4" style={s.page}>
        <View style={s.header} fixed>
          <Image src={LOGO} style={s.logo} />
          <View style={s.hr}>
            <Text style={s.hName}>{name}</Text>
            {d.company.company_address ? <Text style={s.hLine}>{d.company.company_address}</Text> : null}
            <Text style={s.hLine}>{[d.company.company_phone && `Ph: ${d.company.company_phone}`, d.company.company_website, d.company.gst_number && `GSTIN: ${d.company.gst_number}`].filter(Boolean).join("   |   ")}</Text>
          </View>
        </View>
        <View style={s.footer} fixed>
          <Text>{name}</Text><Text>{d.dc_number}</Text>
          <Text render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`} />
        </View>

        <Text style={s.title}>DELIVERY CHALLAN</Text>
        <View style={s.cols}>
          <View style={s.panel}>
            <Text style={s.ph}>CONSIGNEE / SITE</Text>
            <View style={s.pb}>
              <Text style={{ fontWeight: "bold", fontSize: 11 }}>{d.customer_name}</Text>
              <KV k="Project" v={d.project_code} />
              <KV k="Site address" v={d.site_address} />
            </View>
          </View>
          <View style={s.panel}>
            <Text style={s.ph}>DISPATCH DETAILS</Text>
            <View style={s.pb}>
              <KV k="Challan No." v={d.dc_number} />
              <KV k="Date" v={dmy(d.dispatch_date)} />
              <KV k="Vehicle No." v={d.vehicle_no} />
              <KV k="Driver" v={[d.driver_name, d.driver_phone].filter(Boolean).join(" · ") || null} />
              <KV k="Transporter" v={d.transporter} />
            </View>
          </View>
        </View>

        <View style={s.table}>
          <View style={s.thead}>
            <Text style={[s.c, { width: "8%" }]}>Sr.</Text>
            <Text style={[s.c, { width: "44%" }]}>Description</Text>
            <Text style={[s.c, { width: "14%" }, s.r]}>Qty (Nos)</Text>
            <Text style={[s.c, { width: "16%" }, s.r]}>Unit Wt (Kg)</Text>
            <Text style={[s.c, { width: "18%" }, s.r]}>Total Wt (Kg)</Text>
          </View>
          {d.lines.map((l, i) => (
            <View key={l.panel_code} style={i % 2 ? [s.tr, { backgroundColor: LIGHT }] : s.tr}>
              <Text style={[s.c, { width: "8%" }]}>{i + 1}</Text>
              <Text style={[s.c, { width: "44%" }]}>Aluminium Formwork Panel {l.panel_code}</Text>
              <Text style={[s.c, { width: "14%" }, s.r]}>{l.quantity}</Text>
              <Text style={[s.c, { width: "16%" }, s.r]}>{n2(l.unit_weight_kg)}</Text>
              <Text style={[s.c, { width: "18%" }, s.r]}>{n2(l.quantity * l.unit_weight_kg)}</Text>
            </View>
          ))}
          <View style={s.total}>
            <Text style={[s.c, { width: "52%" }, s.r]}>Total</Text>
            <Text style={[s.c, { width: "14%" }, s.r]}>{totalQty}</Text>
            <Text style={[s.c, { width: "16%" }]} />
            <Text style={[s.c, { width: "18%" }, s.r]}>{n2(totalKg)}</Text>
          </View>
        </View>
        {d.notes ? <Text style={[s.small, { marginTop: 4 }]}>Notes: {d.notes}</Text> : null}
        <Text style={[s.small, { marginTop: 4 }]}>Weights are nominal catalog weights. Please check quantities on receipt and report any shortage or damage within 24 hours.</Text>

        <View style={s.signs} wrap={false}>
          <View style={s.sign}><Text style={{ fontWeight: "bold" }}>For {name}</Text><Text>Prepared / Authorised by</Text></View>
          <View style={s.sign}><Text style={{ fontWeight: "bold" }}>Gate / Security</Text><Text>Checked out</Text></View>
          <View style={s.sign}><Text style={{ fontWeight: "bold" }}>Received by (Site)</Text><Text>Name, Sign & Date</Text></View>
        </View>

        <Text style={s.h2} break={d.qr_codes.length > 60}>PANEL QR CODES IN THIS DISPATCH</Text>
        <Text style={{ fontSize: 8, lineHeight: 1.6, color: DARK }}>
          {d.qr_codes.map((q) => `${q.qr_code} (${q.panel_code})`).join("   ·   ")}
        </Text>
      </Page>
    </Document>
  );
}
