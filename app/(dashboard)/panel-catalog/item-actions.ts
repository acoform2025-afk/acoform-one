"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile, hasPermission } from "@/lib/auth/permissions";
import { dbError } from "@/lib/format";

const CATEGORIES = [
  "wall_panel", "deck_panel", "internal_corner", "external_corner", "soffit_corner", "kicker", "extension_panel", "filler_panel",
  "beam_side_panel", "beam_soffit_panel", "deck_beam", "prop_head", "accessory",
] as const;

const schema = z.object({
  id: z.string().uuid().optional().or(z.literal("").transform(() => undefined)),
  panel_code: z.string().trim().min(1, "Code required").max(40).regex(/^[A-Za-z0-9.\-_/]+$/, "Use letters, numbers, - . _ /"),
  panel_category: z.enum(CATEGORIES),
  width_mm: z.coerce.number().positive().max(20000),
  height_mm: z.coerce.number().positive().max(20000),
  weight_kg: z.coerce.number().positive().max(5000),
  description: z.string().trim().max(120).optional().transform((v) => v || null),
  unit: z.enum(["nos", "set", "m"]).default("nos"),
});

export type ItemResult = { ok?: boolean; error?: string } | undefined;

export async function saveCatalogItem(_p: ItemResult, formData: FormData): Promise<ItemResult> {
  if (!(await hasPermission("panel_master", "manage"))) return { error: "You don't have permission to edit the panel catalogue." };
  const parsed = schema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    const [f, m] = Object.entries(parsed.error.flatten().fieldErrors)[0] ?? [];
    return { error: f ? `${f.replace(/_/g, " ")}: ${m?.[0]}` : "Check the values." };
  }
  const profile = await getCurrentProfile();
  if (!profile) return { error: "Not signed in." };
  const { id, ...row } = parsed.data;
  const supabase = await createClient();
  const q = id
    ? supabase.from("panel_master").update(row).eq("id", id).select("id")
    : supabase.from("panel_master").insert({ ...row, tenant_id: profile.tenant_id, is_standard: true }).select("id");
  const { data, error } = await q;
  if (error) return { error: error.code === "23505" ? "That code already exists." : dbError(error.message) };
  if (!data?.length) return { error: "Not saved (no permission)." };
  revalidatePath("/panel-catalog");
  return { ok: true };
}

export async function setCatalogItemActive(id: string, active: boolean): Promise<ItemResult> {
  if (!(await hasPermission("panel_master", "manage"))) return { error: "No permission." };
  if (!z.string().uuid().safeParse(id).success) return { error: "Invalid item." };
  const supabase = await createClient();
  const { error } = await supabase.from("panel_master").update({ is_active: active }).eq("id", id);
  if (error) return { error: dbError(error.message) };
  revalidatePath("/panel-catalog");
  return { ok: true };
}
