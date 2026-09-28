"use client";

import { useActionState, useEffect, useRef } from "react";
import { addWall } from "../actions";

const input = "w-full rounded-md border border-graphite-700 bg-graphite-800 px-2.5 py-2 text-sm text-graphite-100 focus:border-signal-amber focus:outline-none";
const label = "text-[11px] font-medium uppercase tracking-wide text-graphite-500";

export function WallForm({ designId, nextCode }: { designId: string; nextCode: string }) {
  const [state, action, pending] = useActionState(addWall, undefined);
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => { if (state?.ok) ref.current?.reset(); }, [state]);
  return (
    <form ref={ref} action={action} className="rounded-lg border border-graphite-800 bg-graphite-900 p-4">
      <input type="hidden" name="designId" value={designId} />
      <p className="mb-3 text-xs font-medium uppercase tracking-wide text-graphite-400">Add wall</p>
      {state?.error && <p className="mb-3 rounded-md border border-signal-red/30 bg-signal-red/10 px-3 py-2 text-xs text-signal-red">{state.error}</p>}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-7">
        <label className="flex flex-col gap-1"><span className={label}>Code</span><input name="wallCode" defaultValue={nextCode} required className={input} /></label>
        <label className="flex flex-col gap-1"><span className={label}>Length (mm)</span><input name="lengthMm" type="number" min="1" required className={input} /></label>
        <label className="flex flex-col gap-1"><span className={label}>Height (mm)</span><input name="heightMm" type="number" min="2400" max="3000" defaultValue={2400} required className={input} /></label>
        <label className="flex flex-col gap-1"><span className={label}>Thickness (mm)</span><input name="thicknessMm" type="number" min="100" defaultValue={200} required className={input} /></label>
        <label className="flex flex-col gap-1"><span className={label}>Start corner</span>
          <select name="startCorner" className={input}><option value="none">None</option><option value="internal">Internal</option><option value="external">External</option></select></label>
        <label className="flex flex-col gap-1"><span className={label}>End corner</span>
          <select name="endCorner" className={input}><option value="none">None</option><option value="internal">Internal</option><option value="external">External</option></select></label>
        <div className="flex items-end">
          <button disabled={pending} className="w-full rounded-md bg-aluminium-300 px-3 py-2 text-sm font-medium text-graphite-950 hover:opacity-90 disabled:opacity-50">{pending ? "…" : "Add wall"}</button>
        </div>
      </div>
    </form>
  );
}
