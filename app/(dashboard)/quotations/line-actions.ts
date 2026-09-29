"use server";

import { createClient } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/auth/permissions";
import { revalidatePath } from "next/cache";
import { z } from "zod";

type LineActionResult = { success: boolean; error?: string; data?: { id: string } };

function cleanDbError(message: string): string {
  return message.replace(/^.*ERROR:\s*/i, "");
}

const extraLineSchema = z.object({
  quotationId: z.string().uuid(),
  lineType: z.enum(["accessory", "transport", "service"]),
  description: z.string().trim().min(1, "Description required").max(200),
  unit: z.string().trim().min(1, "Unit required").max(20),
  quantity: z.coerce.number().positive("Quantity must be more than 0"),
  unitRate: z.coerce.number().min(0, "Rate cannot be negative"),
  notes: z.string().max(500).optional(),
});

/** Adds an accessory / transport / design-supervision line to a detailed quotation. */
export async function addExtraLine(formData: FormData): Promise<LineActionResult> {
  try {
    await requirePermission("quotations", "create");
  } catch {
    return { success: false, error: "Permission denied." };
  }

  const parsed = extraLineSchema.safeParse({
    quotationId: formData.get("quotationId"),
    lineType: formData.get("lineType"),
    description: formData.get("description"),
    unit: formData.get("unit"),
    quantity: formData.get("quantity"),
    unitRate: formData.get("unitRate"),
    notes: formData.get("notes") || undefined,
  });

  if (!parsed.success) {
    const firstError = Object.values(parsed.error.flatten().fieldErrors)[0]?.[0];
    return { success: false, error: firstError ?? "Invalid input." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("add_quotation_extra_line", {
    p_quotation_id: parsed.data.quotationId,
    p_line_type: parsed.data.lineType,
    p_description: parsed.data.description,
    p_unit: parsed.data.unit,
    p_quantity: parsed.data.quantity,
    p_unit_rate: parsed.data.unitRate,
    p_notes: parsed.data.notes,
  });

  if (error) return { success: false, error: cleanDbError(error.message) };

  revalidatePath(`/quotations/${parsed.data.quotationId}`);
  return { success: true, data: { id: data as string } };
}

const updateQtySchema = z.object({
  lineId: z.string().uuid(),
  quotationId: z.string().uuid(),
  quantity: z.coerce.number().positive("Quantity must be more than 0"),
});

/** Changes the quantity of any line (panel or extra). Panel rates stay as snapshotted. */
export async function updateLineQuantity(lineId: string, quotationId: string, quantity: string): Promise<LineActionResult> {
  try {
    await requirePermission("quotations", "create");
  } catch {
    return { success: false, error: "Permission denied." };
  }

  const parsed = updateQtySchema.safeParse({ lineId, quotationId, quantity });
  if (!parsed.success) {
    const firstError = Object.values(parsed.error.flatten().fieldErrors)[0]?.[0];
    return { success: false, error: firstError ?? "Invalid quantity." };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("update_quotation_line", {
    p_line_id: parsed.data.lineId,
    p_quantity: parsed.data.quantity,
  });

  if (error) return { success: false, error: cleanDbError(error.message) };

  revalidatePath(`/quotations/${parsed.data.quotationId}`);
  return { success: true };
}

const updateRateSchema = z.object({
  lineId: z.string().uuid(),
  quotationId: z.string().uuid(),
  unitRate: z.coerce.number().min(0, "Rate cannot be negative"),
});

/** Changes the rate of an accessory / transport / service line (not allowed on panel lines). */
export async function updateExtraLineRate(lineId: string, quotationId: string, unitRate: string): Promise<LineActionResult> {
  try {
    await requirePermission("quotations", "create");
  } catch {
    return { success: false, error: "Permission denied." };
  }

  const parsed = updateRateSchema.safeParse({ lineId, quotationId, unitRate });
  if (!parsed.success) {
    const firstError = Object.values(parsed.error.flatten().fieldErrors)[0]?.[0];
    return { success: false, error: firstError ?? "Invalid rate." };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("update_quotation_line", {
    p_line_id: parsed.data.lineId,
    p_unit_rate: parsed.data.unitRate,
  });

  if (error) return { success: false, error: cleanDbError(error.message) };

  revalidatePath(`/quotations/${parsed.data.quotationId}`);
  return { success: true };
}

const numSchema = z.object({
  id: z.string().uuid(),
  quotationId: z.string().uuid(),
  value: z.coerce.number({ invalid_type_error: "Enter a number" }).positive("Must be more than 0"),
});

/** Negotiated rate (₹/kg) on a panel line of a draft quotation. */
export async function updatePanelLineRate(lineId: string, quotationId: string, ratePerKg: string): Promise<LineActionResult> {
  try { await requirePermission("quotations", "create"); } catch { return { success: false, error: "Permission denied." }; }
  const parsed = numSchema.safeParse({ id: lineId, quotationId, value: ratePerKg });
  if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid rate." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("update_quotation_line", { p_line_id: parsed.data.id, p_rate_per_kg: parsed.data.value });
  if (error) return { success: false, error: cleanDbError(error.message) };
  revalidatePath(`/quotations/${parsed.data.quotationId}`);
  return { success: true };
}

/** Quick quote: change the area (sqm) or the rate (₹/sqm). */
export async function updateQuickQuoteField(quotationId: string, field: "area" | "rate", value: string): Promise<LineActionResult> {
  try { await requirePermission("quotations", "create"); } catch { return { success: false, error: "Permission denied." }; }
  const parsed = numSchema.safeParse({ id: quotationId, quotationId, value });
  if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid value." };
  const supabase = await createClient();
  const { error } = field === "area"
    ? await supabase.rpc("update_quick_quote_area", { p_quotation_id: quotationId, p_area_sqm: parsed.data.value })
    : await supabase.rpc("update_quick_quote_rate", { p_quotation_id: quotationId, p_rate_per_sqm: parsed.data.value });
  if (error) return { success: false, error: cleanDbError(error.message) };
  revalidatePath(`/quotations/${quotationId}`);
  revalidatePath("/quotations");
  return { success: true };
}
