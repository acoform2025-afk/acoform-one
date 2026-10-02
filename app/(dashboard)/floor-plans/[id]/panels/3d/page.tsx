import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { buildZones, runPanels, type PanelQuery } from "@/lib/floor-plans/run-panels";
import { buildScene3 } from "@/lib/floor-plans/scene3d";
import { Viewer3D } from "./viewer";

export const metadata = { title: "3D model" };
export const dynamic = "force-dynamic";

export default async function Model3DPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<PanelQuery> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const q = await searchParams;
  const supabase = await createClient();
  const r = await runPanels(supabase, id, q);
  if (!r) notFound();
  const back = <Link href={`/floor-plans/${id}/panels`} className="text-xs text-graphite-500 hover:text-graphite-300">← Panel layout &amp; BOM</Link>;
  if (r.error || !r.inp || !r.shell) return <div className="fade-in">{back}<p className="mt-4 text-sm text-signal-amber">{r.error ?? "Measure and save this plan first."}</p></div>;
  const zones = buildZones(r.inp, r.catalog);
  const scene = buildScene3({
    zoneWalls: r.inp.zoneWalls, zoneGaps: r.inp.zoneGaps, decks: r.inp.decks, zones, faces: r.result.faces, mpp: r.shell.mpp,
    floorHeight: Number(r.t.params.floorHeight) || 3, slabMm: Number(r.t.params.slabMm) || 150, stdHeight: r.opt.stdHeight, beamDepthMm: Number(r.t.params.beamDepthMm) || 600,
  });
  return (
    <div className="fade-in">
      {back}
      <h1 className="mt-1 text-lg font-semibold text-graphite-50">3D model — typical floor</h1>
      <p className="mb-3 text-xs text-graphite-400">{r.plan.name} · clear height {Math.round(scene.H * 1000)} mm · {scene.stats.wall} wall panels · {scene.stats.deck} deck panels ({zones.length} zones) · {scene.stats.special} special pieces</p>
      <Viewer3D scene={scene} />
    </div>
  );
}
