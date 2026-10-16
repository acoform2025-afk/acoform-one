import { createClient } from "@/lib/supabase/server";
import { runPanels } from "@/lib/floor-plans/run-panels";
import { sceneOf } from "@/lib/floor-plans/scene-of";
import { sceneToIfc } from "@/lib/export/ifc";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const safe = (s: string) => s.replace(/[^\w.\- ]+/g, "_").slice(0, 80);

/** The typical floor's formwork (every panel with its code) plus the concrete as an IFC4 file — opens in Revit. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new Response("Not found", { status: 404 });
  const url = new URL(req.url);
  const q = { h: url.searchParams.get("h") ?? undefined, kg: url.searchParams.get("kg") ?? undefined, prop: url.searchParams.get("prop") ?? undefined };
  const supabase = await createClient();
  const r = await runPanels(supabase, id, q);
  if (!r) return new Response("Floor plan not found", { status: 404 });
  if (r.error || !r.inp || !r.shell || !r.result) return new Response(r.error ?? "Measure and save this plan first.", { status: 400 });
  const scene = sceneOf(r);
  if (!scene) return new Response("Could not build the floor model.", { status: 400 });
  const { data: company } = await supabase.from("tenants").select("company_name").eq("id", r.plan.tenant_id).maybeSingle();
  const text = sceneToIfc(scene, { project: r.lead?.project_name ?? r.plan.name, floor: "Typical floor formwork", company: company?.company_name ?? "Aco Form Work Pvt Ltd" });
  const name = safe(`${r.plan.name} - formwork`);
  return new Response(text, { headers: { "Content-Type": "application/x-step; charset=utf-8", "Content-Disposition": `attachment; filename="${name}.ifc"`, "Cache-Control": "no-store" } });
}
