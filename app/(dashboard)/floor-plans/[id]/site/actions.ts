"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { hasPermission } from "@/lib/auth/permissions";
import { dbError } from "@/lib/format";
import { cleanLines, ISSUES } from "@/lib/floor-plans/site-learn";
import type { Json } from "@/lib/types/database";

export async function saveSiteReport(_p: { ok?: boolean; error?: string } | undefined, formData: FormData) {
  if (!(await hasPermission("quotations", "create"))) return { error: "You don't have permission to add site reports." };
  const planId = String(formData.get("plan") ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(planId)) return { error: "Unknown floor plan." };
  let lines: unknown = [];
  try { lines = JSON.parse(String(formData.get("lines") ?? "[]")); } catch { return { error: "Could not read the quantities." }; }
  const issues = formData.getAll("issue").map(String).filter((k) => ISSUES.some((i) => i.key === k));
  const floor = String(formData.get("floor") ?? "").trim().slice(0, 40);
  if (!floor) return { error: "Write which floor / pour this report is for." };
  const date = String(formData.get("date") ?? "");
  const cycle = Number(formData.get("cycle"));
  const supabase = await createClient();
  const { error } = await supabase.from("site_reports").insert({
    floor_plan_id: planId, floor_label: floor, pour_date: /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : null,
    cycle_days: Number.isFinite(cycle) && cycle > 0 && cycle < 60 ? cycle : null, system: String(formData.get("system") ?? "").slice(0, 20) || null,
    lines: cleanLines(lines) as unknown as Json, issues: issues as unknown as Json, notes: String(formData.get("notes") ?? "").trim().slice(0, 2000) || null,
  });
  if (error) return { error: dbError(error.message) };
  revalidatePath(`/floor-plans/${planId}/site`);
  revalidatePath("/settings");
  return { ok: true };
}

export async function deleteSiteReport(formData: FormData) {
  if (!(await hasPermission("quotations", "create"))) return;
  const id = String(formData.get("id") ?? ""), planId = String(formData.get("plan") ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(id)) return;
  const supabase = await createClient();
  await supabase.from("site_reports").delete().eq("id", id);
  revalidatePath(`/floor-plans/${planId}/site`);
  revalidatePath("/settings");
}
