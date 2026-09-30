"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { DraftingCompass } from "lucide-react";
import { attachFloorPlan } from "../../floor-plans/actions";
import { fmtArea } from "@/lib/floor-plans/calc";

type Attached = { id: string; name: string; previewUrl: string | null; totals: Record<string, number> };
type Option = { id: string; name: string; drawing_type: string; contact: number | null };

/** Floor plan printed on the quotation PDF (plan picture + area take-off table). */
export function FloorPlanCard({ quotationId, leadId, editable, isQuick, attached, options }: {
  quotationId: string; leadId: string | null; editable: boolean; isQuick: boolean; attached: Attached | null; options: Option[];
}) {
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const run = (planId: string | null) => { setErr(null); start(async () => { const r = await attachFloorPlan(quotationId, planId); if (r.error) setErr(r.error); }); };
  const uploadHref = `/floor-plans/new?quotation=${quotationId}${leadId ? `&lead=${leadId}` : ""}`;

  return (
    <div className="mt-6 rounded-lg border border-graphite-800 bg-graphite-900 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="inline-flex items-center gap-2 text-sm font-medium text-graphite-200"><DraftingCompass className="size-4 text-graphite-500" />Floor plan &amp; area take-off</p>
        {editable ? <Link href={uploadHref} className="text-xs text-brand-orange hover:underline">+ Upload AutoCAD / PDF plan</Link> : null}
      </div>
      {err ? <p className="mt-2 text-sm text-signal-red">{err}</p> : null}

      {attached ? (
        <div className="mt-3 flex flex-col gap-4 sm:flex-row">
          {attached.previewUrl ? (
            <Link href={`/floor-plans/${attached.id}?quotation=${quotationId}`} className="shrink-0">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={attached.previewUrl} alt={attached.name} className="h-36 w-full rounded border border-graphite-800 bg-white object-contain sm:w-56" />
            </Link>
          ) : null}
          <div className="min-w-0 flex-1 text-sm">
            <Link href={`/floor-plans/${attached.id}?quotation=${quotationId}`} className="font-medium text-graphite-100 hover:text-brand-orange hover:underline">{attached.name}</Link>
            <p className="mt-0.5 text-xs text-graphite-500">Printed on the quotation PDF with its area table.</p>
            <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
              <dt className="text-graphite-500">Vertical set (walls + columns)</dt><dd className="text-right font-mono text-graphite-200">{fmtArea(attached.totals.vertical_area)}</dd>
              <dt className="text-graphite-500">Typical floor total</dt><dd className="text-right font-mono text-graphite-200">{fmtArea(attached.totals.contact_area)}</dd>
              <dt className="text-graphite-500">Formwork set{attached.totals.extra_pct ? ` (+${attached.totals.extra_pct}%)` : ""}{attached.totals.nontypical_area ? " + non-typical" : ""}</dt><dd className="text-right font-mono font-semibold text-graphite-50">{fmtArea(attached.totals.quote_area || attached.totals.contact_area)}</dd>
            </dl>
            <div className="mt-3 flex flex-wrap gap-2">
              <Link href={`/floor-plans/${attached.id}?quotation=${quotationId}`} className="rounded-md border border-graphite-700 px-3 py-1.5 text-xs text-graphite-200 hover:bg-graphite-800">
                {editable ? (isQuick ? "Measure / use area in this quote" : "Open & measure") : "Open plan"}
              </Link>
              <a href={`/floor-plans/${attached.id}/area-sheet`} target="_blank" rel="noreferrer" className="rounded-md bg-brand-orange px-3 py-1.5 text-xs font-medium text-white hover:opacity-90">Area calculation sheet</a>
              {editable ? <button type="button" disabled={pending} onClick={() => run(null)} className="rounded-md border border-graphite-700 px-3 py-1.5 text-xs text-graphite-400 hover:text-signal-red disabled:opacity-50">Remove from PDF</button> : null}
            </div>
          </div>
        </div>
      ) : options.length ? (
        <ul className="mt-3 divide-y divide-graphite-800 rounded-md border border-graphite-800">
          {options.map((o) => (
            <li key={o.id} className="flex items-center justify-between gap-3 bg-graphite-950 px-3 py-2 text-sm">
              <Link href={`/floor-plans/${o.id}?quotation=${quotationId}`} className="min-w-0 truncate text-graphite-200 hover:underline">{o.name} <span className="text-xs capitalize text-graphite-500">· {o.drawing_type}</span></Link>
              <span className="shrink-0 font-mono text-xs text-graphite-400">{o.contact ? fmtArea(o.contact) : "not measured"}</span>
              {editable ? <button type="button" disabled={pending} onClick={() => run(o.id)} className="shrink-0 rounded bg-brand-orange px-2.5 py-1 text-xs font-medium text-white disabled:opacity-50">Print on PDF</button> : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-xs text-graphite-500">No floor plan yet. Upload the AutoCAD plan to measure the area and print it on the quotation.</p>
      )}
    </div>
  );
}
