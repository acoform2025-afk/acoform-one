import { renderToBuffer } from "@react-pdf/renderer";
import { createClient } from "@/lib/supabase/server";
import { runPanels } from "@/lib/floor-plans/run-panels";
import { ModulationDocument, modulationTypes } from "@/lib/pdf/modulation-document";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const safe = (s: string) => s.replace(/[^\w.\- ]+/g, "_").slice(0, 80);

/** Wall-face modulation drawings (A3 PDF): schedule of face types + elevations with panels, tops, fillers and ties. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new Response("Not found", { status: 404 });
  const url = new URL(req.url);
  const q = { h: url.searchParams.get("h") ?? undefined, kg: url.searchParams.get("kg") ?? undefined, prop: url.searchParams.get("prop") ?? undefined };
  const supabase = await createClient();
  const r = await runPanels(supabase, id, q);
  if (!r) return new Response("Floor plan not found", { status: 404 });
  if (r.error) return new Response(r.error, { status: 400 });
  const faces = r.result.faces.filter((f) => f.length > 0);
  if (!faces.length) return new Response("No wall faces in this plan yet — measure the walls first.", { status: 400 });
  const { data: eng } = await supabase.from("engineering_parameters").select("tie_spacing_h_mm, tie_spacing_v_mm").maybeSingle();
  const { data: company } = await supabase.from("tenants").select("company_name").eq("id", r.plan.tenant_id).maybeSingle();
  const drawingNo = `MD-${r.lead?.lead_code?.split("/").pop() ?? "01"}`;
  const rev = r.t.shell?.rev?.trim() || "R0";
  const types = modulationTypes(faces);
  const buf = await renderToBuffer(<ModulationDocument types={types} totalFaces={faces.length} info={{
    company: company?.company_name ?? "Aco Form Work Pvt Ltd", planName: r.plan.name,
    project: r.lead?.project_name ?? r.plan.name, client: r.lead?.company_name ?? r.lead?.customer_name ?? "—",
    drawingNo, rev, date: new Date().toLocaleDateString("en-GB"), stdHeight: r.opt.stdHeight,
    tieH: Number(eng?.tie_spacing_h_mm) || 800, tieV: Number(eng?.tie_spacing_v_mm) || 800,
    note: `Floor ${Math.round(r.t.params.floorHeight * 1000)} mm · slab ${r.t.params.slabMm} mm · face codes as on the panel layout drawing`,
  }} />);
  return new Response(new Uint8Array(buf), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="${safe(`${drawingNo}_${rev}_Wall modulation_${r.plan.name}`)}.pdf"`, "Cache-Control": "no-store" } });
}
