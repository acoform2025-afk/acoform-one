"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile, hasPermission } from "@/lib/auth/permissions";
import { loadLayoutRules, normaliseLayoutRules } from "@/lib/design-engine/layout-rules";
import { learn, type SiteReportRow } from "@/lib/floor-plans/site-learn";
import type { Json } from "@/lib/types/database";

/** Apply what the site reports say to the panel layout rules: loss % on small parts, or spare % per panel family. */
export async function applySiteLearning(formData: FormData) {
  if (!(await hasPermission("designs", "approve"))) return;
  const profile = await getCurrentProfile(); if (!profile) return;
  const what = String(formData.get("what") ?? "");
  const supabase = await createClient();
  const rules = await loadLayoutRules(supabase);
  const { data } = await supabase.from("site_reports").select("lines, issues, cycle_days, system").eq("system", rules.system).order("created_at", { ascending: false }).limit(500);
  const L = learn((data ?? []) as unknown as SiteReportRow[]);
  if (what === "loss" && L.suggestLoss != null) rules.lossPct = L.suggestLoss;
  else if (what === "spare") rules.sparePct = L.suggestSpare;
  else if (what === "clear") rules.sparePct = {};
  else return;
  await supabase.from("measurement_rules").upsert({ tenant_id: profile.tenant_id, layout: normaliseLayoutRules(rules) as unknown as Json, updated_at: new Date().toISOString() }, { onConflict: "tenant_id" });
  revalidatePath("/settings");
  revalidatePath("/floor-plans", "layout");
}
