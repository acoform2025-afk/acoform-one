"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/auth/permissions";
import { dbError } from "@/lib/format";

const rowSchema = z.object({
  item: z.string().max(150),
  description: z.string().max(300),
  unit: z.string().max(20),
  remarks: z.string().max(100),
});

/**
 * Saves the quotation's own "Accessories inclusive list" (printed on the PDF).
 * rows = null resets it to the standard list for the formwork type.
 */
export async function saveAccessories(quotationId: string, rows: z.infer<typeof rowSchema>[] | null): Promise<{ ok?: boolean; error?: string }> {
  try { await requirePermission("quotations", "create"); } catch { return { error: "Permission denied." }; }
  if (!z.string().uuid().safeParse(quotationId).success) return { error: "Invalid quotation." };
  let items: z.infer<typeof rowSchema>[] | null = null;
  if (rows !== null) {
    const parsed = z.array(rowSchema).max(100, "At most 100 rows").safeParse(rows);
    if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the accessories list." };
    items = parsed.data;
  }
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_quotation_accessories", { p_quotation_id: quotationId, p_items: items });
  if (error) return { error: dbError(error.message) };
  revalidatePath(`/quotations/${quotationId}`);
  return { ok: true };
}
