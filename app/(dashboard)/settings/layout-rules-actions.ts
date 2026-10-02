"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile, hasPermission } from "@/lib/auth/permissions";
import { dbError } from "@/lib/format";
import { normaliseLayoutRules } from "@/lib/design-engine/layout-rules";
import type { Json } from "@/lib/types/database";

export async function saveLayoutRules(_p: { ok?: boolean; error?: string } | undefined, formData: FormData) {
  if (!(await hasPermission("designs", "approve"))) return { error: "Only design approvers can change the panel layout rules." };
  const profile = await getCurrentProfile();
  if (!profile) return { error: "Not signed in." };
  let raw: unknown = null;
  try { raw = JSON.parse(String(formData.get("rules") ?? "{}")); } catch { return { error: "Could not read the rules." }; }
  const layout = normaliseLayoutRules(raw);
  const supabase = await createClient();
  const { error } = await supabase.from("measurement_rules").upsert({ tenant_id: profile.tenant_id, layout: layout as unknown as Json, updated_at: new Date().toISOString() }, { onConflict: "tenant_id" });
  if (error) return { error: dbError(error.message) };
  revalidatePath("/settings");
  revalidatePath("/floor-plans", "layout");
  return { ok: true };
}
