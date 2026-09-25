import path from "node:path";
import { Document, Font, Page, StyleSheet, Text, View } from "@react-pdf/renderer";
import {
  ADVANTAGES, ACCESSORIES, CLOSING, DEFAULT_PAYMENT_TERMS, DELIVERY_SCHEDULE, SCHEDULE_NOTE, SET_LABEL, TECH_SPECS, TERMS,
  formworkKind,
} from "@/lib/quotations/document-content";
import { EXTRA_LINE_TYPES, LINE_TYPE_LABELS, formatQty, summariseLines } from "@/lib/quotations/line-types";

const FONT_DIR = path.join(process.cwd(), "public", "fonts");
Font.register({
  family: "Carlito",
  fonts: [
    { src: path.join(FONT_DIR, "Carlito-Regular.ttf") },
    { src: path.join(FONT_DIR, "Carlito-Bold.ttf"), fontWeight: "bold" },
  ],
});
Font.registerHyphenationCallback((word) => [word]);

const ORANGE = "#f09800";
const GRAY = "#6b6d68";
const LIGHT = "#f5f5f4";
const LINE = "#d6d6d3";

const s = StyleSheet.create({
  page: { fontFamily: "Carlito", fontSize: 10, color: "#1f1f1e", paddingTop: 92, paddingBottom: 56, paddingHorizontal: 42, lineHeight: 1.35 },
  header: { position: "absolute", top: 24, left: 42, right: 42, flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end", borderBottomWidth: 2, borderBottomColor: ORANGE, paddingBottom: 8 },
  brand: { fontSize: 20, fontWeight: "bold", color: ORANGE, letterSpacing: 1, lineHeight: 1 },
  brandSub: { fontSize: 8.5, color: GRAY, marginTop: 3, lineHeight: 1 },
  headRight: { fontSize: 8, color: GRAY, textAlign: "right", maxWidth: 330, lineHeight: 1.25 },
  footer: { position: "absolute", bottom: 22, left: 42, right: 42, flexDirection: "row", justifyContent: "space-between", fontSize: 8, color: GRAY, borderTopWidth: 0.5, borderTopColor: LINE, paddingTop: 6 },
  title: { fontSize: 15, fontWeight: "bold", textAlign: "center", marginBottom: 12, color: "#111" },
  refRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 10 },
  bold: { fontWeight: "bold" },
  h2: { fontSize: 11, fontWeight: "bold", color: ORANGE, marginTop: 12, marginBottom: 5 },
  p: { marginBottom: 6 },
  li: { flexDirection: "row", marginBottom: 3 },
  liNum: { width: 18 },
  liText: { flex: 1 },
  table: { borderWidth: 0.5, borderColor: LINE },
  thead: { flexDirection: "row", backgroundColor: GRAY, color: "#fff", fontWeight: "bold" },
  tr: { flexDirection: "row", borderTopWidth: 0.5, borderTopColor: LINE },
  alt: { backgroundColor: LIGHT },
  cell: { paddingVertical: 3, paddingHorizontal: 4 },
  right: { textAlign: "right" },
  center: { textAlign: "center" },
  totalRow: { flexDirection: "row", borderTopWidth: 1, borderTopColor: ORANGE, fontWeight: "bold", fontSize: 11 },
  box: { borderWidth: 0.5, borderColor: LINE, padding: 8, marginTop: 8 },
  kv: { flexDirection: "row", marginBottom: 2 },
  kvK: { width: 90, color: GRAY },
  small: { fontSize: 8.5, color: GRAY },
});

export type PdfCompany = {
  company_name: string | null; company_address: string | null; company_phone: string | null; company_website: string | null;
  gst_number: string | null; bank_account_name: string | null; bank_name: string | null; bank_account_number: string | null;
  bank_ifsc_code: string | null; bank_branch: string | null;
};

export type PdfQuotation = {
  quotation_code: string; quotation_type: string; formwork_type: string | null; customer_name: string;
  customer_address: string | null; kind_attn: string | null; schedule_description: string | null;
  quotation_date: string; validity_days: number; payment_terms: string[] | null;
  total_area_sqm: number | null; total_amount: number | null; total_with_gst: number | null; gst_percentage: number;
  quick_rate_per_sqm: number | null; nalco_rate_per_kg: number | null; nalco_rate_date: string | null;
};

