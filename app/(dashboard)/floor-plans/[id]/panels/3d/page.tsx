import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { runPanels, type PanelQuery } from "@/lib/floor-plans/run-panels";
import { checkLayout } from "@/lib/floor-plans/check-run";
import type { Scene3 } from "@/lib/floor-plans/scene3d";
import { sceneOf, type Ran } from "@/lib/floor-plans/scene-of";
import { groupLevels, levelRank, type Building } from "@/lib/floor-plans/building";
import { Viewer3D, type Stack3 } from "./viewer";

export const metadata = { title: "3D model" };
export const dynamic = "force-dynamic";

export default async function Model3DPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<PanelQuery & { focus?: string; building?: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const q = await searchParams;
  const supabase = await createClient();
  const r = await runPanels(supabase, id, q);
  if (!r) notFound();
  const back = <Link href={`/floor-plans/${id}/panels`} className="text-xs text-graphite-500 hover:text-graphite-300">← Panel layout &amp; BOM</Link>;
  if (r.error || !r.inp || !r.shell) return <div className="fade-in">{back}<p className="mt-4 text-sm text-signal-amber">{r.error ?? "Measure and save this plan first."}</p></div>;
  const ck = checkLayout(r)!;
  const zones = ck.zones;
  const scene = sceneOf(r)!;
  const building = (r.t as { building?: Building }).building;
  const whole = q.building === "1" && !!building?.levels.length;
  const qs = new URLSearchParams({ ...(q.h ? { h: q.h } : {}), ...(q.kg ? { kg: q.kg } : {}), ...(q.prop ? { prop: q.prop } : {}) }).toString();

  // the whole building: every formed level stacked at its real height — the typical plan for the typical floors, a
  // level's own plan where one is measured, a faint block for levels not formed with this set
  let stack: Stack3 | null = null;
  const missingOwn: string[] = [];
  if (whole && building) {
    const typicalMm = Math.round((Number(r.t.params.floorHeight) || 3) * 1000);
    const scenes: Scene3[] = [scene];
    const key = new Map<string, number>();
    const own = new Map<string, Ran | null>();
    const levels: Stack3["levels"] = [];
    const ownIdx = new Set<number>();
    let y = 0;
    const sorted = [...building.levels].sort((a, b) => levelRank(a) - levelRank(b));
    for (const l of sorted) {
      const h = (l.floorMm ?? typicalMm) / 1000;
      let idx: number | null = null;
      if (l.use === "own" && l.planId && /^[0-9a-f-]{36}$/i.test(l.planId)) {
        if (!own.has(l.planId)) own.set(l.planId, await runPanels(supabase, l.planId, q));
        const o = own.get(l.planId);
        const k = `own|${l.planId}`;
        if (o && !o.error && o.inp && o.shell) { if (!key.has(k)) { const s = sceneOf(o); if (s) { key.set(k, scenes.length); ownIdx.add(scenes.length); scenes.push(s); } } idx = key.get(k) ?? null; }
        if (idx == null) missingOwn.push(l.name);
      }
      // the typical layout stands for every other formed level; a taller / lower level shows it stretched to its own
      // height (one layout only — building a fresh layout per height is too heavy for the server)
      if (idx == null && l.use !== "none") idx = 0;
      if (l.kind === "headroom" && l.use === "none") continue;        // nothing to draw above the terrace
      levels.push({ key: l.key, name: l.name, kind: l.kind, y0: y, h, sceneIdx: idx, own: idx != null && ownIdx.has(idx) });
      y += h;
    }
    stack = { levels, scenes };
  }
  const groups = building ? groupLevels(building.levels) : [];
  return (
    <div className="fade-in">
      {back}
      <div className="mt-1 flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-lg font-semibold text-graphite-50">3D model — {whole ? "whole building" : "typical floor"}</h1>
        <a href={`/floor-plans/${id}/panels/render?${qs}`} target="_blank" rel="noreferrer" className="rounded-md border border-graphite-700 px-2.5 py-1.5 text-xs text-graphite-200 hover:bg-graphite-800">3D views (PDF)</a>
        <a href={`/floor-plans/${id}/panels/stairs?${qs}`} target="_blank" rel="noreferrer" className="rounded-md border border-graphite-700 px-2.5 py-1.5 text-xs text-graphite-200 hover:bg-graphite-800">Staircase assembly drawing (PDF)</a>
        {building?.levels.length ? (
          <div className="flex items-center gap-1 text-xs">
            <Link href={`/floor-plans/${id}/panels/3d?${qs}`} className={`rounded-md px-2.5 py-1.5 ${!whole ? "bg-brand-orange text-white" : "border border-graphite-700 text-graphite-300 hover:bg-graphite-800"}`}>Typical floor</Link>
            <Link href={`/floor-plans/${id}/panels/3d?${qs}&building=1`} className={`rounded-md px-2.5 py-1.5 ${whole ? "bg-brand-orange text-white" : "border border-graphite-700 text-graphite-300 hover:bg-graphite-800"}`}>Whole building ({building.levels.filter((l) => l.use !== "none").length} levels)</Link>
          </div>
        ) : null}
      </div>
      <p className="mb-3 text-xs text-graphite-400">
        {r.plan.name} · clear height {Math.round(scene.H * 1000)} mm · {scene.stats.wall} wall panels · {scene.stats.deck} deck panels ({zones.length} zones) · {scene.stats.special} special pieces · design check: <Link href={`/floor-plans/${id}/panels/check?${qs}`} className={ck.check.errors ? "text-signal-red underline" : "text-signal-green underline"}>{ck.check.errors} errors, {ck.check.warnings} warnings</Link>
        {whole && stack ? <> · {stack.levels.length} levels, {(stack.levels.reduce((s, l) => s + l.h, 0)).toFixed(1)} m tall · {groups.filter((g) => g.use !== "none").map((g) => `${g.name}${g.count > 1 ? ` (${g.count})` : ""}`).join(", ")}</> : null}
      </p>
      {whole && missingOwn.length ? <p className="mb-2 text-[11px] text-signal-amber">{missingOwn.join(", ")}: own plan not measured yet — shown with the typical floor.</p> : null}
      <Viewer3D scene={scene} focus={q.focus} stack={stack ?? undefined} />
    </div>
  );
}
