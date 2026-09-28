"use server";

import { createClient } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/auth/permissions";
import { revalidatePath } from "next/cache";
import { z } from "zod";

const positiveNumber = (label: string) =>
  z.coerce.number({ invalid_type_error: `${label} must be a number` }).positive(`${label} must be more than 0`);
const positiveWhole = (label: string) =>
  z.coerce.number({ invalid_type_error: `${label} must be a number` }).int(`${label} must be a whole number`).positive(`${label} must be more than 0`);

const createLeadSchema = z.object({
  projectName: z.string({ required_error: "Project name is required" }).min(1, "Project name is required"),
  companyName: z.string().optional(),
  contactPersonName: z.string().optional(),
  contactPhone: z.string().optional(),
  contactEmail: z.string().optional(),
  gstNumber: z.string().optional(),
  projectLocation: z.string().optional(),
  estimatedAreaSqm: positiveNumber("Estimated area").optional(),
  projectType: z.string().optional(),
  numFloors: positiveWhole("Number of floors").optional(),
  numRepetitiveUnits: positiveWhole("Repetitive units").optional(),
  sourceChannel: z.string().optional(),
  expectedStartDate: z.string().optional(),
  formworkType: z.string().optional(),
});

export type ActionResult = { success: boolean; error?: string; leadCode?: string };

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
    projectName: emptyToUndefined(formData.get("projectName")),
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
    // Say exactly which field is wrong instead of a generic message
    return { success: false, error: parsed.error.issues[0]?.message ?? "Please check the form and try again." };
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "Your session has expired. Please sign in again." };

  const { data: profile } = await supabase.from("users").select("tenant_id").eq("id", user.id).single();
  if (!profile) return { success: false, error: "Could not resolve your tenant." };

  // lead_code is left out on purpose: the database numbers it (ACOFORM/LEAD/<FY>/001)
  const { data: created, error } = await supabase.from("leads").insert({
    tenant_id: profile.tenant_id,
    project_name: parsed.data.projectName,
    customer_name: parsed.data.companyName ?? parsed.data.projectName,
    company_name: parsed.data.companyName ?? null,
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
    owner_user_id: user.id,
  }).select("lead_code").single();

  if (error) {
    console.error("createLead failed:", error.message);
    return { success: false, error: `Could not create the lead: ${error.message}` };
  }

  revalidatePath("/leads");
  return { success: true, leadCode: created?.lead_code };
}
