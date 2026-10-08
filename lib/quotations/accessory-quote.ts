/**
 * Accessories-only quotations (wall ties, wedge pins, patti, props … supplied without a formwork set): reading the
 * customer's requirement as they send it (WhatsApp / email text), and the standard wording of the quotation.
 */

export type AccessoryRow = { item: string; spec: string; qty: number; unit: string; rate?: number };
export type ParsedRequirement = { rows: AccessoryRow[]; application?: string; delivery?: string; unread: string[] };

const UNIT_RE = "(nos?\\.?|numbers?|pcs?\\.?|pieces?|sets?|kgs?|kg\\.?|mtrs?|m|rmt|rm|meters?|metres?|bags?|boxes?|bundles?|pairs?|ltrs?|litres?)";
const QTY_AT_END = new RegExp(`[:=\\-–]?\\s*([\\d][\\d,]*(?:\\.\\d+)?)\\s*${UNIT_RE}?\\s*\\.?$`, "i");
const UNIT_NAME: Record<string, string> = { no: "Nos", nos: "Nos", number: "Nos", numbers: "Nos", pc: "Pcs", pcs: "Pcs", piece: "Pcs", pieces: "Pcs", set: "Set", sets: "Set", kg: "Kg", kgs: "Kg", m: "Mtr", mtr: "Mtr", mtrs: "Mtr", meter: "Mtr", meters: "Mtr", metre: "Mtr", metres: "Mtr", rmt: "Rmt", rm: "Rmt", bag: "Bag", bags: "Bag", box: "Box", boxes: "Box", bundle: "Bundle", bundles: "Bundle", pair: "Pair", pairs: "Pair", ltr: "Ltr", ltrs: "Ltr", litre: "Ltr", litres: "Ltr" };
const unitName = (u?: string) => (u ? UNIT_NAME[u.toLowerCase().replace(/\.$/, "")] ?? u : "Nos");
/** A size / length on its own ("230 mm", "300MM", "2.5 m", "16 dia", "M16 x 300") — a variant of the item above it. */
const isSize = (s: string) => /^\(?\s*(m\s?\d{1,2}\s*[x×*]\s*)?\d+(\.\d+)?\s*(mm|cm|m|mtr|meter|metre|inch|in|"|ft|dia|ø)?(\s*[x×*]\s*\d+(\.\d+)?\s*(mm|cm|m)?)*\s*(long|length|lg|thk|thick)?\s*\)?$/i.test(s.trim());
const clean = (s: string) => s.replace(/^\s*(\(?\d{1,2}[).]|[-•*])\s*/, "").replace(/\s*[:\-–=]+\s*$/, "").replace(/\s+/g, " ").trim();

/**
 * The customer's requirement as written → item rows.
 *   "Non-breakable wall tie 2.5m thickness :-"   → a heading: the item of the size lines under it
 *   "1) 230 mm : 504 Nos"                          → item "Non-breakable wall tie 2.5m thickness", size "230 mm", 504 Nos
 *   "3) Wedge patti : 3000 Nos"                    → item "Wedge patti", 3000 Nos
 *   "Use in Aluminium Formwork" / "Delivery at Bapunagar, Ahmedabad" → what it is for / where it goes
 */
export function parseRequirement(text: string): ParsedRequirement {
  const out: ParsedRequirement = { rows: [], unread: [] };
  let heading = "";
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const use = line.match(/^(?:to\s+be\s+)?(?:use[ds]?|for\s+use|application)\s*(?:in|for|:)\s*(.+)$/i);
    if (use) { out.application = use[1].replace(/[.\s]+$/, ""); continue; }
    const del = line.match(/^(?:delivery|deliver(?:ed)?|supply|site)\s*(?:at|to|:|place\s*:?)\s*(.+)$/i);
    if (del) { out.delivery = del[1].replace(/[.\s]+$/, ""); continue; }
    if (/^(rate|price|quote|quotation|best\s+rate|kindly|please|pls|regards|thanks|thank\s+you)\b/i.test(line)) continue;
    const m = line.match(QTY_AT_END);
    const left = m ? clean(line.slice(0, m.index)) : "";
    const qty = m ? Number(m[1].replace(/,/g, "")) : NaN;
    if (!m || !(qty > 0) || !left) {
      // no quantity: a heading for the size lines that follow ("Non-breakable wall tie 2.5m thickness :-")
      const h = clean(line);
      if (h && /[a-z]/i.test(h)) heading = h; else out.unread.push(line);
      continue;
    }
    if (isSize(left) && heading) out.rows.push({ item: heading, spec: left, qty, unit: unitName(m[2]) });
    else {
      // "Wall tie 230 mm : 504" → item + size when the line ends in a size
      const sm = left.match(/^(.*?[a-z].*?)\s+((?:\d+(?:\.\d+)?\s*(?:mm|cm|m|mtr|inch|dia))(?:\s*[x×*]\s*\d+(?:\.\d+)?\s*(?:mm|cm|m)?)*)$/i);
      out.rows.push(sm ? { item: sm[1], spec: sm[2], qty, unit: unitName(m[2]) } : { item: left, spec: "", qty, unit: unitName(m[2]) });
      heading = "";
    }
  }
  return out;
}

/** Terms printed on an accessories quotation (payment terms can be edited per quotation). */
export const ACCESSORY_PAYMENT_TERMS = ["100% advance along with the purchase order."];
export function accessoryTerms(o: { delivery?: string | null; freightQuoted: boolean; gstPct: number; validityDays: number; validUntil: string }): string[] {
  return [
    `Prices are for the items and quantities above, in Indian Rupees. GST @ ${o.gstPct}% is extra and shown separately.`,
    o.delivery
      ? o.freightQuoted ? `Delivery at ${o.delivery}: freight as quoted above; unloading at site in the customer's scope.` : `Delivery at ${o.delivery}: freight extra at actuals unless quoted above; unloading at site in the customer's scope.`
      : "Prices are ex-works; freight extra at actuals.",
    "Dispatch: within 7–10 working days from the receipt of the purchase order and advance, subject to stock.",
    "Quantities are as per the customer's requirement; any change in quantity will be billed at the same rates.",
    "Material once supplied will not be taken back.",
    `This offer is valid for ${o.validityDays} days, i.e. until ${o.validUntil}.`,
  ];
}