export type PdfLine = {
  id: string; line_type: string; description: string | null; unit: string | null; quantity: number;
  unit_rate: number | null; line_total: number | null; notes: string | null; unit_weight_kg: number | null; rate_per_kg: number | null;
  panel_code: string | null; width_mm: number | null; height_mm: number | null; area_sqm: number | null;
};

const rupee = (n: number | null | undefined, digits = 0) =>
  `₹ ${Number(n ?? 0).toLocaleString("en-IN", { minimumFractionDigits: digits, maximumFractionDigits: digits })}`;
const num = (n: number | null | undefined, digits = 2) =>
  Number(n ?? 0).toLocaleString("en-IN", { minimumFractionDigits: digits, maximumFractionDigits: digits });
const dmy = (iso: string | null | undefined, sep = "/") => {
  if (!iso) return "";
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${d}${sep}${m}${sep}${y}`;
};

function Bullets({ items, numbered }: { items: string[]; numbered?: boolean }) {
  return (
    <View>
      {items.map((t, i) => (
        <View key={i} style={s.li} wrap={false}>
          <Text style={s.liNum}>{numbered ? `${i + 1})` : "•"}</Text>
          <Text style={s.liText}>{t}</Text>
        </View>
      ))}
    </View>
  );
}

function Header({ c }: { c: PdfCompany }) {
  return (
    <View style={s.header} fixed>
      <View>
        <Text style={s.brand}>ACOFORM</Text>
        <Text style={s.brandSub}>Aluminium Formwork Systems</Text>
      </View>
      <View>
        <Text style={s.headRight}>{c.company_name ?? "Aco Form Work Pvt Ltd"}</Text>
        {c.company_address ? <Text style={s.headRight}>{c.company_address}</Text> : null}
        <Text style={s.headRight}>
          {[c.company_phone && `Ph: ${c.company_phone}`, c.company_website, c.gst_number && `GSTIN: ${c.gst_number}`].filter(Boolean).join("  |  ")}
        </Text>
      </View>
    </View>
  );
}

function Footer() {
  return (
    <View style={s.footer} fixed>
      <Text>Acoform Work Private Limited</Text>
      <Text render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`} />
    </View>
  );
}

function QuickSchedule({ q }: { q: PdfQuotation }) {
  const gst = Number(q.total_with_gst ?? 0) - Number(q.total_amount ?? 0);
  return (
    <View style={s.table}>
      <View style={s.thead}>
        <Text style={[s.cell, { width: "8%" }, s.center]}>Sr. No.</Text>
        <Text style={[s.cell, { width: "44%" }]}>Description</Text>
        <Text style={[s.cell, { width: "14%" }, s.right]}>Qty (Sqm)</Text>
        <Text style={[s.cell, { width: "14%" }, s.right]}>Rate</Text>
        <Text style={[s.cell, { width: "20%" }, s.right]}>Total</Text>
      </View>
      <View style={s.tr}>
        <Text style={[s.cell, { width: "8%" }, s.center]}>1</Text>
        <Text style={[s.cell, { width: "44%" }]}>{q.schedule_description || "Acoform Aluminium Formwork"}</Text>
        <Text style={[s.cell, { width: "14%" }, s.right]}>{num(q.total_area_sqm)}</Text>
        <Text style={[s.cell, { width: "14%" }, s.right]}>{rupee(q.quick_rate_per_sqm)}</Text>
        <Text style={[s.cell, { width: "20%" }, s.right]}>{rupee(q.total_amount)}</Text>
      </View>
      <NalcoGstTotal q={q} gst={gst} />
    </View>
  );
}

function NalcoGstTotal({ q, gst }: { q: PdfQuotation; gst: number }) {
  return (
    <>
      {q.nalco_rate_per_kg ? (
        <View style={s.tr}>
          <Text style={[s.cell, { width: "80%" }, s.small]}>
            Nalco Rate :- {num(q.nalco_rate_per_kg)} Rs/Kg{q.nalco_rate_date ? ` (${dmy(q.nalco_rate_date, "-")})` : ""}
          </Text>
          <Text style={[s.cell, { width: "20%" }]} />
        </View>
      ) : null}
      <View style={s.tr}>
        <Text style={[s.cell, { width: "80%" }, s.right]}>GST @ {Number(q.gst_percentage).toFixed(0)}%</Text>
        <Text style={[s.cell, { width: "20%" }, s.right]}>{rupee(gst)}</Text>
      </View>
      <View style={s.totalRow}>
        <Text style={[s.cell, { width: "80%" }, s.right]}>Total Amount</Text>
        <Text style={[s.cell, { width: "20%" }, s.right]}>{rupee(q.total_with_gst)}</Text>
      </View>
    </>
  );
}

