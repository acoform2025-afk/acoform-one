"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile, requirePermission } from "@/lib/auth/permissions";
import { dbError } from "@/lib/format";
import { MEDIA_BUCKET } from "@/lib/quotations/media";

type Result = { ok?: boolean; error?: string };
const kindSchema = z.enum(["site_photo", "client_logo"]);
const captionSchema = z.string().trim().max(120).optional();

async function guard(): Promise<string | null> {
  try { await requirePermission("quotations", "approve"); } catch { return "Only managers who can approve quotations can change these pictures."; }
  return null;
}

/** Records a picture the browser has just uploaded to storage (folder = the company's id). */
export async function addMedia(kind: string, storagePath: string, caption?: string): Promise<Result> {
  const denied = await guard(); if (denied) return { error: denied };
  const k = kindSchema.safeParse(kind); if (!k.success) return { error: "Invalid picture type." };
  const c = captionSchema.safeParse(caption); if (!c.success) return { error: "Name is too long (max 120 characters)." };
  const profile = await getCurrentProfile();
  if (!profile) return { error: "Not signed in." };
  if (!new RegExp(`^${profile.tenant_id}/[A-Za-z0-9_-]+\\.(jpg|png)$`).test(storagePath)) return { error: "Invalid file." };

  const supabase = await createClient();
  const { data: last } = await supabase.from("quotation_media").select("sort_order").eq("kind", k.data)
    .order("sort_order", { ascending: false }).limit(1).maybeSingle();
  const { error } = await supabase.from("quotation_media").insert({
    kind: k.data, storage_path: storagePath, caption: c.data || null, sort_order: (last?.sort_order ?? 0) + 1,
  });
  if (error) {
    await supabase.storage.from(MEDIA_BUCKET).remove([storagePath]); // don't leave an orphan file behind
    return { error: dbError(error.message) };
  }
  revalidatePath("/settings");
  return { ok: true };
}

export async function deleteMedia(id: string): Promise<Result> {
  const denied = await guard(); if (denied) return { error: denied };
  if (!z.string().uuid().safeParse(id).success) return { error: "Invalid picture." };
  const supabase = await createClient();
  const { data: row } = await supabase.from("quotation_media").select("storage_path").eq("id", id).maybeSingle();
  if (!row) return { error: "Picture not found." };
  const { error } = await supabase.from("quotation_media").delete().eq("id", id);
  if (error) return { error: dbError(error.message) };
  if (!row.storage_path.startsWith("builtin:")) await supabase.storage.from(MEDIA_BUCKET).remove([row.storage_path]);
  revalidatePath("/settings");
  return { ok: true };
}

export async function moveMedia(id: string, direction: -1 | 1): Promise<Result> {
  const denied = await guard(); if (denied) return { error: denied };
  if (!z.string().uuid().safeParse(id).success) return { error: "Invalid picture." };
  const supabase = await createClient();
  const { data: row } = await supabase.from("quotation_media").select("kind").eq("id", id).maybeSingle();
  if (!row) return { error: "Picture not found." };
  const { data: list } = await supabase.from("quotation_media").select("id").eq("kind", row.kind)
    .order("sort_order").order("created_at");
  const ids = (list ?? []).map((r) => r.id);
  const i = ids.indexOf(id); const j = i + direction;
  if (i < 0 || j < 0 || j >= ids.length) return { ok: true };
  [ids[i], ids[j]] = [ids[j], ids[i]];
  // renumber 1..n so the order is always clean
  for (let n = 0; n < ids.length; n++) {
    const { error } = await supabase.from("quotation_media").update({ sort_order: n + 1 }).eq("id", ids[n]);
    if (error) return { error: dbError(error.message) };
  }
  revalidatePath("/settings");
  return { ok: true };
}

export async function renameMedia(id: string, caption: string): Promise<Result> {
  const denied = await guard(); if (denied) return { error: denied };
  if (!z.string().uuid().safeParse(id).success) return { error: "Invalid picture." };
  const c = captionSchema.safeParse(caption); if (!c.success) return { error: "Name is too long (max 120 characters)." };
  const supabase = await createClient();
  const { error } = await supabase.from("quotation_media").update({ caption: c.data || null }).eq("id", id);
  if (error) return { error: dbError(error.message) };
  revalidatePath("/settings");
  return { ok: true };
}
