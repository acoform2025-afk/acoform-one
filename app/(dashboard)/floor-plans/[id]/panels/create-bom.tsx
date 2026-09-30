"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Factory, Loader2 } from "lucide-react";
import { createBomFromFloorPlan } from "../../actions";

export type BomDesign = { id: string; code: string; project: string };

/** Sends this panel layout to production: creates a draft BOM under a design, then opens it for approval. */
export function CreateBom({ planId, designs, query }: { planId: string; designs: BomDesign[]; query: { h: string; kg: string; prop: string } }) {
  const router = useRouter();
  const [designId, setDesignId] = useState(designs[0]?.id ?? "");
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function go() {
    setErr(null);
    start(async () => {
      const r = await createBomFromFloorPlan(planId, designId, query);
      if (r.error || !r.data) { setErr(r.error ?? "Could not create the BOM."); return; }
      router.push(`/boms/${r.data.bomId}`);
    });
  }

  return (
    <section className="mt-4 rounded-lg border border-brand-orange/40 bg-brand-orange/5 p-3">
      <h2 className="flex items-center gap-2 text-sm font-semibold text-graphite-50"><Factory className="size-4 text-brand-orange" />Send to production</h2>
      <p className="mt-0.5 text-xs text-graphite-400">
        Creates a <b>draft BOM</b> from this layout (panels only — props and accessories stay on this page). On the BOM page: check it → <b>Approve</b> → <b>Release to production</b>; work orders are made automatically.
      </p>
      {designs.length === 0 ? (
        <p className="mt-2 text-xs text-graphite-500">No design yet. Create one under <Link href="/projects" className="text-brand-orange hover:underline">Projects &amp; designs</Link>, then come back.</p>
      ) : (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <select value={designId} onChange={(e) => setDesignId(e.target.value)} className="min-w-64 rounded border border-graphite-700 bg-graphite-950 px-2 py-1.5 text-sm text-graphite-100">
            {designs.map((d) => <option key={d.id} value={d.id}>{d.code}{d.project ? ` · ${d.project}` : ""}</option>)}
          </select>
          <button type="button" onClick={go} disabled={pending || !designId}
            className="inline-flex items-center gap-2 rounded-md bg-brand-orange px-3 py-2 text-xs font-medium text-white hover:opacity-90 disabled:opacity-50">
            {pending ? <Loader2 className="size-3.5 animate-spin" /> : null}Create BOM for production
          </button>
        </div>
      )}
      {err ? <p className="mt-2 text-xs text-signal-red">{err}</p> : null}
    </section>
  );
}
