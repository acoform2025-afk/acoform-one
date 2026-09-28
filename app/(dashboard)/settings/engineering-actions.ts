"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { dbError } from "@/lib/format";

const pos = (max: number) => z.coerce.number().positive().max(max);
const schema = z.object({
  concrete_density_kn_m3: pos(40),
  tie_capacity_kn: pos(1000),
  tie_spacing_h_mm: pos(3000),
  tie_spacing_v_mm: pos(3000),
  panel_e_mpa: pos(300000),
  panel_i_mm4_per_mm: pos(1e7),
  min_safety_factor: z.coerce.number().min(1).max(10),
  deflection_limit_wall: z.coerce.number().min(100).max(1000),
  is_certified: z.string().optional().transform((v) => v === "on"),
  certified_by: z.string().trim().max(120).optional().transform((v) => (v ? v : null)),
  certification_note: z.string().trim().max(500).optional().transform((v) => (v ? v : null)),
});

export async function saveEngineeringParameters(_p: { ok?: boolean; error?: string } | undefined, formData: FormData) {
  const parsed = schema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    const [field, msgs] = Object.entries(parsed.error.flatten().fieldErrors)[0] ?? [];
    return { error: field ? `${field.replace(/_/g, " ")}: ${msgs?.[0]}` : "Check the values." };
  }
  if (parsed.data.is_certified && !parsed.data.certified_by) return { error: "Enter who certified these values." };
  const supabase = await createClient();
  const { data: t } = await supabase.from("engineering_parameters").select("tenant_id").maybeSingle();
  if (!t) return { error: "Parameters not found." };
  const { data, error } = await supabase.from("engineering_parameters").update(parsed.data).eq("tenant_id", t.tenant_id).select("tenant_id");
  if (error) return { error: dbError(error.message) };
  if (!data?.length) return { error: "Only users who can approve designs (Design Head) can change these." };
  revalidatePath("/settings");
  return { ok: true };
}
