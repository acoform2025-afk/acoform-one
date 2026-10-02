/**
 * Step 6 — learn from the site. After each pour the site engineer reports, per panel family, how many panels were
 * short (brought extra / made on site) or not used, and how many small parts were lost or broken. All reports
 * together give the real spare % per family, the real loss % on small parts and the floor cycle time — which can
 * be applied to the panel layout rules, so the next design starts from what the site really needs.
 */
import type { BomRow } from "@/lib/design-engine/floor-panels";

export const FAMILY_LABEL: Record<string, string> = {
  wall: "Wall panels", "wall-top": "Wall top panels", filler: "Fillers / specials", end: "Stop-ends",
  corner: "Corners, soffit corners, kickers", column: "Column panels", deck: "Deck panels", beam: "Beam panels",
  upstand: "Upstand / planter panels", stair: "Staircase", drop: "Drop (sunk slab) formwork",
};
export const ACCESSORIES: { key: string; label: string; re: RegExp }[] = [
  { key: "pins", label: "Pins", re: /^L?PIN$/ },
  { key: "wedges", label: "Wedges", re: /WEDGE/ },
  { key: "ties", label: "Tie rods / flat ties", re: /^(TIE|FT|FLAT)/ },
  { key: "props", label: "Props", re: /^PROP/ },
  { key: "heads", label: "Prop heads", re: /^B?PH/ },
];
export const ISSUES: { key: string; label: string }[] = [
  { key: "leak", label: "Grout leakage at joints" },
  { key: "align", label: "Walls out of line / plumb" },
  { key: "short", label: "Panels short on site" },
  { key: "damage", label: "Damaged panels" },
  { key: "props", label: "Props short / deck sagging" },
  { key: "late", label: "Floor cycle delayed" },
];

/** One line of a site report. family: short = more needed than designed, extra = sent but not used. acc: lost = lost / broken. */
export type SiteLine = { key: string; label: string; kind: "family" | "acc"; design: number; short: number; extra: number; lost: number; note?: string };
export type SiteReportRow = { id: string; floor_label: string; pour_date: string | null; cycle_days: number | null; system: string | null; lines: SiteLine[]; issues: string[]; notes: string | null; created_at: string; floor_plan_id: string };

/** The design side of a site report: panel pcs per family + small-part quantities, from the layout BOM. */
export function designLines(bom: BomRow[]): SiteLine[] {
  const fam = new Map<string, number>();
  for (const r of bom) if (r.group !== "accessory" && !r.code.startsWith("SPARE-") && FAMILY_LABEL[r.group] && !(r.unit && r.unit !== "pcs" && r.unit !== "nos")) fam.set(r.group, (fam.get(r.group) ?? 0) + r.qty);
  const out: SiteLine[] = [];
  for (const k of Object.keys(FAMILY_LABEL)) if (fam.get(k)) out.push({ key: k, label: FAMILY_LABEL[k], kind: "family", design: Math.round(fam.get(k)!), short: 0, extra: 0, lost: 0 });
  for (const a of ACCESSORIES) {
    const q = bom.filter((r) => r.group === "accessory" && a.re.test(r.code)).reduce((s, r) => s + r.qty, 0);
    if (q > 0) out.push({ key: a.key, label: a.label, kind: "acc", design: Math.round(q), short: 0, extra: 0, lost: 0 });
  }
  return out;
}

const num = (v: unknown) => { const n = Number(v); return Number.isFinite(n) && n > 0 ? n : 0; };
export function cleanLines(raw: unknown): SiteLine[] {
  if (!Array.isArray(raw)) return [];
  return raw.slice(0, 60).map((x) => {
    const o = (x && typeof x === "object" ? x : {}) as Record<string, unknown>;
    return { key: String(o.key ?? "").slice(0, 40), label: String(o.label ?? "").slice(0, 80), kind: o.kind === "acc" ? "acc" : "family", design: Math.round(num(o.design)), short: Math.round(num(o.short)), extra: Math.round(num(o.extra)), lost: Math.round(num(o.lost)), ...(o.note ? { note: String(o.note).slice(0, 200) } : {}) } as SiteLine;
  }).filter((l) => l.key);
}

export type Learned = {
  reports: number; cycleDays: number | null;
  families: { key: string; label: string; design: number; short: number; extra: number; sparePct: number }[];
  acc: { key: string; label: string; design: number; lost: number; lossPct: number }[];
  issues: { key: string; label: string; count: number }[];
  suggestLoss: number | null;                       // % loss on small parts the site really sees
  suggestSpare: Record<string, number>;             // % spare per panel family (only where the site was short)
};

const r05 = (v: number) => Math.round(v * 2) / 2;

/** Everything the site reports say, added up. */
export function learn(reports: Pick<SiteReportRow, "lines" | "issues" | "cycle_days">[]): Learned {
  const fam = new Map<string, { label: string; design: number; short: number; extra: number }>();
  const acc = new Map<string, { label: string; design: number; lost: number }>();
  const iss = new Map<string, number>();
  const cyc: number[] = [];
  for (const rep of reports) {
    for (const l of rep.lines ?? []) {
      if (l.kind === "acc") { const g = acc.get(l.key) ?? { label: l.label, design: 0, lost: 0 }; g.design += l.design; g.lost += l.lost; acc.set(l.key, g); }
      else { const g = fam.get(l.key) ?? { label: l.label, design: 0, short: 0, extra: 0 }; g.design += l.design; g.short += l.short; g.extra += l.extra; fam.set(l.key, g); }
    }
    for (const k of rep.issues ?? []) iss.set(k, (iss.get(k) ?? 0) + 1);
    if (rep.cycle_days && rep.cycle_days > 0) cyc.push(Number(rep.cycle_days));
  }
  const families = [...fam.entries()].map(([key, g]) => ({ key, ...g, sparePct: g.design ? r05((100 * g.short) / g.design) : 0 }));
  const accs = [...acc.entries()].map(([key, g]) => ({ key, ...g, lossPct: g.design ? Math.round((1000 * g.lost) / g.design) / 10 : 0 }));
  // loss % for small parts: pins, wedges and ties together (props / heads are counted, not lost, normally)
  const small = accs.filter((a) => ["pins", "wedges", "ties"].includes(a.key));
  const sd = small.reduce((s, a) => s + a.design, 0), sl = small.reduce((s, a) => s + a.lost, 0);
  const suggestSpare: Record<string, number> = {};
  for (const f of families) if (f.sparePct >= 1) suggestSpare[f.key] = Math.min(25, f.sparePct);
  return {
    reports: reports.length,
    cycleDays: cyc.length ? Math.round((cyc.reduce((s, v) => s + v, 0) / cyc.length) * 10) / 10 : null,
    families, acc: accs,
    issues: [...iss.entries()].map(([key, count]) => ({ key, label: ISSUES.find((i) => i.key === key)?.label ?? key, count })).sort((a, b) => b.count - a.count),
    suggestLoss: sd > 0 ? Math.min(50, Math.max(1, Math.ceil((100 * sl) / sd))) : null,
    suggestSpare,
  };
}
