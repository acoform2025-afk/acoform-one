"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/auth/permissions";
import { dbError } from "@/lib/format";

type Result = { success: boolean; error?: string; data?: { id: string } };

const rowSchema = z.object({
  kind: z.enum(["accessory", "transport"]).default("accessory"),
  item: z.string().trim().min(1, "Every row needs an item").max(200),
  spec: z.string().trim().max(200).default(""),
  qty: z.coerce.number().positive("Quantity must be more than 0"),
  unit: z.string().trim().min(1).max(20).default("Nos"),
  rate: z.coerce.number().min(0, "Rate cannot be negative").default(0),
});
const rowsSchema = z.array(rowSchema).min(1, "Add at least one item").max(100, "At most 100 items");
const opt = (max: number) => z.string().trim().max(max).optional().transform((v) => (v ? v : null));

async function addRows(supabase: Awaited<ReturnType<typeof createClient>>, quotationId: string, rows: z.infer<typeof rowsSchema>): Promise<string | null> {
  for (const r of rows) {
    const { error } = await supabase.rpc("add_quotation_extra_line", {
      p_quotation_id: quotationId, p_line_type: r.kind, p_description: r.item, p_unit: r.unit, p_quantity: r.qty, p_unit_rate: r.rate, p_notes: r.spec || undefined,
    });
    if (error) return dbError(error.message);
  }
  return null;
}

/** A quotation for accessories only (no formwork set): the items as the customer asked for them, priced per piece. */
export async function createAccessoriesQuote(formData: FormData): Promise<Result> {
  try { await requirePermission("quotations", "create"); } catch { return { success: false, error: "You don't have permission to create quotations." }; }
  const base = z.object({
    quotationCode: z.string().trim().min(1, "Quotation code required").max(60),
    customerName: z.string().trim().min(1, "Customer name required").max(200),
    leadId: z.string().uuid().optional(),
    kindAttn: opt(120), customerPhone: opt(40), customerEmail: opt(200), customerAddress: opt(300), projectName: opt(200),
    deliveryPlace: opt(200), application: opt(200),
  }).safeParse({
    quotationCode: formData.get("quotationCode"), customerName: formData.get("customerName"), leadId: formData.get("leadId") || undefined,
    kindAttn: formData.get("kindAttn") ?? undefined, customerPhone: formData.get("customerPhone") ?? undefined, customerEmail: formData.get("customerEmail") ?? undefined,
    customerAddress: formData.get("customerAddress") ?? undefined, projectName: formData.get("projectName") ?? undefined,
    deliveryPlace: formData.get("deliveryPlace") ?? undefined, application: formData.get("application") ?? undefined,
  });
  if (!base.success) return { success: false, error: Object.values(base.error.flatten().fieldErrors)[0]?.[0] ?? "Check the form." };
  let rowsIn: unknown;
  try { rowsIn = JSON.parse(String(formData.get("rows") ?? "[]")); } catch { return { success: false, error: "Check the items." }; }
  const rows = rowsSchema.safeParse(rowsIn);
  if (!rows.success) return { success: false, error: rows.error.issues[0]?.message ?? "Check the items." };
  const d = base.data;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { data: profile } = await supabase.from("users").select("tenant_id").eq("id", user!.id).single();
  if (!profile) return { success: false, error: "Could not resolve your tenant." };
  const contact = Object.fromEntries(Object.entries({ kind_attn: d.kindAttn, customer_phone: d.customerPhone, customer_email: d.customerEmail, customer_address: d.customerAddress, project_name: d.projectName }).filter(([, v]) => v !== null));
  const { data, error } = await supabase.from("quotations").insert({
    tenant_id: profile.tenant_id, quotation_code: d.quotationCode, customer_name: d.customerName, lead_id: d.leadId ?? null, created_by: user!.id,
    quotation_type: "accessories", delivery_place: d.deliveryPlace, application: d.application ?? "Aluminium Formwork", show_references: false, ...contact,
  }).select("id").single();
  if (error) return { success: false, error: error.message.includes("quotations_tenant_id_quotation_code_key") ? "A quotation with that code already exists." : dbError(error.message) };
  const err = await addRows(supabase, data.id, rows.data);
  if (err) return { success: false, error: `Quotation created, but an item could not be added: ${err}` };
  revalidatePath("/quotations");
  return { success: true, data: { id: data.id } };
}

/** More items on an accessories quotation (typed in or pasted from the customer's message). */
export async function addAccessoryRows(quotationId: string, rowsIn: unknown): Promise<Result> {
  try { await requirePermission("quotations", "create"); } catch { return { success: false, error: "Permission denied." }; }
  if (!z.string().uuid().safeParse(quotationId).success) return { success: false, error: "Invalid quotation." };
  const rows = rowsSchema.safeParse(rowsIn);
  if (!rows.success) return { success: false, error: rows.error.issues[0]?.message ?? "Check the items." };
  const supabase = await createClient();
  const err = await addRows(supabase, quotationId, rows.data);
  revalidatePath(`/quotations/${quotationId}`);
  return err ? { success: false, error: err } : { success: true };
}

/** Delivery place and what the material is used for (printed on the accessories quotation). */
export async function saveAccessoryQuoteInfo(quotationId: string, deliveryPlace: string, application: string): Promise<Result> {
  try { await requirePermission("quotations", "create"); } catch { return { success: false, error: "Permission denied." }; }
  if (!z.string().uuid().safeParse(quotationId).success) return { success: false, error: "Invalid quotation." };
  const supabase = await createClient();
  const { error } = await supabase.from("quotations").update({ delivery_place: deliveryPlace.trim().slice(0, 200) || null, application: application.trim().slice(0, 200) || null }).eq("id", quotationId);
  if (error) return { success: false, error: dbError(error.message) };
  revalidatePath(`/quotations/${quotationId}`);
  return { success: true };
}
