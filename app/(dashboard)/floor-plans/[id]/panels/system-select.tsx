"use client";

import { useRef } from "react";
import { setPlanSystem } from "./system-actions";

/** Per-plan formwork system: company setting, or another system for this plan only. */
export function SystemSelect({ planId, value, companyLabel, options, canEdit }: { planId: string; value: string; companyLabel: string; options: { key: string; label: string }[]; canEdit: boolean }) {
  const form = useRef<HTMLFormElement>(null);
  return (
    <form ref={form} action={setPlanSystem} className="inline">
      <input type="hidden" name="plan" value={planId} />
      <select name="system" defaultValue={value} disabled={!canEdit} onChange={() => form.current?.requestSubmit()}
        className="rounded-md border border-graphite-700 bg-graphite-900 px-2 py-1 text-xs text-graphite-100 focus:border-signal-amber focus:outline-none">
        <option value="">Company setting — {companyLabel}</option>
        {options.map((o) => <option key={o.key} value={o.key}>This plan only: {o.label}</option>)}
      </select>
    </form>
  );
}
