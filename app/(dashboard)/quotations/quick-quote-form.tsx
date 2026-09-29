"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CustomerFields, type CustomerDefaults } from "./customer-fields";
import { createQuickQuote } from "./actions";

type Lead = { id: string; lead_code: string; customer_name: string; project_name: string | null };
type Rate = { formwork_type: string; rate_per_sqm: number };

const AREA_BASIS_HINT: Record<string, string> = {
  monolithic: "Total formwork contact area of a typical floor (slab + walls + beams + stairs)",
  vertical: "Vertical formwork face area (walls/columns only, slab separate)",
};

export function QuickQuoteForm({ leads, rates, nextCode, leadId, prefill, areaDefault, plan }: { leads: Lead[]; rates: Rate[]; nextCode: string; leadId?: string; prefill?: CustomerDefaults; areaDefault?: string; plan?: { id: string; name: string; monolithic: number; vertical: number } }) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [formworkType, setFormworkType] = useState<"monolithic" | "vertical">("monolithic");
  const [areaSqm, setAreaSqm] = useState(areaDefault ?? "");
  const [areaTouched, setAreaTouched] = useState(false);
  // area measured on a floor plan follows the formwork type (floor plate vs walls + columns) until typed over
  function changeType(v: "monolithic" | "vertical") {
    setFormworkType(v);
    if (plan && !areaTouched) setAreaSqm(String(v === "vertical" ? plan.vertical : plan.monolithic));
  }
  const router = useRouter();

  const activeRate = rates.find((r) => r.formwork_type === formworkType);
  const subtotal = activeRate && areaSqm ? Number(areaSqm) * Number(activeRate.rate_per_sqm) : null;
  const gstAmount = subtotal !== null ? subtotal * 0.18 : null;
  const estimatedTotal = subtotal !== null ? subtotal + (gstAmount ?? 0) : null;

  function handleSubmit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const result = await createQuickQuote(formData);
      if (!result.success) setError(result.error ?? "Could not create quick quote.");
      else if (result.data?.id) router.push(`/quotations/${result.data.id}`);
    });
  }

  return (
    <form action={handleSubmit} className="rounded-lg border border-graphite-800 bg-graphite-900 p-5">
      <h2 className="mb-1 text-sm font-medium text-graphite-200">Quick quote</h2>
      <p className="mb-4 text-xs text-graphite-500">Fast area-based estimate. For an exact panel-by-panel quote, use &quot;New quotation&quot; instead.</p>
      {error && <p className="mb-4 rounded-md border border-signal-red/30 bg-signal-red/10 px-3.5 py-2.5 text-sm text-signal-red">{error}</p>}

      <div className="grid grid-cols-2 gap-4">
        <CustomerFields defaults={prefill} />
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium uppercase tracking-wide text-graphite-400">Quotation code</label>
          <input name="quotationCode" required defaultValue={nextCode} className="rounded-md border border-graphite-700 bg-graphite-800 px-3.5 py-2.5 text-sm text-graphite-100 focus:border-signal-amber focus:outline-none" />
        </div>
        {leads.length > 0 && (
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium uppercase tracking-wide text-graphite-400">Link to lead (optional)</label>
            <select name="leadId" defaultValue={leadId ?? ""} className="rounded-md border border-graphite-700 bg-graphite-800 px-3.5 py-2.5 text-sm text-graphite-100 focus:border-signal-amber focus:outline-none">
              <option value="">— None —</option>
              {leads.map((l) => <option key={l.id} value={l.id}>{l.lead_code} — {l.project_name ?? l.customer_name}</option>)}
            </select>
          </div>
        )}
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium uppercase tracking-wide text-graphite-400">Formwork type</label>
          <select name="formworkType" value={formworkType} onChange={(e) => changeType(e.target.value as "monolithic" | "vertical")} className="rounded-md border border-graphite-700 bg-graphite-800 px-3.5 py-2.5 text-sm text-graphite-100 focus:border-signal-amber focus:outline-none">
            <option value="monolithic">Full Set (Monolithic)</option>
            <option value="vertical">Vertical Set</option>
          </select>
        </div>
        <div className="col-span-2 flex flex-col gap-1.5">
          <label className="text-xs font-medium uppercase tracking-wide text-graphite-400">Area (sqm) — {AREA_BASIS_HINT[formworkType]}</label>
          {plan ? (
            <p className="text-xs text-signal-green">
              From floor plan “{plan.name}”: full set {plan.monolithic.toLocaleString("en-IN")} m² · vertical set (walls + columns) {plan.vertical.toLocaleString("en-IN")} m². The plan is printed on the quotation.
              <input type="hidden" name="floorPlanId" value={plan.id} />
            </p>
          ) : null}
          <input name="areaSqm" type="number" step="0.01" required value={areaSqm} onChange={(e) => { setAreaSqm(e.target.value); setAreaTouched(true); }} placeholder="5000" className="rounded-md border border-graphite-700 bg-graphite-800 px-3.5 py-2.5 text-sm text-graphite-100 focus:border-signal-amber focus:outline-none" />
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium uppercase tracking-wide text-graphite-400">Nalco rate ref. (₹/kg, optional)</label>
          <input name="nalcoRatePerKg" type="number" step="0.01" placeholder="e.g. 393.85" className="rounded-md border border-graphite-700 bg-graphite-800 px-3.5 py-2.5 text-sm text-graphite-100 focus:border-signal-amber focus:outline-none" />
        </div>
      </div>

      {activeRate ? (
        <div className="mt-3 rounded-md border border-graphite-800 bg-graphite-950 p-3 text-xs">
          <div className="flex justify-between text-graphite-400"><span>Rate</span><span className="font-mono">₹{Number(activeRate.rate_per_sqm).toFixed(2)}/sqm</span></div>
          {subtotal !== null && (
            <>
              <div className="mt-1 flex justify-between text-graphite-400"><span>Subtotal</span><span className="font-mono">₹{subtotal.toLocaleString("en-IN", { maximumFractionDigits: 0 })}</span></div>
              <div className="mt-1 flex justify-between text-graphite-400"><span>GST @ 18%</span><span className="font-mono">₹{(gstAmount ?? 0).toLocaleString("en-IN", { maximumFractionDigits: 0 })}</span></div>
              <div className="mt-1.5 flex justify-between border-t border-graphite-800 pt-1.5 font-medium text-graphite-200"><span>Total Amount</span><span className="font-mono">₹{(estimatedTotal ?? 0).toLocaleString("en-IN", { maximumFractionDigits: 0 })}</span></div>
            </>
          )}
        </div>
      ) : (
        <p className="mt-3 text-xs text-signal-amber">No active rate set for {formworkType}. Set one up under Panel Catalog first.</p>
      )}

      <button type="submit" disabled={isPending || !activeRate} className="mt-4 rounded-md bg-aluminium-300 px-4 py-2 text-sm font-medium text-graphite-950 transition-opacity hover:opacity-90 disabled:opacity-50">
        {isPending ? "Creating…" : "Create quick quote"}
      </button>
    </form>
  );
}
