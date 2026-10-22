import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { loadRules } from "@/lib/floor-plans/rules";
import { structuralOf } from "@/lib/floor-plans/run-panels";
import { mergeSummary } from "@/lib/floor-plans/structural-link";
import type { Takeoff } from "@/lib/floor-plans/calc";

/** The automatic reading of a structural layout plan, for the measuring screen to merge into the plan it is linked
 *  to: GET /floor-plans/<id>/structural?plan=<structural plan id>. Only plans the user can read; functions stripped. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const url = new URL(req.url);
  const planId = url.searchParams.get("plan") ?? "";
  if (!/^[0-9a-f-]{36}$/i.test(id) || !/^[0-9a-f-]{36}$/i.test(planId)) return NextResponse.json({ error: "Bad request." }, { status: 400 });
  const supabase = await createClient();
  const { data: own } = await supabase.from("floor_plans").select("id, lead_id").eq("id", id).maybeSingle();
  if (!own) return NextResponse.json({ error: "Plan not found." }, { status: 404 });
  const rules = await loadRules(supabase);
  const t = { structural: { planId, dx: 0, dy: 0, scale: 1, auto: true } } as unknown as Takeoff;
  const st = await structuralOf(supabase, t, rules);
  if (!st) return NextResponse.json({ error: "The structural plan could not be read (not measured, or its drawing is missing)." }, { status: 404 });
  const { onFloor: _f, ...auto } = st.auto;
  void _f;
  return NextResponse.json({ auto, unitToM: st.unitToM, name: st.name, summary: mergeSummary(st.auto) });
}
