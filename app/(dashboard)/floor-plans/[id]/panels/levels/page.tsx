import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { runPanels, type PanelQuery } from "@/lib/floor-plans/run-panels";
import { groupLevels, type Building } from "@/lib/floor-plans/building";
import { levelSets } from "@/lib/floor-plans/level-sets";

export const metadata = { title: "Set per level" };
export const dynamic = "force-dynamic";
const n0 = (v: number) => v.toLocaleString("en-IN", { maximumFractionDigits: 0 });

/**
 * Set per level: the typical floor's pieces against every level that has its own drawing — what the set must carry
 * extra for those floors, what stays idle there, and the full set (the most of each code any level needs).
 */
export default async function LevelSetsPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<PanelQuery & { all?: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const q = await searchParams;
  const supabase = await createClient();
  const r = await runPanels(supabase, id, q);
  if (!r) notFound();
  const qs = r.opt ? new URLSearchParams({ h: String(r.opt.stdHeight), kg: String(r.opt.kgPerM2), prop: String(r.opt.propSpacing) }).toString() : "";
  const back = <Link href={`/floor-plans/${id}/panels?${qs}`} className="text-xs text-graphite-500 hover:text-graphite-300">← Panel layout &amp; BOM</Link>;
  if (r.error || !r.result) return <div className="fade-in">{back}<p className="mt-4 text-sm text-signal-amber">{r.error}</p></div>;
  const building = (r.t as { building?: Building }).building;
  const groups = building ? groupLevels(building.levels) : [];
  // one column per own plan (floors 2, 6, 10 … share one)
  const byPlan = new Map<string, string[]>();
  for (const l of building?.levels ?? []) if (l.use === "own" && l.planId && /^[0-9a-f-]{36}$/i.test(l.planId)) byPlan.set(l.planId, [...(byPlan.get(l.planId) ?? []), l.name]);
  const own: { id: string; name: string; floors: string[]; bom: typeof r.result.bom }[] = [];
  const failed: string[] = [];
  for (const [pid, floors] of byPlan) {
    const o = await runPanels(supabase, pid, q);
    if (o && !o.error && o.result) own.push({ id: pid, name: o.plan.name.replace(`${r.plan.name} — `, ""), floors, bom: o.result.bom });
    else failed.push(floors.join(", "));
  }
  const noPlan = groups.filter((g) => g.use === "own" && !g.planId);
  const typicalFloors = groups.filter((g) => g.use === "typical").map((g) => g.name);
  const s = levelSets(r.result.bom, own);
  const rows = q.all === "1" ? s.rows : s.rows.filter((x) => x.levels.some((v) => v !== x.typical));
  return (
    <div className="fade-in max-w-6xl">
      {back}
      <div className="mt-2 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-graphite-50">Set per level — typical + the difference</h1>
          <p className="mt-1 max-w-3xl text-sm text-graphite-400">One set is reused floor by floor. A floor with its own drawing needs the typical set plus the pieces it has more of; the full set is the most of each code any level needs.</p>
        </div>
        <div className="flex items-center gap-2 text-xs">
          <Link href={`/floor-plans/${id}/panels/levels?${qs}${q.all === "1" ? "" : "&all=1"}`} className="rounded-md border border-graphite-700 px-2.5 py-1.5 text-graphite-200 hover:bg-graphite-800">{q.all === "1" ? "Only the differences" : "Every code"}</Link>
          <Link href={`/floor-plans/${id}/panels/3d?${qs}&building=1`} className="rounded-md bg-signal-green px-3 py-1.5 font-medium text-white hover:opacity-90">Whole building 3D</Link>
        </div>
      </div>
      {!building?.levels.length ? <p className="mt-3 rounded-md border border-signal-amber/30 bg-signal-amber/10 px-3 py-2 text-xs text-signal-amber">The building&apos;s levels are not read yet — open the plan and use &ldquo;Whole building → Read levels again&rdquo;.</p> : null}
      {noPlan.length ? <p className="mt-3 rounded-md border border-signal-amber/30 bg-signal-amber/10 px-3 py-2 text-xs text-signal-amber">{noPlan.map((g) => g.name).join(", ")}: own drawing in the file but no plan yet — on the plan page, Whole building → &ldquo;Make the plans of all levels with their own drawing&rdquo;. Until then these floors are counted as the typical floor.</p> : null}
      {failed.length ? <p className="mt-3 rounded-md border border-signal-red/30 bg-signal-red/10 px-3 py-2 text-xs text-signal-red">Could not read the plan of: {failed.join("; ")}.</p> : null}
      <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-3">
        <div className="rounded-lg border border-graphite-800 bg-graphite-900 p-3"><p className="text-[11px] uppercase tracking-wide text-graphite-500">Typical set{typicalFloors.length ? ` (${typicalFloors.join(", ")})` : ""}</p><p className="mt-1 font-mono text-lg font-semibold text-graphite-50">{n0(s.typ.pcs)} pcs · {n0(s.typ.kg)} kg</p></div>
        <div className="rounded-lg border border-graphite-800 bg-graphite-900 p-3"><p className="text-[11px] uppercase tracking-wide text-graphite-500">Extra for the other floors</p><p className="mt-1 font-mono text-lg font-semibold text-brand-orange">+{n0(s.extra.pcs)} pcs · {n0(s.extra.kg)} kg</p></div>
        <div className="rounded-lg border border-graphite-800 bg-graphite-900 p-3"><p className="text-[11px] uppercase tracking-wide text-graphite-500">Full set (every level)</p><p className="mt-1 font-mono text-lg font-semibold text-graphite-50">{n0(s.full.pcs)} pcs · {n0(s.full.kg)} kg</p></div>
      </div>
      {s.cols.length ? (
        <div className="mt-4 grid grid-cols-1 gap-2 md:grid-cols-2 lg:grid-cols-3">
          {s.cols.map((c) => (
            <div key={c.id} className="rounded-md border border-graphite-800 p-2 text-xs">
              <Link href={`/floor-plans/${c.id}/panels?${qs}`} className="font-medium text-graphite-100 hover:underline">{c.name}</Link>
              <div className="text-graphite-500">{c.floors.join(", ")}</div>
              <div className="mt-1 text-graphite-300"><span className="text-brand-orange">+{n0(c.extraPcs)} pcs ({n0(c.extraKg)} kg)</span> over the typical set · {n0(c.idlePcs)} pcs idle on this floor</div>
            </div>
          ))}
        </div>
      ) : <p className="mt-4 text-sm text-graphite-400">No level has its own measured plan yet: every formed level is counted as the typical floor.</p>}
      {s.cols.length ? (
        <div className="mt-4 overflow-x-auto rounded-lg border border-graphite-800">
          <table className="w-full min-w-[640px] text-left text-xs">
            <thead className="bg-graphite-900 uppercase tracking-wide text-graphite-500">
              <tr><th className="px-2 py-2">Code</th><th className="px-2 py-2">Piece</th><th className="px-2 py-2 text-right">Typical</th>{s.cols.map((c) => <th key={c.id} className="px-2 py-2 text-right" title={c.floors.join(", ")}>{c.name.length > 22 ? c.name.slice(0, 20) + "…" : c.name}</th>)}<th className="px-2 py-2 text-right">Full set</th><th className="px-2 py-2 text-right">Extra</th></tr>
            </thead>
            <tbody>
              {rows.map((x) => (
                <tr key={x.code} className="border-t border-graphite-800">
                  <td className="px-2 py-1 font-mono text-graphite-100">{x.code}{x.custom ? <span className="ml-1 text-[9px] text-signal-amber">special</span> : null}</td>
                  <td className="px-2 py-1 text-graphite-400">{x.description}</td>
                  <td className="px-2 py-1 text-right font-mono text-graphite-300">{x.typical}</td>
                  {x.levels.map((v, i) => <td key={i} className={`px-2 py-1 text-right font-mono ${v > x.typical ? "text-brand-orange" : v < x.typical ? "text-graphite-500" : "text-graphite-300"}`}>{v}</td>)}
                  <td className="px-2 py-1 text-right font-mono text-graphite-100">{x.full}</td>
                  <td className="px-2 py-1 text-right font-mono text-brand-orange">{x.full > x.typical ? `+${x.full - x.typical}` : ""}</td>
                </tr>
              ))}
              {!rows.length ? <tr><td colSpan={5 + s.cols.length} className="px-2 py-3 text-graphite-400">No difference: every level needs the same pieces as the typical floor.</td></tr> : null}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}
