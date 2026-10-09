import React from "react";
import path from "node:path";
import { Document, Font, Image, Page, StyleSheet, Text, View } from "@react-pdf/renderer";
import type { SheetGeo } from "./area-sheet-document";
import { IsoFigure, PlanFigure, SectionFigure } from "./plan-figures";
import {
  ADVANTAGES, accessoriesFor, CLOSING, DEFAULT_PAYMENT_TERMS, DELIVERY_SCHEDULE, SCHEDULE_NOTE, SET_LABEL, TECH_SPECS, TERMS,
  formworkKind,
} from "@/lib/quotations/document-content";
import { EXTRA_LINE_TYPES, LINE_TYPE_LABELS, formatQty, summariseLines } from "@/lib/quotations/line-types";
import { rupeesInWords } from "@/lib/quotations/amount-words";
import { ACCESSORY_PAYMENT_TERMS, accessoryTerms } from "@/lib/quotations/accessory-quote";

const PUBLIC = path.join(process.cwd(), "public");
Font.register({
  family: "Carlito",
  fonts: [
    { src: path.join(PUBLIC, "fonts", "Carlito-Regular.ttf") },
    { src: path.join(PUBLIC, "fonts", "Carlito-Bold.ttf"), fontWeight: "bold" },
  ],
});
Font.registerHyphenationCallback((word) => [word]);
const LOGO = path.join(PUBLIC, "brand", "acoform-logo.png");
// Site photos + client logos come from Settings (lib/quotations/media.ts): a file path or raw image bytes
export type PdfImage = string | { data: Buffer; format: "png" | "jpg" };
export type PdfMedia = { photos: PdfImage[]; logos: PdfImage[] };
export type PdfFloorPlan = { name: string; image: PdfImage | null; rows: [string, string][]; note: string; rules?: string[]; items?: { code: string; label: string; calc: string; area: number }[]; geo?: SheetGeo | null; dims?: { floorMm: number; slabMm: number; beamMm: number; parapetMm: number; unitToM: number; thin: boolean } };

const ORANGE = "#ef9d2f";
const ORANGE_SOFT = "#fdf3e4";
const GRAY = "#6b6d68";
const GRAY_DARK = "#3d3f3b";
const LIGHT = "#f6f6f5";
const LINE = "#dcdcd8";

const s = StyleSheet.create({
  page: { fontFamily: "Carlito", fontSize: 10, color: "#222", paddingTop: 88, paddingBottom: 60, paddingHorizontal: 40, lineHeight: 1.35 },
  header: { position: "absolute", top: 22, left: 40, right: 40, flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingBottom: 8, borderBottomWidth: 2, borderBottomColor: ORANGE },
  logo: { width: 150, height: 27.3 },
  headRight: { alignItems: "flex-end", maxWidth: 300 },
  headName: { fontSize: 10.5, fontWeight: "bold", color: GRAY_DARK, lineHeight: 1.2 },
  headLine: { fontSize: 7.8, color: GRAY, textAlign: "right", lineHeight: 1.3 },
  footer: { position: "absolute", bottom: 20, left: 40, right: 40, flexDirection: "row", justifyContent: "space-between", fontSize: 7.5, color: GRAY, borderTopWidth: 0.75, borderTopColor: ORANGE, paddingTop: 5 },
  watermark: { position: "absolute", top: 330, left: 90, fontSize: 110, fontWeight: "bold", color: "#f0f0ee", transform: "rotate(-30deg)", letterSpacing: 8 },

  titleBar: { flexDirection: "row", alignItems: "stretch", marginBottom: 12 },
  titleAccent: { width: 4, backgroundColor: ORANGE, marginRight: 8 },
  title: { fontSize: 17, fontWeight: "bold", color: GRAY_DARK, letterSpacing: 0.5, lineHeight: 1.15 },
  subtitle: { fontSize: 10, color: GRAY, lineHeight: 1.2 },

  cols: { flexDirection: "row", gap: 10, marginBottom: 10 },
  panel: { flex: 1, borderWidth: 0.75, borderColor: LINE, borderRadius: 3 },
  panelHead: { backgroundColor: GRAY, color: "#fff", fontWeight: "bold", fontSize: 8.5, paddingVertical: 3, paddingHorizontal: 7, letterSpacing: 0.6 },
  panelBody: { paddingVertical: 5, paddingHorizontal: 7 },
  kv: { flexDirection: "row", marginBottom: 1.5 },
  kvK: { width: 70, color: GRAY, fontSize: 9 },
  kvV: { flex: 1, fontSize: 9 },
  company: { fontSize: 11.5, fontWeight: "bold", marginBottom: 2 },

  figures: { flexDirection: "row", marginBottom: 12, borderWidth: 0.75, borderColor: ORANGE, borderRadius: 3, backgroundColor: ORANGE_SOFT },
  fig: { flex: 1, paddingVertical: 6, paddingHorizontal: 8, borderRightWidth: 0.75, borderRightColor: "#f3d7ae" },
  figK: { fontSize: 7.5, color: GRAY, letterSpacing: 0.5 },
  figV: { fontSize: 12.5, fontWeight: "bold", color: GRAY_DARK, marginTop: 1 },

  bold: { fontWeight: "bold" },
  h2: { fontSize: 11, fontWeight: "bold", color: GRAY_DARK, marginTop: 12, marginBottom: 5, paddingBottom: 2, borderBottomWidth: 0.75, borderBottomColor: ORANGE },
  p: { marginBottom: 5 },
  li: { flexDirection: "row", marginBottom: 2.5 },
  liNum: { width: 16, color: ORANGE, fontWeight: "bold" },
  liText: { flex: 1 },

  table: { borderWidth: 0.75, borderColor: LINE },
  thead: { flexDirection: "row", backgroundColor: GRAY, color: "#fff", fontWeight: "bold", fontSize: 9 },
  tr: { flexDirection: "row", borderTopWidth: 0.5, borderTopColor: LINE },
  alt: { backgroundColor: LIGHT },
  cell: { paddingVertical: 3, paddingHorizontal: 5 },
  right: { textAlign: "right" },
  center: { textAlign: "center" },
  totalRow: { flexDirection: "row", backgroundColor: ORANGE, color: "#fff", fontWeight: "bold", fontSize: 11.5 },
  words: { fontSize: 9, fontStyle: "normal", color: GRAY_DARK, marginTop: 4 },
  small: { fontSize: 8.5, color: GRAY },
  box: { borderWidth: 0.75, borderColor: LINE, borderRadius: 3, padding: 8, marginTop: 8 },
  signRow: { flexDirection: "row", gap: 16, marginTop: 14 },
  signBox: { flex: 1, borderWidth: 0.75, borderColor: LINE, borderRadius: 3, padding: 8, height: 98, justifyContent: "space-between" },
});

