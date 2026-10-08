"use server";

import { createClient } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/auth/permissions";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

export type ActionResult = { success: boolean; error?: string; data?: { id: string } };

const optText = (max: number) => z.string().trim().max(max).optional().transform((v) => (v ? v : null));
const contactSchema = z.object({
  kindAttn: optText(120),
  customerPhone: optText(40),
  customerEmail: z.string().trim().max(200).optional().transform((v) => (v ? v : null))
    .refine((v) => v === null || /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v), "Enter a valid email"),
  customerGstin: z.string().trim().toUpperCase().max(15).optional().transform((v) => (v ? v : null))
    .refine((v) => v === null || /^[0-9]{2}[A-Z0-9]{13}$/.test(v), "GSTIN should be 15 characters"),
  customerAddress: optText(300),
  projectName: optText(200),
});

function readContact(formData: FormData) {
  return contactSchema.safeParse({
    kindAttn: formData.get("kindAttn") ?? undefined,
    customerPhone: formData.get("customerPhone") ?? undefined,
    customerEmail: formData.get("customerEmail") ?? undefined,
    customerGstin: formData.get("customerGstin") ?? undefined,
    customerAddress: formData.get("customerAddress") ?? undefined,
    projectName: formData.get("projectName") ?? undefined,
  });
}

/** Only non-empty values, so the lead's details (filled by the database) are not overwritten with blanks. */
function contactColumns(c: z.infer<typeof contactSchema>) {
  const cols = {
    kind_attn: c.kindAttn, customer_phone: c.customerPhone, customer_email: c.customerEmail,
    customer_gstin: c.customerGstin, customer_address: c.customerAddress, project_name: c.projectName,
  };
  return Object.fromEntries(Object.entries(cols).filter(([, v]) => v !== null)) as Partial<typeof cols>;
}

const createQuotationSchema = z.object({
  quotationCode: z.string().min(1, "Quotation code required"),
  customerName: z.string().min(1, "Customer name required"),
  leadId: z.string().uuid().optional(),
  validUntil: z.string().optional(),
  formworkType: z.enum(["monolithic", "vertical"]).default("monolithic"),
});

export async function createQuotation(formData: FormData): Promise<ActionResult> {
  try {
    await requirePermission("quotations", "create");
  } catch {
    return { success: false, error: "You don't have permission to create quotations." };
  }

  const parsed = createQuotationSchema.safeParse({
    quotationCode: formData.get("quotationCode"),
    customerName: formData.get("customerName"),
    leadId: formData.get("leadId") || undefined,
    validUntil: formData.get("validUntil") || undefined,
    formworkType: formData.get("formworkType") || undefined,
  });

  if (!parsed.success) return { success: false, error: "Please check the form and try again." };
  const contact = readContact(formData);
  if (!contact.success) return { success: false, error: Object.values(contact.error.flatten().fieldErrors)[0]?.[0] ?? "Check the customer details." };

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { data: profile } = await supabase.from("users").select("tenant_id").eq("id", user!.id).single();
  if (!profile) return { success: false, error: "Could not resolve your tenant." };

  const { data, error } = await supabase.from("quotations").insert({
    tenant_id: profile.tenant_id,
    quotation_code: parsed.data.quotationCode,
    customer_name: parsed.data.customerName,
    lead_id: parsed.data.leadId ?? null,
    valid_until: parsed.data.validUntil ?? null,
    created_by: user!.id,
    quotation_type: "detailed",
    formwork_type: parsed.data.formworkType,
    area_basis: parsed.data.formworkType === "monolithic" ? "floor_plate" : "vertical_face",
    ...contactColumns(contact.data),
  }).select("id").single();

  if (error) {
    const isDuplicate = error.message.includes("quotations_tenant_id_quotation_code_key");
    return { success: false, error: isDuplicate ? "A quotation with that code already exists." : "Could not create quotation. Please try again." };
  }

  revalidatePath("/quotations");
  return { success: true, data: { id: data.id } };
}

const quickQuoteSchema = z.object({
  quotationCode: z.string().min(1, "Quotation code required"),
  customerName: z.string().min(1, "Customer name required"),
  formworkType: z.enum(["monolithic", "vertical"]),
  areaSqm: z.coerce.number().positive("Area must be a positive number"),
  leadId: z.string().uuid().optional(),
  validUntil: z.string().optional(),
  nalcoRatePerKg: z.coerce.number().positive().optional(),
});

