"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CustomerFields, type CustomerDefaults } from "./customer-fields";
import { createAccessoriesQuote } from "./accessory-quote-actions";
import { AccessoryRowsEditor, emptyRow, rowsForServer, type EditRow, type KnownRate } from "./accessory-rows-editor";

type Lead = { id: string; lead_code: string; customer_name: string; project_name: string | null };
const input = "rounded-md border border-graphite-700 bg-graphite-800 px-3.5 py-2.5 text-sm text-graphite-100 focus:border-signal-amber focus:outline-none";

/** Quotation for accessories only (wall ties, wedge pins, patti, props …) — priced per item, no formwork set. */
export function AccessoriesQuoteForm({ leads, nextCode, leadId, prefill, known }: { leads: Lead[]; nextCode: string; leadId?: string; prefill?: CustomerDefaults; known: KnownRate[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<EditRow[]>([emptyRow()]);
  const [delivery, setDelivery] = useState("");
  const [application, setApplication] = useState("Aluminium Formwork");

  function submit(fd: FormData) {
    setError(null);
    const r = rowsForServer(rows);
    if (!r.length) { setError("Add at least one item with a quantity."); return; }
    fd.set("rows", JSON.stringify(r)); fd.set("deliveryPlace", delivery); fd.set("application", application);
    start(async () => {
      const res = await createAccessoriesQuote(fd);
      if (!res.success) setError(res.error ?? "Could not create the quotation.");
      else if (res.data?.id) router.push(`/quotations/${res.data.id}`);
    });
  }

  return (
    <form action={submit} className="rounded-lg border border-graphite-800 bg-graphite-900 p-5">
      <h2 className="mb-1 text-sm font-medium text-graphite-200">Accessories quotation</h2>
      <p className="mb-4 text-xs text-graphite-500">For supplying accessories only — wall ties, wedge pins, patti, props, PVC sleeves … priced per item. Its own PDF format.</p>
      {error && <p className="mb-4 rounded-md border border-signal-red/30 bg-signal-red/10 px-3.5 py-2.5 text-sm text-signal-red">{error}</p>}
      <div className="grid grid-cols-2 gap-4">
        <CustomerFields defaults={prefill} />
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium uppercase tracking-wide text-graphite-400">Quotation code</label>
          <input name="quotationCode" required defaultValue={nextCode} className={input} />
        </div>
        {leads.length > 0 && (
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium uppercase tracking-wide text-graphite-400">Link to lead (optional)</label>
            <select name="leadId" defaultValue={leadId ?? ""} className={input}>
              <option value="">— None —</option>
              {leads.map((l) => <option key={l.id} value={l.id}>{l.lead_code} — {l.project_name ?? l.customer_name}</option>)}
            </select>
          </div>
        )}
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium uppercase tracking-wide text-graphite-400">Delivery at</label>
          <input value={delivery} onChange={(e) => setDelivery(e.target.value)} placeholder="Bapunagar, Ahmedabad" className={input} />
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium uppercase tracking-wide text-graphite-400">For use in</label>
          <input value={application} onChange={(e) => setApplication(e.target.value)} placeholder="Aluminium Formwork" className={input} />
        </div>
        <div className="col-span-2">
          <AccessoryRowsEditor rows={rows} setRows={setRows} known={known} onInfo={(i) => { if (i.delivery) setDelivery(i.delivery); if (i.application) setApplication(i.application); }} />
        </div>
      </div>
      <button type="submit" disabled={pending} className="mt-4 rounded-md bg-aluminium-300 px-4 py-2 text-sm font-medium text-graphite-950 hover:opacity-90 disabled:opacity-50">{pending ? "Creating…" : "Create accessories quotation"}</button>
    </form>
  );
}
