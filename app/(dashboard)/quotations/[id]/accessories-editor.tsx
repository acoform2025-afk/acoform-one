"use client";

import { useState, useTransition } from "react";
import { ArrowDown, ArrowUp, Plus, RotateCcw, Trash2 } from "lucide-react";
import { saveAccessories } from "../accessories-actions";
import type { AccessoryRow } from "@/lib/quotations/document-content";

const cell =
  "w-full rounded border border-transparent bg-transparent px-2 py-1.5 text-sm text-graphite-100 placeholder:text-graphite-600 hover:border-graphite-700 focus:border-brand-orange focus:bg-graphite-950 focus:outline-none disabled:hover:border-transparent";

/** Editable "Accessories inclusive list" printed on the proposal PDF (one list per quotation). */
export function AccessoriesEditor({ quotationId, rows: initial, isCustom, standard, editable }: {
  quotationId: string; rows: AccessoryRow[]; isCustom: boolean; standard: AccessoryRow[]; editable: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<AccessoryRow[]>(initial);
  const [dirty, setDirty] = useState(false);
  const [msg, setMsg] = useState<{ ok?: boolean; error?: string } | null>(null);
  const [isPending, startTransition] = useTransition();

  function update(i: number, field: keyof AccessoryRow, value: string) {
    setRows((r) => r.map((row, idx) => (idx === i ? { ...row, [field]: value } : row)));
    setDirty(true); setMsg(null);
  }
  function move(i: number, d: -1 | 1) {
    setRows((r) => { const n = [...r]; const j = i + d; if (j < 0 || j >= n.length) return r; [n[i], n[j]] = [n[j], n[i]]; return n; });
    setDirty(true); setMsg(null);
  }
  function remove(i: number) { setRows((r) => r.filter((_, idx) => idx !== i)); setDirty(true); setMsg(null); }
  function add() { setRows((r) => [...r, { item: "", description: "", unit: "Nos.", remarks: "As per design" }]); setDirty(true); setMsg(null); }

  function save(reset = false) {
    startTransition(async () => {
      const res = await saveAccessories(quotationId, reset ? null : rows);
      setMsg(res);
      if (res.ok) { setDirty(false); if (reset) setRows(standard); }
    });
  }

  return (
    <div id="accessories" className="mt-6 scroll-mt-6 rounded-lg border border-graphite-800 bg-graphite-900">
      <button type="button" onClick={() => setOpen((o) => !o)} className="flex w-full items-center justify-between px-4 py-3 text-left">
        <span className="text-sm font-medium text-graphite-200">
          Accessories inclusive list <span className="font-normal text-graphite-500">· {rows.length} items · {isCustom || dirty ? "edited for this quotation" : "standard list"} (printed on the PDF)</span>
        </span>
        <span className={editable && !open ? "rounded-md bg-brand-orange px-3 py-1 text-xs font-medium text-white" : "text-xs text-graphite-500"}>
          {open ? "Hide" : editable ? "Edit" : "View"}
        </span>
      </button>

      {open && (
        <div className="border-t border-graphite-800 p-4">
          {msg?.error && <p className="mb-3 rounded-md border border-signal-red/30 bg-signal-red/10 px-3 py-2 text-sm text-signal-red">{msg.error}</p>}
          {msg?.ok && <p className="mb-3 rounded-md border border-signal-green/30 bg-signal-green/10 px-3 py-2 text-sm text-signal-green">Saved. The PDF now uses this list.</p>}

          <div className="overflow-x-auto rounded-md border border-graphite-800 bg-graphite-950">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead className="bg-graphite-900 text-xs uppercase tracking-wide text-graphite-500">
                <tr>
                  <th className="w-10 px-2 py-2 text-center font-medium">Sr.</th>
                  <th className="px-2 py-2 font-medium">Item</th>
                  <th className="px-2 py-2 font-medium">Description</th>
                  <th className="w-24 px-2 py-2 font-medium">Unit</th>
                  <th className="w-36 px-2 py-2 font-medium">Remarks</th>
                  {editable && <th className="w-28 px-2 py-2"></th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-graphite-800">
                {rows.map((r, i) => (
                  <tr key={i}>
                    <td className="px-2 py-1 text-center text-xs text-graphite-500">{i + 1}</td>
                    <td className="px-1 py-1"><input value={r.item} onChange={(e) => update(i, "item", e.target.value)} disabled={!editable} placeholder="Item name" className={cell} /></td>
                    <td className="px-1 py-1"><input value={r.description} onChange={(e) => update(i, "description", e.target.value)} disabled={!editable} className={cell} /></td>
                    <td className="px-1 py-1"><input value={r.unit} onChange={(e) => update(i, "unit", e.target.value)} disabled={!editable} className={cell} /></td>
                    <td className="px-1 py-1"><input value={r.remarks} onChange={(e) => update(i, "remarks", e.target.value)} disabled={!editable} className={cell} /></td>
                    {editable && (
                      <td className="px-2 py-1">
                        <div className="flex items-center justify-end gap-0.5 text-graphite-500">
                          <button type="button" onClick={() => move(i, -1)} disabled={i === 0} title="Move up" className="rounded p-1 hover:bg-graphite-900 hover:text-graphite-100 disabled:opacity-30"><ArrowUp className="size-3.5" /></button>
                          <button type="button" onClick={() => move(i, 1)} disabled={i === rows.length - 1} title="Move down" className="rounded p-1 hover:bg-graphite-900 hover:text-graphite-100 disabled:opacity-30"><ArrowDown className="size-3.5" /></button>
                          <button type="button" onClick={() => remove(i)} title="Remove" className="rounded p-1 hover:bg-signal-red/10 hover:text-signal-red"><Trash2 className="size-3.5" /></button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
                {rows.length === 0 && <tr><td colSpan={editable ? 6 : 5} className="px-3 py-6 text-center text-sm text-graphite-500">No accessories. Add a row below.</td></tr>}
              </tbody>
            </table>
          </div>

          {editable ? (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <button type="button" onClick={add} className="inline-flex items-center gap-1.5 rounded-md border border-graphite-700 bg-graphite-950 px-3 py-1.5 text-sm text-graphite-200 hover:bg-graphite-900">
                <Plus className="size-4" /> Add row
              </button>
              <button type="button" onClick={() => save(false)} disabled={isPending || !dirty} className="rounded-md bg-brand-orange px-4 py-1.5 text-sm font-medium text-white hover:bg-brand-orange-dark disabled:opacity-50">
                {isPending ? "Saving…" : "Save list"}
              </button>
              {(isCustom || dirty) && (
                <button type="button" onClick={() => { if (confirm("Replace this list with the standard accessories list?")) save(true); }} disabled={isPending}
                  className="ml-auto inline-flex items-center gap-1.5 text-xs text-graphite-500 hover:text-brand-orange-dark">
                  <RotateCcw className="size-3.5" /> Reset to standard list
                </button>
              )}
              {dirty && <span className="text-xs text-amber-700 dark:text-amber-300">Unsaved changes</span>}
            </div>
          ) : (
            <p className="mt-3 text-xs text-graphite-500">This quotation is locked. Create a revision to change the list.</p>
          )}
        </div>
      )}
    </div>
  );
}
