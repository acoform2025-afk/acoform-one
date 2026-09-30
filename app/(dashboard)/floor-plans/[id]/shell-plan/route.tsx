import { renderToBuffer } from "@react-pdf/renderer";
import { createClient } from "@/lib/supabase/server";
import { computeTotals, totalsRows, type Takeoff } from "@/lib/floor-plans/calc";
import { loadRules } from "@/lib/floor-plans/rules";
import { dxfAuto, readDxf, type DxfModel } from "@/lib/floor-plans/dxf";
import { buildShell, shellToDxf } from "@/lib/floor-plans/shell";
import { UNIT_TO_M } from "@/lib/floor-plans/calc";
import { ShellPlanDocument } from "@/lib/pdf/shell-plan-document";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const safe = (s: string) => s.replace(/[^\w.\- ]+/g, "_").slice(0, 80);

/** Shell plan of a measured floor plan: A3 PDF (default) or ?format=dxf for AutoCAD. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new Response("Not found", { status: 404 });
  const format = new URL(req.url).searchParams.get("format") === "dxf" ? "dxf" : "pdf";
  const supabase = await createClient();
  const { data: plan } = await supabase.from("floor_plans")
    .select("id, name, source_kind, file_path, takeoff, tenant_id, leads ( lead_code, project_name, customer_name, company_name )")
    .eq("id", id).maybeSingle();
  if (!plan) return new Response("Floor plan not found", { status: 404 });
  const t = plan.takeoff as unknown as Takeoff;
  if (!t || !Array.isArray(t.shapes)) return new Response("Measure and save this plan first.", { status: 400 });

  let model: DxfModel | null = null;
  if (plan.source_kind === "dxf") {
    const { data: blob } = await supabase.storage.from("floor-plans").download(plan.file_path);
    if (blob) { try { model = readDxf(await blob.text()); } catch { model = null; } }
  }
  const g = buildShell(t, model);
  const lead = Array.isArray(plan.leads) ? plan.leads[0] : plan.leads;
  const drawingNo = t.shell?.drawingNo?.trim() || `SP-${lead?.lead_code?.split("/").pop() ?? "01"}`;
  const rev = t.shell?.rev?.trim() || "R0";

  if (format === "dxf") {
    return new Response(shellToDxf(g), {
      headers: { "Content-Type": "application/dxf", "Content-Disposition": `attachment; filename="${safe(`${drawingNo}_${rev}_${plan.name}`)}.dxf"`, "Cache-Control": "no-store" },
    });
  }

  // totals (DXF layer quantities are recomputed the same way as on screen)
  const rules = await loadRules(supabase);
  let auto = null;
  if (model && t.dxf) {
    const reg = t.dxf.region;
    const { dxfFrame } = await import("@/lib/floor-plans/dxf");
    const f = dxfFrame(model, 2400);
    const keep = reg ? (p: { pts: [number, number][] }) => p.pts.every((q) => { const [x, y] = f.toPx(q); return x >= reg[0] && x <= reg[2] && y >= reg[1] && y <= reg[3]; }) : undefined;
    auto = dxfAuto(model, t.dxf.layerRoles, UNIT_TO_M[t.dxf.units], keep, t.params.minOpeningM2 != null && String(t.params.minOpeningM2) !== "" ? Number(t.params.minOpeningM2) : rules.minOpeningM2);
  }
  const totals = computeTotals(t, auto, rules);
  const { data: company } = await supabase.from("tenants").select("company_name").eq("id", plan.tenant_id).maybeSingle();

  const buffer = await renderToBuffer(
    <ShellPlanDocument g={g} info={{
      company: company?.company_name ?? "Aco Form Work Pvt Ltd",
      project: lead?.project_name ?? plan.name, client: lead?.company_name ?? lead?.customer_name ?? "—", planName: plan.name,
      drawingNo, rev, date: new Date().toLocaleDateString("en-GB"),
      drawnBy: t.shell?.drawnBy ?? "", checkedBy: t.shell?.checkedBy ?? "",
      notes: (t.shell?.notes ?? "All dimensions are in mm unless noted otherwise.\nLevels are with respect to finished slab level of the typical floor.\nShell plan to be approved by the client before panel design.").split(/\r?\n/).map((x) => x.trim()).filter(Boolean),
      floorHeight: t.params.floorHeight, slabMm: t.params.slabMm,
      totals: totalsRows(totals),
    }} />,
  );
  return new Response(new Uint8Array(buffer), {
    headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="${safe(`${drawingNo}_${rev}_${plan.name}`)}.pdf"`, "Cache-Control": "no-store" },
  });
}
