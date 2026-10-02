"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile, hasPermission } from "@/lib/auth/permissions";
import { dbError } from "@/lib/format";
import { normaliseRules } from "@/lib/floor-plans/rules";

export async function saveMeasurementRules(_p: { ok?: boolean; error?: string } | undefined, formData: FormData) {
  if (!(await hasPermission("designs", "approve")) && !(await hasPermission("quotations", "approve"))) return { error: "Only design or quotation approvers can change these rules." };
  const profile = await getCurrentProfile();
  if (!profile) return { error: "Not signed in." };
  const f = (k: string) => formData.get(k);
  const on = (k: string) => f(k) === "on";
  const rules = normaliseRules({
    minOpeningM2: Number(f("minOpeningM2")), kickerMm: Number(f("kickerMm")), stairAllowanceM2: Number(f("stairAllowanceM2")), extraPct: Number(f("extraPct")),
    slabEdges: on("slabEdges"), reveals: on("reveals"), deductWallTops: on("deductWallTops"), deductColumnTops: on("deductColumnTops"),
    stairs: on("stairs"), printOnQuote: on("printOnQuote"), stairBasis: f("stairBasis"),
  });
  const supabase = await createClient();
  const { error } = await supabase.from("measurement_rules").upsert({ tenant_id: profile.tenant_id, rules, updated_at: new Date().toISOString() }, { onConflict: "tenant_id" });
  if (error) return { error: dbError(error.message) };
  revalidatePath("/settings");
  revalidatePath("/floor-plans", "layout");
  return { ok: true };
}
