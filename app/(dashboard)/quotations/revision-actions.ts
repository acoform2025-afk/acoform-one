"use server";

import { createClient } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/auth/permissions";
import { revalidatePath } from "next/cache";
import { z } from "zod";

type RevisionResult = { success: boolean; error?: string; data?: { id: string } };

const schema = z.object({
  quotationId: z.string().uuid(),
  reprice: z.boolean(),
  areaSqm: z.number().positive("Area must be more than 0").optional(),
});

/**
 * Creates the next revision (R1, R2 ...) of an approved / sent / rejected / expired quotation.
 * The source quotation becomes "superseded". Returns the new quotation id.
 */
export async function createRevision(quotationId: string, reprice: boolean, areaSqm?: string): Promise<RevisionResult> {
  try {
    await requirePermission("quotations", "create");
  } catch {
    return { success: false, error: "Permission denied." };
  }

  const parsed = schema.safeParse({
    quotationId,
    reprice,
    areaSqm: areaSqm && areaSqm.trim() !== "" ? Number(areaSqm) : undefined,
  });
  if (!parsed.success) {
    const firstError = Object.values(parsed.error.flatten().fieldErrors)[0]?.[0];
    return { success: false, error: firstError ?? "Invalid input." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_quotation_revision", {
    p_quotation_id: parsed.data.quotationId,
    p_reprice: parsed.data.reprice,
    p_area_sqm: parsed.data.areaSqm,
  });

  if (error) return { success: false, error: error.message.replace(/^.*ERROR:\s*/i, "") };

  revalidatePath("/quotations");
  revalidatePath(`/quotations/${parsed.data.quotationId}`);
  return { success: true, data: { id: data as string } };
}
