// Shared definitions for detailed-quotation line types.
// Used by the quotation detail page, the add-line form and the PDF.

export type LineType = "panel" | "accessory" | "transport" | "service";
export type ExtraLineType = Exclude<LineType, "panel">;

export const EXTRA_LINE_TYPES: ExtraLineType[] = ["accessory", "transport", "service"];

export const LINE_TYPE_LABELS: Record<LineType, string> = {
  panel: "Aluminium Formwork Panels",
  accessory: "Accessories",
  transport: "Transport / Freight",
  service: "Design & Supervision",
};

// Units offered in the form, per line type (first one is the default).
export const UNIT_OPTIONS: Record<ExtraLineType, string[]> = {
  accessory: ["nos", "set", "kg", "rmt"],
  transport: ["trip", "lump sum", "km"],
  service: ["month", "visit", "day", "lump sum"],
};

// Suggested descriptions (free text is still allowed).
export const DESCRIPTION_SUGGESTIONS: Record<ExtraLineType, string[]> = {
  accessory: [
    "Pins & wedges",
    "Tie rods with nuts & PVC sleeves",
    "Walers",
    "Push-pull props",
    "Slab props",
    "Kicker / starter",
    "Beam side & soffit fittings",
  ],
  transport: ["Transport – factory to site", "Return transport – site to factory", "Loading & unloading"],
  service: ["Formwork design & shop drawings", "Site supervision", "Training of site crew"],
};

export type LineForSummary = { line_type: string | null; line_total: number | string | null };

export type LineSummary = {
  byType: Record<LineType, number>;
  subtotal: number;
};

/** Sums line totals by type. subtotal should equal quotations.total_amount. */
export function summariseLines(lines: LineForSummary[] | null | undefined): LineSummary {
  const byType: Record<LineType, number> = { panel: 0, accessory: 0, transport: 0, service: 0 };
  for (const l of lines ?? []) {
    const type = (l.line_type ?? "panel") as LineType;
    if (type in byType) byType[type] += Number(l.line_total ?? 0);
  }
  const subtotal = byType.panel + byType.accessory + byType.transport + byType.service;
  return { byType, subtotal };
}

export function formatQty(q: number | string): string {
  const n = Number(q);
  return Number.isInteger(n) ? String(n) : n.toFixed(3).replace(/0+$/, "").replace(/\.$/, "");
}
