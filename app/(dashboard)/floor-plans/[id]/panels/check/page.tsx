import Link from "next/link";
import { notFound } from "next/navigation";
import { Download } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { runPanels, type PanelQuery } from "@/lib/floor-plans/run-panels";
import { checkLayout } from "@/lib/floor-plans/check-run";

export const metadata = { title: "Design check" };
export const dynamic = "force-dynamic";

const HOW: Record<string, string> = {
  model: "Is the drawing complete — walls, slab, floor height?",
  "face-fit": "Do the panels on every wall face add up to the face length? Fillers too narrow?",
  "wall-clash": "Do wall panels of two faces need the same space (gap between walls too narrow, crossing at a corner)?",
  "wall-in-concrete": "Is any wall panel placed inside the concrete (broken or doubled wall outline)?",
  "deck-on-wall": "Does any deck panel sit on top of a wall?",
  "deck-on-beam": "Does any deck panel run across a beam over a door / window?",
  "deck-overlap": "Do any two deck panels overlap?",
  uncovered: "How much slab in each zone is left for special deck panels / plywood?",
  "pin-hole": "Can the special panels be pinned to the standard panels (hole grid, narrow pieces)?",
};

export default async function CheckPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<PanelQuery> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const q = await searchParams;
  const supabase = await createClient();
  const r = await runPanels(supabase, id, q);
  if (!r) notFound();
  const back = <Link href={`/floor-plans/${id}/panels?${new URLSearchParams(q as Record<string, string>).toString()}`} className="text-xs text-graphite-500 hover:text-graphite-300">← Panel layout &amp; BOM</Link>;
  const ck = r.error ? null : checkLayout(r);
  if (!ck) return <div className="fade-in">{back}<p className="mt-4 text-sm text-signal-amber">{r.error ?? "Measure and save this plan first."}</p></div>;
  const { check } = ck;
  const opt = r.opt!;
  const qs = new URLSearchParams({ h: String(opt.stdHeight), kg: String(opt.kgPerM2), prop: String(opt.propSpacing) }).toString();
  return (
    <div className="fade-in max-w-6xl">
      {back}
      <div className="mt-2 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-graphite-50">Design check</h1>
          <p className="mt-1 max-w-3xl text-sm text-graphite-400">Model review and clash check of the panel layout of <b>{r.plan.name}</b>: {check.checked.faces} wall faces, {check.checked.deck} deck panels in {check.checked.zones} zones and {check.checked.specials} special panel types checked.</p>
        </div>
        <div className="flex gap-2">
          <Link href={`/floor-plans/${id}/panels/3d?${qs}`} className="rounded-md bg-signal-green px-3 py-2 text-xs font-medium text-white hover:opacity-90">Show in 3D</Link>
          <a href={`/floor-plans/${id}/panels/check-list?${qs}`} className="inline-flex items-center gap-1.5 rounded-md border border-graphite-700 px-3 py-2 text-xs font-medium text-graphite-200 hover:border-brand-orange"><Download className="size-3.5" />Check list (Excel)</a>
        </div>
      </div>

      <div className={`mt-4 rounded-lg border p-4 ${check.errors ? "border-signal-red/40 bg-signal-red/10" : "border-signal-green/40 bg-signal-green/10"}`}>
        <p className={`text-lg font-semibold ${check.errors ? "text-signal-red" : "text-signal-green"}`}>{check.errors ? `${check.errors} error(s) to fix` : "No clashes found"}{check.warnings ? ` · ${check.warnings} warning(s) to review` : ""}</p>
        <p className="mt-0.5 text-xs text-graphite-400">Errors must be fixed before production (change the drawing or the layout). Warnings need a decision by the designer.</p>
      </div>

      <div className="mt-4 overflow-x-auto rounded-lg border border-graphite-800">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead className="bg-graphite-900 text-xs uppercase tracking-wide text-graphite-500"><tr><th className="px-4 py-2">Check</th><th className="px-4 py-2">What it looks for</th><th className="px-4 py-2 text-right">Errors</th><th className="px-4 py-2 text-right">Warnings</th></tr></thead>
          <tbody className="divide-y divide-graphite-800">
            {check.summary.map((s) => (
              <tr key={s.kind} className="bg-graphite-950">
                <td className="px-4 py-2 text-xs font-medium text-graphite-200">{s.errors || s.warnings ? <a href={`#${s.kind}`} className="hover:underline">{s.label}</a> : s.label}</td>
                <td className="px-4 py-2 text-xs text-graphite-400">{HOW[s.kind]}</td>
                <td className={`px-4 py-2 text-right font-mono text-xs ${s.errors ? "text-signal-red" : "text-graphite-500"}`}>{s.errors || "✓"}</td>
                <td className={`px-4 py-2 text-right font-mono text-xs ${s.warnings ? "text-signal-amber" : "text-graphite-500"}`}>{s.warnings || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {check.summary.filter((s) => s.errors || s.warnings).map((s) => {
        const list = check.issues.filter((i) => i.kind === s.kind);
        return (
          <section key={s.kind} id={s.kind} className="mt-5">
            <h2 className="text-sm font-semibold text-graphite-100">{s.label} <span className="font-normal text-graphite-500">({list.length})</span></h2>
            <div className="mt-2 overflow-x-auto rounded-lg border border-graphite-800">
              <table className="w-full min-w-[640px] text-left text-sm">
                <tbody className="divide-y divide-graphite-800">
                  {list.map((i) => (
                    <tr key={i.id} className="bg-graphite-950">
                      <td className="w-16 px-3 py-2 font-mono text-[11px] text-graphite-500">{i.id}</td>
                      <td className="w-20 px-3 py-2"><span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${i.sev === "error" ? "bg-signal-red/15 text-signal-red" : "bg-signal-amber/15 text-signal-amber"}`}>{i.sev === "error" ? "ERROR" : "WARNING"}</span></td>
                      <td className="px-3 py-2 font-mono text-xs text-graphite-200">{i.where}</td>
                      <td className="px-3 py-2 text-xs text-graphite-400">{i.detail}</td>
                      <td className="w-24 px-3 py-2 text-right">{i.at ? <Link href={`/floor-plans/${id}/panels/3d?${qs}&focus=${i.id}`} className="text-xs text-aluminium-300 hover:underline">See in 3D →</Link> : null}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        );
      })}
    </div>
  );
}
