"use client";

import Link from "next/link";
import { useActionState, useMemo, useState } from "react";
import { dispatchPanels, returnPanels } from "./actions";

type Panel = { id: string; qr_code: string; panel_code: string; status: string; cycle_count: number; current_location: string; project_code: string | null };
type Project = { id: string; project_code: string; customer_name: string };

const input = "rounded-md border border-graphite-700 bg-graphite-800 px-2.5 py-1.5 text-sm text-graphite-100 focus:border-signal-amber focus:outline-none";
const STATUS_STYLE: Record<string, string> = {
  in_stock: "text-signal-green", dispatched: "text-blue-700 dark:text-blue-300", on_site: "text-signal-amber", returned: "text-graphite-300",
  under_repair: "text-signal-red", scrapped: "text-graphite-500 line-through",
};

export function PanelTable({ panels, projects, canDispatch, canReturn }: { panels: Panel[]; projects: Project[]; canDispatch: boolean; canReturn: boolean }) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [dState, dAction, dPending] = useActionState(dispatchPanels, undefined);
  const [rState, rAction, rPending] = useActionState(returnPanels, undefined);

  const sel = useMemo(() => panels.filter((p) => selected.has(p.id)), [panels, selected]);
  const allInStock = sel.length > 0 && sel.every((p) => p.status === "in_stock");
  const allOnSite = sel.length > 0 && sel.every((p) => p.status === "dispatched" || p.status === "on_site");
  const toggle = (id: string) => setSelected((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const hidden = sel.map((p) => <input key={p.id} type="hidden" name="panelId" value={p.id} />);

  return (
    <div>
      {sel.length > 0 && (
        <div className="sticky top-0 z-10 mb-3 rounded-lg border border-signal-amber/40 bg-graphite-900 p-4">
          <p className="text-sm text-graphite-200">{sel.length} panel(s) selected <button type="button" onClick={() => setSelected(new Set())} className="ml-2 text-xs text-graphite-500 hover:text-graphite-300">clear</button></p>
          {canDispatch && allInStock && (
            <form action={dAction} className="mt-3 flex flex-wrap items-end gap-2">
              {hidden}
              <select name="projectId" required defaultValue="" className={input}>
                <option value="" disabled>Dispatch to project…</option>
                {projects.map((p) => <option key={p.id} value={p.id}>{p.project_code} — {p.customer_name}</option>)}
              </select>
              <input name="vehicleNo" placeholder="Vehicle no." className={`${input} w-32`} />
              <input name="driverName" placeholder="Driver" className={`${input} w-32`} />
              <input name="driverPhone" placeholder="Driver phone" className={`${input} w-32`} />
              <input name="transporter" placeholder="Transporter" className={`${input} w-36`} />
              <button disabled={dPending} className="rounded-md bg-signal-amber px-4 py-1.5 text-sm font-semibold text-graphite-950 disabled:opacity-50">{dPending ? "Dispatching…" : "Create delivery challan"}</button>
              {dState?.error && <p className="w-full text-xs text-signal-red">{dState.error}</p>}
            </form>
          )}
          {canReturn && allOnSite && (
            <form action={rAction} className="mt-3 flex flex-wrap items-end gap-2" onSubmit={() => setTimeout(() => setSelected(new Set()), 0)}>
              {hidden}
              <select name="condition" defaultValue="good" className={input}><option value="good">Returned — good</option><option value="damaged">Returned — damaged (to repair)</option></select>
              <input name="notes" placeholder="Notes" className={`${input} w-56`} />
              <button disabled={rPending} className="rounded-md border border-graphite-600 px-4 py-1.5 text-sm text-graphite-100 hover:bg-graphite-800 disabled:opacity-50">{rPending ? "…" : "Record return"}</button>
              {rState?.error && <p className="w-full text-xs text-signal-red">{rState.error}</p>}
            </form>
          )}
          {!allInStock && !allOnSite && <p className="mt-2 text-xs text-graphite-500">Select only in-stock panels to dispatch, or only site panels to return.</p>}
        </div>
      )}

      <div className="overflow-hidden rounded-lg border border-graphite-800">
        <table className="w-full text-left text-sm">
          <thead className="bg-graphite-900 text-xs uppercase tracking-wide text-graphite-500">
            <tr><th className="w-10 px-3 py-2.5" /><th className="px-3 py-2.5">QR code</th><th className="px-3 py-2.5">Panel</th><th className="px-3 py-2.5">Status</th><th className="px-3 py-2.5">Location / project</th><th className="px-3 py-2.5 text-right">Cycles</th></tr>
          </thead>
          <tbody className="divide-y divide-graphite-800">
            {panels.length === 0 && <tr><td colSpan={6} className="px-4 py-8 text-center text-graphite-600">No panels match.</td></tr>}
            {panels.map((p) => (
              <tr key={p.id} className={`text-xs ${selected.has(p.id) ? "bg-signal-amber/5" : "bg-graphite-950"}`}>
                <td className="px-3 py-2"><input type="checkbox" checked={selected.has(p.id)} onChange={() => toggle(p.id)} disabled={p.status === "scrapped"} className="accent-signal-amber" aria-label={`Select ${p.qr_code}`} /></td>
                <td className="px-3 py-2 font-mono"><Link href={`/inventory/${p.id}`} className="text-aluminium-300 hover:underline">{p.qr_code}</Link></td>
                <td className="px-3 py-2 font-mono text-graphite-300">{p.panel_code}</td>
                <td className={`px-3 py-2 ${STATUS_STYLE[p.status] ?? ""}`}>{p.status.replace(/_/g, " ")}</td>
                <td className="px-3 py-2 text-graphite-400">{p.current_location}{p.project_code ? ` · ${p.project_code}` : ""}</td>
                <td className="px-3 py-2 text-right font-mono text-graphite-300">{p.cycle_count}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
