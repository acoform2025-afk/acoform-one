"use client";

import { useActionState, useState } from "react";
import { failQc } from "../actions";

export function FailQcForm({ orderId, woId }: { orderId: string; woId: string }) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(failQc, undefined);
  if (!open || state?.ok) {
    return <button type="button" onClick={() => setOpen(true)} className="rounded-md border border-signal-red/40 bg-signal-red/10 px-2.5 py-1 text-xs text-signal-red hover:bg-signal-red/20">Fail QC</button>;
  }
  return (
    <form action={action} className="mt-2 flex w-full flex-col gap-2 rounded-md border border-signal-red/30 bg-graphite-900 p-3">
      <input type="hidden" name="orderId" value={orderId} /><input type="hidden" name="woId" value={woId} />
      <textarea name="description" required rows={2} placeholder="Defect found (raises an NCR)" className="rounded-md border border-graphite-700 bg-graphite-800 px-2.5 py-1.5 text-xs text-graphite-100" />
      <div className="flex items-center gap-2">
        <select name="severity" defaultValue="major" className="rounded-md border border-graphite-700 bg-graphite-800 px-2 py-1 text-xs text-graphite-100">
          <option value="minor">Minor</option><option value="major">Major</option><option value="critical">Critical</option>
        </select>
        <button disabled={pending} className="rounded-md bg-signal-red px-3 py-1 text-xs font-medium text-white disabled:opacity-50">{pending ? "…" : "Record failure"}</button>
        <button type="button" onClick={() => setOpen(false)} className="text-xs text-graphite-500">Cancel</button>
      </div>
      {state?.error && <p className="text-xs text-signal-red">{state.error}</p>}
    </form>
  );
}
