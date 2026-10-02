"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { saveSiteReport } from "./actions";
import { ISSUES, type SiteLine } from "@/lib/floor-plans/site-learn";

const input = "w-full rounded-md border border-graphite-700 bg-graphite-950 px-2.5 py-2 text-sm text-graphite-100 focus:border-signal-amber focus:outline-none";
const lbl = "text-xs font-medium uppercase tracking-wide text-graphite-400";

export function SiteReportForm({ planId, system, design }: { planId: string; system: string; design: SiteLine[] }) {
  const [state, action, pending] = useActionState(saveSiteReport, undefined);
  const [lines, setLines] = useState<SiteLine[]>(design);
  const form = useRef<HTMLFormElement>(null);
  useEffect(() => { if (state?.ok) { form.current?.reset(); setLines(design); } }, [state, design]);
  const set = (i: number, k: "short" | "extra" | "lost", v: string) => setLines((ls) => ls.map((l, j) => (j === i ? { ...l, [k]: Math.max(0, Math.round(Number(v) || 0)) } : l)));
  const cell = (i: number, k: "short" | "extra" | "lost", val: number) => (
    <input type="number" min={0} inputMode="numeric" value={val || ""} placeholder="0" onChange={(e) => set(i, k, e.target.value)} className={`${input} w-20 text-right`} />
  );
  return (
    <form ref={form} action={action} className="rounded-lg border border-graphite-800 bg-graphite-900 p-4">
      <input type="hidden" name="plan" value={planId} />
      <input type="hidden" name="system" value={system} />
      <input type="hidden" name="lines" value={JSON.stringify(lines)} />
      <h2 className="text-sm font-semibold text-graphite-100">New site report — after a pour</h2>
      <p className="mt-1 text-xs text-graphite-500">Fill only what was different from the design. Blank = as designed.</p>
      {state?.error && <p className="mt-3 rounded-md border border-signal-red/30 bg-signal-red/10 px-3 py-2 text-sm text-signal-red">{state.error}</p>}
      {state?.ok && <p className="mt-3 rounded-md border border-signal-green/30 bg-signal-green/10 px-3 py-2 text-sm text-signal-green">Saved. Thank you — the app learns from every report.</p>}
      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        <label className="flex flex-col gap-1"><span className={lbl}>Floor / pour</span><input name="floor" required placeholder="e.g. 7th floor" className={input} /></label>
        <label className="flex flex-col gap-1"><span className={lbl}>Pour date</span><input name="date" type="date" className={input} /></label>
        <label className="flex flex-col gap-1"><span className={lbl}>Days for this floor</span><input name="cycle" type="number" step="0.5" min={1} max={59} placeholder="e.g. 7" className={input} /></label>
      </div>

      <h3 className="mt-5 text-xs font-semibold uppercase tracking-wide text-brand-orange">Panels</h3>
      <div className="mt-2 overflow-x-auto">
        <table className="w-full min-w-[420px] text-sm">
          <thead><tr className="text-left text-xs text-graphite-500"><th className="py-1 font-medium">Family</th><th className="py-1 text-right font-medium">Design pcs</th><th className="py-1 text-right font-medium">Short on site</th><th className="py-1 text-right font-medium">Not used</th></tr></thead>
          <tbody>
            {lines.map((l, i) => l.kind === "family" ? (
              <tr key={l.key} className="border-t border-graphite-800"><td className="py-1.5 text-graphite-200">{l.label}</td><td className="py-1.5 text-right tabular-nums text-graphite-400">{l.design}</td><td className="py-1.5"><div className="flex justify-end">{cell(i, "short", l.short)}</div></td><td className="py-1.5"><div className="flex justify-end">{cell(i, "extra", l.extra)}</div></td></tr>
            ) : null)}
          </tbody>
        </table>
      </div>
      <p className="mt-1 text-[11px] text-graphite-500">Short = panels you had to bring extra, borrow or make / cut on site. Not used = sent to site but not needed.</p>

      <h3 className="mt-5 text-xs font-semibold uppercase tracking-wide text-brand-orange">Small parts lost or broken in this pour</h3>
      <div className="mt-2 grid gap-2 sm:grid-cols-2">
        {lines.map((l, i) => l.kind === "acc" ? (
          <label key={l.key} className="flex items-center justify-between gap-3 rounded-md border border-graphite-800 px-3 py-2 text-sm text-graphite-200">
            <span>{l.label} <span className="text-xs text-graphite-500">(design {l.design.toLocaleString("en-IN")})</span></span>{cell(i, "lost", l.lost)}
          </label>
        ) : null)}
      </div>

      <h3 className="mt-5 text-xs font-semibold uppercase tracking-wide text-brand-orange">Problems seen</h3>
      <div className="mt-2 grid gap-1.5 sm:grid-cols-2">
        {ISSUES.map((i) => (
          <label key={i.key} className="flex items-center gap-2 text-sm text-graphite-200"><input type="checkbox" name="issue" value={i.key} className="size-4 accent-signal-amber" />{i.label}</label>
        ))}
      </div>
      <label className="mt-4 flex flex-col gap-1"><span className={lbl}>Notes</span><textarea name="notes" rows={3} placeholder="Where it happened, what was changed on site …" className={input} /></label>
      <button disabled={pending} className="mt-4 w-full rounded-md bg-brand-orange px-4 py-2.5 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-60 sm:w-auto">{pending ? "Saving…" : "Save site report"}</button>
    </form>
  );
}
