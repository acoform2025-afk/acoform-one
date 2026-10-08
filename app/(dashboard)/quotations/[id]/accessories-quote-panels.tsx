"use client";

import { useState, useTransition } from "react";
import { addAccessoryRows, saveAccessoryQuoteInfo } from "../accessory-quote-actions";
import { AccessoryRowsEditor, emptyRow, rowsForServer, type EditRow, type KnownRate } from "../accessory-rows-editor";

const input = "w-full rounded-md border border-graphite-700 bg-graphite-900 px-3 py-2 text-sm text-graphite-100 focus:border-signal-amber focus:outline-none disabled:opacity-60";

/** Delivery place and what the material is used for — printed on the accessories quotation. */
export function AccessoryInfoForm({ quotationId, delivery, application, editable }: { quotationId: string; delivery: string; application: string; editable: boolean }) {
  const [d, setD] = useState(delivery), [a, setA] = useState(application);
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const dirty = d !== delivery || a !== application;
  return (
    <div className="mt-6 grid gap-3 rounded-lg border border-graphite-800 bg-graphite-900 p-4 md:grid-cols-[1fr_1fr_auto] md:items-end">
      <label className="flex flex-col gap-1.5"><span className="text-xs font-medium uppercase tracking-wide text-graphite-400">Delivery at</span><input value={d} onChange={(e) => setD(e.target.value)} disabled={!editable} placeholder="Bapunagar, Ahmedabad" className={input} /></label>
      <label className="flex flex-col gap-1.5"><span className="text-xs font-medium uppercase tracking-wide text-graphite-400">For use in</span><input value={a} onChange={(e) => setA(e.target.value)} disabled={!editable} placeholder="Aluminium Formwork" className={input} /></label>
      {editable ? (
        <button type="button" disabled={!dirty || pending} onClick={() => start(async () => { const r = await saveAccessoryQuoteInfo(quotationId, d, a); setMsg(r.success ? "Saved." : r.error ?? "Could not save."); })} className="rounded-md bg-signal-amber px-4 py-2 text-sm font-semibold text-graphite-950 hover:opacity-90 disabled:opacity-40">{pending ? "Saving…" : "Save"}</button>
      ) : null}
      {msg ? <p className="text-xs text-graphite-400 md:col-span-3">{msg}</p> : null}
    </div>
  );
}

/** Add items: typed in, or pasted from the customer's message. */
export function AccessoryAddPanel({ quotationId, known }: { quotationId: string; known: KnownRate[] }) {
  const [rows, setRows] = useState<EditRow[]>([emptyRow()]);
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const add = () => {
    const r = rowsForServer(rows); if (!r.length) { setErr("Fill in an item and its quantity."); return; }
    setErr(null);
    start(async () => { const res = await addAccessoryRows(quotationId, r); if (!res.success) setErr(res.error ?? "Could not add."); else setRows([emptyRow()]); });
  };
  return (
    <div className="mt-4 rounded-lg border border-graphite-800 bg-graphite-900 p-4">
      <h3 className="mb-3 text-xs font-medium uppercase tracking-wide text-graphite-400">Add items</h3>
      <AccessoryRowsEditor rows={rows} setRows={setRows} known={known} />
      {err ? <p className="mt-2 text-xs text-signal-red">{err}</p> : null}
      <button type="button" onClick={add} disabled={pending} className="mt-3 rounded-md bg-aluminium-300 px-4 py-2 text-sm font-medium text-graphite-950 hover:opacity-90 disabled:opacity-50">{pending ? "Adding…" : "Add to quotation"}</button>
    </div>
  );
}