function DetailedSchedule({ q, lines }: { q: PdfQuotation; lines: PdfLine[] }) {
  const panels = lines.filter((l) => l.line_type === "panel");
  const extras = lines.filter((l) => l.line_type !== "panel");
  const sum = summariseLines(lines);
  const gst = Number(q.total_with_gst ?? 0) - Number(q.total_amount ?? 0);
  let sr = 0;
  return (
    <View>
      {panels.length > 0 && (
        <View style={s.table}>
          <View style={s.thead}>
            <Text style={[s.cell, { width: "7%" }, s.center]}>Sr.</Text>
            <Text style={[s.cell, { width: "25%" }]}>{LINE_TYPE_LABELS.panel}</Text>
            <Text style={[s.cell, { width: "14%" }, s.center]}>Size (mm)</Text>
            <Text style={[s.cell, { width: "9%" }, s.right]}>Qty</Text>
            <Text style={[s.cell, { width: "12%" }, s.right]}>Area (Sqm)</Text>
            <Text style={[s.cell, { width: "13%" }, s.right]}>Weight (Kg)</Text>
            <Text style={[s.cell, { width: "20%" }, s.right]}>Amount</Text>
          </View>
          {panels.map((l, i) => (
            <View key={l.id} style={i % 2 ? [s.tr, s.alt] : s.tr} wrap={false}>
              <Text style={[s.cell, { width: "7%" }, s.center]}>{++sr}</Text>
              <Text style={[s.cell, { width: "25%" }]}>{l.panel_code}</Text>
              <Text style={[s.cell, { width: "14%" }, s.center]}>{l.width_mm && l.height_mm ? `${Number(l.width_mm)} x ${Number(l.height_mm)}` : ""}</Text>
              <Text style={[s.cell, { width: "9%" }, s.right]}>{formatQty(l.quantity)}</Text>
              <Text style={[s.cell, { width: "12%" }, s.right]}>{num(Number(l.area_sqm ?? 0) * Number(l.quantity))}</Text>
              <Text style={[s.cell, { width: "13%" }, s.right]}>{num(Number(l.unit_weight_kg ?? 0) * Number(l.quantity))}</Text>
              <Text style={[s.cell, { width: "20%" }, s.right]}>{rupee(l.line_total, 2)}</Text>
            </View>
          ))}
          <View style={[s.tr, s.bold]}>
            <Text style={[s.cell, { width: "80%" }, s.right]}>
              Panels subtotal ({num(q.total_area_sqm)} Sqm @ {num(panels[0]?.rate_per_kg)} Rs/Kg)
            </Text>
            <Text style={[s.cell, { width: "20%" }, s.right]}>{rupee(sum.byType.panel, 2)}</Text>
          </View>
        </View>
      )}

      {EXTRA_LINE_TYPES.map((t) => {
        const group = extras.filter((l) => l.line_type === t);
        if (group.length === 0) return null;
        return (
          <View key={t} style={[s.table, { marginTop: 8 }]} wrap={false}>
            <View style={s.thead}>
              <Text style={[s.cell, { width: "7%" }, s.center]}>Sr.</Text>
              <Text style={[s.cell, { width: "39%" }]}>{LINE_TYPE_LABELS[t]}</Text>
              <Text style={[s.cell, { width: "10%" }, s.center]}>Unit</Text>
              <Text style={[s.cell, { width: "10%" }, s.right]}>Qty</Text>
              <Text style={[s.cell, { width: "14%" }, s.right]}>Rate</Text>
              <Text style={[s.cell, { width: "20%" }, s.right]}>Amount</Text>
            </View>
            {group.map((l, i) => (
              <View key={l.id} style={i % 2 ? [s.tr, s.alt] : s.tr}>
                <Text style={[s.cell, { width: "7%" }, s.center]}>{++sr}</Text>
                <View style={[s.cell, { width: "39%" }]}>
                  <Text>{l.description}</Text>
                  {l.notes ? <Text style={s.small}>{l.notes}</Text> : null}
                </View>
                <Text style={[s.cell, { width: "10%" }, s.center]}>{l.unit}</Text>
                <Text style={[s.cell, { width: "10%" }, s.right]}>{formatQty(l.quantity)}</Text>
                <Text style={[s.cell, { width: "14%" }, s.right]}>{rupee(l.unit_rate, 2)}</Text>
                <Text style={[s.cell, { width: "20%" }, s.right]}>{rupee(l.line_total, 2)}</Text>
              </View>
            ))}
          </View>
        );
      })}

      <View style={[s.table, { marginTop: 8 }]} wrap={false}>
        <View style={s.tr}>
          <Text style={[s.cell, { width: "80%" }, s.right]}>Subtotal</Text>
          <Text style={[s.cell, { width: "20%" }, s.right]}>{rupee(q.total_amount, 2)}</Text>
        </View>
        <NalcoGstTotal q={q} gst={gst} />
      </View>
    </View>
  );
}