export async function createQuickQuote(formData: FormData): Promise<ActionResult> {
  try {
    await requirePermission("quotations", "create");
  } catch {
    return { success: false, error: "You don't have permission to create quotations." };
  }

  const parsed = quickQuoteSchema.safeParse({
    quotationCode: formData.get("quotationCode"),
    customerName: formData.get("customerName"),
    formworkType: formData.get("formworkType"),
    areaSqm: formData.get("areaSqm"),
    leadId: formData.get("leadId") || undefined,
    validUntil: formData.get("validUntil") || undefined,
    nalcoRatePerKg: formData.get("nalcoRatePerKg") || undefined,
  });

  if (!parsed.success) {
    const firstError = Object.values(parsed.error.flatten().fieldErrors)[0]?.[0];
    return { success: false, error: firstError ?? "Please check the form and try again." };
  }
  const contact = readContact(formData);
  if (!contact.success) return { success: false, error: Object.values(contact.error.flatten().fieldErrors)[0]?.[0] ?? "Check the customer details." };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_quick_quote", {
    p_quotation_code: parsed.data.quotationCode,
    p_customer_name: parsed.data.customerName,
    p_formwork_type: parsed.data.formworkType,
    p_area_sqm: parsed.data.areaSqm,
    p_lead_id: parsed.data.leadId,
    p_valid_until: parsed.data.validUntil,
    p_nalco_rate_per_kg: parsed.data.nalcoRatePerKg,
  });

  if (error) {
    const isDuplicate = error.message.includes("quotations_tenant_id_quotation_code_key");
    const isNoRate = error.message.includes("No active");
    return {
      success: false,
      error: isDuplicate ? "A quotation with that code already exists." : isNoRate ? error.message.replace(/^.*ERROR:\s*/i, "") : "Could not create quick quote. Please try again.",
    };
  }

  const extra = contactColumns(contact.data);
  if (Object.keys(extra).length > 0) await supabase.from("quotations").update(extra).eq("id", data as string);

  // made from the measured blocks of a project → one line per block (and the second wall option, when quoted)
  const blocksRaw = String(formData.get("blocks") ?? "");
  if (blocksRaw) {
    const bl = z.array(z.object({ id: z.string().uuid().optional(), name: z.string().min(1).max(60), area: z.array(z.number().min(0)).min(1).max(2) })).max(40).safeParse(JSON.parse(blocksRaw));
    const labels = z.array(z.string().max(80)).length(2).safeParse(JSON.parse(String(formData.get("optionLabels") || "null")));
    if (bl.success && bl.data.length) {
      const desc = ["Aluminium formwork — typical floor", ...bl.data.map((b) => `${b.name}: ${b.area[0]} Sqm`)].join("; ");
      const two = labels.success && bl.data.every((b) => b.area.length === 2);
      await supabase.from("quotations").update({ schedule_description: desc, floor_plan_id: bl.data[0].id ?? null, options: two ? { labels: labels.data, blocks: bl.data, note: "Amount in words and the summary figures are for Option 1. Quantities as per approved GFC drawings." } : { blocks: bl.data } }).eq("id", data as string);
    }
  }
  // made from a measured floor plan → print that plan on the quotation
  const planId = String(formData.get("floorPlanId") ?? "");
  if (/^[0-9a-f-]{36}$/i.test(planId)) await supabase.rpc("set_quotation_floor_plan", { p_quotation_id: data as string, p_floor_plan_id: planId });

  revalidatePath("/quotations");
  return { success: true, data: { id: data as string } };
}

const addLineSchema = z.object({
  quotationId: z.string().uuid(),
  panelCode: z.string().min(1),
  quantity: z.coerce.number().int().positive("Quantity must be at least 1"),
  notes: z.string().optional(),
});

