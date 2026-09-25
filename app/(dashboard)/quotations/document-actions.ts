"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/auth/permissions";
import { dbError } from "@/lib/format";

const opt = (max: number) => z.string().trim().max(max).optional().transform((v) => (v ? v : null));

const schema = z.object({
  quotationId: z.string().uuid(),
  customerName: z.string().trim().min(1, "Customer name is required").max(200),
  kindAttn: opt(120),
  customerAddress: opt(300),
  customerPhone: opt(40),
  customerEmail: opt(200).refine((v) => v === null || /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v), "Enter a valid email"),
  customerGstin: z.string().trim().toUpperCase().max(15).optional().transform((v) => (v ? v : null))
    .refine((v) => v === null || /^[0-9]{2}[A-Z0-9]{13}$/.test(v), "GSTIN should be 15 characters"),
  projectName: opt(200),
  scheduleDescription: opt(200),
  quotationDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Choose a quotation date"),
  validityDays: z.coerce.number().int().min(1).max(365),
  nalcoRate: z.string().trim().optional().transform((v) => (v ? Number(v) : null)).refine((v) => v === null || (v > 0 && Number.isFinite(v)), "Nalco rate must be a positive number"),
  nalcoDate: z.string().trim().optional().transform((v) => (v ? v : null)),
  paymentTerms: z.string().optional().transform((v) => {
    const list = (v ?? "").split("\n").map((l) => l.replace(/^[•\-*]\s*/, "").trim()).filter(Boolean);
    return list.length ? list : null;
  }),
  areaSqm: z.string().trim().optional(),
});

export async function saveQuotationDetails(_prev: { ok?: boolean; error?: string } | undefined, formData: FormData) {
  try {
    await requirePermission("quotations", "create");
  } catch {
    return { error: "Permission denied." };
  }
  const parsed = schema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { error: Object.values(parsed.error.flatten().fieldErrors)[0]?.[0] ?? "Check the form." };
  const d = parsed.data;

  const supabase = await createClient();
  const { error } = await supabase
    .from("quotations")
    .update({
      customer_name: d.customerName,
      kind_attn: d.kindAttn,
      customer_address: d.customerAddress,
      customer_phone: d.customerPhone,
      customer_email: d.customerEmail,
      customer_gstin: d.customerGstin,
      project_name: d.projectName,
      schedule_description: d.scheduleDescription,
      quotation_date: d.quotationDate,
      validity_days: d.validityDays,
      nalco_rate_per_kg: d.nalcoRate,
      nalco_rate_date: d.nalcoDate,
      payment_terms: d.paymentTerms,
    })
    .eq("id", d.quotationId);
  if (error) return { error: dbError(error.message) };

  if (d.areaSqm) {
    const area = Number(d.areaSqm);
    if (!(area > 0)) return { error: "Area must be more than 0" };
    const { error: aErr } = await supabase.rpc("update_quick_quote_area", { p_quotation_id: d.quotationId, p_area_sqm: area });
    if (aErr) return { error: dbError(aErr.message) };
  }

  revalidatePath(`/quotations/${d.quotationId}`);
  return { ok: true };
}
