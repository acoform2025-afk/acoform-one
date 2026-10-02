import { createClient } from "@/lib/supabase/server";
import { runPanels } from "@/lib/floor-plans/run-panels";
import { checkLayout } from "@/lib/floor-plans/check-run";
import { ISSUE_LABEL } from "@/lib/design-engine/design-check";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Design-check list as CSV (opens in Excel). */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new Response("Not found", { status: 404 });
  const url = new URL(req.url);
  const q = { h: url.searchParams.get("h") ?? undefined, kg: url.searchParams.get("kg") ?? undefined, prop: url.searchParams.get("prop") ?? undefined };
  const r = await runPanels(await createClient(), id, q);
  if (!r) return new Response("Floor plan not found", { status: 404 });
  const ck = r.error ? null : checkLayout(r);
  if (!ck) return new Response(r.error ?? "Measure and save this plan first.", { status: 400 });
  const cell = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
  const lines = [["No.", "Severity", "Check", "Where (panel / face / zone)", "Problem", "X m", "Y m"].map(cell).join(",")];
  for (const i of ck.check.issues) lines.push([i.id, i.sev === "error" ? "ERROR" : "WARNING", ISSUE_LABEL[i.kind], i.where, i.detail, i.at ? i.at[0].toFixed(2) : "", i.at ? i.at[1].toFixed(2) : ""].map(cell).join(","));
  const name = `Design_check_${r.plan.name}`.replace(/[^\w.\- ]+/g, "_").slice(0, 80);
  return new Response("﻿" + lines.join("\r\n"), { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${name}.csv"`, "Cache-Control": "no-store" } });
}
