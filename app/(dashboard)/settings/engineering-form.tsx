"use client";

import { useActionState } from "react";
import { saveEngineeringParameters } from "./engineering-actions";

type P = Record<string, number | string | boolean | null>;
const input = "rounded-md border border-graphite-700 bg-graphite-900 px-3 py-2 text-sm text-graphite-100 focus:border-signal-amber focus:outline-none disabled:opacity-60";

const FIELDS: [string, string, string][] = [
  ["concrete_density_kn_m3", "Concrete density", "kN/m³"],
  ["tie_capacity_kn", "Tie rod safe capacity", "kN"],
  ["tie_spacing_h_mm", "Tie spacing – horizontal", "mm"],
  ["tie_spacing_v_mm", "Tie spacing – vertical", "mm"],
  ["panel_e_mpa", "Aluminium E (modulus)", "MPa"],
  ["panel_i_mm4_per_mm", "Panel I per mm width", "mm⁴/mm"],
  ["min_safety_factor", "Minimum safety factor", "×"],
  ["deflection_limit_wall", "Deflection limit (wall)", "L/"],
];

export function EngineeringForm({ p, canEdit }: { p: P; canEdit: boolean }) {
  const [state, action, pending] = useActionState(saveEngineeringParameters, undefined);
  return (
    <form id="engineering" action={action} className="rounded-lg border border-graphite-800 bg-graphite-900 p-5">
      <h2 className="text-sm font-medium text-graphite-200">Engineering parameters (design verification)</h2>
      <p className="mt-1 text-xs text-graphite-500">
        Used by every design&apos;s engineering check. Designs cannot be approved until these are marked certified.
        {p.is_certified ? <span className="ml-1 text-signal-green">Certified{p.certified_by ? ` by ${p.certified_by}` : ""}.</span> : <span className="ml-1 text-signal-amber">Currently placeholders.</span>}
      </p>
      {state?.error && <p className="mt-3 rounded-md border border-signal-red/30 bg-signal-red/10 px-3 py-2 text-sm text-signal-red">{state.error}</p>}
      {state?.ok && <p className="mt-3 rounded-md border border-signal-green/30 bg-signal-green/10 px-3 py-2 text-sm text-signal-green">Saved. Re-run the engineering check on open designs.</p>}
      <div className="mt-4 grid gap-4 md:grid-cols-4">
        {FIELDS.map(([name, label, unit]) => (
          <label key={name} className="flex flex-col gap-1.5">
            <span className="text-xs font-medium uppercase tracking-wide text-graphite-400">{label} <span className="normal-case text-graphite-600">({unit})</span></span>
            <input name={name} type="number" step="any" defaultValue={String(p[name] ?? "")} required disabled={!canEdit} className={input} />
          </label>
        ))}
      </div>
      <div className="mt-4 grid gap-4 md:grid-cols-3">
        <label className="flex items-center gap-2 text-sm text-graphite-200">
          <input type="checkbox" name="is_certified" defaultChecked={Boolean(p.is_certified)} disabled={!canEdit} className="accent-signal-amber" />
          These values are ACOFORM certified
        </label>
        <label className="flex flex-col gap-1.5"><span className="text-xs font-medium uppercase tracking-wide text-graphite-400">Certified by</span>
          <input name="certified_by" defaultValue={String(p.certified_by ?? "")} disabled={!canEdit} placeholder="Name, designation" className={input} /></label>
        <label className="flex flex-col gap-1.5"><span className="text-xs font-medium uppercase tracking-wide text-graphite-400">Reference / note</span>
          <input name="certification_note" defaultValue={String(p.certification_note ?? "")} disabled={!canEdit} placeholder="Test report no., date" className={input} /></label>
      </div>
      {canEdit ? (
        <button disabled={pending} className="mt-4 rounded-md bg-signal-amber px-5 py-2 text-sm font-semibold text-graphite-950 hover:opacity-90 disabled:opacity-50">{pending ? "Saving…" : "Save parameters"}</button>
      ) : <p className="mt-3 text-xs text-graphite-500">Only users who can approve designs can change these.</p>}
    </form>
  );
}
