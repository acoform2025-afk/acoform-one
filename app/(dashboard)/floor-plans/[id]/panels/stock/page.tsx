import Link from "next/link";
import { notFound } from "next/navigation";
import { Download } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { runPanels, type PanelQuery } from "@/lib/floor-plans/run-panels";
import { stockCheck } from "@/lib/floor-plans/stock";

export const metadata = { title: "Stock check" };
export const dynamic = "force-dynamic";
const n0 = (v: number) => v.toLocaleString("en-IN", { maximumFractionDigits: 0 });

export default async function StockPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<PanelQuery & { only?: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const q = await searchParams;
  const supabase = await createClient();
  const r = await runPanels(supabase, id, q);
  if (!r) notFound();
  const qs = r.opt ? new URLSearchParams({ h: String(r.opt.stdHeight), kg: String(r.opt.kgPerM2), prop: String(r.opt.propSpacing) }).toString() : "";
  const back = <Link href={`/floor-plans/${id}/panels?${qs}`} className="text-xs text-graphite-500 hover:text-graphite-300">← Panel layout &amp; BOM</Link>;
  if (r.error) return <div className="fade-in">{back}<p className="mt-4 text-sm text-signal-amber">{r.error}</p></div>;
  const s = await stockCheck(supabase, r.result.bom);
  const rows = q.only === "short" ? s.rows.filter((x) => x.toMake > 0) : s.rows;
  return (
    <div className="fade-in max-w-6xl">
      {back}
      <div className="mt-2 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-graphite-50">Stock check — stock first</h1>
          <p className="mt-1 max-w-3xl text-sm text-graphite-400">Panels this layout needs against the panels in the yard (Inventory, status “in stock”). Send from stock first, produce only the shortfall.</p>
        </div>
        <a href={`/floor-plans/${id}/panels/stock-list?${qs}`} className="inline-flex items-center gap-1.5 rounded-md bg-brand-orange px-3 py-2 text-xs font-medium text-white hover:opacity-90"><Download className="size-3.5" />Production shortfall (Excel)</a>
      </div>
      {s.trackedPanels === 0 ? <p className="mt-3 rounded-md border border-signal-amber/30 bg-signal-amber/10 px-3 py-2 text-xs text-signal-amber">No panels are in Inventory yet — everything is shown as “to make”. Panels appear in stock after production QC (QR code).</p> : null}
      <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-3">
        {[["Needed", s.totals.need, s.totals.kgNeed], ["From stock", s.totals.fromStock, s.totals.kgFromStock], ["To produce", s.totals.toMake, s.totals.kgToMake]].map(([k, n, kg]) => (
          <div key={k as string} className="rounded-lg border border-graphite-800 bg-graphite-900 p-3">
            <p className="text-[11px] uppercase tracking-wide text-graphite-500">{k}</p>
            <p className="mt-1 font-mono text-lg font-semibold text-graphite-50">{n0(n as number)} pcs · {n0(kg as number)} kg</p>
          </div>
        ))}
      </div>
      <div className="mt-3 flex gap-2 text-xs">
        <Link href={`/floor-plans/${id}/panels/stock?${qs}`} className={`rounded-md px-2.5 py-1.5 ${q.only !== "short" ? "bg-brand-orange text-white" : "border border-graphite-700 text-graphite-300"}`}>All types</Link>
        <Link href={`/floor-plans/${id}/panels/stock?${qs}&only=short`} className={`rounded-md px-2.5 py-1.5 ${q.only === "short" ? "bg-brand-orange text-white" : "border border-graphite-700 text-graphite-300"}`}>Only shortfall</Link>
      </div>
      <div className="mt-3 overflow-x-auto rounded-lg border border-graphite-800">
        <table className="w-full min-w-[760px] text-left text-sm">
          <thead className="bg-graphite-900 text-xs uppercase tracking-wide text-graphite-500"><tr><th className="px-4 py-2">Code</th><th className="px-4 py-2">Description</th><th className="px-4 py-2 text-right">Need</th><th className="px-4 py-2 text-right">In stock</th><th className="px-4 py-2 text-right">At sites</th><th className="px-4 py-2 text-right">From stock</th><th className="px-4 py-2 text-right">To produce</th></tr></thead>
          <tbody className="divide-y divide-graphite-800">
            {rows.map((x) => (
              <tr key={x.code} className="bg-graphite-950">
                <td className="px-4 py-2 font-mono text-xs text-graphite-200">{x.code}{x.custom ? <span className="ml-1.5 rounded bg-signal-amber/15 px-1 text-[10px] text-signal-amber">special</span> : null}</td>
                <td className="px-4 py-2 text-xs text-graphite-400">{x.description}</td>
                <td className="px-4 py-2 text-right font-mono text-xs text-graphite-100">{n0(x.need)}</td>
                <td className="px-4 py-2 text-right font-mono text-xs text-graphite-300">{n0(x.inStock)}</td>
                <td className="px-4 py-2 text-right font-mono text-xs text-graphite-500">{x.onSite ? n0(x.onSite) : "—"}</td>
                <td className="px-4 py-2 text-right font-mono text-xs text-signal-green">{x.fromStock ? n0(x.fromStock) : "—"}</td>
                <td className={`px-4 py-2 text-right font-mono text-xs ${x.toMake ? "text-signal-amber" : "text-graphite-500"}`}>{x.toMake ? n0(x.toMake) : "✓"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
