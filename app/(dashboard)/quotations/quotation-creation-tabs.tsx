"use client";

import { useState } from "react";
import { NewQuotationForm } from "./new-quotation-form";
import { QuickQuoteForm } from "./quick-quote-form";
import type { CustomerDefaults } from "./customer-fields";

type Lead = { id: string; lead_code: string; customer_name: string; project_name: string | null };
type Rate = { formwork_type: string; rate_per_sqm: number };

export type LeadPrefill = { leadId: string; label: string; customer: CustomerDefaults; areaSqm?: string; plan?: { id: string; name: string; monolithic: number; vertical: number } };

export function QuotationCreationTabs({ leads, rates, nextCode, initialMode, fromLead }: {
  leads: Lead[]; rates: Rate[]; nextCode: string; initialMode?: "detailed" | "quick"; fromLead?: LeadPrefill;
}) {
  const [mode, setMode] = useState<"detailed" | "quick" | null>(initialMode ?? null);

  if (!mode) {
    return (
      <div className="flex gap-2">
        <button onClick={() => setMode("detailed")} className="rounded-md bg-aluminium-300 px-4 py-2 text-sm font-medium text-graphite-950 hover:opacity-90">+ New quotation</button>
        <button onClick={() => setMode("quick")} className="rounded-md border border-graphite-700 px-4 py-2 text-sm text-graphite-300 hover:bg-graphite-800">⚡ Quick quote</button>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-3 flex items-center gap-4">
        <button onClick={() => setMode(null)} className="text-xs text-graphite-500 hover:text-graphite-300">← Back</button>
        {fromLead ? <span className="text-xs text-graphite-400">From lead <span className="font-mono text-aluminium-300">{fromLead.label}</span></span> : null}
        <button onClick={() => setMode(mode === "detailed" ? "quick" : "detailed")} className="text-xs text-graphite-500 hover:text-signal-amber">
          Switch to {mode === "detailed" ? "quick quote" : "detailed quotation"}
        </button>
      </div>
      {mode === "detailed"
        ? <NewQuotationForm key="d" leads={leads} nextCode={nextCode} leadId={fromLead?.leadId} prefill={fromLead?.customer} />
        : <QuickQuoteForm key="q" leads={leads} rates={rates} nextCode={nextCode} leadId={fromLead?.leadId} prefill={fromLead?.customer} areaDefault={fromLead?.areaSqm} plan={fromLead?.plan} />}
    </div>
  );
}
