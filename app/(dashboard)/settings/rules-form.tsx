"use client";

import { useActionState } from "react";
import { saveMeasurementRules } from "./rules-actions";
import type { MeasureRules } from "@/lib/floor-plans/rules";

const input = "rounded-md border border-graphite-700 bg-graphite-900 px-3 py-2 text-sm text-graphite-100 focus:border-signal-amber focus:outline-none disabled:opacity-60";
const lbl = "text-xs font-medium uppercase tracking-wide text-graphite-400";

const CHECKS: [keyof MeasureRules, string, string][] = [
  ["slabEdges", "Measure slab & duct edges", "Perimeter × slab thickness (IS 1200-5)."],
  ["reveals", "Add door & window reveals", "Sides, soffit and sill of each opening."],
  ["deductWallTops", "Deduct wall tops from slab", "Slab soffit measured net of wall tops."],
  ["deductColumnTops", "Deduct column tops from slab", "Slab soffit measured net of column tops."],
  ["stairs", "Include staircases", "Waist soffit, risers, open stringers, landings."],
  ["printOnQuote", "Print these rules on quotations", "Shown under the area take-off."],
];

export function RulesForm({ r, canEdit }: { r: MeasureRules; canEdit: boolean }) {
  const [state, action, pending] = useActionState(saveMeasurementRules, undefined);
  return (
    <form id="measurement" action={action} className="rounded-lg border border-graphite-800 bg-graphite-900 p-5">
      <h2 className="text-sm font-medium text-graphite-200">Measurement rules (formwork area)</h2>
      <p className="mt-1 text-xs text-graphite-500">
        How ACOFORM measures contact area. Every floor-plan take-off, panel BOM and quotation uses these, unless a plan changes a value for itself.
      </p>
      {state?.error && <p className="mt-3 rounded-md border border-signal-red/30 bg-signal-red/10 px-3 py-2 text-sm text-signal-red">{state.error}</p>}
      {state?.ok && <p className="mt-3 rounded-md border border-signal-green/30 bg-signal-green/10 px-3 py-2 text-sm text-signal-green">Saved. Open take-offs use the new rules; re-save a take-off to update its quotation.</p>}
      <div className="mt-4 grid gap-4 md:grid-cols-4">
        <label className="flex flex-col gap-1.5"><span className={lbl}>Don&apos;t deduct openings under <span className="normal-case text-graphite-600">(m²)</span></span>
          <select name="minOpeningM2" defaultValue={String(r.minOpeningM2)} disabled={!canEdit} className={input}>
            {[0, 0.1, 0.25, 0.3, 0.4, 0.5, 1].map((v) => <option key={v} value={v}>{v === 0 ? "0 — deduct all" : `${v} m²${v === 0.4 ? " (IS 1200-5)" : v === 0.3 ? " (common practice)" : ""}`}</option>)}
          </select></label>
        <label className="flex flex-col gap-1.5"><span className={lbl}>External kicker height <span className="normal-case text-graphite-600">(mm, 0 = none)</span></span>
          <input name="kickerMm" type="number" min={0} max={500} step={5} defaultValue={r.kickerMm} disabled={!canEdit} className={input} /></label>
        <label className="flex flex-col gap-1.5"><span className={lbl}>Staircase allowance <span className="normal-case text-graphite-600">(m² per staircase)</span></span>
          <input name="stairAllowanceM2" type="number" min={0} max={2000} step={1} defaultValue={r.stairAllowanceM2} disabled={!canEdit} className={input} /></label>
        <label className="flex flex-col gap-1.5"><span className={lbl}>Staircase area on the quote</span>
          <select name="stairBasis" defaultValue={r.stairBasis} disabled={!canEdit} className={input}>
            <option value="allowance">Allowance per staircase (measured flights shown for information)</option>
            <option value="measured">Measured from the drawing (soffit, risers, stringers, landings)</option>
          </select></label>
        <label className="flex flex-col gap-1.5"><span className={lbl}>Default add % <span className="normal-case text-graphite-600">(specials / wastage)</span></span>
          <input name="extraPct" type="number" min={0} max={100} step={1} defaultValue={r.extraPct} disabled={!canEdit} className={input} /></label>
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-2">
        {CHECKS.map(([k, t, hint]) => (
          <label key={k} className="flex items-start gap-2 text-sm text-graphite-200">
            <input type="checkbox" name={k} defaultChecked={Boolean(r[k])} disabled={!canEdit} className="mt-1 accent-signal-amber" />
            <span>{t}<span className="block text-xs text-graphite-500">{hint}</span></span>
          </label>
        ))}
      </div>
      {canEdit ? (
        <button disabled={pending} className="mt-4 rounded-md bg-signal-amber px-5 py-2 text-sm font-semibold text-graphite-950 hover:opacity-90 disabled:opacity-50">{pending ? "Saving…" : "Save rules"}</button>
      ) : <p className="mt-3 text-xs text-graphite-500">Only design or quotation approvers can change these.</p>}
    </form>
  );
}
