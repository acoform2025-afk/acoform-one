"use client";

import { useActionState } from "react";
import { releaseToProduction } from "../actions";

const input = "rounded-md border border-graphite-700 bg-graphite-800 px-3 py-2 text-sm text-graphite-100 focus:border-signal-amber focus:outline-none";

export function ReleaseForm({ bomId, suggestedCode }: { bomId: string; suggestedCode: string }) {
  const [state, action, pending] = useActionState(releaseToProduction, undefined);
  return (
    <form action={action} className="flex flex-wrap items-end gap-3 rounded-lg border border-graphite-800 bg-graphite-900 p-4">
      <input type="hidden" name="bomId" value={bomId} />
      <label className="flex flex-col gap-1"><span className="text-[11px] uppercase tracking-wide text-graphite-500">Production order code</span>
        <input name="orderCode" defaultValue={suggestedCode} required className={input} /></label>
      <label className="flex flex-col gap-1"><span className="text-[11px] uppercase tracking-wide text-graphite-500">Target completion</span>
        <input name="targetCompletion" type="date" className={input} /></label>
      <button disabled={pending} className="rounded-md bg-signal-amber px-4 py-2 text-sm font-semibold text-graphite-950 hover:opacity-90 disabled:opacity-50">
        {pending ? "Releasing…" : "Release to production"}
      </button>
      {state?.error && <p className="w-full text-xs text-signal-red">{state.error}</p>}
    </form>
  );
}
