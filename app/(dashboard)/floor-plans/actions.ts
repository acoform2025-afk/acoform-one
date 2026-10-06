"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile, requirePermission } from "@/lib/auth/permissions";
import { dbError } from "@/lib/format";
import { dwgToDxf } from "@/lib/floor-plans/dwg";
import { loadModel, runPanels } from "@/lib/floor-plans/run-panels";
import { drawingParts, dxfFrame } from "@/lib/floor-plans/dxf";
import { UNIT_TO_M } from "@/lib/floor-plans/calc";
import type { Building } from "@/lib/floor-plans/building";
import { readingFingerprint, type ReadingFp } from "@/lib/floor-plans/reading-record";

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
  originalPath: z.string().max(300).optional(),     // the .dwg a DXF was converted from (in the browser)
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
  if (p.data.originalPath && (p.data.sourceKind !== "dxf" || p.data.originalPath !== `${profile.tenant_id}/${p.data.id}/original.dwg`)) return { error: "Invalid file." };

  const supabase = await createClient();
  const { error } = await supabase.from("floor_plans").insert({
    id: p.data.id, name: p.data.name, lead_id: p.data.leadId ?? null, source_kind: p.data.sourceKind,
    file_path: p.data.filePath, file_name: p.data.fileName ?? null, drawing_type: p.data.drawingType,
    original_path: p.data.originalPath ?? null,
  });
  if (error) {
    await supabase.storage.from(FLOOR_PLAN_BUCKET_NAME).remove([p.data.filePath, ...(p.data.originalPath ? [p.data.originalPath] : [])]);
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
  extra_area: num.default(0), wall_top_area: num.default(0), extra_pct: z.number().min(0).max(100).default(0), quote_area: num.default(0), typical_quote: num.default(0), nontypical_area: num.default(0),
  wall_top_drawn: num.default(0),
  wall_options: z.object({ all: z.object({ contact: num, quote: num }), thin: z.object({ contact: num, quote: num }), limitMm: z.number().min(75).max(500), chosen: z.enum(["all", "thin"]) }).optional(),
  items: z.array(z.object({
    code: z.string().max(20), group: z.enum(["slab", "deduct", "edge", "wall", "opening", "column", "beam", "loft", "extra"]),
    label: z.string().transform((v) => v.slice(0, 120)), calc: z.string().transform((v) => v.slice(0, 160)), area: z.number().finite().min(-1e7).max(1e7),
  })).max(400).default([]),
  floors: z.number().int().min(1).max(500),
  params: z.object({
    floorHeight: z.number().min(0).max(50), slabMm: z.number().min(0).max(2000), floors: z.number().min(1).max(500),
    wallTopM2: num.optional(), slabM2: num.optional(), ductM2: num.optional(), wallLenM: num.optional(), beamLenM: num.optional(), includeEdges: z.boolean().optional(), extraPct: z.number().min(0).max(100).optional(), minOpeningM2: z.number().min(0).max(5).optional(), autoLintels: z.boolean().optional(),
    beamDepthMm: num.optional(), beamWidthMm: num.optional(), wallThkMm: num.optional(),
    scope: z.enum(["full", "vertical", "columns", "framed", "deck"]).optional(), minWallMm: num.optional(), parapetMm: num.optional(), sillMm: num.optional(), autoEdgeBeams: z.boolean().optional(),
  }),
  source: z.enum(["manual", "dxf", "mixed"]),
  rules: z.object({
    minOpeningM2: z.number().min(0).max(5), slabEdges: z.boolean(), reveals: z.boolean(), deductWallTops: z.boolean(), deductColumnTops: z.boolean(),
    kickerMm: z.number().min(0).max(500), wetKerbMm: z.number().min(0).max(1000).optional(), stairs: z.boolean(), stairAllowanceM2: z.number().min(0).max(2000).default(100), stairBasis: z.enum(["allowance", "measured"]).optional(), extraPct: z.number().min(0).max(100), printOnQuote: z.boolean(),
  }).optional(),
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
  // the files can be shared by several plans of one drawing (e.g. one per block): removed only with the last one
  const { count } = await supabase.from("floor_plans").select("id", { count: "exact", head: true }).eq("file_path", row.file_path);
  if (!count) await supabase.storage.from(FLOOR_PLAN_BUCKET_NAME).remove([row.file_path, ...(row.preview_path ? [row.preview_path] : []), ...(row.original_path ? [row.original_path] : [])]);
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

/**
 * Floor plan panel layout → a normal draft BOM under a chosen design. From there the existing BOM screen
 * approves it and releases it to production (production order + work orders).
 */
export async function createBomFromFloorPlan(planId: string, designId: string, q: { h?: string; kg?: string; prop?: string }): Promise<Result<{ bomId: string }>> {
  try { await requirePermission("bom", "generate"); } catch { return { error: "Your role can't create BOMs." }; }
  if (!uuid.safeParse(planId).success || !uuid.safeParse(designId).success) return { error: "Choose a design first." };
  const supabase = await createClient();
  const { runPanels } = await import("@/lib/floor-plans/run-panels");
  const r = await runPanels(supabase, planId, q ?? {});
  if (!r) return { error: "Floor plan not found." };
  if (r.error || !r.result) return { error: r.error ?? "Measure and save this floor plan first." };
  const items = r.result.bom
    .filter((b) => b.group !== "accessory" && b.qty > 0)
    .map((b) => ({ code: b.code, qty: Math.round(b.qty), unitWeight: b.qty ? b.weight / b.qty : 0, width: b.w || 0 }));
  if (!items.length) return { error: "The panel layout is empty." };
  const s = r.result.summary;
  const { data, error } = await supabase.rpc("create_bom_from_floor_plan", {
    p_design_id: designId, p_floor_plan_id: planId, p_items: items,
    p_summary: { standardPct: s.standardPct, weight: s.weight, panelArea: s.panelArea },
  });
  if (error || !data) return { error: dbError(error?.message ?? "Could not create the BOM.") };
  revalidatePath("/boms"); revalidatePath(`/designs/${designId}`);
  return { ok: true, data: { bomId: data as string } };
}

/** After the drawing was read again from its original DWG (by the browser): every plan using this file is marked
 *  updated, so the take-off, panels and 3D read the new file. */
export async function touchPlanFile(id: string): Promise<Result> {
  const denied = await guard(); if (denied) return { error: denied };
  if (!uuid.safeParse(id).success) return { error: "Invalid floor plan." };
  const supabase = await createClient();
  const { data: row } = await supabase.from("floor_plans").select("file_path, lead_id").eq("id", id).maybeSingle();
  if (!row) return { error: "Floor plan not found." };
  const { error } = await supabase.from("floor_plans").update({ updated_at: new Date().toISOString() }).eq("file_path", row.file_path);
  if (error) return { error: dbError(error.message) };
  revalidatePath("/floor-plans"); revalidatePath(`/floor-plans/${id}`);
  if (row.lead_id) revalidatePath(`/leads/${row.lead_id}`);
  return { ok: true };
}

const boxSchema = z.tuple([z.number(), z.number(), z.number(), z.number()]);
const reviewSchema = z.object({ kind: z.enum(["include", "exclude", "clear"]), box: boxSchema.optional() });
/**
 * Reading review: the user answers one of the reader's doubts — a box (plan metres) is "part of this floor" (the reader
 * keeps everything in it) or "not part of this floor" (left out). Stored on the plan; the plan is read again with it.
 * "clear" forgets every answer.
 */
export async function applyReadingAnswer(id: string, input: z.infer<typeof reviewSchema>): Promise<Result> {
  const denied = await guard(); if (denied) return { error: denied };
  if (!uuid.safeParse(id).success) return { error: "Invalid floor plan." };
  const parsed = reviewSchema.safeParse(input); if (!parsed.success) return { error: "Invalid answer." };
  const supabase = await createClient();
  const { data: row } = await supabase.from("floor_plans").select("takeoff, lead_id").eq("id", id).maybeSingle();
  if (!row) return { error: "Floor plan not found." };
  const t = (row.takeoff && typeof row.takeoff === "object" ? row.takeoff : {}) as { dxf?: { excludeM?: number[][]; includeM?: number[][] } & Record<string, unknown> };
  if (!t.dxf) return { error: "This plan has no drawing to review." };
  const dxf = { ...t.dxf };
  if (parsed.data.kind === "clear") { delete dxf.excludeM; delete dxf.includeM; }
  else {
    const key = parsed.data.kind === "include" ? "includeM" : "excludeM", other = parsed.data.kind === "include" ? "excludeM" : "includeM";
    const b = parsed.data.box!.map((v) => Math.round(v * 1000) / 1000);
    const list = (dxf[key] ?? []).filter((x) => !(Math.abs(x[0] - b[0]) < 0.05 && Math.abs(x[1] - b[1]) < 0.05 && Math.abs(x[2] - b[2]) < 0.05 && Math.abs(x[3] - b[3]) < 0.05));
    if (list.length >= 200) return { error: "Too many answers on this plan — clear them first." };
    dxf[key] = [...list, b];
    dxf[other] = (dxf[other] ?? []).filter((x) => !(x[0] <= b[0] + 0.05 && x[1] <= b[1] + 0.05 && x[2] >= b[2] - 0.05 && x[3] >= b[3] - 0.05));   // an opposite answer on the same spot is withdrawn
  }
  const { error } = await supabase.from("floor_plans").update({ takeoff: { ...t, dxf } as never, updated_at: new Date().toISOString() }).eq("id", id);
  if (error) return { error: dbError(error.message) };
  revalidatePath(`/floor-plans/${id}`); revalidatePath(`/floor-plans/${id}/review`);
  if (row.lead_id) revalidatePath(`/leads/${row.lead_id}`);
  return { ok: true };
}

/** Approve the present reading of a plan (its fingerprint is kept; later reads are compared with it) or withdraw the approval. */
export async function approveReading(id: string, approve: boolean): Promise<Result> {
  const denied = await guard(); if (denied) return { error: denied };
  if (!uuid.safeParse(id).success) return { error: "Invalid floor plan." };
  const supabase = await createClient();
  const { data: row } = await supabase.from("floor_plans").select("takeoff, lead_id").eq("id", id).maybeSingle();
  if (!row) return { error: "Floor plan not found." };
  const t = (row.takeoff && typeof row.takeoff === "object" ? row.takeoff : {}) as { dxf?: Record<string, unknown> };
  if (!t.dxf) return { error: "This plan has no drawing to approve." };
  let approved: { at: string; by?: string; fp: ReadingFp } | null = null;
  if (approve) {
    const r = await runPanels(supabase, id, {});
    if (!r || r.error || !r.inp) return { error: r?.error ?? "The plan could not be read." };
    const fp = readingFingerprint(r.inp, r.zones ?? [], r.result);
    if (fp.openFaces) return { error: `${fp.openFaces} wall face${fp.openFaces > 1 ? "s have" : " has"} no panel — fix that before approving.` };
    const me = await getCurrentProfile().catch(() => null);
    approved = { at: new Date().toISOString(), by: me?.full_name ?? me?.email ?? undefined, fp };
  }
  // the save time is not touched: the reading itself did not change
  const { error } = await supabase.from("floor_plans").update({ takeoff: { ...t, dxf: { ...t.dxf, approved } } as never }).eq("id", id);
  if (error) return { error: dbError(error.message) };
  revalidatePath(`/floor-plans/${id}`); revalidatePath(`/floor-plans/${id}/review`); revalidatePath("/floor-plans/check");
  return { ok: true };
}

const levelPlanSchema = z.object({
  fromId: uuid,
  name: z.string().trim().min(1).max(150),
  region: z.tuple([z.number(), z.number(), z.number(), z.number()]).nullable(),   // the level's drawing (screen px of the same file), null = pick by hand
  floorMm: z.number().min(1500).max(9000).optional(),
  floors: z.number().int().min(1).max(200).default(1),
});
/**
 * A level's own plan (stilt, ground, refuge …) made from the same drawing file as the typical floor: same file, layers,
 * scale and settings; its own region, floor height and count. Measured like any plan; the typical plan's building list
 * points at it.
 */
export async function createLevelPlan(input: z.infer<typeof levelPlanSchema>): Promise<Result<{ id: string }>> {
  const denied = await guard(); if (denied) return { error: denied };
  const p = levelPlanSchema.safeParse(input);
  if (!p.success) return { error: p.error.issues[0]?.message ?? "Check the level." };
  const supabase = await createClient();
  const { data: src } = await supabase.from("floor_plans").select("id, name, lead_id, source_kind, drawing_type, file_path, original_path, file_name, takeoff").eq("id", p.data.fromId).maybeSingle();
  if (!src) return { error: "Floor plan not found." };
  const t = (src.takeoff && typeof src.takeoff === "object" && !Array.isArray(src.takeoff) ? src.takeoff : {}) as Record<string, unknown>;
  const params = (t.params && typeof t.params === "object" ? t.params : {}) as Record<string, unknown>;
  const dxf = (t.dxf && typeof t.dxf === "object" ? t.dxf : null) as Record<string, unknown> | null;
  const takeoff = {
    v: 1, metersPerPx: t.metersPerPx ?? null, calib: t.calib, image: t.image, shapes: [], columns: [], beams: [], extras: [], nonTypical: [], stairs: [],
    system: t.system, shell: t.shell,
    params: { ...params, floors: p.data.floors, ...(p.data.floorMm ? { floorHeight: p.data.floorMm / 1000 } : {}) },
    dxf: dxf ? { ...dxf, region: p.data.region } : undefined,
    auto: { done: true, note: `made from "${src.name}" for this level` },
    parentPlan: src.id,
  };
  const { data, error } = await supabase.from("floor_plans").insert({
    name: p.data.name, lead_id: src.lead_id, source_kind: src.source_kind, drawing_type: src.drawing_type,
    file_path: src.file_path, original_path: src.original_path, file_name: src.file_name, takeoff: takeoff as never,
  }).select("id").single();
  if (error || !data) return { error: dbError(error?.message ?? "Could not create the plan.") };
  await measurePlan(data.id);
  revalidatePath("/floor-plans");
  if (src.lead_id) revalidatePath(`/leads/${src.lead_id}`);
  return { ok: true, data: { id: data.id } };
}

/** Read a plan on the server and store its totals, so a plan made from a drawing counts as measured without being opened. */
async function measurePlan(id: string): Promise<boolean> {
  const supabase = await createClient();
  const r = await runPanels(supabase, id, {});
  if (!r || r.error || !r.inp) return false;
  const { error } = await supabase.from("floor_plans").update({ totals: r.inp.totals as never }).eq("id", id);
  return !error;
}

/**
 * Every level that has its own drawing in the file but no plan yet gets one — one plan per drawing (floors 2, 6, 10 …
 * drawn as "2ND,6TH,10TH FLOOR PLAN" share it), read and measured on the server, and linked to its levels. After this
 * the whole-building 3D and the "Set per level" list use each level's own drawing instead of the typical plan.
 */
export async function createAllLevelPlans(fromId: string): Promise<Result<{ made: number; names: string[] }>> {
  const denied = await guard(); if (denied) return { error: denied };
  if (!uuid.safeParse(fromId).success) return { error: "Invalid floor plan." };
  const supabase = await createClient();
  const { data: src } = await supabase.from("floor_plans").select("id, name, lead_id, source_kind, drawing_type, file_path, original_path, file_name, takeoff, tenant_id, updated_at").eq("id", fromId).maybeSingle();
  if (!src) return { error: "Floor plan not found." };
  const t = (src.takeoff && typeof src.takeoff === "object" && !Array.isArray(src.takeoff) ? src.takeoff : {}) as Record<string, unknown> & { building?: Building; dxf?: { units: keyof typeof UNIT_TO_M; layerRoles?: Record<string, never>; region?: number[] | null }; params?: Record<string, unknown> };
  const b = t.building;
  if (!b?.levels.length || !t.dxf) return { error: "Read the levels of the building first (Whole building → Read levels again)." };
  const model = await loadModel(supabase, src);
  if (!model) return { error: "The drawing file could not be read." };
  const u = UNIT_TO_M[t.dxf.units], f = dxfFrame(model, 2400);
  const parts = drawingParts(model, u, t.dxf.layerRoles as never);
  const pxOf = (n: number): [number, number, number, number] | null => { const p = parts.find((x) => x.n === n); if (!p) return null; const a = f.toPx([p.box[0], p.box[1]]), c = f.toPx([p.box[2], p.box[3]]); return [Math.min(a[0], c[0]), Math.min(a[1], c[1]), Math.max(a[0], c[0]), Math.max(a[1], c[1])]; };
  // the typical plan's own drawing is not a level plan
  const reg = t.dxf.region;
  const area = (x: number[]) => Math.max(0, x[2] - x[0]) * Math.max(0, x[3] - x[1]);
  const isTypical = (px: number[]) => !!reg && area([Math.max(px[0], reg[0]), Math.max(px[1], reg[1]), Math.min(px[2], reg[2]), Math.min(px[3], reg[3])]) > 0.6 * Math.min(area(px), area(reg));
  const { data: sibs } = await supabase.from("floor_plans").select("id").eq("file_path", src.file_path ?? "");
  const exists = new Set((sibs ?? []).map((x) => x.id));
  const byPart = new Map<number, typeof b.levels>();
  for (const l of b.levels) if (l.use === "own" && l.partN && !(l.planId && exists.has(l.planId))) byPart.set(l.partN, [...(byPart.get(l.partN) ?? []), l]);
  const levels = [...b.levels];
  const names: string[] = [];
  for (const [n, group] of byPart) {
    const px = pxOf(n); if (!px || isTypical(px)) { for (const l of group) { const i = levels.findIndex((x) => x.key === l.key); if (i >= 0 && isTypical(px ?? [0, 0, 0, 0])) levels[i] = { ...levels[i], use: "typical", planId: null }; } continue; }
    const title = group[0].partTitle ?? `drawing ${n}`;
    const floorMm = group[0].floorMm;
    const takeoff = {
      v: 1, metersPerPx: t.metersPerPx ?? null, calib: t.calib, image: t.image, shapes: [], columns: [], beams: [], extras: [], nonTypical: [], stairs: [],
      system: t.system, shell: t.shell,
      params: { ...(t.params ?? {}), floors: group.length, ...(floorMm ? { floorHeight: floorMm / 1000 } : {}) },
      dxf: { ...t.dxf, region: px, excludeM: undefined, includeM: undefined, approved: null },
      auto: { done: true, note: `made from "${src.name}" for ${group.map((l) => l.name).join(", ")}` },
      parentPlan: src.id,
    };
    const { data, error } = await supabase.from("floor_plans").insert({
      name: `${src.name} — ${title}`, lead_id: src.lead_id, source_kind: src.source_kind, drawing_type: src.drawing_type,
      file_path: src.file_path, original_path: src.original_path, file_name: src.file_name, takeoff: takeoff as never,
    }).select("id").single();
    if (error || !data) return { error: dbError(error?.message ?? "Could not create the plan.") };
    await measurePlan(data.id);
    for (const l of group) { const i = levels.findIndex((x) => x.key === l.key); if (i >= 0) levels[i] = { ...levels[i], planId: data.id, use: "own" }; }
    names.push(title);
  }
  const { error } = await supabase.from("floor_plans").update({ takeoff: { ...t, building: { ...b, edited: true, levels } } as never, updated_at: new Date().toISOString() }).eq("id", fromId);
  if (error) return { error: dbError(error.message) };
  revalidatePath("/floor-plans"); revalidatePath(`/floor-plans/${fromId}`);
  if (src.lead_id) revalidatePath(`/leads/${src.lead_id}`);
  return { ok: true, data: { made: names.length, names } };
}
