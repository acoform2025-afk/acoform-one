import { createClient } from "@/lib/supabase/server";
import { runPanels, buildZones } from "@/lib/floor-plans/run-panels";
import { wallPanelNumbers } from "@/lib/floor-plans/zones";
import { packingByZone } from "@/lib/floor-plans/packing";
import { fabSpec } from "@/lib/design-engine/fabrication";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Packing list by zone (CSV): one bundle per deck zone with its deck panels and the wall panels around it. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new Response("Not found", { status: 404 });
  const url = new URL(req.url);
  const q = { h: url.searchParams.get("h") ?? undefined, kg: url.searchParams.get("kg") ?? undefined, prop: url.searchParams.get("prop") ?? undefined };
  const r = await runPanels(await createClient(), id, q);
  if (!r) return new Response("Floor plan not found", { status: 404 });
  if (r.error || !r.inp || !r.shell) return new Response(r.error ?? "Measure and save this plan first.", { status: 400 });
  const zones = (r.zones ?? buildZones(r.inp, r.catalog, r.layoutRules));
  const cat = new Map(r.catalog.map((c) => [c.panel_code, c]));
  const wallCode = (w: number) => r.catalog.find((c) => c.panel_category === "wall_panel" && Number(c.width_mm) === w && Number(c.height_mm) === r.opt.stdHeight)?.panel_code ?? `WP-${w}-${r.opt.stdHeight}`;
  const wallPanels = wallPanelNumbers(r.result.faces, r.opt.stdHeight, wallCode);
  const kgOf = (code: string, w: number, h: number) => { const c = cat.get(code); return c && Number(c.weight_kg) > 0 ? Number(c.weight_kg) : fabSpec(code, "", w, h, 1).kgEach; };
  const packs = packingByZone({ zones, faces: r.result.faces, mpp: r.shell.mpp, walls: r.inp.zoneWalls, wallPanels, kgOf });
  const cell = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
  const row = (a: (string | number)[]) => a.map(cell).join(",");
  const lines = [row([`PACKING LIST BY ZONE — ${r.plan.name}`]), row(["Bundle = one zone: its deck panels + the wall panels of the faces around it. EXT = outer faces of external walls."]), ""];
  lines.push(row(["Bundle", "Zone area m2", "Pieces", "Weight kg", "Wall faces"]));
  for (const p of packs) lines.push(row([p.zone, p.area ? p.area.toFixed(1) : "", p.pcs, p.kg, p.faces.join(" ")]));
  lines.push(row(["TOTAL", "", packs.reduce((a, p) => a + p.pcs, 0), packs.reduce((a, p) => a + p.kg, 0), ""]), "");
  lines.push(row(["Bundle", "Type", "Code", "Width mm", "Height / length mm", "Qty", "kg each", "kg total", "Panel numbers"]));
  for (const p of packs) {
    for (const l of p.lines) lines.push(row([p.zone, l.kind, l.code, l.w, l.h, l.qty, l.kgEach, Math.round(l.kgEach * l.qty * 10) / 10, l.nos.join(" ")]));
    lines.push(row([`${p.zone} total`, "", "", "", "", p.pcs, "", p.kg, ""]));
  }
  const name = `Packing_list_${r.plan.name}`.replace(/[^\w.\- ]+/g, "_").slice(0, 80);
  return new Response("﻿" + lines.join("\r\n"), { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${name}.csv"`, "Cache-Control": "no-store" } });
}
