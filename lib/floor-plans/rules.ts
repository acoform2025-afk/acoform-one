/**
 * Company measurement rules for formwork (contact) area.
 * Set once in Settings → Measurement rules; every take-off uses them unless the plan overrides a value.
 * Defaults follow IS 1200 (Part 5) plus current aluminium-formwork quotation practice.
 */
export type MeasureRules = {
  minOpeningM2: number;       // openings smaller than this are not deducted (IS 1200-5: 0.4; many firms use 0.3)
  slabEdges: boolean;         // slab + duct edges (perimeter × slab thickness) are measured
  reveals: boolean;           // door / window reveals (jambs, soffit, sill) are added
  deductWallTops: boolean;    // plan area on top of walls is taken off the slab soffit
  deductColumnTops: boolean;  // plan area on top of columns is taken off the slab soffit
  kickerMm: number;           // external kicker height added along the outer slab edge (0 = none)
  stairs: boolean;            // staircases are included in the quoted area
  stairAllowanceM2: number;   // formwork area allowed per staircase found on the drawing (when not measured flight by flight)
  stairBasis: "allowance" | "measured";   // quoted stair area: the allowance per staircase, or the area measured from the tread lines (soffit, risers, stringers, landings)
  extraPct: number;           // default % added on the typical floor (wastage / specials)
  printOnQuote: boolean;      // print these rules on the quotation
};

export const DEFAULT_RULES: MeasureRules = {
  minOpeningM2: 0.4, slabEdges: false, reveals: true, deductWallTops: true, deductColumnTops: true,
  kickerMm: 0, stairs: true, stairAllowanceM2: 100, stairBasis: "allowance", extraPct: 10, printOnQuote: true,
};

const bool = (v: unknown, d: boolean) => (typeof v === "boolean" ? v : d);
const numIn = (v: unknown, d: number, lo: number, hi: number) => {
  const n = Number(v);
  return v === null || v === undefined || v === "" || !Number.isFinite(n) ? d : Math.min(hi, Math.max(lo, n));
};

/** Clean any stored JSON into a full rule set (missing values fall back to the defaults). */
export function normaliseRules(raw: unknown): MeasureRules {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const d = DEFAULT_RULES;
  return {
    minOpeningM2: numIn(r.minOpeningM2, d.minOpeningM2, 0, 5),
    slabEdges: bool(r.slabEdges, d.slabEdges),
    reveals: bool(r.reveals, d.reveals),
    deductWallTops: bool(r.deductWallTops, d.deductWallTops),
    deductColumnTops: bool(r.deductColumnTops, d.deductColumnTops),
    kickerMm: numIn(r.kickerMm, d.kickerMm, 0, 500),
    stairs: bool(r.stairs, d.stairs),
    stairAllowanceM2: numIn(r.stairAllowanceM2, d.stairAllowanceM2, 0, 2000),
    stairBasis: r.stairBasis === "measured" ? "measured" : d.stairBasis,
    extraPct: numIn(r.extraPct, d.extraPct, 0, 100),
    printOnQuote: bool(r.printOnQuote, d.printOnQuote),
  };
}

/** Plain-English lines for the quotation / shell plan. */
export function describeRules(r: MeasureRules): string[] {
  const out = [
    r.minOpeningM2 > 0 ? `Openings and ducts smaller than ${r.minOpeningM2} m² are not deducted.` : "All openings are deducted, whatever their size.",
    r.slabEdges ? "Slab edges and duct / opening edges are measured (perimeter × slab thickness)." : "Slab edges are not measured separately.",
    r.reveals ? "Door and window reveals (sides, soffit, sill) are added; both wall faces are deducted." : "Door and window openings are deducted without adding reveals.",
    [r.deductWallTops && "wall tops", r.deductColumnTops && "column tops"].filter(Boolean).length
      ? `Slab soffit is measured net of ${[r.deductWallTops && "wall tops", r.deductColumnTops && "column tops"].filter(Boolean).join(" and ")}.`
      : "Slab soffit is measured over wall and column tops.",
    "Beam sides below the slab, edge-beam outer faces at full depth and beam bottoms where marked are measured.",
  ];
  if (r.kickerMm > 0) out.push(`External kicker of ${r.kickerMm} mm is added along the outer edge.`);
  out.push(r.stairs ? `Staircases are included${r.stairBasis === "measured" || r.stairAllowanceM2 <= 0 ? " (measured: waist soffit, risers, open stringers, landings)" : ` (${r.stairAllowanceM2} m² per staircase unless measured flight by flight)`}.` : "Staircases are excluded.");
  out.push("Openings in wall lines get a beam / lintel up to the slab: both sides measured (depth − slab).");
  out.push("Contact area = formwork in contact with concrete (IS 1200 Part 5).");
  return out;
}

/** Company rules from the database (server or browser Supabase client). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function loadRules(supabase: any): Promise<MeasureRules> {
  const { data } = await supabase.from("measurement_rules").select("rules").maybeSingle();
  return normaliseRules(data?.rules);
}
