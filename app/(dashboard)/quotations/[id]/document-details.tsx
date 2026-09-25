"use client";

import { useActionState, useState } from "react";
import { saveQuotationDetails } from "../document-actions";
import { DEFAULT_PAYMENT_TERMS, formworkKind } from "@/lib/quotations/document-content";

type Q = {
  id: string; customer_name: string; kind_attn: string | null; customer_address: string | null;
  schedule_description: string | null; quotation_date: string; validity_days: number;
  nalco_rate_per_kg: number | null; nalco_rate_date: string | null; payment_terms: string[] | null;
  quotation_type: string; formwork_type: string | null; total_area_sqm: number | null;
};

const input =
  "w-full rounded-md border border-graphite-700 bg-graphite-900 px-3 py-2 text-sm text-graphite-100 focus:border-signal-amber focus:outline-none disabled:opacity-60";

function L({ label, children, wide }: { label: string; children: React.ReactNode; wide?: boolean }) {
  return (
    <label className={`flex flex-col gap-1.5 ${wide ? "md:col-span-2" : ""}`}>
      <span className="text-xs font-medium uppercase tracking-wide text-graphite-400">{label}</span>
      {children}
    </label>
  );
}

export function DocumentDetails({ q, editable }: { q: Q; editable: boolean }) {
  const [state, action, pending] = useActionState(saveQuotationDetails, undefined);
  const [open, setOpen] = useState(false);
  const kind = formworkKind(q.formwork_type);
  const terms = (q.payment_terms ?? DEFAULT_PAYMENT_TERMS[kind]).join("\n");
  const d = !editable;

  return (
    <div className="mt-6 rounded-lg border border-graphite-800 bg-graphite-900">
      <button type="button" onClick={() => setOpen((o) => !o)} className="flex w-full items-center justify-between px-4 py-3 text-left">
        <span className="text-sm font-medium text-graphite-200">Proposal details (printed on the PDF)</span>
        <span className="text-xs text-graphite-500">{open ? "Hide" : editable ? "Edit" : "View"}</span>
      </button>
      {open && (
        <form action={action} className="border-t border-graphite-800 p-4">
          <input type="hidden" name="quotationId" value={q.id} />
          {state?.error && <p className="mb-3 rounded-md border border-signal-red/30 bg-signal-red/10 px-3 py-2 text-sm text-signal-red">{state.error}</p>}
          {state?.ok && <p className="mb-3 rounded-md border border-signal-green/30 bg-signal-green/10 px-3 py-2 text-sm text-signal-green">Saved.</p>}
          <div className="grid gap-4 md:grid-cols-2">
            <L label="Customer (To)"><input name="customerName" defaultValue={q.customer_name} required disabled={d} className={input} /></L>
            <L label="Kind Attn"><input name="kindAttn" defaultValue={q.kind_attn ?? ""} placeholder="Mr. …" disabled={d} className={input} /></L>
            <L label="Customer city / address" wide><input name="customerAddress" defaultValue={q.customer_address ?? ""} placeholder="Ahmedabad, Gujarat" disabled={d} className={input} /></L>
            <L label="Price schedule description" wide>
              <input name="scheduleDescription" defaultValue={q.schedule_description ?? ""} placeholder="Acoform Aluminium Formwork – A Wing" disabled={d} className={input} />
            </L>
            {q.quotation_type === "quick" && (
              <L label="Quantity (Sqm)"><input name="areaSqm" type="number" step="0.01" min="0" defaultValue={q.total_area_sqm ?? ""} disabled={d} className={input} /></L>
            )}
            <L label="Quotation date"><input name="quotationDate" type="date" defaultValue={q.quotation_date} required disabled={d} className={input} /></L>
            <L label="Validity (days)"><input name="validityDays" type="number" min="1" defaultValue={q.validity_days} required disabled={d} className={input} /></L>
            <L label="Nalco rate (₹/kg)"><input name="nalcoRate" type="number" step="0.01" defaultValue={q.nalco_rate_per_kg ?? ""} disabled={d} className={input} /></L>
            <L label="Nalco rate date"><input name="nalcoDate" type="date" defaultValue={q.nalco_rate_date ?? ""} disabled={d} className={input} /></L>
            <L label="Payment terms (one per line)" wide>
              <textarea name="paymentTerms" rows={4} defaultValue={terms} disabled={d} className={input} />
            </L>
          </div>
          {editable ? (
            <button disabled={pending} className="mt-4 rounded-md bg-signal-amber px-4 py-2 text-sm font-semibold text-graphite-950 hover:opacity-90 disabled:opacity-50">
              {pending ? "Saving…" : "Save details"}
            </button>
          ) : (
            <p className="mt-3 text-xs text-graphite-500">This quotation is locked. Create a revision to change it.</p>
          )}
        </form>
      )}
    </div>
  );
}
