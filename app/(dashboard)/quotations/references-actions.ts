"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/auth/permissions";
import { dbError } from "@/lib/format";

/** Switches the "Our work at site / Our esteemed clients" PDF page on or off for one quotation. */
export async function setShowReferences(quotationId: string, show: boolean): Promise<{ ok?: boolean; error?: string }> {
  try { await requirePermission("quotations", "create"); } catch { return { error: "Permission denied." }; }
  if (!z.string().uuid().safeParse(quotationId).success) return { error: "Invalid quotation." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_quotation_show_references", { p_quotation_id: quotationId, p_show: show === true });
  if (error) return { error: dbError(error.message) };
  revalidatePath(`/quotations/${quotationId}`);
  return { ok: true };
}
