import { createClient } from "@/lib/supabase/server";
import { runPanels } from "@/lib/floor-plans/run-panels";
import { buildPackage } from "@/lib/floor-plans/package-build";
import { zip } from "@/lib/floor-plans/package";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const safe = (s: string) => s.replace(/[^\w.\- ]+/g, "_").slice(0, 80);

/** One Excel list of the design package (?file=main|numbering|production|walers|accessories|packing|check), or ?file=all → ZIP. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new Response("Not found", { status: 404 });
  const url = new URL(req.url);
  const q = { h: url.searchParams.get("h") ?? undefined, kg: url.searchParams.get("kg") ?? undefined, prop: url.searchParams.get("prop") ?? undefined };
  const areas = Math.max(1, Math.min(12, Number(url.searchParams.get("areas")) || 4));
  const r = await runPanels(await createClient(), id, q);
  if (!r) return new Response("Floor plan not found", { status: 404 });
  const files = buildPackage(r, areas);
  if (!files) return new Response(r.error ?? "Measure and save this plan first.", { status: 400 });
  const which = url.searchParams.get("file") ?? "all";
  const base = safe(r.plan.name);
  if (which === "all") {
    const enc = new TextEncoder();
    const z = zip(files.map((f) => ({ name: `${safe(f.name)}.csv`, data: enc.encode(f.csv) })));
    return new Response(new Uint8Array(z), { headers: { "Content-Type": "application/zip", "Content-Disposition": `attachment; filename="Design package lists_${base}.zip"`, "Cache-Control": "no-store" } });
  }
  const f = files.find((x) => x.key === which);
  if (!f) return new Response("Unknown list", { status: 404 });
  return new Response(f.csv, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${safe(f.name)}_${base}.csv"`, "Cache-Control": "no-store" } });
}
