"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/auth/permissions";

const schema = z.object({
  company_name: z.string().trim().min(1, "Company name is required").max(200),
  gst_number: z.string().trim().max(20).optional(),
  company_address: z.string().trim().max(500).optional(),
  company_phone: z.string().trim().max(50).optional(),
  company_website: z.string().trim().max(200).optional(),
  bank_account_name: z.string().trim().max(200).optional(),
  bank_name: z.string().trim().max(200).optional(),
  bank_account_number: z.string().trim().max(40).optional(),
  bank_ifsc_code: z.string().trim().max(20).optional(),
  bank_branch: z.string().trim().max(200).optional(),
});

export async function saveCompanySettings(_prev: { ok?: boolean; error?: string } | undefined, formData: FormData) {
  const raw = Object.fromEntries(Object.keys(schema.shape).map((k) => [k, String(formData.get(k) ?? "")]));
  const parsed = schema.safeParse(raw);
  if (!parsed.success) return { error: Object.values(parsed.error.flatten().fieldErrors)[0]?.[0] ?? "Check the form." };

  const profile = await getCurrentProfile();
  if (!profile) return { error: "Not signed in." };

  const n = (v: string | undefined) => (v && v !== "" ? v : null);
  const d = parsed.data;
  const clean = {
    company_name: d.company_name, gst_number: n(d.gst_number), company_address: n(d.company_address),
    company_phone: n(d.company_phone), company_website: n(d.company_website), bank_account_name: n(d.bank_account_name),
    bank_name: n(d.bank_name), bank_account_number: n(d.bank_account_number), bank_ifsc_code: n(d.bank_ifsc_code), bank_branch: n(d.bank_branch),
  };
  const supabase = await createClient();
  const { data, error } = await supabase.from("tenants").update(clean).eq("id", profile.tenant_id).select("id");
  if (error) return { error: "Could not save settings." };
  if (!data || data.length === 0) return { error: "Only a Super Admin can change company settings." };

  revalidatePath("/settings");
  return { ok: true };
}
