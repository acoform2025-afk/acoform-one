"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { dbError } from "@/lib/format";
import type { Result } from "@/components/action-button";

const NEXT: Record<string, string> = { pending: "cutting", cutting: "assembly", assembly: "qc", on_hold: "assembly" };

export async function advanceWorkOrder(orderId: string, woId: string, from: string): Promise<Result> {
  const to = NEXT[from];
  if (!to) return { success: false, error: "Nothing to advance." };
  const supabase = await createClient();
  const { data, error } = await supabase.from("work_orders").update({ status: to }).eq("id", woId).eq("status", from).select("id");
  if (error) return { success: false, error: dbError(error.message) };
  if (!data?.length) return { success: false, error: "The work order changed or you lack production permission. Refresh." };
  await supabase.from("production_orders").update({ status: "in_progress" }).eq("id", orderId).eq("status", "planned");
  revalidatePath(`/production/${orderId}`);
  return { success: true };
}

export async function passQc(orderId: string, woId: string): Promise<Result> {
  const supabase = await createClient();
  const checklist = { dimensions: true, welding: true, face_sheet: true, holes: true, finish: true, checked_via: "ACOFORM ONE" };
  const { error } = await supabase.rpc("pass_work_order_qc", { p_work_order_id: woId, p_checklist: checklist });
  if (error) return { success: false, error: dbError(error.message) };
  revalidatePath(`/production/${orderId}`);
  return { success: true };
}

const failSchema = z.object({
  orderId: z.string().uuid(), woId: z.string().uuid(),
  description: z.string().trim().min(5, "Describe the defect").max(1000),
  severity: z.enum(["minor", "major", "critical"]),
});

export async function failQc(_p: { error?: string; ok?: boolean } | undefined, formData: FormData) {
  const parsed = failSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { error: Object.values(parsed.error.flatten().fieldErrors)[0]?.[0] ?? "Check the form." };
  const d = parsed.data;
  const supabase = await createClient();
  const { error } = await supabase.rpc("fail_work_order_qc", {
    p_work_order_id: d.woId, p_checklist: { failed: true, checked_via: "ACOFORM ONE" }, p_description: d.description, p_severity: d.severity,
  });
  if (error) return { error: dbError(error.message) };
  revalidatePath(`/production/${d.orderId}`);
  return { ok: true };
}
