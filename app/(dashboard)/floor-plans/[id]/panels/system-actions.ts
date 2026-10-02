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

/** Column sets bought for this project, % of all column faces (blank / 100 = one set per column). */
export async function setPlanColumnSets(formData: FormData) {
  if (!(await hasPermission("quotations", "create"))) return;
  const id = String(formData.get("plan") ?? ""); const v = Number(formData.get("pct"));
  if (!/^[0-9a-f-]{36}$/i.test(id)) return;
  const supabase = await createClient();
  const { data: plan } = await supabase.from("floor_plans").select("takeoff").eq("id", id).maybeSingle();
  if (!plan?.takeoff || typeof plan.takeoff !== "object") return;
  const t = { ...(plan.takeoff as Record<string, unknown>) };
  const o = { ...((t.ruleOverrides as Record<string, unknown>) ?? {}) };
  if (Number.isFinite(v) && v >= 10 && v < 100) o.columnSetPct = Math.round(v); else delete o.columnSetPct;
  if (Object.keys(o).length) t.ruleOverrides = o; else delete t.ruleOverrides;
  await supabase.from("floor_plans").update({ takeoff: t as unknown as Json }).eq("id", id);
  revalidatePath(`/floor-plans/${id}`, "layout");
}
