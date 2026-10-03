import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { runPanels, type PanelQuery } from "@/lib/floor-plans/run-panels";
import { checkLayout } from "@/lib/floor-plans/check-run";
import { buildScene3 } from "@/lib/floor-plans/scene3d";
import { Viewer3D } from "./viewer";

export const metadata = { title: "3D model" };
export const dynamic = "force-dynamic";

export default async function Model3DPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<PanelQuery & { focus?: string }> }) {
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
  const scene = buildScene3({
    zoneWalls: r.inp.zoneWalls, zoneGaps: r.inp.zoneGaps, decks: r.inp.decks, zones, faces: r.result.faces, mpp: r.shell.mpp,
    floorHeight: Number(r.t.params.floorHeight) || 3, slabMm: Number(r.t.params.slabMm) || 150, stdHeight: r.opt.stdHeight, beamDepthMm: Number(r.t.params.beamDepthMm) || 600,
    cols: r.inp.zoneCols, beams3: r.inp.zoneBeam3, stairs: r.inp.zoneStairs,
    stairGeo: r.inp.stairs, kickerMm: r.layoutRules?.kickerMm ?? 0, scMm: r.layoutRules ? [r.layoutRules.soffitCornerW, r.layoutRules.soffitCornerLeg] : undefined, icMm: r.layoutRules?.internalCorner, ecMm: r.layoutRules?.externalCorner,
  });
  scene.issues = ck.check.issues.filter((i) => i.at).map((i) => ({ id: i.id, sev: i.sev, text: `${i.where}: ${i.detail}`, at: [Math.round(i.at![0] * 1000) / 1000, Math.round(i.at![1] * 1000) / 1000], y: i.z ?? scene.H }));
  const qs = new URLSearchParams({ ...(q.h ? { h: q.h } : {}), ...(q.kg ? { kg: q.kg } : {}), ...(q.prop ? { prop: q.prop } : {}) }).toString();
  return (
    <div className="fade-in">
      {back}
      <h1 className="mt-1 text-lg font-semibold text-graphite-50">3D model — typical floor</h1>
      <p className="mb-3 text-xs text-graphite-400">{r.plan.name} · clear height {Math.round(scene.H * 1000)} mm · {scene.stats.wall} wall panels · {scene.stats.deck} deck panels ({zones.length} zones) · {scene.stats.special} special pieces · design check: <Link href={`/floor-plans/${id}/panels/check?${qs}`} className={ck.check.errors ? "text-signal-red underline" : "text-signal-green underline"}>{ck.check.errors} errors, {ck.check.warnings} warnings</Link></p>
      <Viewer3D scene={scene} focus={q.focus} />
    </div>
  );
}
