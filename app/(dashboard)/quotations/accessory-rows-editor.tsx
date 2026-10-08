"use client";

import { useState } from "react";
import { ClipboardPaste, Plus, Trash2 } from "lucide-react";
import { parseRequirement } from "@/lib/quotations/accessory-quote";

export type KnownRate = { item: string; spec: string; unit: string; rate: number };
export type EditRow = { kind: "accessory" | "transport"; item: string; spec: string; qty: string; unit: string; rate: string };

const cell = "w-full rounded border border-graphite-700 bg-graphite-800 px-2 py-1.5 text-xs text-graphite-100 focus:border-signal-amber focus:outline-none";
const key = (a: string, b: string) => `${a.trim().toLowerCase()}|${b.trim().toLowerCase()}`;
export const emptyRow = (): EditRow => ({ kind: "accessory", item: "", spec: "", qty: "", unit: "Nos", rate: "" });

/**
 * The items of an accessories quotation: paste the customer's message to fill them in, or type them; the rate
 * last quoted for the same item and size is filled in (and can be changed).
 */
export function AccessoryRowsEditor({ rows, setRows, known, onInfo }: { rows: EditRow[]; setRows: (r: EditRow[]) => void; known: KnownRate[]; onInfo?: (i: { delivery?: string; application?: string }) => void }) {
  const [paste, setPaste] = useState("");
  const [note, setNote] = useState<string | null>(null);
  const rateOf = new Map(known.map((k) => [key(k.item, k.spec), k]));
  const items = [...new Set(known.map((k) => k.item))];
  const withRate = (r: EditRow): EditRow => {
    if (r.rate !== "") return r;
    const k = rateOf.get(key(r.item, r.spec)); return k ? { ...r, rate: String(k.rate), unit: r.unit || k.unit } : r;
  };
  const read = () => {
    const p = parseRequirement(paste);
    if (!p.rows.length) { setNote("No items with a quantity were found. Write one item per line, e.g. “Wedge patti : 3000 Nos”."); return; }
    const add = p.rows.map((r) => withRate({ kind: "accessory", item: r.item, spec: r.spec, qty: String(r.qty), unit: r.unit, rate: "" }));
    setRows([...rows.filter((r) => r.item.trim() || r.qty), ...add]);
    onInfo?.({ delivery: p.delivery, application: p.application });
    const priced = add.filter((r) => r.rate !== "").length;
    setNote(`${add.length} items read${priced ? `, ${priced} with the rate last quoted` : ""}${p.delivery ? ` · delivery at ${p.delivery}` : ""}${p.unread.length ? ` · not understood: ${p.unread.join(" / ")}` : ""}.`);
    setPaste("");
  };
  // a changed item / size takes the rate last quoted for it, when no rate is typed yet
  const set = (i: number, patch: Partial<EditRow>) => setRows(rows.map((r, j) => (j !== i ? r : patch.item != null || patch.spec != null ? withRate({ ...r, ...patch }) : { ...r, ...patch })));
  const total = rows.reduce((s, r) => s + (Number(r.qty) || 0) * (Number(r.rate) || 0), 0);

  return (
    <div className="flex flex-col gap-3">
      <div className="rounded-md border border-graphite-800 bg-graphite-950 p-3">
        <label className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-graphite-400"><ClipboardPaste className="size-3.5" />Paste the customer&apos;s requirement (optional)</label>
        <textarea value={paste} onChange={(e) => setPaste(e.target.value)} rows={4} placeholder={"Non-breakable wall tie :-\n1) 230 mm : 504 Nos\n2) Wedge patti : 3000 Nos\nDelivery at Bapunagar, Ahmedabad"} className={`${cell} mt-1.5 font-mono`} />
        <button type="button" onClick={read} disabled={!paste.trim()} className="mt-2 rounded-md border border-graphite-700 px-3 py-1.5 text-xs text-graphite-200 hover:bg-graphite-800 disabled:opacity-50">Read the items</button>
        {note ? <p className="mt-1.5 text-xs text-signal-green">{note}</p> : null}
      </div>
      <datalist id="acc-items">{items.map((i) => <option key={i} value={i} />)}</datalist>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-left text-xs">
          <thead className="text-[10px] uppercase tracking-wide text-graphite-500">
            <tr><th className="w-8 py-1">Sr</th><th className="py-1">Item</th><th className="py-1">Size / specification</th><th className="w-20 py-1 text-right">Qty</th><th className="w-20 py-1">Unit</th><th className="w-24 py-1 text-right">Rate ₹</th><th className="w-24 py-1 text-right">Amount ₹</th><th className="w-8" /></tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i}>
                <td className="py-1 pr-1 text-graphite-500">{i + 1}</td>
                <td className="py-1 pr-1"><input list="acc-items" value={r.item} onChange={(e) => set(i, { item: e.target.value })} placeholder={r.kind === "transport" ? "Freight up to site" : "Wall tie"} className={cell} /></td>
                <td className="py-1 pr-1"><input value={r.spec} onChange={(e) => set(i, { spec: e.target.value })} placeholder="230 mm" className={cell} /></td>
                <td className="py-1 pr-1"><input value={r.qty} onChange={(e) => set(i, { qty: e.target.value })} inputMode="decimal" className={`${cell} text-right`} /></td>
                <td className="py-1 pr-1"><input value={r.unit} onChange={(e) => set(i, { unit: e.target.value })} className={cell} /></td>
                <td className="py-1 pr-1"><input value={r.rate} onChange={(e) => set(i, { rate: e.target.value })} inputMode="decimal" placeholder="0.00" className={`${cell} text-right`} /></td>
                <td className="py-1 pr-1 text-right font-mono text-graphite-300">{((Number(r.qty) || 0) * (Number(r.rate) || 0)).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                <td className="py-1"><button type="button" onClick={() => setRows(rows.filter((_, j) => j !== i))} className="text-graphite-500 hover:text-signal-red" aria-label="Remove row"><Trash2 className="size-3.5" /></button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex gap-2">
          <button type="button" onClick={() => setRows([...rows, emptyRow()])} className="inline-flex items-center gap-1 rounded-md border border-graphite-700 px-2.5 py-1.5 text-xs text-graphite-200 hover:bg-graphite-800"><Plus className="size-3.5" />Item</button>
          <button type="button" onClick={() => setRows([...rows, { ...emptyRow(), kind: "transport", item: "Freight up to site", qty: "1", unit: "Lump sum" }])} className="inline-flex items-center gap-1 rounded-md border border-graphite-700 px-2.5 py-1.5 text-xs text-graphite-200 hover:bg-graphite-800"><Plus className="size-3.5" />Freight</button>
        </div>
        <p className="text-xs text-graphite-400">Subtotal <span className="font-mono text-graphite-100">₹ {total.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span> + GST</p>
      </div>
    </div>
  );
}

/** Rows ready for the server (blank rows left out). */
export const rowsForServer = (rows: EditRow[]) => rows.filter((r) => r.item.trim() && Number(r.qty) > 0).map((r) => ({ kind: r.kind, item: r.item.trim(), spec: r.spec.trim(), qty: Number(r.qty), unit: r.unit.trim() || "Nos", rate: Number(r.rate) || 0 }));
