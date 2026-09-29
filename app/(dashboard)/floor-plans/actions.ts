"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile, requirePermission } from "@/lib/auth/permissions";
import { dbError } from "@/lib/format";
import { dwgToDxf } from "@/lib/floor-plans/dwg";

const FLOOR_PLAN_BUCKET_NAME = "floor-plans";
type Result<T = undefined> = { ok?: boolean; error?: string; data?: T };

async function guard(): Promise<string | null> {
  try { await requirePermission("quotations", "create"); } catch { return "Your role can't upload or measure floor plans."; }
  return null;
}
const uuid = z.string().uuid();

const createSchema = z.object({
  id: uuid,
  name: z.string().trim().min(1, "Give the floor plan a name").max(150),
  leadId: uuid.optional(),
  sourceKind: z.enum(["dxf", "pdf", "image"]),
  filePath: z.string().max(300),
  fileName: z.string().max(255).optional(),
  drawingType: z.enum(["plan", "section", "elevation", "other"]).default("plan"),
});

/** Records a plan whose file the browser has just uploaded to storage (<tenant>/<plan id>/source.ext). */
export async function createFloorPlan(input: z.infer<typeof createSchema>): Promise<Result<{ id: string }>> {
  const denied = await guard(); if (denied) return { error: denied };
  const p = createSchema.safeParse(input);
  if (!p.success) return { error: p.error.issues[0]?.message ?? "Check the form." };
  const profile = await getCurrentProfile();
  if (!profile) return { error: "Not signed in." };
  const ext = p.data.sourceKind === "dxf" ? "dxf" : p.data.sourceKind === "pdf" ? "pdf" : "(jpg|png)";
  if (!new RegExp(`^${profile.tenant_id}/${p.data.id}/source\\.${ext}$`).test(p.data.filePath)) return { error: "Invalid file." };

  const supabase = await createClient();
  const { error } = await supabase.from("floor_plans").insert({
    id: p.data.id, name: p.data.name, lead_id: p.data.leadId ?? null, source_kind: p.data.sourceKind,
    file_path: p.data.filePath, file_name: p.data.fileName ?? null, drawing_type: p.data.drawingType,
  });
  if (error) {
    await supabase.storage.from(FLOOR_PLAN_BUCKET_NAME).remove([p.data.filePath]);
    return { error: dbError(error.message) };
  }
  revalidatePath("/floor-plans");
  if (p.data.leadId) revalidatePath(`/leads/${p.data.leadId}`);
  return { ok: true, data: { id: p.data.id } };
}

const dwgSchema = z.object({
  id: uuid,
  name: z.string().trim().min(1, "Give the drawing a name").max(150),
  leadId: uuid.optional(),
  originalPath: z.string().max(300),
  fileName: z.string().max(255).optional(),
  drawingType: z.enum(["plan", "section", "elevation", "other"]).default("plan"),
});

