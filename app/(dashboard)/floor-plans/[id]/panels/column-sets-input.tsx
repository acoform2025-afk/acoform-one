"use client";

import { setPlanColumnSets } from "./system-actions";

/** Column sets bought for this project (% of all columns; the sets are re-used column after column). */
export function ColumnSetsInput({ planId, value, canEdit }: { planId: string; value: number; canEdit: boolean }) {
  return (
    <form action={setPlanColumnSets} className="inline-flex items-center gap-1.5">
      <input type="hidden" name="plan" value={planId} />
      <span>Column sets bought:</span>
      <input name="pct" type="number" min={10} max={100} step={1} defaultValue={value} disabled={!canEdit}
        className="w-16 rounded-md border border-graphite-700 bg-graphite-900 px-2 py-0.5 text-xs text-graphite-100 focus:border-signal-amber focus:outline-none" />
      <span>% of all columns</span>
      {canEdit ? <button className="rounded-md border border-graphite-700 px-2 py-0.5 text-xs text-graphite-200 hover:bg-graphite-800">Apply</button> : null}
    </form>
  );
}
