"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { hasPermission } from "@/lib/auth/permissions";
import type { Json } from "@/lib/types/database";

/** Formwork system for one floor plan ("" = company setting). */
export async function setPlanSystem(formData: FormData) {
  if (!(await hasPermission("quotations", "create"))) return;
  const id = String(formData.get("plan") ?? ""), sys = String(formData.get("system") ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(id) || !["", "tierod", "flattie", "acoform"].includes(sys)) return;
  const supabase = await createClient();
  const { data: plan } = await supabase.from("floor_plans").select("takeoff").eq("id", id).maybeSingle();
  if (!plan?.takeoff || typeof plan.takeoff !== "object") return;
  const t = { ...(plan.takeoff as Record<string, unknown>) };
  if (sys) t.system = sys; else delete t.system;
  await supabase.from("floor_plans").update({ takeoff: t as unknown as Json }).eq("id", id);
  revalidatePath(`/floor-plans/${id}`, "layout");
}
