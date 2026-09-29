import { renderToBuffer } from "@react-pdf/renderer";
import { createClient } from "@/lib/supabase/server";
import { runPanels } from "@/lib/floor-plans/run-panels";
import { PanelBomDocument } from "@/lib/pdf/panel-bom-document";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const safe = (s: string) => s.replace(/[^\w.\- ]+/g, "_").slice(0, 80);

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new Response("Not found", { status: 404 });
  const url = new URL(req.url);
  const q = { h: url.searchParams.get("h") ?? undefined, kg: url.searchParams.get("kg") ?? undefined, prop: url.searchParams.get("prop") ?? undefined };
  const supabase = await createClient();
  const r = await runPanels(supabase, id, q);
  if (!r) return new Response("Floor plan not found", { status: 404 });
  if (r.error) return new Response(r.error, { status: 400 });
  const name = safe(`Panel BOM - ${r.plan.name}`);
  if (url.searchParams.get("format") === "csv") {
    const cell = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
    const lines = [["Code", "Description", "Group", "Width mm", "Height mm", "Qty", "Area m2", "Weight kg", "Custom"].map(cell).join(",")];
    for (const b of r.result.bom) lines.push([b.code, b.description, b.group, b.w, b.h, b.qty, b.area, b.weight, b.custom ? "yes" : "no"].map(cell).join(","));
    lines.push("", [cell("Total"), "", "", "", "", "", cell(r.result.summary.panelArea), cell(r.result.summary.weight), ""].join(","));
    return new Response("﻿" + lines.join("\r\n"), { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${name}.csv"`, "Cache-Control": "no-store" } });
  }
  const { data: company } = await supabase.from("tenants").select("company_name").eq("id", r.plan.tenant_id).maybeSingle();
  const buf = await renderToBuffer(<PanelBomDocument r={r.result} info={{
    company: company?.company_name ?? "Aco Form Work Pvt Ltd", planName: r.plan.name,
    project: r.lead?.project_name ?? r.plan.name, client: r.lead?.company_name ?? r.lead?.customer_name ?? "—",
    date: new Date().toLocaleDateString("en-GB"), contactArea: r.totals.contact_area,
    options: `Wall panel height ${r.opt.stdHeight} mm · custom panels ${r.opt.kgPerM2} kg/m² · props @ ${r.opt.propSpacing} m`,
  }} />);
  return new Response(new Uint8Array(buf), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="${name}.pdf"`, "Cache-Control": "no-store" } });
}
