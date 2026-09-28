"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { dbError } from "@/lib/format";
import type { Result } from "@/components/action-button";

const ids = z.array(z.string().uuid()).min(1, "Select at least one panel");

const dispatchSchema = z.object({
  projectId: z.string().uuid("Choose a project"),
  vehicleNo: z.string().trim().max(20).optional(),
  driverName: z.string().trim().max(80).optional(),
  driverPhone: z.string().trim().max(20).optional(),
  transporter: z.string().trim().max(120).optional(),
  notes: z.string().trim().max(500).optional(),
});

export async function dispatchPanels(_p: { error?: string } | undefined, formData: FormData): Promise<{ error?: string } | undefined> {
  const panelIds = ids.safeParse(formData.getAll("panelId"));
  if (!panelIds.success) return { error: "Select at least one in-stock panel." };
  const parsed = dispatchSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { error: Object.values(parsed.error.flatten().fieldErrors)[0]?.[0] ?? "Check the form." };
  const d = parsed.data;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_dispatch", {
    p_project_id: d.projectId, p_panel_ids: panelIds.data, p_vehicle_no: d.vehicleNo, p_driver_name: d.driverName,
    p_driver_phone: d.driverPhone, p_transporter: d.transporter, p_notes: d.notes,
  });
  if (error) return { error: dbError(error.message) };
  redirect(`/dispatches/${data}`);
}

export async function returnPanels(_p: { error?: string; ok?: boolean } | undefined, formData: FormData) {
  const panelIds = ids.safeParse(formData.getAll("panelId"));
  if (!panelIds.success) return { error: "Select at least one panel on site." };
  const condition = formData.get("condition") === "damaged" ? "damaged" : "good";
  const notes = String(formData.get("notes") ?? "").trim() || undefined;
  const supabase = await createClient();
  const { error } = await supabase.rpc("return_panels", { p_panel_ids: panelIds.data, p_condition: condition, p_notes: notes });
  if (error) return { error: dbError(error.message) };
  revalidatePath("/inventory");
  return { ok: true };
}

export async function closeRepair(panelId: string, scrap: boolean): Promise<Result> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("close_panel_repair", { p_panel_id: panelId, p_scrap: scrap });
  if (error) return { success: false, error: dbError(error.message) };
  revalidatePath("/inventory");
  revalidatePath(`/inventory/${panelId}`);
  return { success: true };
}

export async function confirmDelivery(noteId: string): Promise<Result> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("confirm_delivery", { p_dispatch_note_id: noteId });
  if (error) return { success: false, error: dbError(error.message) };
  revalidatePath(`/dispatches/${noteId}`);
  return { success: true };
}
