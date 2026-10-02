import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { runPanels } from "@/lib/floor-plans/run-panels";
import { designLines, learn, ISSUES, type SiteLine, type SiteReportRow } from "@/lib/floor-plans/site-learn";
import { PRESETS } from "@/lib/design-engine/layout-rules";
import { SiteReportForm } from "./site-report-form";
import { deleteSiteReport } from "./actions";

export const metadata = { title: "Site reports" };
export const dynamic = "force-dynamic";

export default async function SitePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const supabase = await createClient();
  const r = await runPanels(supabase, id, {});
  if (!r) notFound();
  const back = <Link href={`/floor-plans/${id}/panels`} className="text-xs text-graphite-500 hover:text-graphite-300">← Panel layout &amp; BOM</Link>;
  if (r.error || !r.result) return <div className="fade-in">{back}<p className="mt-4 text-sm text-signal-amber">{r.error ?? "Measure and save this plan first."}</p></div>;
  const design = designLines(r.result.bom);
  const { data } = await supabase.from("site_reports").select("id, floor_label, pour_date, cycle_days, system, lines, issues, notes, created_at, floor_plan_id").eq("floor_plan_id", id).order("created_at", { ascending: false }).limit(100);
  const reports = (data ?? []) as unknown as SiteReportRow[];
  const L = learn(reports);
  const system = r.layoutRules?.system ?? "acoform";
  const sum = (ls: SiteLine[], k: "short" | "extra" | "lost", kind: "family" | "acc") => ls.filter((l) => l.kind === kind).reduce((s, l) => s + (l[k] || 0), 0);
  return (
    <div className="fade-in mx-auto max-w-4xl">
      {back}
      <h1 className="mt-1 text-lg font-semibold text-graphite-50">Site reports — {r.plan.name}</h1>
      <p className="mb-4 text-xs text-graphite-400">After every pour, the site engineer notes what was different from the design. ACOFORM ONE adds up all reports and learns the real spare and loss needed ({PRESETS[system].label}). <Link href="/settings#site-learning" className="text-aluminium-300 hover:underline">See what the app has learned</Link></p>

      <SiteReportForm planId={id} system={system} design={design} />

      <h2 className="mt-6 text-sm font-semibold text-graphite-100">Reports for this plan ({reports.length})</h2>
      {reports.length ? (
        <>
          <div className="mt-2 grid gap-2 sm:grid-cols-4">
            <Stat label="Reports" v={String(L.reports)} />
            <Stat label="Average floor cycle" v={L.cycleDays ? `${L.cycleDays} days` : "—"} />
            <Stat label="Small-part loss" v={L.suggestLoss != null ? `${L.suggestLoss} %` : "—"} />
            <Stat label="Most frequent problem" v={L.issues[0]?.label ?? "none"} />
          </div>
          <div className="mt-3 overflow-x-auto rounded-lg border border-graphite-800">
            <table className="w-full min-w-[560px] text-sm">
              <thead className="bg-graphite-900 text-left text-xs text-graphite-500"><tr><th className="px-3 py-2 font-medium">Floor</th><th className="px-3 py-2 font-medium">Date</th><th className="px-3 py-2 text-right font-medium">Days</th><th className="px-3 py-2 text-right font-medium">Panels short</th><th className="px-3 py-2 text-right font-medium">Not used</th><th className="px-3 py-2 text-right font-medium">Parts lost</th><th className="px-3 py-2 font-medium">Problems</th><th /></tr></thead>
              <tbody>
                {reports.map((x) => (
                  <tr key={x.id} className="border-t border-graphite-800 align-top">
                    <td className="px-3 py-2 text-graphite-100">{x.floor_label}{x.notes ? <p className="mt-0.5 max-w-[16rem] text-xs text-graphite-500">{x.notes}</p> : null}</td>
                    <td className="px-3 py-2 text-graphite-300">{x.pour_date ? new Date(x.pour_date).toLocaleDateString("en-GB") : "—"}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-graphite-300">{x.cycle_days ?? "—"}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-graphite-300">{sum(x.lines ?? [], "short", "family")}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-graphite-300">{sum(x.lines ?? [], "extra", "family")}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-graphite-300">{sum(x.lines ?? [], "lost", "acc").toLocaleString("en-IN")}</td>
                    <td className="px-3 py-2 text-xs text-graphite-400">{(x.issues ?? []).map((k) => ISSUES.find((i) => i.key === k)?.label ?? k).join(", ") || "—"}</td>
                    <td className="px-3 py-2"><form action={deleteSiteReport}><input type="hidden" name="id" value={x.id} /><input type="hidden" name="plan" value={id} /><button className="text-xs text-graphite-500 hover:text-signal-red">Delete</button></form></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : <p className="mt-2 text-sm text-graphite-500">No site reports yet. Add the first one after the first pour.</p>}
    </div>
  );
}

function Stat({ label, v }: { label: string; v: string }) {
  return <div className="rounded-lg border border-graphite-800 bg-graphite-900 px-3 py-2"><p className="text-[11px] uppercase tracking-wide text-graphite-500">{label}</p><p className="mt-0.5 text-sm font-semibold text-graphite-100">{v}</p></div>;
}
