import { renderToBuffer } from "@react-pdf/renderer";
import { createClient } from "@/lib/supabase/server";
import { runPanels } from "@/lib/floor-plans/run-panels";
import { pinHoleCheck, specialsFromBom } from "@/lib/design-engine/fabrication";
import { FabricationDocument } from "@/lib/pdf/fabrication-document";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const safe = (s: string) => s.replace(/[^\w.\- ]+/g, "_").slice(0, 80);

/** Special-panel production drawings (A3 PDF) or ?format=csv for the production order / cutting list. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new Response("Not found", { status: 404 });
  const url = new URL(req.url);
  const q = { h: url.searchParams.get("h") ?? undefined, kg: url.searchParams.get("kg") ?? undefined, prop: url.searchParams.get("prop") ?? undefined };
  const supabase = await createClient();
  const r = await runPanels(supabase, id, q);
  if (!r) return new Response("Floor plan not found", { status: 404 });
  if (r.error || !r.result) return new Response(r.error ?? "Measure and save this plan first.", { status: 400 });
  const specs = specialsFromBom(r.result.bom);
  if (!specs.length) return new Response("No special (made-to-size) panels in this layout.", { status: 400 });
  const check = pinHoleCheck(specs);
  const drawingNo = `SP-${r.lead?.lead_code?.split("/").pop() ?? "01"}`;
  const rev = r.t.shell?.rev?.trim() || "R0";
  const name = safe(`${drawingNo}_${rev}_Special panels_${r.plan.name}`);
  if (url.searchParams.get("format") === "csv") {
    const cell = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
    const lines = [["Mark", "Code", "Description", "Width mm", "Height / length mm", "Nos", "Part", "Part size mm", "Part nos per panel", "Part kg per panel", "Panel kg", "Total kg", "Holes (height edge)", "Holes (width edge)", "Notes"].map(cell).join(",")];
    specs.forEach((s, i) => s.cut.forEach((c, j) => lines.push([j ? "" : `SP-${String(i + 1).padStart(2, "0")}`, j ? "" : s.code, j ? "" : s.description, j ? "" : s.w, j ? "" : s.h, j ? "" : s.qty, c.part, c.size, c.nos, c.kg, j ? "" : s.kgEach, j ? "" : (s.kgEach * s.qty).toFixed(1), j ? "" : s.holesH.join(" "), j ? "" : s.holesW.join(" "), j ? "" : s.warnings.join(" ")].map(cell).join(","))));
    return new Response("﻿" + lines.join("\r\n"), { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${name}.csv"`, "Cache-Control": "no-store" } });
  }
  const { data: company } = await supabase.from("tenants").select("company_name").eq("id", r.plan.tenant_id).maybeSingle();
  const buf = await renderToBuffer(<FabricationDocument specs={specs.slice(0, 120)} check={check} info={{
    company: company?.company_name ?? "Aco Form Work Pvt Ltd", planName: r.plan.name,
    project: r.lead?.project_name ?? r.plan.name, client: r.lead?.company_name ?? r.lead?.customer_name ?? "—",
    drawingNo, rev, date: new Date().toLocaleDateString("en-GB"),
  }} />);
  return new Response(new Uint8Array(buf), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="${name}.pdf"`, "Cache-Control": "no-store" } });
}
