"use server";

import { createClient } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/auth/permissions";
import { revalidatePath } from "next/cache";
import { z } from "zod";

export type ActionResult = { success: boolean; error?: string };

const rateCardSchema = z.object({
  rateName: z.string().min(1, "Rate name required"),
  ratePerKg: z.coerce.number().positive("Rate must be a positive number"),
  effectiveFrom: z.string().min(1, "Effective date required"),
});

export async function updateRateCard(formData: FormData): Promise<ActionResult> {
  try {
    await requirePermission("cost_rate_cards", "manage");
  } catch {
    return { success: false, error: "You don't have permission to manage rate cards." };
  }

  const parsed = rateCardSchema.safeParse({
    rateName: formData.get("rateName"),
    ratePerKg: formData.get("ratePerKg"),
    effectiveFrom: formData.get("effectiveFrom"),
  });

  if (!parsed.success) {
    const first = Object.values(parsed.error.flatten().fieldErrors)[0]?.[0];
    return { success: false, error: first ?? "Invalid input." };
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { data: profile } = await supabase
    .from("users").select("tenant_id").eq("id", user!.id).single();

  if (!profile) return { success: false, error: "Could not resolve tenant." };

  await supabase
    .from("cost_rate_cards")
    .update({ is_active: false, effective_to: new Date().toISOString().split("T")[0] })
    .eq("tenant_id", profile.tenant_id)
    .eq("is_active", true);

  const { error } = await supabase.from("cost_rate_cards").insert({
    tenant_id: profile.tenant_id,
    rate_name: parsed.data.rateName,
    rate_per_kg: parsed.data.ratePerKg,
    effective_from: parsed.data.effectiveFrom,
    is_active: true,
    created_by: user!.id,
  });

  if (error) return { success: false, error: "Could not save rate card." };

  revalidatePath("/panel-catalog");
  return { success: true };
}

const quickRateSchema = z.object({
  formworkType: z.enum(["monolithic", "vertical"]),
  ratePerSqm: z.coerce.number().positive("Rate must be a positive number"),
  effectiveFrom: z.string().min(1, "Effective date required"),
});

export async function updateQuickQuoteRate(formData: FormData): Promise<ActionResult> {
  try {
    await requirePermission("cost_rate_cards", "manage");
  } catch {
    return { success: false, error: "You don't have permission to manage rates." };
  }

  const parsed = quickRateSchema.safeParse({
    formworkType: formData.get("formworkType"),
    ratePerSqm: formData.get("ratePerSqm"),
    effectiveFrom: formData.get("effectiveFrom"),
  });

  if (!parsed.success) {
    const first = Object.values(parsed.error.flatten().fieldErrors)[0]?.[0];
    return { success: false, error: first ?? "Invalid input." };
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { data: profile } = await supabase
    .from("users").select("tenant_id").eq("id", user!.id).single();

  if (!profile) return { success: false, error: "Could not resolve tenant." };

  await supabase
    .from("quick_quote_rates")
    .update({ is_active: false, effective_to: new Date().toISOString().split("T")[0] })
    .eq("tenant_id", profile.tenant_id)
    .eq("formwork_type", parsed.data.formworkType)
    .eq("is_active", true);

  const { error } = await supabase.from("quick_quote_rates").insert({
    tenant_id: profile.tenant_id,
    formwork_type: parsed.data.formworkType,
    rate_per_sqm: parsed.data.ratePerSqm,
    effective_from: parsed.data.effectiveFrom,
    is_active: true,
    created_by: user!.id,
  });

  if (error) return { success: false, error: "Could not save rate." };

  revalidatePath("/panel-catalog");
  return { success: true };
}
