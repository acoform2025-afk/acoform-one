import { renderToBuffer } from "@react-pdf/renderer";
import { createClient } from "@/lib/supabase/server";
import { runPanels } from "@/lib/floor-plans/run-panels";
import { faceMarks } from "@/lib/floor-plans/panel-marks";
import { shellToDxf } from "@/lib/floor-plans/shell";
import { PanelLayoutDocument } from "@/lib/pdf/panel-layout-document";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const safe = (s: string) => s.replace(/[^\w.\- ]+/g, "_").slice(0, 80);

/** Wall panel layout drawing: A3 PDF (default) or ?format=dxf (plan + panel joints on PANEL-* layers). */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new Response("Not found", { status: 404 });
  const url = new URL(req.url);
  const q = { h: url.searchParams.get("h") ?? undefined, kg: url.searchParams.get("kg") ?? undefined, prop: url.searchParams.get("prop") ?? undefined };
  const supabase = await createClient();
  const r = await runPanels(supabase, id, q);
  if (!r) return new Response("Floor plan not found", { status: 404 });
  if (r.error || !r.shell) return new Response(r.error ?? "Measure and save this plan first.", { status: 400 });
  const g = r.shell;
  const marks = faceMarks(r.result.faces);
  const drawingNo = `PL-${r.lead?.lead_code?.split("/").pop() ?? "01"}`;
  const rev = r.t.shell?.rev?.trim() || "R0";
  const name = safe(`${drawingNo}_${rev}_Panel layout_${r.plan.name}`);

  if (url.searchParams.get("format") === "dxf") {
    const dxf = shellToDxf(g, ({ line, text, textH }) => {
      const tk = g.mpp > 0 ? 0.1 / g.mpp : 3;      // 100 mm ticks
      for (const m of marks) {
        line("PANEL-FACE", m.a, m.fillerFrom ?? m.b);
        if (m.fillerFrom) line("PANEL-FILLER", m.fillerFrom, m.b);
        for (const p of [m.a, ...m.joints, m.b]) line("PANEL-JOINT", p, [p[0] + m.n[0] * tk, p[1] + m.n[1] * tk]);
        text("PANEL-TEXT", [m.mid[0] + m.n[0] * tk * 2.5, m.mid[1] + m.n[1] * tk * 2.5], `${m.code}: ${m.text}`, textH * 0.6);
      }
    });
    return new Response(dxf, { headers: { "Content-Type": "application/dxf", "Content-Disposition": `attachment; filename="${name}.dxf"`, "Cache-Control": "no-store" } });
  }

  const { data: company } = await supabase.from("tenants").select("company_name").eq("id", r.plan.tenant_id).maybeSingle();
  const buf = await renderToBuffer(<PanelLayoutDocument g={g} marks={marks} r={r.result} info={{
    company: company?.company_name ?? "Aco Form Work Pvt Ltd", planName: r.plan.name,
    project: r.lead?.project_name ?? r.plan.name, client: r.lead?.company_name ?? r.lead?.customer_name ?? "—",
    drawingNo, rev, date: new Date().toLocaleDateString("en-GB"),
    options: `Wall panel height ${r.opt.stdHeight} mm · panels laid from the start of each face · all sizes in mm`,
  }} />);
  return new Response(new Uint8Array(buf), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="${name}.pdf"`, "Cache-Control": "no-store" } });
}