export function QuotationDocument({ q, lines, company }: { q: PdfQuotation; lines: PdfLine[]; company: PdfCompany }) {
  const kind = formworkKind(q.formwork_type);
  const setLabel = SET_LABEL[kind];
  const payment = q.payment_terms && q.payment_terms.length > 0 ? q.payment_terms : DEFAULT_PAYMENT_TERMS[kind];
  const hasBank = company.bank_account_number || company.bank_name;

  return (
    <Document title={`${q.quotation_code} – ${q.customer_name}`} author="Aco Form Work Pvt Ltd" subject="Techno-Commercial Proposal">
      {/* Cover letter + advantages */}
      <Page size="A4" style={s.page}>
        <Header c={company} />
        <Text style={s.title}>TECHNO-COMMERCIAL PROPOSAL</Text>
        <View style={s.refRow}>
          <Text><Text style={s.bold}>Ref.: </Text>{q.quotation_code}</Text>
          <Text><Text style={s.bold}>Date : </Text>{dmy(q.quotation_date)}</Text>
        </View>
        <Text style={s.p}>To,</Text>
        <Text style={[s.p, s.bold]}>{q.customer_name}{q.customer_address ? `, ${q.customer_address}` : ""}</Text>
        {q.kind_attn ? <Text style={s.p}><Text style={s.bold}>Kind Attn : </Text>{q.kind_attn}</Text> : null}
        <Text style={s.p}><Text style={s.bold}>Subject : </Text>Quotation for Supply of Aluminium Formwork System ({setLabel}).</Text>
        <Text style={s.p}>Dear Sir,</Text>
        <Text style={s.p}>We sincerely thank you for the opportunity to submit our proposal for the supply of Aluminium Formwork ({setLabel}).</Text>
        <Text style={s.p}>We hope that our quotation meets your expectations and requirements. Should you need any further clarification regarding commercial terms or any other details, please feel free to contact us at your convenience.</Text>
        <Text style={s.p}>We look forward to your valued order and the opportunity to work together.</Text>
        <Text style={s.h2}>ACOFORM ADVANTAGES :-</Text>
        <Bullets items={ADVANTAGES} numbered />
        <Footer />
      </Page>

      {/* Price schedule, bank, payment, delivery, validity */}
      <Page size="A4" style={s.page}>
        <Header c={company} />
        <Text style={s.h2}>PRICE SCHEDULE :-</Text>
        {q.quotation_type === "quick" ? <QuickSchedule q={q} /> : <DetailedSchedule q={q} lines={lines} />}
        <Text style={[s.small, { marginTop: 6 }]}>Note :- {SCHEDULE_NOTE}</Text>

        {hasBank ? (
          <View style={s.box} wrap={false}>
            <Text style={[s.bold, { marginBottom: 3 }]}>Account Details:</Text>
            <View style={s.kv}><Text style={s.kvK}>A/C Name</Text><Text>{company.bank_account_name}</Text></View>
            <View style={s.kv}><Text style={s.kvK}>Bank Name</Text><Text>{company.bank_name}</Text></View>
            <View style={s.kv}><Text style={s.kvK}>A/C No.</Text><Text>{company.bank_account_number}</Text></View>
            <View style={s.kv}><Text style={s.kvK}>IFSC Code</Text><Text>{company.bank_ifsc_code}</Text></View>
            <View style={s.kv}><Text style={s.kvK}>Branch</Text><Text>{company.bank_branch}</Text></View>
          </View>
        ) : null}

        <Text style={s.h2}>PAYMENT TERMS :-</Text>
        <Bullets items={payment} />
        <Text style={s.h2}>DELIVERY SCHEDULE :-</Text>
        <Bullets items={DELIVERY_SCHEDULE} />
        <Text style={s.h2}>VALIDITY :-</Text>
        <Bullets items={[`This offer is valid for a period of ${q.validity_days} days from the date of offer.`]} />
        <Footer />
      </Page>

      {/* Technical specification */}
      <Page size="A4" style={s.page}>
        <Header c={company} />
        <Text style={s.h2}>ACOFORM TECHNICAL AND MATERIAL SPECIFICATION :-</Text>
        <View style={s.table}>
          <View style={s.thead}>
            <Text style={[s.cell, { width: "9%" }, s.center]}>Sr. No.</Text>
            <Text style={[s.cell, { width: "41%" }]}>Technical Specifications Parameters</Text>
            <Text style={[s.cell, { width: "50%" }]}>Details</Text>
          </View>
          {TECH_SPECS[kind].map(([k, v], i) => (
            <View key={k + i} style={i % 2 ? [s.tr, s.alt] : s.tr} wrap={false}>
              <Text style={[s.cell, { width: "9%" }, s.center]}>{i + 1}</Text>
              <Text style={[s.cell, { width: "41%" }]}>{k}</Text>
              <Text style={[s.cell, { width: "50%" }]}>{v}</Text>
            </View>
          ))}
        </View>
        <Footer />
      </Page>

      {/* Accessories inclusive list */}
      <Page size="A4" style={s.page}>
        <Header c={company} />
        <Text style={s.h2}>ACCESSORIES INCLUSIVE LIST</Text>
        <View style={[s.table, { fontSize: 9 }]}>
          <View style={s.thead}>
            <Text style={[s.cell, { width: "8%" }, s.center]}>Sr. No.</Text>
            <Text style={[s.cell, { width: "30%" }]}>Item</Text>
            <Text style={[s.cell, { width: "38%" }]}>Description</Text>
            <Text style={[s.cell, { width: "9%" }, s.center]}>Unit</Text>
            <Text style={[s.cell, { width: "15%" }]}>Remarks</Text>
          </View>
          {ACCESSORIES[kind].map(([item, desc, unit, rem], i) => (
            <View key={i} style={[s.tr, { paddingVertical: 0 }, ...(i % 2 ? [s.alt] : [])]} wrap={false}>
              <Text style={[s.cell, { width: "8%" }, s.center]}>{i + 1}</Text>
              <Text style={[s.cell, { width: "30%" }]}>{item}</Text>
              <Text style={[s.cell, { width: "38%" }]}>{desc}</Text>
              <Text style={[s.cell, { width: "9%" }, s.center]}>{unit}</Text>
              <Text style={[s.cell, { width: "15%" }]}>{rem}</Text>
            </View>
          ))}
        </View>
        <Footer />
      </Page>

      {/* Terms & conditions */}
      <Page size="A4" style={s.page}>
        <Header c={company} />
        <Text style={s.h2}>TERMS & CONDITIONS OF CONTRACT :-</Text>
        {TERMS.map((t, i) => (
          <View key={t.title} style={{ marginBottom: 5 }} wrap={false}>
            <Text><Text style={s.bold}>{i + 1}) {t.title}: </Text>{t.text ?? ""}</Text>
            {t.bullets ? <View style={{ marginLeft: 14, marginTop: 2 }}><Bullets items={t.bullets} /></View> : null}
          </View>
        ))}
        <View style={{ marginTop: 10 }} wrap={false}>
          {CLOSING.map((c) => <Text key={c} style={s.p}>{c}</Text>)}
          <Text style={[s.p, { marginTop: 8 }]}>Thanks & Regards,</Text>
          <Text style={{ marginTop: 34 }}>Authorised Signatory</Text>
          <Text style={s.small}>(Sign & Stamp)</Text>
          <Text style={[s.bold, { marginTop: 2 }]}>Acoform Work Private Limited</Text>
        </View>
        <Footer />
      </Page>
    </Document>
  );
}
