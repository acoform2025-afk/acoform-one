"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { dbError } from "@/lib/format";
import { generateLayouts, type CatalogPanel, type Wall } from "@/lib/design-engine/layout";
import type { Result } from "@/components/action-button";

export async function createDesign(projectId: string): Promise<Result> {
  const supabase = await createClient();
  const { data: code, error: cErr } = await supabase.rpc("next_design_code", { p_project_id: projectId });
  if (typeof code !== "string") return { success: false, error: "Project not found." };
  if (cErr || !code) return { success: false, error: "Project not found." };
  const { data: profile } = await supabase.from("projects").select("tenant_id").eq("id", projectId).single();
  const { data: { user } } = await supabase.auth.getUser();
  const { data, error } = await supabase.from("designs")
    .insert({ tenant_id: profile!.tenant_id, project_id: projectId, design_code: code, created_by: user?.id ?? null })
    .select("id").single();
  if (error) return { success: false, error: error.message.includes("row-level security") ? "You don't have permission to create designs." : dbError(error.message) };
  revalidatePath(`/projects/${projectId}`);
  return { success: true, redirectTo: `/designs/${data.id}` };
}

const wallSchema = z.object({
  designId: z.string().uuid(),
  wallCode: z.string().trim().min(1, "Wall code required").max(20),
  lengthMm: z.coerce.number().positive("Length must be more than 0").max(100000),
  heightMm: z.coerce.number().min(2400, "Height must be 2400–3000 mm").max(3000, "Height must be 2400–3000 mm"),
  thicknessMm: z.coerce.number().min(100, "Wall thickness looks too small (mm)").max(1000),
  startCorner: z.enum(["none", "internal", "external"]),
  endCorner: z.enum(["none", "internal", "external"]),
});

export async function addWall(_p: { error?: string; ok?: boolean } | undefined, formData: FormData) {
  const parsed = wallSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { error: Object.values(parsed.error.flatten().fieldErrors)[0]?.[0] ?? "Check the wall details." };
  const d = parsed.data;
  const supabase = await createClient();
  const { data: design } = await supabase.from("designs").select("tenant_id").eq("id", d.designId).single();
  if (!design) return { error: "Design not found." };
  const { count } = await supabase.from("design_walls").select("*", { count: "exact", head: true }).eq("design_id", d.designId);
  const { error } = await supabase.from("design_walls").insert({
    tenant_id: design.tenant_id, design_id: d.designId, wall_code: d.wallCode.toUpperCase(), sequence_order: count ?? 0,
    length_mm: d.lengthMm, height_mm: d.heightMm, thickness_mm: d.thicknessMm, start_corner: d.startCorner, end_corner: d.endCorner,
  });
  if (error) {
    if (error.message.includes("design_walls_design_id_wall_code_key")) return { error: "That wall code is already used in this design." };
    if (error.message.includes("row-level security")) return { error: "This design is locked or you don't have permission." };
    return { error: dbError(error.message) };
  }
  // walls changed → old layouts no longer match
  revalidatePath(`/designs/${d.designId}`);
  return { ok: true };
}

export async function deleteWall(designId: string, wallId: string): Promise<Result> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("design_walls").delete().eq("id", wallId).select("id");
  if (error) return { success: false, error: dbError(error.message) };
  if (!data?.length) return { success: false, error: "This design is locked or you don't have permission." };
  revalidatePath(`/designs/${designId}`);
  return { success: true };
}

export async function runLayoutEngine(designId: string): Promise<Result> {
  const supabase = await createClient();
  const [{ data: walls }, { data: catalog }, { data: rate }] = await Promise.all([
    supabase.from("design_walls").select("id, wall_code, length_mm, height_mm, start_corner, end_corner").eq("design_id", designId).order("sequence_order"),
    supabase.from("panel_master").select("id, panel_code, panel_category, width_mm, height_mm, weight_kg, area_sqm").eq("is_active", true),
    supabase.from("cost_rate_cards").select("rate_per_kg").eq("is_active", true).maybeSingle(),
  ]);
  if (!walls?.length) return { success: false, error: "Add at least one wall first." };
  let result;
  try {
    result = generateLayouts(walls as Wall[], (catalog ?? []) as CatalogPanel[], Number(rate?.rate_per_kg ?? 0));
  } catch (e) {
    return { success: false, error: (e as Error).message };
  }
  const { error } = await supabase.rpc("save_design_layouts", { p_design_id: designId, p_options: result.options as unknown as never });
  if (error) return { success: false, error: dbError(error.message) };
  revalidatePath(`/designs/${designId}`);
  return { success: true };
}

export async function selectOption(designId: string, optionId: string): Promise<Result> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("select_layout_option", { p_design_id: designId, p_option_id: optionId });
  if (error) return { success: false, error: dbError(error.message) };
  revalidatePath(`/designs/${designId}`);
  return { success: true };
}

export async function runCheck(designId: string): Promise<Result> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("run_engineering_check", { p_design_id: designId });
  if (error) return { success: false, error: dbError(error.message) };
  revalidatePath(`/designs/${designId}`);
  return { success: true };
}

async function setStatus(designId: string, status: "pending_approval" | "approved" | "rejected" | "draft"): Promise<Result> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("designs").update({ status }).eq("id", designId).select("id");
  if (error) return { success: false, error: dbError(error.message) };
  if (!data?.length) return { success: false, error: "You don't have permission to do that." };
  revalidatePath(`/designs/${designId}`);
  return { success: true };
}
export async function submitDesign(designId: string) { return setStatus(designId, "pending_approval"); }
export async function approveDesign(designId: string) { return setStatus(designId, "approved"); }
export async function rejectDesign(designId: string) { return setStatus(designId, "rejected"); }

export async function generateBom(designId: string): Promise<Result> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("generate_bom_from_design", { p_design_id: designId });
  if (error) return { success: false, error: dbError(error.message) };
  revalidatePath(`/designs/${designId}`);
  return { success: true, redirectTo: `/boms/${data}` };
}