/** AutoCAD .dwg uploaded by the browser → converted to .dxf on the server (LibreDWG) → saved as a DXF plan. */
export async function createFloorPlanFromDwg(input: z.infer<typeof dwgSchema>): Promise<Result<{ id: string }>> {
  const denied = await guard(); if (denied) return { error: denied };
  const p = dwgSchema.safeParse(input);
  if (!p.success) return { error: p.error.issues[0]?.message ?? "Check the form." };
  const profile = await getCurrentProfile();
  if (!profile) return { error: "Not signed in." };
  if (p.data.originalPath !== `${profile.tenant_id}/${p.data.id}/original.dwg`) return { error: "Invalid file." };

  const supabase = await createClient();
  const bucket = supabase.storage.from(FLOOR_PLAN_BUCKET_NAME);
  const dxfPath = `${profile.tenant_id}/${p.data.id}/source.dxf`;
  const fail = async (msg: string) => { await bucket.remove([p.data.originalPath, dxfPath]); return { error: msg }; };

  const { data: blob, error: dlErr } = await bucket.download(p.data.originalPath);
  if (dlErr || !blob) return fail("Could not read the uploaded DWG.");
  const bytes = new Uint8Array(await blob.arrayBuffer());
  if (bytes.length > 26 * 1024 * 1024) return fail("DWG is larger than 25 MB.");
  if (String.fromCharCode(...bytes.slice(0, 2)) !== "AC") return fail("This doesn't look like an AutoCAD DWG file.");

  let dxf: string;
  try { dxf = await dwgToDxf(bytes); } catch (e) { return fail(e instanceof Error ? e.message : "Could not read the DWG."); }
  const up = await bucket.upload(dxfPath, new Blob([dxf], { type: "application/dxf" }), { contentType: "application/dxf", upsert: true });
  if (up.error) return fail(up.error.message.includes("exceeded") ? "The drawing is too large once converted. Delete unused sheets / PURGE in AutoCAD and try again." : "Could not save the converted drawing.");

  const { error } = await supabase.from("floor_plans").insert({
    id: p.data.id, name: p.data.name, lead_id: p.data.leadId ?? null, source_kind: "dxf", drawing_type: p.data.drawingType,
    file_path: dxfPath, original_path: p.data.originalPath, file_name: p.data.fileName ?? null,
  });
  if (error) return fail(dbError(error.message));
  revalidatePath("/floor-plans");
  if (p.data.leadId) revalidatePath(`/leads/${p.data.leadId}`);
  return { ok: true, data: { id: p.data.id } };
}

const num = z.number().finite().min(0).max(1e7);
const totalsSchema = z.object({
  plan_area: num, slab_soffit: num, slab_edge: num, wall_length: num, wall_area: num,
  column_count: z.number().int().min(0).max(100000), column_area: num,
  column_sizes: z.array(z.object({ size: z.string().max(40), qty: z.number().int().min(0).max(100000) })).max(200),
  beam_area: num, vertical_area: num, contact_area: num, clear_height: num,
  extra_area: num.default(0), wall_top_area: num.default(0), extra_pct: z.number().min(0).max(100).default(0), quote_area: num.default(0),
  wall_top_drawn: num.default(0),
  items: z.array(z.object({
    code: z.string().max(20), group: z.enum(["slab", "deduct", "edge", "wall", "opening", "column", "beam", "loft", "extra"]),
    label: z.string().max(80), calc: z.string().max(120), area: z.number().finite().min(-1e7).max(1e7),
  })).max(400).default([]),
  floors: z.number().int().min(1).max(500),
  params: z.object({
    floorHeight: z.number().min(0).max(50), slabMm: z.number().min(0).max(2000), floors: z.number().min(1).max(500),
    wallTopM2: num.optional(), includeEdges: z.boolean().optional(), extraPct: z.number().min(0).max(100).optional(),
    beamDepthMm: num.optional(), beamWidthMm: num.optional(), wallThkMm: num.optional(),
  }),
  source: z.enum(["manual", "dxf", "mixed"]),
});

export async function saveTakeoff(id: string, takeoff: unknown, totals: unknown, previewPath: string | null): Promise<Result> {
  const denied = await guard(); if (denied) return { error: denied };
  if (!uuid.safeParse(id).success) return { error: "Invalid floor plan." };
  if (!takeoff || typeof takeoff !== "object" || Array.isArray(takeoff)) return { error: "Invalid measurements." };
  if (JSON.stringify(takeoff).length > 1_500_000) return { error: "Too many measurements to save." };
  const t = totalsSchema.safeParse(totals);
  if (!t.success) return { error: "Invalid totals: " + (t.error.issues[0]?.path.join(".") ?? "") };
  const profile = await getCurrentProfile();
  if (!profile) return { error: "Not signed in." };
  if (previewPath !== null && previewPath !== `${profile.tenant_id}/${id}/preview.jpg`) return { error: "Invalid preview." };

  const supabase = await createClient();
  const patch: { takeoff: never; totals: never; preview_path?: string } = { takeoff: takeoff as never, totals: t.data as never };
  if (previewPath) patch.preview_path = previewPath;
  const { data, error } = await supabase.from("floor_plans").update(patch).eq("id", id).select("id, lead_id");
  if (error) return { error: dbError(error.message) };
  if (!data?.length) return { error: "Floor plan not found." };
  revalidatePath(`/floor-plans/${id}`);
  revalidatePath("/floor-plans");
  if (data[0].lead_id) revalidatePath(`/leads/${data[0].lead_id}`);
  return { ok: true };
}

