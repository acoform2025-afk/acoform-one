import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { runPanels, type PanelQuery } from "@/lib/floor-plans/run-panels";
import { partQty } from "@/lib/design-engine/parts3d";
import { PRESETS } from "@/lib/design-engine/layout-rules";
import { ComponentsCatalog } from "./catalog";

export const metadata = { title: "Components & accessories" };
export const dynamic = "force-dynamic";

export default async function ComponentsPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<PanelQuery> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const q = await searchParams;
  const supabase = await createClient();
  const r = await runPanels(supabase, id, q);
  if (!r) notFound();
  const ok = !r.error && "result" in r && r.result;
  const qty = ok ? partQty(r.result.bom) : {};
  const system = ok ? PRESETS[r.layoutRules?.system ?? "acoform"].label : "—";
  const qs = new URLSearchParams({ ...(q.h ? { h: q.h } : {}), ...(q.kg ? { kg: q.kg } : {}), ...(q.prop ? { prop: q.prop } : {}) }).toString();
  return (
    <div className="fade-in">
      <Link href={`/floor-plans/${id}/panels/3d?${qs}`} className="text-xs text-graphite-500 hover:text-graphite-300">← 3D model</Link>
      <div className="mt-1 flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-lg font-semibold text-graphite-50">Components &amp; accessories — 3D</h1>
        <a href={`/floor-plans/${id}/panels/components-pdf?${qs}`} target="_blank" rel="noreferrer" className="rounded-md border border-graphite-700 px-2.5 py-1.5 text-xs text-graphite-200 hover:bg-graphite-800">Components catalogue (PDF)</a>
      </div>
      <p className="mb-3 text-xs text-graphite-400">{r.plan.name} · every piece of the aluminium formwork system as a 3D model, with typical sizes and the quantity in this project&apos;s parts list.</p>
      <ComponentsCatalog qty={qty} tieSystem={system} />
    </div>
  );
}