export type PdfCompany = {
  company_name: string | null; company_address: string | null; company_phone: string | null; company_website: string | null;
  gst_number: string | null; bank_account_name: string | null; bank_name: string | null; bank_account_number: string | null;
  bank_ifsc_code: string | null; bank_branch: string | null;
};

export type PdfQuotation = {
  quotation_code: string; quotation_type: string; formwork_type: string | null; status: string; revision_no: number | null;
  customer_name: string; customer_address: string | null; kind_attn: string | null; customer_phone: string | null;
  customer_email: string | null; customer_gstin: string | null; project_name: string | null; schedule_description: string | null;
  quotation_date: string; validity_days: number; payment_terms: string[] | null;
  total_area_sqm: number | null; total_amount: number | null; total_with_gst: number | null; gst_percentage: number;
  quick_rate_per_sqm: number | null; nalco_rate_per_kg: number | null; nalco_rate_date: string | null;
  accessories?: unknown; // edited accessories list (null = standard list)
  show_references?: boolean | null; // print the "Our work at site & esteemed clients" page
  options?: QuoteOptions | null;   // quote with two alternatives (wall options), one line per block
  delivery_place?: string | null;  // accessories quotation: where the material is delivered
  application?: string | null;     // accessories quotation: what it is used for ("Aluminium Formwork")
};
export type QuoteOptions = { labels: [string, string]; blocks: { name: string; area: number[] }[]; note?: string };

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
const addDays = (iso: string, days: number) => {
  const d = new Date(iso.slice(0, 10) + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};
const titleCase = (t: string) => (/[a-z]/.test(t) && t === t.toLowerCase() ? t.replace(/\b\w/g, (c) => c.toUpperCase()) : t);

function Bullets({ items, numbered }: { items: string[]; numbered?: boolean }) {
  return (
    <View>
      {items.map((t, i) => (
        <View key={i} style={s.li} wrap={false}>
          <Text style={s.liNum}>{numbered ? `${i + 1}.` : "•"}</Text>
          <Text style={s.liText}>{t}</Text>
        </View>
      ))}
    </View>
  );
}

function Chrome({ c, code, draft }: { c: PdfCompany; code: string; draft: boolean }) {
  const name = titleCase(c.company_name ?? "Aco Form Work Pvt Ltd");
  return (
    <>
      {draft ? <Text style={s.watermark} fixed>DRAFT</Text> : null}
      <View style={s.header} fixed>
        <Image src={LOGO} style={s.logo} />
        <View style={s.headRight}>
          <Text style={s.headName}>{name}</Text>
          {c.company_address ? <Text style={s.headLine}>{c.company_address}</Text> : null}
          <Text style={s.headLine}>
            {[c.company_phone && `Ph: ${c.company_phone}`, c.company_website, c.gst_number && `GSTIN: ${c.gst_number}`].filter(Boolean).join("   |   ")}
          </Text>
        </View>
      </View>
      <View style={s.footer} fixed>
        <Text>{name}</Text>
        <Text>Ref: {code}</Text>
        <Text render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`} />
      </View>
    </>
  );
}

function KV({ k, v }: { k: string; v: string | null | undefined }) {
  if (!v) return null;
  return <View style={s.kv}><Text style={s.kvK}>{k}</Text><Text style={s.kvV}>{v}</Text></View>;
}

function GstAndTotal({ q }: { q: PdfQuotation }) {
  const gst = Number(q.total_with_gst ?? 0) - Number(q.total_amount ?? 0);
  return (
    <>
      <View style={s.tr}>
        <Text style={[s.cell, { width: "78%" }, s.right]}>Subtotal</Text>
        <Text style={[s.cell, { width: "22%" }, s.right]}>{rupee(q.total_amount)}</Text>
      </View>
      <View style={s.tr}>
        <Text style={[s.cell, { width: "78%" }, s.right]}>GST @ {Number(q.gst_percentage).toFixed(0)}%</Text>
        <Text style={[s.cell, { width: "22%" }, s.right]}>{rupee(gst)}</Text>
      </View>
      <View style={s.totalRow}>
        <Text style={[s.cell, { width: "78%" }, s.right]}>Total Amount</Text>
        <Text style={[s.cell, { width: "22%" }, s.right]}>{rupee(q.total_with_gst)}</Text>
      </View>
    </>
  );
}

/** "Title; Block A: 4675 Sqm; Block C: 8810 Sqm" → title + one line per block (only when the blocks add up to the total area). */
export function quickBlocks(desc: string | null, total: number | null): { title: string; blocks: { name: string; area: number }[] } {
  const parts = (desc ?? "").split(/\n|;/).map((x) => x.trim()).filter(Boolean);
  const blocks: { name: string; area: number }[] = []; const rest: string[] = [];
  for (const p of parts) {
    const m = p.match(/^(.{1,60}?)\s*[:=–-]\s*([\d,]+(?:\.\d+)?)\s*(sq\.?\s*m(?:tr)?s?|sqm|m2|m²)?$/i);
    if (m) blocks.push({ name: m[1].trim(), area: Number(m[2].replace(/,/g, "")) }); else rest.push(p);
  }
  const sum = blocks.reduce((a, b) => a + b.area, 0);
  if (blocks.length < 2 || !total || Math.abs(sum - Number(total)) > 0.5) return { title: desc ?? "", blocks: [] };
  return { title: rest.join(" · "), blocks };
}

/** Two alternatives side by side (e.g. all walls concrete / thin walls in block): the client picks one. */
function OptionsSchedule({ q, o }: { q: PdfQuotation; o: QuoteOptions }) {
  const rate = Number(q.quick_rate_per_sqm) || 0, gstPct = Number(q.gst_percentage) || 0;
  const tot = [0, 1].map((k) => o.blocks.reduce((a, b) => a + (b.area[k] ?? 0), 0));
  const W = { sr: "6%", desc: "28%", a: "15%", r: "12%", amt: "19.5%" };
  const kind = SET_LABEL[formworkKind(q.formwork_type)];
  return (
    <View style={s.table} wrap={false}>
      <View style={s.thead}>
        <Text style={[s.cell, { width: W.sr }, s.center]}>Sr.</Text>
        <Text style={[s.cell, { width: W.desc }]}>Description</Text>
        <Text style={[s.cell, { width: W.a }, s.right]}>Option 1 Qty (Sqm)</Text>
        <Text style={[s.cell, { width: W.a }, s.right]}>Option 2 Qty (Sqm)</Text>
        <Text style={[s.cell, { width: W.r }, s.right]}>Rate (₹/Sqm)</Text>
        <Text style={[s.cell, { width: "24%" }, s.right]}>Amount Opt. 1 / Opt. 2</Text>
      </View>
      {o.blocks.map((b, i) => (
        <View key={i} style={s.tr}>
          <Text style={[s.cell, { width: W.sr }, s.center]}>{i + 1}</Text>
          <View style={[s.cell, { width: W.desc }]}><Text style={s.bold}>{b.name}</Text><Text style={s.small}>{kind} · typical floor contact area</Text></View>
          <Text style={[s.cell, { width: W.a }, s.right]}>{num(b.area[0] ?? 0)}</Text>
          <Text style={[s.cell, { width: W.a }, s.right]}>{num(b.area[1] ?? 0)}</Text>
          <Text style={[s.cell, { width: W.r }, s.right]}>{num(rate, 0)}</Text>
          <Text style={[s.cell, { width: "24%" }, s.right]}>{rupee((b.area[0] ?? 0) * rate)}{"\n"}{rupee((b.area[1] ?? 0) * rate)}</Text>
        </View>
      ))}
      {[["Subtotal", 1], [`GST @ ${gstPct.toFixed(0)}%`, gstPct / 100]].map(([label, f], i) => (
        <View key={i} style={s.tr}>
          <Text style={[s.cell, { width: "34%" }, s.right]}>{label as string}</Text>
          <Text style={[s.cell, { width: W.a }, s.right]}>{i === 0 ? num(tot[0]) : ""}</Text>
          <Text style={[s.cell, { width: W.a }, s.right]}>{i === 0 ? num(tot[1]) : ""}</Text>
          <Text style={[s.cell, { width: W.r }, s.right]} />
          <Text style={[s.cell, { width: "24%" }, s.right]}>{rupee(tot[0] * rate * (f as number))}{"\n"}{rupee(tot[1] * rate * (f as number))}</Text>
        </View>
      ))}
      <View style={s.totalRow}>
        <Text style={[s.cell, { width: "76%" }, s.right]}>Total Amount — Option 1 / Option 2</Text>
        <Text style={[s.cell, { width: "24%" }, s.right]}>{rupee(tot[0] * rate * (1 + gstPct / 100))}{"\n"}{rupee(tot[1] * rate * (1 + gstPct / 100))}</Text>
      </View>
      <View style={{ padding: 5 }}>
        <Text style={s.small}>Option 1: {o.labels[0]}.   Option 2: {o.labels[1]}.   Amounts shown as Option 1 / Option 2.</Text>
        {o.note ? <Text style={s.small}>{o.note}</Text> : null}
      </View>
    </View>
  );
}

function QuickSchedule({ q }: { q: PdfQuotation }) {
  const o = q.options;
  if (o && Array.isArray(o.blocks) && o.blocks.length && Array.isArray(o.labels) && o.labels.length === 2) return <OptionsSchedule q={q} o={o} />;
  const qb = quickBlocks(q.schedule_description, q.total_area_sqm);
  if (qb.blocks.length) {
    const rate = Number(q.quick_rate_per_sqm) || 0;
    return (
      <View style={s.table} wrap={false}>
        <View style={s.thead}>
          <Text style={[s.cell, { width: "8%" }, s.center]}>Sr.</Text>
          <Text style={[s.cell, { width: "44%" }]}>Description</Text>
          <Text style={[s.cell, { width: "13%" }, s.right]}>Qty (Sqm)</Text>
          <Text style={[s.cell, { width: "13%" }, s.right]}>Rate (₹/Sqm)</Text>
          <Text style={[s.cell, { width: "22%" }, s.right]}>Amount</Text>
        </View>
        {qb.blocks.map((b, i) => (
          <View key={i} style={s.tr}>
            <Text style={[s.cell, { width: "8%" }, s.center]}>{i + 1}</Text>
            <View style={[s.cell, { width: "44%" }]}>
              <Text style={s.bold}>{qb.title || "Acoform Aluminium Formwork"} — {b.name}</Text>
              <Text style={s.small}>{SET_LABEL[formworkKind(q.formwork_type)]} · measured on {q.formwork_type === "vertical" ? "vertical face" : "floor plate"} area</Text>
            </View>
            <Text style={[s.cell, { width: "13%" }, s.right]}>{num(b.area)}</Text>
            <Text style={[s.cell, { width: "13%" }, s.right]}>{num(rate, 0)}</Text>
            <Text style={[s.cell, { width: "22%" }, s.right]}>{rupee(b.area * rate)}</Text>
          </View>
        ))}
        <GstAndTotal q={q} />
      </View>
    );
  }
  return (
    <View style={s.table} wrap={false}>
      <View style={s.thead}>
        <Text style={[s.cell, { width: "8%" }, s.center]}>Sr.</Text>
        <Text style={[s.cell, { width: "44%" }]}>Description</Text>
        <Text style={[s.cell, { width: "13%" }, s.right]}>Qty (Sqm)</Text>
        <Text style={[s.cell, { width: "13%" }, s.right]}>Rate (₹/Sqm)</Text>
        <Text style={[s.cell, { width: "22%" }, s.right]}>Amount</Text>
      </View>
      <View style={s.tr}>
        <Text style={[s.cell, { width: "8%" }, s.center]}>1</Text>
        <View style={[s.cell, { width: "44%" }]}>
          <Text style={s.bold}>{q.schedule_description || "Acoform Aluminium Formwork"}</Text>
          <Text style={s.small}>{SET_LABEL[formworkKind(q.formwork_type)]} · measured on {q.formwork_type === "vertical" ? "vertical face" : "floor plate"} area</Text>
        </View>
        <Text style={[s.cell, { width: "13%" }, s.right]}>{num(q.total_area_sqm)}</Text>
        <Text style={[s.cell, { width: "13%" }, s.right]}>{num(q.quick_rate_per_sqm, 0)}</Text>
        <Text style={[s.cell, { width: "22%" }, s.right]}>{rupee(q.total_amount)}</Text>
      </View>
      <GstAndTotal q={q} />
    </View>
  );
}

function DetailedSchedule({ q, lines }: { q: PdfQuotation; lines: PdfLine[] }) {
  const panels = lines.filter((l) => l.line_type === "panel");
  const extras = lines.filter((l) => l.line_type !== "panel");
  const sum = summariseLines(lines);
  let sr = 0;
  return (
    <View>
      {panels.length > 0 && (
        <View style={s.table}>
          <View style={s.thead}>
            <Text style={[s.cell, { width: "7%" }, s.center]}>Sr.</Text>
            <Text style={[s.cell, { width: "24%" }]}>{LINE_TYPE_LABELS.panel}</Text>
            <Text style={[s.cell, { width: "14%" }, s.center]}>Size (mm)</Text>
            <Text style={[s.cell, { width: "9%" }, s.right]}>Qty</Text>
            <Text style={[s.cell, { width: "12%" }, s.right]}>Area (Sqm)</Text>
            <Text style={[s.cell, { width: "12%" }, s.right]}>Weight (Kg)</Text>
            <Text style={[s.cell, { width: "22%" }, s.right]}>Amount</Text>
          </View>
          {panels.map((l, i) => (
            <View key={l.id} style={i % 2 ? [s.tr, s.alt] : s.tr} wrap={false}>
              <Text style={[s.cell, { width: "7%" }, s.center]}>{++sr}</Text>
              <Text style={[s.cell, { width: "24%" }]}>{l.panel_code}</Text>
              <Text style={[s.cell, { width: "14%" }, s.center]}>{l.width_mm && l.height_mm ? `${Number(l.width_mm)} x ${Number(l.height_mm)}` : ""}</Text>
              <Text style={[s.cell, { width: "9%" }, s.right]}>{formatQty(l.quantity)}</Text>
              <Text style={[s.cell, { width: "12%" }, s.right]}>{num(Number(l.area_sqm ?? 0) * Number(l.quantity))}</Text>
              <Text style={[s.cell, { width: "12%" }, s.right]}>{num(Number(l.unit_weight_kg ?? 0) * Number(l.quantity))}</Text>
              <Text style={[s.cell, { width: "22%" }, s.right]}>{rupee(l.line_total, 2)}</Text>
            </View>
          ))}
          <View style={[s.tr, s.bold, { backgroundColor: LIGHT }]}>
            <Text style={[s.cell, { width: "78%" }, s.right]}>Panels subtotal · {num(q.total_area_sqm)} Sqm @ {num(panels[0]?.rate_per_kg)} ₹/Kg</Text>
            <Text style={[s.cell, { width: "22%" }, s.right]}>{rupee(sum.byType.panel, 2)}</Text>
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
              <Text style={[s.cell, { width: "9%" }, s.right]}>Qty</Text>
              <Text style={[s.cell, { width: "13%" }, s.right]}>Rate</Text>
              <Text style={[s.cell, { width: "22%" }, s.right]}>Amount</Text>
            </View>
            {group.map((l, i) => (
              <View key={l.id} style={i % 2 ? [s.tr, s.alt] : s.tr}>
                <Text style={[s.cell, { width: "7%" }, s.center]}>{++sr}</Text>
                <View style={[s.cell, { width: "39%" }]}>
                  <Text>{l.description}</Text>
                  {l.notes ? <Text style={s.small}>{l.notes}</Text> : null}
                </View>
                <Text style={[s.cell, { width: "10%" }, s.center]}>{l.unit}</Text>
                <Text style={[s.cell, { width: "9%" }, s.right]}>{formatQty(l.quantity)}</Text>
                <Text style={[s.cell, { width: "13%" }, s.right]}>{rupee(l.unit_rate, 2)}</Text>
                <Text style={[s.cell, { width: "22%" }, s.right]}>{rupee(l.line_total, 2)}</Text>
              </View>
            ))}
          </View>
        );
      })}

      <View style={[s.table, { marginTop: 8 }]} wrap={false}>
        <GstAndTotal q={q} />
      </View>
    </View>
  );
}

/**
 * Accessories-only quotation: a short commercial offer — who it is for, the items as the customer asked for them
 * (item, size, quantity, rate, amount), GST and total, terms, bank details and signatures. No formwork pages.
 */
function AccessoriesDocument({ q, lines, company }: { q: PdfQuotation; lines: PdfLine[]; company: PdfCompany }) {
  const draft = ["draft", "pending_approval"].includes(q.status);
  const validUntil = addDays(q.quotation_date, q.validity_days);
  const companyName = titleCase(company.company_name ?? "Aco Form Work Pvt Ltd");
  const items = [...lines.filter((l) => l.line_type !== "transport"), ...lines.filter((l) => l.line_type === "transport")];
  const freight = lines.some((l) => l.line_type === "transport");
  const payment = q.payment_terms && q.payment_terms.length > 0 ? q.payment_terms : ACCESSORY_PAYMENT_TERMS;
  const hasBank = company.bank_account_number || company.bank_name;
  const use = q.application?.trim();
  const W = { sr: "6%", item: "32%", spec: "17%", qty: "9%", unit: "10%", rate: "11%", amt: "15%" };
  return (
    <Document title={`${q.quotation_code} – ${q.customer_name}`} author={companyName} subject="Quotation for formwork accessories">
      <Page size="A4" style={s.page}>
        <Chrome c={company} code={q.quotation_code} draft={draft} />
        <View style={s.titleBar}>
          <View style={s.titleAccent} />
          <View>
            <Text style={s.title}>QUOTATION</Text>
            <Text style={s.subtitle}>Supply of Formwork Accessories{use ? ` – for use in ${use}` : ""}</Text>
          </View>
        </View>
        <View style={s.cols}>
          <View style={s.panel}>
            <Text style={s.panelHead}>TO</Text>
            <View style={s.panelBody}>
              <Text style={s.company}>{q.customer_name}</Text>
              <KV k="Kind Attn" v={q.kind_attn} />
              <KV k="Phone" v={q.customer_phone} />
              <KV k="Email" v={q.customer_email} />
              <KV k="GSTIN" v={q.customer_gstin} />
              <KV k="Address" v={q.customer_address} />
            </View>
          </View>
          <View style={s.panel}>
            <Text style={s.panelHead}>QUOTATION DETAILS</Text>
            <View style={s.panelBody}>
              <KV k="Ref. No." v={q.quotation_code} />
              <KV k="Date" v={dmy(q.quotation_date)} />
              <KV k="Valid until" v={`${dmy(validUntil)} (${q.validity_days} days)`} />
              <KV k="Project" v={q.project_name} />
              <KV k="Delivery at" v={q.delivery_place} />
              <KV k="Revision" v={q.revision_no ? `R${q.revision_no}` : "R0"} />
            </View>
          </View>
        </View>

        <Text style={s.p}>Dear Sir, with reference to your enquiry for the supply of formwork accessories{use ? ` for use in ${use}` : ""}{q.delivery_place ? `, delivery at ${q.delivery_place}` : ""}, we are pleased to quote our rates as under:</Text>

        <View style={s.table}>
          <View style={s.thead} fixed>
            <Text style={[s.cell, { width: W.sr }, s.center]}>Sr.</Text>
            <Text style={[s.cell, { width: W.item }]}>Item</Text>
            <Text style={[s.cell, { width: W.spec }]}>Size / Spec.</Text>
            <Text style={[s.cell, { width: W.qty }, s.right]}>Qty</Text>
            <Text style={[s.cell, { width: W.unit }, s.center]}>Unit</Text>
            <Text style={[s.cell, { width: W.rate }, s.right]}>Rate (₹)</Text>
            <Text style={[s.cell, { width: W.amt }, s.right]}>Amount (₹)</Text>
          </View>
          {items.map((l, i) => {
            // every row carries the full item name (also when the item repeats in another size)
            return (
              <View key={l.id} style={i % 2 ? [s.tr, s.alt] : s.tr} wrap={false}>
                <Text style={[s.cell, { width: W.sr }, s.center]}>{i + 1}</Text>
                <Text style={[s.cell, { width: W.item }]}>{l.description}</Text>
                <Text style={[s.cell, { width: W.spec }]}>{l.notes ?? ""}</Text>
                <Text style={[s.cell, { width: W.qty }, s.right]}>{formatQty(l.quantity)}</Text>
                <Text style={[s.cell, { width: W.unit }, s.center]}>{l.unit}</Text>
                <Text style={[s.cell, { width: W.rate }, s.right]}>{num(l.unit_rate, 2)}</Text>
                <Text style={[s.cell, { width: W.amt }, s.right]}>{num(l.line_total, 2)}</Text>
              </View>
            );
          })}
        </View>
        <View style={[s.table, { marginTop: 6 }]} wrap={false}>
          <GstAndTotal q={q} />
        </View>
        <Text style={s.words}><Text style={s.bold}>Amount in words: </Text>{rupeesInWords(Math.round(Number(q.total_with_gst ?? 0)))}</Text>

        <Text style={s.h2}>TERMS &amp; CONDITIONS</Text>
        <Bullets items={[...payment.map((p) => `Payment: ${p}`), ...accessoryTerms({ delivery: q.delivery_place, freightQuoted: freight, gstPct: Number(q.gst_percentage) || 18, validityDays: q.validity_days, validUntil: dmy(validUntil) })]} numbered />

        <View wrap={false}>
          <Text style={[s.p, { marginTop: 8 }]}>We hope our offer meets your requirement and look forward to your valued order.</Text>
          <View style={[s.signRow, { marginTop: 6, gap: 10 }]}>
            {hasBank ? (
              <View style={[s.signBox, { flex: 1.4, height: 82, justifyContent: "flex-start" }]}>
                <Text style={[s.bold, { marginBottom: 3, color: GRAY_DARK }]}>Bank Details</Text>
                <KV k="A/C Name" v={company.bank_account_name} />
                <KV k="Bank" v={company.bank_name} />
                <KV k="A/C No." v={company.bank_account_number} />
                <KV k="IFSC" v={company.bank_ifsc_code} />
                <KV k="Branch" v={company.bank_branch} />
              </View>
            ) : null}
            <View style={[s.signBox, { height: 82 }]}>
              <Text style={s.bold}>For {companyName}</Text>
              <View><Text>Authorised Signatory</Text><Text style={s.small}>(Sign & Stamp)</Text></View>
            </View>
            <View style={[s.signBox, { height: 82 }]}>
              <Text style={s.bold}>Accepted by {q.customer_name}</Text>
              <View><Text>Name, Signature & Stamp</Text><Text style={s.small}>Date:</Text></View>
            </View>
          </View>
        </View>
      </Page>
    </Document>
  );
}

export function QuotationDocument({ q, lines, company, media = { photos: [], logos: [] }, plan = null, plans }: { q: PdfQuotation; lines: PdfLine[]; company: PdfCompany; media?: PdfMedia; plan?: PdfFloorPlan | null; plans?: PdfFloorPlan[] }) {
  if (q.quotation_type === "accessories") return <AccessoriesDocument q={q} lines={lines} company={company} />;
  const planPages: PdfFloorPlan[] = plans?.length ? plans : plan ? [plan] : [];
  const kind = formworkKind(q.formwork_type);
  const setLabel = SET_LABEL[kind];
  const payment = q.payment_terms && q.payment_terms.length > 0 ? q.payment_terms : DEFAULT_PAYMENT_TERMS[kind];
  const hasBank = company.bank_account_number || company.bank_name;
  const draft = ["draft", "pending_approval"].includes(q.status);
  const validUntil = addDays(q.quotation_date, q.validity_days);
  const companyName = titleCase(company.company_name ?? "Aco Form Work Pvt Ltd");
  const chrome = <Chrome c={company} code={q.quotation_code} draft={draft} />;
  const { photos, logos } = media;
  const showReferences = q.show_references !== false && (photos.length > 0 || logos.length > 0);
  const qtyLabel = q.quotation_type === "quick" ? "QUANTITY" : "FORMWORK AREA";
  const hasOpts = !!(q.options && Array.isArray(q.options.blocks) && q.options.blocks.length && q.options.labels?.length === 2);
  const opt2Area = hasOpts ? q.options!.blocks.reduce((a, b) => a + (b.area[1] ?? 0), 0) : 0;

  return (
    <Document title={`${q.quotation_code} – ${q.customer_name}`} author={companyName} subject="Techno-Commercial Proposal">
      {/* 1. Cover: who, what, headline figures, letter, advantages */}
      <Page size="A4" style={s.page}>
        {chrome}
        <View style={s.titleBar}>
          <View style={s.titleAccent} />
          <View>
            <Text style={s.title}>TECHNO-COMMERCIAL PROPOSAL</Text>
            <Text style={s.subtitle}>Supply of Aluminium Formwork System ({setLabel})</Text>
          </View>
        </View>

        <View style={s.cols}>
          <View style={s.panel}>
            <Text style={s.panelHead}>PREPARED FOR</Text>
            <View style={s.panelBody}>
              <Text style={s.company}>{q.customer_name}</Text>
              <KV k="Kind Attn" v={q.kind_attn} />
              <KV k="Phone" v={q.customer_phone} />
              <KV k="Email" v={q.customer_email} />
              <KV k="GSTIN" v={q.customer_gstin} />
              <KV k="Address" v={q.customer_address} />
            </View>
          </View>
          <View style={s.panel}>
            <Text style={s.panelHead}>PROPOSAL DETAILS</Text>
            <View style={s.panelBody}>
              <KV k="Ref. No." v={q.quotation_code} />
              <KV k="Date" v={dmy(q.quotation_date)} />
              <KV k="Valid until" v={`${dmy(validUntil)} (${q.validity_days} days)`} />
              <KV k="Project" v={q.project_name} />
              <KV k="System" v={`Aluminium Formwork – ${setLabel}`} />
              <KV k="Revision" v={q.revision_no ? `R${q.revision_no}` : "R0"} />
            </View>
          </View>
        </View>

        <View style={s.figures}>
          <View style={s.fig}><Text style={s.figK}>{qtyLabel}{hasOpts ? " (OPTION 1 / 2)" : ""}</Text><Text style={s.figV}>{num(q.total_area_sqm)} Sqm{hasOpts ? ` / ${num(opt2Area)} Sqm` : ""}</Text></View>
          {q.quotation_type === "quick" ? (
            <View style={s.fig}><Text style={s.figK}>RATE</Text><Text style={s.figV}>{rupee(q.quick_rate_per_sqm)} / Sqm</Text></View>
          ) : (
            <View style={s.fig}><Text style={s.figK}>SUBTOTAL</Text><Text style={s.figV}>{rupee(q.total_amount)}</Text></View>
          )}
          <View style={[s.fig, { borderRightWidth: 0 }]}><Text style={s.figK}>TOTAL INCL. GST{hasOpts ? " (OPTION 1 / 2)" : ""}</Text><Text style={s.figV}>{rupee(q.total_with_gst)}{hasOpts ? ` / ${rupee(opt2Area * (Number(q.quick_rate_per_sqm) || 0) * (1 + (Number(q.gst_percentage) || 0) / 100))}` : ""}</Text></View>
        </View>

        <Text style={s.p}>Dear Sir,</Text>
        <Text style={s.p}>We sincerely thank you for the opportunity to submit our proposal for the supply of Aluminium Formwork ({setLabel}). We hope that our quotation meets your expectations and requirements. Should you need any further clarification regarding commercial terms or any other details, please feel free to contact us at your convenience.</Text>
        <Text style={s.p}>We look forward to your valued order and the opportunity to work together.</Text>

        <Text style={s.h2}>ACOFORM ADVANTAGES</Text>
        <Bullets items={ADVANTAGES} numbered />
      </Page>

      {/* 2. Commercials */}
      <Page size="A4" style={s.page}>
        {chrome}
        <Text style={[s.h2, { marginTop: 0 }]}>PRICE SCHEDULE</Text>
        {q.quotation_type === "quick" ? <QuickSchedule q={q} /> : <DetailedSchedule q={q} lines={lines} />}
        <Text style={s.words}><Text style={s.bold}>Amount in words: </Text>{rupeesInWords(Math.round(Number(q.total_with_gst ?? 0)))}</Text>
        {q.nalco_rate_per_kg ? (
          <Text style={[s.small, { marginTop: 3 }]}>
            Nalco Rate :- {num(q.nalco_rate_per_kg)} ₹/Kg{q.nalco_rate_date ? ` (as on ${dmy(q.nalco_rate_date, "-")})` : ""}
          </Text>
        ) : null}
        <Text style={[s.small, { marginTop: 3 }]}>Note :- {SCHEDULE_NOTE}</Text>

        <View style={s.cols} wrap={false}>
          <View style={{ flex: 1.1 }}>
            <Text style={s.h2}>PAYMENT TERMS</Text>
            <Bullets items={payment} />
            <Text style={s.h2}>VALIDITY</Text>
            <Bullets items={[`This offer is valid for ${q.validity_days} days from the date of offer, i.e. until ${dmy(validUntil)}.`]} />
          </View>
          {hasBank ? (
            <View style={[s.box, { flex: 0.9, marginTop: 12, alignSelf: "flex-start" }]}>
              <Text style={[s.bold, { marginBottom: 4, color: GRAY_DARK }]}>Bank Details</Text>
              <KV k="A/C Name" v={company.bank_account_name} />
              <KV k="Bank" v={company.bank_name} />
              <KV k="A/C No." v={company.bank_account_number} />
              <KV k="IFSC" v={company.bank_ifsc_code} />
              <KV k="Branch" v={company.bank_branch} />
            </View>
          ) : null}
        </View>

        <Text style={s.h2}>DELIVERY SCHEDULE</Text>
        <Bullets items={DELIVERY_SCHEDULE} />
      </Page>

      {/* 3. Technical specification */}
      <Page size="A4" style={s.page}>
        {chrome}
        <Text style={[s.h2, { marginTop: 0 }]}>ACOFORM TECHNICAL AND MATERIAL SPECIFICATION</Text>
        <View style={s.table}>
          <View style={s.thead}>
            <Text style={[s.cell, { width: "8%" }, s.center]}>Sr.</Text>
            <Text style={[s.cell, { width: "40%" }]}>Parameter</Text>
            <Text style={[s.cell, { width: "52%" }]}>Details</Text>
          </View>
          {TECH_SPECS[kind].map(([k, v], i) => (
            <View key={k + i} style={i % 2 ? [s.tr, s.alt] : s.tr} wrap={false}>
              <Text style={[s.cell, { width: "8%" }, s.center]}>{i + 1}</Text>
              <Text style={[s.cell, { width: "40%" }]}>{k}</Text>
              <Text style={[s.cell, { width: "52%" }]}>{v}</Text>
            </View>
          ))}
        </View>
      </Page>

      {/* 3a. Project floor plan + area take-off (one set of pages per measured block) */}
      {planPages.map((plan, pi) => (
        <React.Fragment key={pi}>
          <Page size="A4" style={s.page}>
            {chrome}
            <Text style={[s.h2, { marginTop: 0 }]}>PROJECT FLOOR PLAN &amp; FORMWORK AREA</Text>
            <Text style={{ fontSize: 9, color: GRAY, marginBottom: 6 }}>{plan.name}</Text>
            {plan.geo ? (
              <View style={{ borderWidth: 0.75, borderColor: "#dddddd", borderRadius: 3, padding: 4, alignItems: "center" }} wrap={false}>
                <PlanFigure geo={plan.geo} w={500} h={plan.geo.box[3] - plan.geo.box[1] > 1.3 * (plan.geo.box[2] - plan.geo.box[0]) ? 430 : 330} />
              </View>
            ) : plan.image ? (
              <View style={{ borderWidth: 0.75, borderColor: "#dddddd", borderRadius: 3, padding: 4, alignItems: "center" }} wrap={false}>
                <Image src={plan.image} style={{ maxWidth: "100%", maxHeight: 430, objectFit: "contain" }} />
              </View>
            ) : null}
            <View style={[s.table, { marginTop: 10, fontSize: 9 }]} wrap={false}>
              {plan.rows.map(([k, v], i) => (
                <View key={k} style={i % 2 ? [s.tr, s.alt] : s.tr}>
                  <Text style={[s.cell, { width: "65%" }, i === plan.rows.length - 1 ? { fontWeight: "bold" } : {}]}>{k}</Text>
                  <Text style={[s.cell, { width: "35%", textAlign: "right" }, i === plan.rows.length - 1 ? { fontWeight: "bold" } : {}]}>{v}</Text>
                </View>
              ))}
            </View>
            <Text style={{ fontSize: 7.5, color: GRAY, marginTop: 4 }}>{plan.note}</Text>
            {plan.rules && plan.rules.length ? (
              <View style={{ marginTop: 8 }} wrap={false}>
                <Text style={{ fontSize: 8.5, fontWeight: "bold", marginBottom: 2 }}>MEASUREMENT BASIS</Text>
                {plan.rules.map((r, i) => <Text key={i} style={{ fontSize: 7.5, color: GRAY, marginBottom: 1 }}>{`${i + 1}. ${r}`}</Text>)}
              </View>
            ) : null}
          </Page>
          {plan.geo && plan.dims ? (
            <Page size="A4" style={s.page}>
              {chrome}
              <Text style={[s.h2, { marginTop: 0 }]}>WHAT WE FORM — {plan.name.toUpperCase()}</Text>
              <Text style={{ fontSize: 8.5, color: GRAY, marginBottom: 6 }}>Concrete of the typical floor as read from your drawing: walls, parapets, columns and beams shown in 3D (the deck panels under the slab are not drawn). Heights from the drawing's sections.</Text>
              <View style={{ borderWidth: 0.75, borderColor: "#dddddd", borderRadius: 3, padding: 4, alignItems: "center" }} wrap={false}>
                <IsoFigure geo={plan.geo} H={(plan.dims.floorMm - plan.dims.slabMm) / 1000} parapetH={plan.dims.parapetMm / 1000} w={500} h={320} unitToM={plan.dims.unitToM} slabM={plan.dims.slabMm / 1000} />
              </View>
              <View style={{ borderWidth: 0.75, borderColor: "#dddddd", borderRadius: 3, padding: 4, marginTop: 8, alignItems: "center" }} wrap={false}>
                <SectionFigure floorMm={plan.dims.floorMm} slabMm={plan.dims.slabMm} beamMm={plan.dims.beamMm} parapetMm={plan.dims.parapetMm} w={500} h={210} thin={plan.dims.thin} />
              </View>
              <Text style={{ fontSize: 7.5, color: GRAY, marginTop: 6 }}>Walls are formed on both faces from the slab top to the underside of the slab above ({plan.dims.floorMm - plan.dims.slabMm} mm). Beams over doors and windows and edge beams are formed on both sides and the underside ({plan.dims.beamMm} mm deep). Balcony parapets are formed on both faces to {plan.dims.parapetMm} mm. The deck is formed on the slab underside less wall tops.</Text>
            </Page>
          ) : null}
          {plan.items && plan.items.length > 0 ? (
            <Page size="A4" style={s.page}>
              {chrome}
              <Text style={[s.h2, { marginTop: 0 }]}>FORMWORK AREA LIST (TYPICAL FLOOR) — {plan.name.toUpperCase()}</Text>
              <View style={[s.table, { fontSize: 8.5 }]}>
                <View style={[s.tr, { backgroundColor: ORANGE_SOFT }]} fixed>
                  <Text style={[s.cell, { width: "10%", fontWeight: "bold" }]}>CODE</Text>
                  <Text style={[s.cell, { width: "32%", fontWeight: "bold" }]}>ELEMENT</Text>
                  <Text style={[s.cell, { width: "40%", fontWeight: "bold" }]}>CALCULATION</Text>
                  <Text style={[s.cell, { width: "18%", fontWeight: "bold", textAlign: "right" }]}>AREA (m²)</Text>
                </View>
                {plan.items.map((it, i) => (
                  <View key={i} style={i % 2 ? [s.tr, s.alt] : s.tr} wrap={false}>
                    <Text style={[s.cell, { width: "10%" }]}>{it.code}</Text>
                    <Text style={[s.cell, { width: "32%" }]}>{it.label}</Text>
                    <Text style={[s.cell, { width: "40%" }]}>{it.calc}</Text>
                    <Text style={[s.cell, { width: "18%", textAlign: "right" }]}>{it.area.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</Text>
                  </View>
                ))}
                {plan.rows.slice(-2).map(([k, v]) => (
                  <View key={k} style={s.tr} wrap={false}>
                    <Text style={[s.cell, { width: "82%", fontWeight: "bold" }]}>{k}</Text>
                    <Text style={[s.cell, { width: "18%", textAlign: "right", fontWeight: "bold" }]}>{v.replace(" m²", "")}</Text>
                  </View>
                ))}
              </View>
            </Page>
          ) : null}
        </React.Fragment>
      ))}

      {/* 3b. Our work at site + esteemed clients */}
      {showReferences ? (
        <Page size="A4" style={s.page}>
          {chrome}
          {photos.length > 0 ? (
            <>
              <Text style={[s.h2, { marginTop: 0 }]}>OUR WORK AT SITE</Text>
              <View wrap={false}>
                <Image src={photos[0]} style={{ width: "100%", height: photos.length > 1 ? 215 : 300, objectFit: "cover", borderRadius: 3 }} />
              </View>
              {photos.length > 1 ? (
                <View style={{ flexDirection: "row", marginTop: 8, gap: 8 }} wrap={false}>
                  {photos.slice(1, 3).map((p, i) => (
                    <Image key={i} src={p} style={{ width: photos.length === 2 ? "100%" : i === 0 ? "60%" : "38.4%", height: 190, objectFit: "cover", borderRadius: 3 }} />
                  ))}
                </View>
              ) : null}
              <Text style={{ fontSize: 8, color: GRAY, marginTop: 4, textAlign: "center" }}>
                Actual site photographs of ACOFORM powder-coated aluminium formwork in use.
              </Text>
            </>
          ) : null}

          {logos.length > 0 ? (
            <>
              <Text style={[s.h2, { marginTop: photos.length > 0 ? 16 : 0 }]}>OUR ESTEEMED CLIENTS</Text>
              <View style={{ flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: 8, marginTop: 4 }} wrap={false}>
                {logos.map((src, i) => (
                  <View key={i} style={{ width: "23.5%", height: 62, borderWidth: 0.75, borderColor: "#dddddd", borderRadius: 4, padding: 6, alignItems: "center", justifyContent: "center" }}>
                    <Image src={src} style={{ maxWidth: "100%", maxHeight: 48, objectFit: "contain" }} />
                  </View>
                ))}
              </View>
            </>
          ) : null}
        </Page>
      ) : null}

      {/* 4. Accessories */}
      <Page size="A4" style={s.page}>
        {chrome}
        <Text style={[s.h2, { marginTop: 0 }]}>ACCESSORIES INCLUSIVE LIST</Text>
        <View style={[s.table, { fontSize: 9 }]}>
          <View style={s.thead}>
            <Text style={[s.cell, { width: "7%" }, s.center]}>Sr.</Text>
            <Text style={[s.cell, { width: "30%" }]}>Item</Text>
            <Text style={[s.cell, { width: "39%" }]}>Description</Text>
            <Text style={[s.cell, { width: "9%" }, s.center]}>Unit</Text>
            <Text style={[s.cell, { width: "15%" }]}>Remarks</Text>
          </View>
          {accessoriesFor(kind, q.accessories).map(([item, desc, unit, rem], i) => (
            <View key={i} style={i % 2 ? [s.tr, s.alt] : s.tr} wrap={false}>
              <Text style={[s.cell, { width: "7%" }, s.center]}>{i + 1}</Text>
              <Text style={[s.cell, { width: "30%" }]}>{item}</Text>
              <Text style={[s.cell, { width: "39%" }]}>{desc}</Text>
              <Text style={[s.cell, { width: "9%" }, s.center]}>{unit}</Text>
              <Text style={[s.cell, { width: "15%" }]}>{rem}</Text>
            </View>
          ))}
        </View>
      </Page>

      {/* 5. Terms, signatures */}
      <Page size="A4" style={s.page}>
        {chrome}
        <Text style={[s.h2, { marginTop: 0 }]}>TERMS & CONDITIONS OF CONTRACT</Text>
        {TERMS.map((t, i) => (
          <View key={t.title} style={{ marginBottom: 4.5 }} wrap={false}>
            <Text><Text style={s.bold}>{i + 1}. {t.title}: </Text>{t.text ?? ""}</Text>
            {t.bullets ? <View style={{ marginLeft: 12, marginTop: 2 }}><Bullets items={t.bullets} /></View> : null}
          </View>
        ))}
        <View wrap={false}>
          <View style={{ marginTop: 8 }}>
            {CLOSING.map((c) => <Text key={c} style={s.p}>{c}</Text>)}
          </View>
          <View style={s.signRow}>
            <View style={s.signBox}>
              <Text style={s.bold}>For {companyName}</Text>
              <View>
                <Text>Authorised Signatory</Text>
                <Text style={s.small}>(Sign & Stamp)</Text>
              </View>
            </View>
            <View style={s.signBox}>
              <Text style={s.bold}>Accepted by {q.customer_name}</Text>
              <View>
                <Text>Name, Signature & Stamp</Text>
                <Text style={s.small}>Date:</Text>
              </View>
            </View>
          </View>
        </View>
      </Page>
    </Document>
  );
}
