import { createClient } from "@/lib/supabase/server";
import { runPanels } from "@/lib/floor-plans/run-panels";
import { stockCheck } from "@/lib/floor-plans/stock";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Stock-first production shortfall as CSV. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new Response("Not found", { status: 404 });
  const url = new URL(req.url);
  const q = { h: url.searchParams.get("h") ?? undefined, kg: url.searchParams.get("kg") ?? undefined, prop: url.searchParams.get("prop") ?? undefined };
  const supabase = await createClient();
  const r = await runPanels(supabase, id, q);
  if (!r) return new Response("Floor plan not found", { status: 404 });
  if (r.error) return new Response(r.error, { status: 400 });
  const s = await stockCheck(supabase, r.result.bom);
  const cell = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
  const lines = [["Code", "Description", "Width mm", "Height mm", "Need", "In stock", "At sites", "From stock", "To produce", "kg each", "kg to produce", "Special"].map(cell).join(",")];
  for (const x of s.rows) lines.push([x.code, x.description, x.w, x.h, x.need, x.inStock, x.onSite, x.fromStock, x.toMake, Math.round(x.kgEach * 100) / 100, Math.round(x.kgEach * x.toMake), x.custom ? "yes" : ""].map(cell).join(","));
  lines.push(["TOTAL", "", "", "", s.totals.need, "", "", s.totals.fromStock, s.totals.toMake, "", s.totals.kgToMake, ""].map(cell).join(","));
  const name = `Stock_check_${r.plan.name}`.replace(/[^\w.\- ]+/g, "_").slice(0, 80);
  return new Response("﻿" + lines.join("\r\n"), { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${name}.csv"`, "Cache-Control": "no-store" } });
}