export async function renameFloorPlan(id: string, name: string): Promise<Result> {
  const denied = await guard(); if (denied) return { error: denied };
  const n = z.string().trim().min(1).max(150).safeParse(name);
  if (!uuid.safeParse(id).success || !n.success) return { error: "Invalid name." };
  const supabase = await createClient();
  const { error } = await supabase.from("floor_plans").update({ name: n.data }).eq("id", id);
  if (error) return { error: dbError(error.message) };
  revalidatePath(`/floor-plans/${id}`); revalidatePath("/floor-plans");
  return { ok: true };
}

export async function deleteFloorPlan(id: string): Promise<Result> {
  const denied = await guard(); if (denied) return { error: denied };
  if (!uuid.safeParse(id).success) return { error: "Invalid floor plan." };
  const supabase = await createClient();
  const { data: row } = await supabase.from("floor_plans").select("file_path, preview_path, original_path, lead_id").eq("id", id).maybeSingle();
  if (!row) return { error: "Floor plan not found." };
  const { error } = await supabase.from("floor_plans").delete().eq("id", id);
  if (error) return { error: dbError(error.message) };
  await supabase.storage.from(FLOOR_PLAN_BUCKET_NAME).remove([row.file_path, ...(row.preview_path ? [row.preview_path] : []), ...(row.original_path ? [row.original_path] : [])]);
  revalidatePath("/floor-plans");
  if (row.lead_id) revalidatePath(`/leads/${row.lead_id}`);
  return { ok: true };
}

