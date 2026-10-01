import { renderToBuffer } from "@react-pdf/renderer";
import { createClient } from "@/lib/supabase/server";
import { buildZones, runPanels } from "@/lib/floor-plans/run-panels";
import { wallPanelNumbers } from "@/lib/floor-plans/zones";
import { InstallationDocument } from "@/lib/pdf/installation-document";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const safe = (s: string) => s.replace(/[^\w.\- ]+/g, "_").slice(0, 80);

/** Deck installation drawings with numbered zones and panels (A3 PDF), or ?format=csv for the numbering list. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new Response("Not found", { status: 404 });
  const url = new URL(req.url);
  const q = { h: url.searchParams.get("h") ?? undefined, kg: url.searchParams.get("kg") ?? undefined, prop: url.searchParams.get("prop") ?? undefined };
  const supabase = await createClient();
  const r = await runPanels(supabase, id, q);
  if (!r) return new Response("Floor plan not found", { status: 404 });
  if (r.error || !r.inp) return new Response(r.error ?? "Measure and save this plan first.", { status: 400 });
  const zones = buildZones(r.inp, r.catalog);
  if (!zones.length) return new Response("No slab outline found — mark the slab (Slab area tool or a slab layer) and save the plan first.", { status: 400 });
  const wallCode = (w: number) => r.catalog.find((c) => c.panel_category === "wall_panel" && Number(c.width_mm) === w && Number(c.height_mm) === r.opt.stdHeight)?.panel_code ?? `WP-${w}-${r.opt.stdHeight}`;
  const wallPanels = wallPanelNumbers(r.result.faces, r.opt.stdHeight, wallCode);
  const drawingNo = `IN-${r.lead?.lead_code?.split("/").pop() ?? "01"}`;
  const rev = r.t.shell?.rev?.trim() || "R0";
  const name = safe(`${drawingNo}_${rev}_Installation_${r.plan.name}`);
  if (url.searchParams.get("format") === "csv") {
    const cell = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
    const lines = [["Panel No.", "Zone / face", "Type", "Code", "Width mm", "Length / height mm", "Special"].map(cell).join(",")];
    for (const z of zones) for (const p of z.panels) lines.push([p.no, z.code, "Deck", p.code, p.w, p.L, p.custom ? "yes" : ""].map(cell).join(","));
    for (const z of zones) if (z.specialArea > 0.02) lines.push([`${z.code}-SP`, z.code, "Deck special (to size)", "DS", "", "", `${z.specialArea.toFixed(2)} m2`].map(cell).join(","));
    for (const w of wallPanels) lines.push([w.no, w.face, "Wall", w.code, w.w, w.h, /^WF|^WT/.test(w.code) ? "yes" : ""].map(cell).join(","));
    return new Response("﻿" + lines.join("\r\n"), { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${name}.csv"`, "Cache-Control": "no-store" } });
  }
  const { data: company } = await supabase.from("tenants").select("company_name").eq("id", r.plan.tenant_id).maybeSingle();
  const buf = await renderToBuffer(<InstallationDocument zones={zones} walls={r.inp.zoneWalls} wallPanels={wallPanels} info={{
    company: company?.company_name ?? "Aco Form Work Pvt Ltd", planName: r.plan.name,
    project: r.lead?.project_name ?? r.plan.name, client: r.lead?.company_name ?? r.lead?.customer_name ?? "—",
    drawingNo, rev, date: new Date().toLocaleDateString("en-GB"),
  }} />);
  return new Response(new Uint8Array(buf), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="${name}.pdf"`, "Cache-Control": "no-store" } });
}
