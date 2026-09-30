"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { FileText, Loader2 } from "lucide-react";
import { fmtArea, type Totals } from "@/lib/floor-plans/calc";
import { applyPlanArea, attachFloorPlan, type AreaBasis } from "../actions";

export type QuoteOption = {
  id: string; code: string; type: "quick" | "detailed" | string; formwork_type: string | null; status: string;
  attached: boolean; editable: boolean; area: number | null;
};

const BASIS: { k: AreaBasis; label: string; hint: string }[] = [
  { k: "quote_area", label: "Formwork set (typical floor + extra % + non-typical additions)", hint: "Full set (monolithic) quick quotes" },
  { k: "vertical_area", label: "Vertical set area (walls + columns)", hint: "Vertical set quick quotes" },
  { k: "plan_area", label: "Slab area only", hint: "Slab outline less ducts" },
];

export function UseInQuotation({ planId, lead, quotes, totals, dirty, canEdit }: {
  planId: string; lead: { id: string; label: string } | null; quotes: QuoteOption[]; totals: Totals; dirty: boolean; canEdit: boolean;
}) {
  const [msg, setMsg] = useState<{ ok?: string; error?: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [, start] = useTransition();
  if (!canEdit) return null;

  function run(key: string, fn: () => Promise<{ ok?: boolean; error?: string }>, ok: string) {
    setMsg(null); setBusy(key);
    start(async () => { const r = await fn(); setBusy(null); setMsg(r.error ? { error: r.error } : { ok }); });
  }

  return (
    <section className="rounded-lg border border-brand-orange/40 bg-graphite-900 p-3">
      <h3 className="text-sm font-medium text-graphite-100">Use in quotation</h3>
      <p className="mb-2 mt-0.5 text-[11px] text-graphite-500">Copies the area into a quick quote and prints this plan with its areas on the quotation PDF.</p>
      {dirty ? <p className="mb-2 rounded border border-signal-amber/30 bg-signal-amber/10 px-2 py-1.5 text-xs text-signal-amber">Save the measurements first.</p> : null}
      {msg?.error ? <p className="mb-2 rounded border border-signal-red/30 bg-signal-red/10 px-2 py-1.5 text-xs text-signal-red">{msg.error}</p> : null}
      {msg?.ok ? <p className="mb-2 rounded border border-signal-green/30 bg-signal-green/10 px-2 py-1.5 text-xs text-signal-green">{msg.ok}</p> : null}

      {quotes.length === 0 ? (
        <p className="text-xs text-graphite-500">{lead ? "This lead has no open quotations yet." : "Link this plan to a lead to see its quotations here."}</p>
      ) : (
        <ul className="space-y-2">
          {quotes.map((q) => {
            const preferred: AreaBasis = q.formwork_type === "vertical" ? "vertical_area" : "quote_area";
            return (
              <li key={q.id} className="rounded-md border border-graphite-800 bg-graphite-950 p-2">
                <div className="flex items-center justify-between gap-2">
                  <Link href={`/quotations/${q.id}`} className="inline-flex items-center gap-1.5 font-mono text-xs text-aluminium-300 hover:underline"><FileText className="size-3.5" />{q.code}</Link>
                  <span className="text-[11px] capitalize text-graphite-500">{q.type}{q.formwork_type ? ` · ${q.formwork_type}` : ""} · {q.status.replace("_", " ")}</span>
                </div>
                {q.type === "quick" && q.area != null ? <p className="mt-1 text-[11px] text-graphite-500">Current area: {fmtArea(q.area)}{q.attached ? " · this plan is on its PDF" : ""}</p> : null}
                {!q.editable ? <p className="mt-1 text-[11px] text-graphite-500">Locked — create a revision on the quotation to change it.</p> : q.type === "quick" ? (
                  <div className="mt-1.5 flex flex-col gap-1">
                    {BASIS.map((b) => (
                      <button key={b.k} type="button" disabled={dirty || !!busy || !(Number(totals[b.k]) > 0)}
                        onClick={() => run(q.id + b.k, () => applyPlanArea(q.id, planId, b.k), `${q.code} now uses ${fmtArea(totals[b.k])} and prints this plan.`)}
                        className={`flex items-center justify-between rounded px-2 py-1.5 text-left text-xs disabled:opacity-40 ${b.k === preferred ? "bg-brand-orange text-white hover:opacity-90" : "border border-graphite-700 text-graphite-200 hover:bg-graphite-800"}`}>
                        <span>{busy === q.id + b.k ? <Loader2 className="mr-1 inline size-3 animate-spin" /> : null}Use {b.label}</span>
                        <span className="font-mono">{fmtArea(totals[b.k])}</span>
                      </button>
                    ))}
                  </div>
                ) : (
                  <button type="button" disabled={dirty || !!busy}
                    onClick={() => run(q.id, () => attachFloorPlan(q.id, q.attached ? null : planId), q.attached ? "Plan removed from the PDF." : "Plan will be printed on the PDF.")}
                    className="mt-1.5 w-full rounded border border-graphite-700 px-2 py-1.5 text-xs text-graphite-200 hover:bg-graphite-800 disabled:opacity-40">
                    {q.attached ? "Remove plan from this quotation's PDF" : "Print this plan on the quotation PDF"}
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {lead ? (
        <Link href={`/quotations?lead=${lead.id}&mode=quick&plan=${planId}`} aria-disabled={dirty}
          className={`mt-3 block rounded-md border border-graphite-700 px-3 py-2 text-center text-xs font-medium text-graphite-200 hover:bg-graphite-800 ${dirty ? "pointer-events-none opacity-40" : ""}`}>
          ⚡ New quick quote from this plan
        </Link>
      ) : null}
    </section>
  );
}