/** Prints (or stops printing) a floor plan page on the quotation PDF. */
export async function attachFloorPlan(quotationId: string, planId: string | null): Promise<Result> {
  const denied = await guard(); if (denied) return { error: denied };
  if (!uuid.safeParse(quotationId).success || (planId !== null && !uuid.safeParse(planId).success)) return { error: "Invalid request." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_quotation_floor_plan", { p_quotation_id: quotationId, p_floor_plan_id: planId });
  if (error) return { error: dbError(error.message) };
  revalidatePath(`/quotations/${quotationId}`);
  return { ok: true };
}

export type AreaBasis = "plan_area" | "vertical_area" | "contact_area" | "quote_area";

/** Attaches the plan and copies one of its measured areas into a quick quote's area. */
export async function applyPlanArea(quotationId: string, planId: string, basis: AreaBasis): Promise<Result<{ area: number }>> {
  const denied = await guard(); if (denied) return { error: denied };
  if (!uuid.safeParse(quotationId).success || !uuid.safeParse(planId).success) return { error: "Invalid request." };
  if (!["plan_area", "vertical_area", "contact_area", "quote_area"].includes(basis)) return { error: "Invalid area type." };
  const supabase = await createClient();
  const { data: plan } = await supabase.from("floor_plans").select("totals").eq("id", planId).maybeSingle();
  if (!plan) return { error: "Floor plan not found." };
  const area = Number((plan.totals as Record<string, unknown>)?.[basis] ?? 0);
  if (!(area > 0)) return { error: "This floor plan has no measured area of that type yet. Measure it and save first." };
  const { data: q } = await supabase.from("quotations").select("quotation_type").eq("id", quotationId).maybeSingle();
  if (!q) return { error: "Quotation not found." };
  if (q.quotation_type !== "quick") return { error: "Only quick quotes take their price from an area. Detailed quotations are priced panel by panel." };

  const at = await supabase.rpc("set_quotation_floor_plan", { p_quotation_id: quotationId, p_floor_plan_id: planId });
  if (at.error) return { error: dbError(at.error.message) };
  const up = await supabase.rpc("update_quick_quote_area", { p_quotation_id: quotationId, p_area_sqm: Math.round(area * 100) / 100 });
  if (up.error) return { error: dbError(up.error.message) };
  revalidatePath(`/quotations/${quotationId}`); revalidatePath("/quotations");
  return { ok: true, data: { area } };
}

/**
 * Sends the walls drawn on a plan to a panel design (Projects & designs): each straight wall segment
 * becomes one design wall (length, clear height, thickness), ready for the layout engine.
 */
export async function sendWallsToDesign(planId: string, designId: string, thicknessMm: number): Promise<Result<{ count: number }>> {
  try { await requirePermission("designs", "create"); } catch { return { error: "Your role can't edit panel designs." }; }
  if (!uuid.safeParse(planId).success || !uuid.safeParse(designId).success) return { error: "Invalid request." };
  const th = z.number().min(100).max(1000).safeParse(thicknessMm);
  if (!th.success) return { error: "Wall thickness must be between 100 and 1000 mm." };

  const supabase = await createClient();
  const { data: plan } = await supabase.from("floor_plans").select("takeoff").eq("id", planId).maybeSingle();
  if (!plan) return { error: "Floor plan not found." };
  const t = plan.takeoff as { metersPerPx?: number | null; params?: { floorHeight?: number; slabMm?: number }; shapes?: { kind: string; pts: [number, number][] }[] };
  const mpp = Number(t.metersPerPx ?? 0);
  if (!(mpp > 0)) return { error: "Set the scale and save the plan first." };
  const heightMm = Math.round((Number(t.params?.floorHeight ?? 3) - Number(t.params?.slabMm ?? 150) / 1000) * 1000);
  if (heightMm < 2400 || heightMm > 3000) return { error: `Wall clear height is ${heightMm} mm; panel designs take 2400–3000 mm. Check floor height and slab thickness on the plan.` };

  const segs: number[] = [];
  for (const s of t.shapes ?? []) {
    if (s.kind !== "wall" || !Array.isArray(s.pts)) continue;
    for (let i = 1; i < s.pts.length; i++) {
      const [a, b] = [s.pts[i - 1], s.pts[i]];
      const mm = Math.round(Math.hypot(b[0] - a[0], b[1] - a[1]) * mpp * 1000);
      if (mm >= 300) segs.push(mm);
    }
  }
  if (!segs.length) return { error: "No walls are drawn on this plan (use the Wall tool). DXF wall layers give a total length only, not separate walls." };
  if (segs.length > 300) return { error: "Too many wall segments (max 300 at a time)." };

  const { data: design } = await supabase.from("designs").select("tenant_id, status").eq("id", designId).maybeSingle();
  if (!design) return { error: "Design not found." };
  if (!["draft", "calculated", "rejected"].includes(design.status)) return { error: "That design is locked. Open a draft design." };
  const { data: existing } = await supabase.from("design_walls").select("wall_code").eq("design_id", designId);
  const used = new Set((existing ?? []).map((w) => w.wall_code));
  let n = 1; const code = () => { while (used.has(`FP${n}`)) n++; used.add(`FP${n}`); return `FP${n}`; };
  const start = existing?.length ?? 0;
  const rows = segs.map((len, i) => ({
    tenant_id: design.tenant_id, design_id: designId, wall_code: code(), sequence_order: start + i,
    length_mm: len, height_mm: heightMm, thickness_mm: th.data, start_corner: "none", end_corner: "none",
  }));
  const { error } = await supabase.from("design_walls").insert(rows);
  if (error) return { error: error.message.includes("row-level security") ? "This design is locked or you don't have permission." : dbError(error.message) };
  revalidatePath(`/designs/${designId}`);
  return { ok: true, data: { count: rows.length } };
}