export async function addQuotationLine(formData: FormData): Promise<ActionResult> {
  try {
    await requirePermission("quotations", "create");
  } catch {
    return { success: false, error: "Permission denied." };
  }

  const parsed = addLineSchema.safeParse({
    quotationId: formData.get("quotationId"),
    panelCode: formData.get("panelCode"),
    quantity: formData.get("quantity"),
    notes: formData.get("notes") || undefined,
  });

  if (!parsed.success) {
    const firstError = Object.values(parsed.error.flatten().fieldErrors)[0]?.[0];
    return { success: false, error: firstError ?? "Invalid input." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("add_quotation_line", {
    p_quotation_id: parsed.data.quotationId,
    p_panel_code: parsed.data.panelCode,
    p_quantity: parsed.data.quantity,
    p_notes: parsed.data.notes ?? undefined,
  });

  if (error) return { success: false, error: error.message.replace(/^.*ERROR:\s*/i, "") };

  revalidatePath(`/quotations/${parsed.data.quotationId}`);
  return { success: true, data: { id: data as string } };
}

export async function removeQuotationLine(lineId: string, quotationId: string): Promise<ActionResult> {
  try {
    await requirePermission("quotations", "create");
  } catch {
    return { success: false, error: "Permission denied." };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("quotation_lines").delete().eq("id", lineId);
  if (error) return { success: false, error: "Could not remove line item." };

  revalidatePath(`/quotations/${quotationId}`);
  return { success: true };
}

export async function submitForApproval(quotationId: string): Promise<ActionResult> {
  try {
    await requirePermission("quotations", "create");
  } catch {
    return { success: false, error: "Permission denied." };
  }

  const supabase = await createClient();
  const { data: quotation } = await supabase.from("quotations").select("quotation_type").eq("id", quotationId).single();

  if (quotation?.quotation_type === "detailed" || quotation?.quotation_type === "accessories") {
    const { count } = await supabase.from("quotation_lines").select("*", { count: "exact", head: true }).eq("quotation_id", quotationId);
    if (!count || count === 0) return { success: false, error: "Add at least one line before submitting for approval." };
  }
  // an accessories quotation goes out only when every item is priced
  if (quotation?.quotation_type === "accessories") {
    const { count } = await supabase.from("quotation_lines").select("*", { count: "exact", head: true }).eq("quotation_id", quotationId).eq("unit_rate", 0);
    if (count) return { success: false, error: `${count} item${count > 1 ? "s have" : " has"} no rate yet. Enter every rate before submitting.` };
  }

  const { error } = await supabase.from("quotations").update({ status: "pending_approval" }).eq("id", quotationId);
  if (error) return { success: false, error: "Could not submit for approval." };

  revalidatePath(`/quotations/${quotationId}`);
  return { success: true };
}

export async function approveQuotation(quotationId: string): Promise<ActionResult> {
  try {
    await requirePermission("quotations", "approve");
  } catch {
    return { success: false, error: "You don't have approval authority for quotations." };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("quotations").update({ status: "approved" }).eq("id", quotationId);
  if (error) return { success: false, error: "Could not approve quotation." };

  revalidatePath(`/quotations/${quotationId}`);
  revalidatePath("/quotations");
  return { success: true };
}

const convertSchema = z.object({
  quotationId: z.string().uuid(),
  projectCode: z.string().min(1, "Project code required"),
  siteAddress: z.string().optional(),
  startDate: z.string().optional(),
  targetCompletion: z.string().optional(),
});

export async function convertToProject(formData: FormData): Promise<ActionResult> {
  try {
    await requirePermission("projects", "create");
  } catch {
    return { success: false, error: "You don't have permission to create projects." };
  }

  const parsed = convertSchema.safeParse({
    quotationId: formData.get("quotationId"),
    projectCode: formData.get("projectCode"),
    siteAddress: formData.get("siteAddress") || undefined,
    startDate: formData.get("startDate") || undefined,
    targetCompletion: formData.get("targetCompletion") || undefined,
  });

  if (!parsed.success) return { success: false, error: "Please check the form and try again." };

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { data: quotation } = await supabase.from("quotations").select("customer_name, status, tenant_id").eq("id", parsed.data.quotationId).single();

  if (!quotation) return { success: false, error: "Quotation not found." };
  if (quotation.status !== "approved") return { success: false, error: "Only an approved quotation can be converted to a project." };

  const { data, error } = await supabase.from("projects").insert({
    tenant_id: quotation.tenant_id,
    project_code: parsed.data.projectCode,
    quotation_id: parsed.data.quotationId,
    customer_name: quotation.customer_name,
    site_address: parsed.data.siteAddress ?? null,
    start_date: parsed.data.startDate ?? null,
    target_completion: parsed.data.targetCompletion ?? null,
    project_manager_id: user!.id,
  }).select("id").single();

  if (error) {
    const isDuplicate = error.message.includes("projects_tenant_id_project_code_key");
    return { success: false, error: isDuplicate ? "A project with that code already exists." : "Could not create project. Please try again." };
  }

  await supabase.from("quotations").update({ status: "accepted" }).eq("id", parsed.data.quotationId);
  revalidatePath("/quotations");
  redirect(`/projects/${data.id}`);
}
