import { renderToBuffer } from "@react-pdf/renderer";
import { createClient } from "@/lib/supabase/server";
import { runPanels } from "@/lib/floor-plans/run-panels";
import { PRESETS } from "@/lib/design-engine/layout-rules";
import { Render3DDocument } from "@/lib/pdf/render3d-document";
import { sceneOf } from "@/lib/floor-plans/scene-of";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const safe = (s: string) => s.replace(/[^\w.\- ]+/g, "_").slice(0, 80);

/** 3D views of the typical-floor formwork as an A3 drawing: assembled from two sides, exploded, wall and deck layers. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new Response("Not found", { status: 404 });
  const url = new URL(req.url);
  const q = { h: url.searchParams.get("h") ?? undefined, kg: url.searchParams.get("kg") ?? undefined, prop: url.searchParams.get("prop") ?? undefined };
  const supabase = await createClient();
  const r = await runPanels(supabase, id, q);
  if (!r) return new Response("Floor plan not found", { status: 404 });
  if (r.error || !r.inp || !r.result) return new Response(r.error ?? "Measure and save this plan first.", { status: 400 });
  const scene = sceneOf(r);
  if (!scene) return new Response("Measure and save this plan first.", { status: 400 });
  const { data: company } = await supabase.from("tenants").select("company_name").eq("id", r.plan.tenant_id).maybeSingle();
  const rules = r.layoutRules;
  const drawingNo = `3D-${r.lead?.lead_code?.split("/").pop() ?? "01"}`;
  const rev = r.t.shell?.rev?.trim() || "R0";
  const buf = await renderToBuffer(<Render3DDocument scene={scene} info={{
    company: company?.company_name ?? "Aco Form Work Pvt Ltd", planName: r.plan.name,
    project: r.lead?.project_name ?? r.plan.name, client: r.lead?.company_name ?? r.lead?.customer_name ?? "—",
    drawingNo, rev, date: new Date().toLocaleDateString("en-GB"), system: PRESETS[rules?.system ?? "acoform"].label,
  }} />);
  const name = safe(`${drawingNo}_${rev}_3D_views_${r.plan.name}`);
  return new Response(new Uint8Array(buf), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="${name}.pdf"`, "Cache-Control": "no-store" } });
}
