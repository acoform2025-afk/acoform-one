"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { hasPermission } from "@/lib/auth/permissions";
import type { Json } from "@/lib/types/database";

/** Wall faces laid out by hand: face code → panel widths. An empty object clears every hand layout. */
export async function savePanelEdits(planId: string, edits: Record<string, number[]>): Promise<{ ok?: boolean; error?: string }> {
  if (!(await hasPermission("quotations", "create"))) return { error: "You do not have permission to change this layout." };
  if (!/^[0-9a-f-]{36}$/i.test(planId)) return { error: "Invalid floor plan." };
  const clean: Record<string, number[]> = {};
  for (const [code, arr] of Object.entries(edits ?? {})) {
    if (!/^[\w.\-/ ]{1,40}$/.test(code) || !Array.isArray(arr) || arr.length > 80) continue;
    const w = arr.map((x) => Math.round(Number(x))).filter((x) => Number.isFinite(x) && x >= 50 && x <= 1200);
    if (w.length) clean[code] = w;
  }
  const supabase = await createClient();
  const { data: plan } = await supabase.from("floor_plans").select("takeoff").eq("id", planId).maybeSingle();
  if (!plan?.takeoff || typeof plan.takeoff !== "object") return { error: "Floor plan not found." };
  const t = { ...(plan.takeoff as Record<string, unknown>) };
  if (Object.keys(clean).length) t.panelEdits = clean; else delete t.panelEdits;
  const { error } = await supabase.from("floor_plans").update({ takeoff: t as unknown as Json }).eq("id", planId);
  if (error) return { error: "Could not save: " + error.message };
  revalidatePath(`/floor-plans/${planId}`, "layout");
  return { ok: true };
}
