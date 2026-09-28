"use client";

import { useState, useTransition, useRef } from "react";
import { createQuotation } from "./actions";
import { useRouter } from "next/navigation";
import { CustomerFields, type CustomerDefaults } from "./customer-fields";

type Lead = { id: string; lead_code: string; customer_name: string; project_name: string | null };

export function NewQuotationForm({ leads, nextCode, leadId, prefill }: { leads: Lead[]; nextCode: string; leadId?: string; prefill?: CustomerDefaults }) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const router = useRouter();

  function handleSubmit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const result = await createQuotation(formData);
      if (!result.success) {
        setError(result.error ?? "Something went wrong.");
      } else {
        formRef.current?.reset();
        if (result.data?.id) router.push(`/quotations/${result.data.id}`);
      }
    });
  }

  return (
    <form ref={formRef} action={handleSubmit} className="rounded-lg border border-graphite-800 bg-graphite-900 p-5">
      <h2 className="mb-4 text-sm font-medium text-graphite-200">New quotation</h2>
      {error && <p className="mb-4 rounded-md border border-signal-red/30 bg-signal-red/10 px-3.5 py-2.5 text-sm text-signal-red">{error}</p>}
      <div className="grid grid-cols-2 gap-4">
        <CustomerFields defaults={prefill} />
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium uppercase tracking-wide text-graphite-400">Quotation code</label>
          <input name="quotationCode" required defaultValue={nextCode} className="rounded-md border border-graphite-700 bg-graphite-900 px-3.5 py-2.5 text-sm text-graphite-100 focus:border-signal-amber focus:outline-none" />
        </div>
        {leads.length > 0 && (
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium uppercase tracking-wide text-graphite-400">Link to lead (optional)</label>
            <select name="leadId" defaultValue={leadId ?? ""} className="rounded-md border border-graphite-700 bg-graphite-900 px-3.5 py-2.5 text-sm text-graphite-100 focus:border-signal-amber focus:outline-none">
              <option value="">— None —</option>
              {leads.map((l) => <option key={l.id} value={l.id}>{l.lead_code} — {l.project_name ?? l.customer_name}</option>)}
            </select>
          </div>
        )}
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium uppercase tracking-wide text-graphite-400">Formwork type</label>
          <select name="formworkType" defaultValue="monolithic" className="rounded-md border border-graphite-700 bg-graphite-900 px-3.5 py-2.5 text-sm text-graphite-100 focus:border-signal-amber focus:outline-none">
            <option value="monolithic">Full Set (Monolithic)</option>
            <option value="vertical">Vertical Set</option>
          </select>
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium uppercase tracking-wide text-graphite-400">Valid until</label>
          <input name="validUntil" type="date" className="rounded-md border border-graphite-700 bg-graphite-900 px-3.5 py-2.5 text-sm text-graphite-100 focus:border-signal-amber focus:outline-none" />
        </div>
      </div>
      <button type="submit" disabled={isPending} className="mt-4 rounded-md bg-aluminium-300 px-4 py-2 text-sm font-medium text-graphite-950 transition-opacity hover:opacity-90 disabled:opacity-50">
        {isPending ? "Creating…" : "Create quotation"}
      </button>
    </form>
  );
}
