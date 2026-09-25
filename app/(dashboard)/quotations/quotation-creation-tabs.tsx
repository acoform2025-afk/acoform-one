"use client";

import { useState } from "react";
import { NewQuotationForm } from "./new-quotation-form";
import { QuickQuoteForm } from "./quick-quote-form";

type Lead = { id: string; lead_code: string; customer_name: string };
type Rate = { formwork_type: string; rate_per_sqm: number };

export function QuotationCreationTabs({ leads, rates, nextCode }: { leads: Lead[]; rates: Rate[]; nextCode: string }) {
  const [mode, setMode] = useState<"detailed" | "quick" | null>(null);

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
      <button onClick={() => setMode(null)} className="mb-3 text-xs text-graphite-500 hover:text-graphite-300">← Back</button>
      {mode === "detailed" ? <NewQuotationForm leads={leads} nextCode={nextCode} /> : <QuickQuoteForm leads={leads} rates={rates} nextCode={nextCode} />}
    </div>
  );
}
