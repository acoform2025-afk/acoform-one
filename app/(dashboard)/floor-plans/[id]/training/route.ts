import { createClient } from "@/lib/supabase/server";
import { loadModel, runPanels } from "@/lib/floor-plans/run-panels";
import { trainingRecord, type Approved } from "@/lib/floor-plans/reading-record";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const safe = (s: string) => s.replace(/[^\w.\- ]+/g, "_").slice(0, 80);

/**
 * Training record of a plan (JSON): the drawing's primitives in plan metres with layer, role and the reader's
 * keep / drop decision, the structure read from them, the user's answers and the approval. Approved records are the
 * labelled corpus for the drawing-reading model; the file is also what a reading looked like at a point in time.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new Response("Not found", { status: 404 });
  const supabase = await createClient();
  const r = await runPanels(supabase, id, {});
  if (!r) return new Response("Floor plan not found", { status: 404 });
  if (r.error || !r.inp || !r.t.dxf) return new Response(r.error ?? "This plan has no drawing to export.", { status: 400 });
  const model = await loadModel(supabase, r.plan);
  if (!model) return new Response("The drawing file could not be read.", { status: 400 });
  const inp = r.inp, frame = inp.readFrame;
  if (!frame) return new Response("The plan has no drawing frame.", { status: 400 });
  const mpp = r.shell?.mpp ?? 0, m = (p: [number, number]): [number, number] => [p[0] * mpp, p[1] * mpp];   // face geometry is in plan px
  const dxf = (r.plan.takeoff as { dxf?: { approved?: Approved | null; includeM?: number[][]; excludeM?: number[][] } } | null)?.dxf ?? {};
  const rec = trainingRecord({
    plan: r.plan.name, approved: dxf.approved ?? null, units: r.t.dxf.units, floorHeightM: r.t.params.floorHeight, slabMm: r.t.params.slabMm,
    answers: { includeM: dxf.includeM ?? [], excludeM: dxf.excludeM ?? [] },
    paths: model.paths, roles: r.t.dxf.layerRoles ?? {}, texts: model.texts ?? [],
    toM: frame.toM, onFloor: frame.onFloor, inRegion: frame.inRegion,
    read: {
      walls: inp.zoneWalls, beams: inp.zoneBeams, columns: inp.zoneCols, slab: inp.decks.map((d) => d.pts), openings: inp.decks.flatMap((d) => d.holes),
      stairs: inp.zoneStairs.map((s) => [...s]),
      faces: r.result.faces.map((f) => ({ code: f.code, a: f.geo ? m(f.geo.a) : undefined, b: f.geo ? m(f.geo.b) : undefined, panels: f.panels, filler: f.filler, end: f.end })),
      zones: (r.zones ?? []).map((z) => ({ code: z.code, area: Math.round(z.area * 100) / 100, box: z.box.map((v) => Math.round(v * 1000) / 1000) })),
    },
  });
  return new Response(JSON.stringify(rec), { headers: { "Content-Type": "application/json; charset=utf-8", "Content-Disposition": `attachment; filename="${safe(r.plan.name)}_reading.json"` } });
}
