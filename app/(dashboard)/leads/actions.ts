"use server";

import { createClient } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/auth/permissions";
import { revalidatePath } from "next/cache";
import { z } from "zod";

const createLeadSchema = z.object({
  leadCode: z.string().min(1, "Lead code is required"),
  customerName: z.string().min(1, "Customer name is required"),
  companyName: z.string().optional(),
  contactPersonName: z.string().optional(),
  contactPhone: z.string().optional(),
  contactEmail: z.string().optional(),
  gstNumber: z.string().optional(),
  projectLocation: z.string().optional(),
  estimatedAreaSqm: z.coerce.number().positive().optional(),
  projectType: z.string().optional(),
  numFloors: z.coerce.number().int().positive().optional(),
  numRepetitiveUnits: z.coerce.number().int().positive().optional(),
  sourceChannel: z.string().optional(),
  expectedStartDate: z.string().optional(),
  formworkType: z.string().optional(),
});

export type ActionResult = { success: boolean; error?: string };

function emptyToUndefined(v: FormDataEntryValue | null): string | undefined {
  const s = v?.toString().trim();
  return s ? s : undefined;
}

export async function createLead(formData: FormData): Promise<ActionResult> {
  try {
    await requirePermission("leads", "create");
  } catch {
    return { success: false, error: "You don't have permission to create leads." };
  }

  const parsed = createLeadSchema.safeParse({
    leadCode: formData.get("leadCode"),
    customerName: formData.get("customerName"),
    companyName: emptyToUndefined(formData.get("companyName")),
    contactPersonName: emptyToUndefined(formData.get("contactPersonName")),
    contactPhone: emptyToUndefined(formData.get("contactPhone")),
    contactEmail: emptyToUndefined(formData.get("contactEmail")),
    gstNumber: emptyToUndefined(formData.get("gstNumber")),
    projectLocation: emptyToUndefined(formData.get("projectLocation")),
    estimatedAreaSqm: emptyToUndefined(formData.get("estimatedAreaSqm")),
    projectType: emptyToUndefined(formData.get("projectType")),
    numFloors: emptyToUndefined(formData.get("numFloors")),
    numRepetitiveUnits: emptyToUndefined(formData.get("numRepetitiveUnits")),
    sourceChannel: emptyToUndefined(formData.get("sourceChannel")),
    expectedStartDate: emptyToUndefined(formData.get("expectedStartDate")),
    formworkType: emptyToUndefined(formData.get("formworkType")),
  });

  if (!parsed.success) {
    return { success: false, error: "Please check the form and try again." };
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const { data: profile } = await supabase.from("users").select("tenant_id").eq("id", user!.id).single();
  if (!profile) return { success: false, error: "Could not resolve your tenant." };

  const { error } = await supabase.from("leads").insert({
    tenant_id: profile.tenant_id,
    lead_code: parsed.data.leadCode,
    customer_name: parsed.data.customerName,
    company_name: parsed.data.companyName ?? parsed.data.customerName,
    contact_person_name: parsed.data.contactPersonName ?? null,
    contact_phone: parsed.data.contactPhone ?? null,
    contact_email: parsed.data.contactEmail ?? null,
    gst_number: parsed.data.gstNumber ?? null,
    project_location: parsed.data.projectLocation ?? null,
    estimated_area_sqm: parsed.data.estimatedAreaSqm ?? null,
    project_type: parsed.data.projectType ?? null,
    num_floors: parsed.data.numFloors ?? null,
    num_repetitive_units: parsed.data.numRepetitiveUnits ?? null,
    source_channel: parsed.data.sourceChannel ?? null,
    expected_start_date: parsed.data.expectedStartDate ?? null,
    formwork_type: parsed.data.formworkType ?? "undecided",
    owner_user_id: user!.id,
  });

  if (error) {
    const isDuplicate = error.message.includes("leads_tenant_id_lead_code_key");
    return { success: false, error: isDuplicate ? "A lead with that code already exists." : "Could not create the lead. Please try again." };
  }

  revalidatePath("/leads");
  return { success: true };
}
