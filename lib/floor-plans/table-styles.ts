/**
 * Table styles for the Excel/CSV lists of the design package: which columns of a list are shown, in which order and
 * under which heading (the "custom table style" of PKPM-LMB). Set once in Settings → Panel layout rules; every list
 * is written that way. A list without a style keeps its standard columns.
 */
export type StyleCol = { from: string; as?: string };
export type TableStyles = Record<string, StyleCol[]>;

/** Standard columns of each list that can be styled (key = list key of the package). */
export const LIST_COLUMNS: Record<string, { label: string; cols: string[] }> = {
  numbering: { label: "Panel numbering list", cols: ["Panel No.", "Area", "Zone / face", "Type", "Code", "Width mm", "Length / height mm", "Special", "Floors", "Status"] },
  production: { label: "Special panels production order", cols: ["Mark", "Code", "Description", "Width mm", "Height / length mm", "Nos", "Panel kg", "Total kg", "Holes (height edge)", "Holes (width edge)", "Notes"] },
  walers: { label: "Walers list", cols: ["Code", "Length mm", "Qty", "Total m", "Wall faces (first 12)"] },
  accessories: { label: "Accessories list", cols: ["Group", "Code", "Description", "Unit", "Qty", "Weight kg", "How counted"] },
  packing: { label: "Packing list by zone", cols: ["Bundle", "Area", "Type", "Code", "Width mm", "Height / length mm", "Qty", "kg each", "kg total", "Panel numbers"] },
  check: { label: "Design check", cols: ["No.", "Severity", "Check", "Where", "Problem"] },
};

export function normaliseTableStyles(raw: unknown): TableStyles {
  const out: TableStyles = {};
  if (!raw || typeof raw !== "object") return out;
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    const std = LIST_COLUMNS[k]; if (!std || !Array.isArray(v)) continue;
    const seen = new Set<string>(); const cols: StyleCol[] = [];
    for (const c of v as Record<string, unknown>[]) {
      const from = String(c?.from ?? ""); if (!std.cols.includes(from) || seen.has(from)) continue;
      seen.add(from);
      const as = typeof c?.as === "string" ? c.as.trim().slice(0, 60) : "";
      cols.push(as && as !== from ? { from, as } : { from });
    }
    if (cols.length) out[k] = cols;
  }
  return out;
}

export function parseCsv(text: string): string[][] {
  const t = text.replace(/^﻿/, ""); const rows: string[][] = []; let row: string[] = [], cell = "", q = false;
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (q) { if (c === '"') { if (t[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += c; }
    else if (c === '"') q = true;
    else if (c === ",") { row.push(cell); cell = ""; }
    else if (c === "\n" || c === "\r") { if (c === "\r" && t[i + 1] === "\n") i++; row.push(cell); rows.push(row); row = []; cell = ""; }
    else cell += c;
  }
  if (cell !== "" || row.length) { row.push(cell); rows.push(row); }
  return rows;
}
const cell = (v: string) => `"${v.replace(/"/g, '""')}"`;

/** Rewrite one list's CSV with the chosen columns, order and headings; lines above the heading row stay as they are. */
export function applyTableStyle(csv: string, style: StyleCol[] | undefined, standard: string[]): string {
  if (!style?.length) return csv;
  const rows = parseCsv(csv);
  const h = rows.findIndex((r) => standard.every((s, i) => r[i] === s));
  if (h < 0) return csv;
  const idx = style.map((c) => standard.indexOf(c.from));
  const out = rows.map((r, i) => (i < h ? r : i === h ? style.map((c) => c.as ?? c.from) : r.length <= 1 ? r : idx.map((j) => r[j] ?? "")));
  return "﻿" + out.map((r) => r.map(cell).join(",")).join("\r\n");
}
