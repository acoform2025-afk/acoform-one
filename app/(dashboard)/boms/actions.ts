"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { dbError } from "@/lib/format";
import type { Result } from "@/components/action-button";

export async function approveBom(bomId: string): Promise<Result> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("bom_headers").update({ status: "approved" }).eq("id", bomId).select("id");
  if (error) return { success: false, error: dbError(error.message) };
  if (!data?.length) return { success: false, error: "You don't have BOM approval rights." };
  revalidatePath(`/boms/${bomId}`);
  return { success: true };
}

export async function discardBom(bomId: string, designId: string): Promise<Result> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("bom_headers").delete().eq("id", bomId).select("id");
  if (error) return { success: false, error: dbError(error.message) };
  if (!data?.length) return { success: false, error: "Only a draft BOM can be discarded, by someone who can generate BOMs." };
  revalidatePath(`/designs/${designId}`);
  return { success: true, redirectTo: `/designs/${designId}` };
}

const releaseSchema = z.object({
  bomId: z.string().uuid(),
  orderCode: z.string().trim().min(1, "Order code required").max(40),
  targetCompletion: z.string().optional().transform((v) => (v ? v : undefined)),
});

export async function releaseToProduction(_p: { error?: string } | undefined, formData: FormData): Promise<{ error?: string } | undefined> {
  const parsed = releaseSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { error: Object.values(parsed.error.flatten().fieldErrors)[0]?.[0] ?? "Check the form." };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_production_order", {
    p_bom_header_id: parsed.data.bomId, p_order_code: parsed.data.orderCode, p_target_completion: parsed.data.targetCompletion,
  });
  if (error) return { error: error.message.includes("unique") ? "That order code already exists." : dbError(error.message) };
  redirect(`/production/${data}`);
}
