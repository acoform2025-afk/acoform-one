import type { createClient } from "@/lib/supabase/server";
import { UNIT_TO_M } from "./calc";
import { drawingFacts, FACTS_V, mergeFacts, type DrawingFacts, type ProjectDrawing, type ProjectFacts } from "./project-facts";
import { loadModel } from "./run-panels";

type Supa = Awaited<ReturnType<typeof createClient>>;
type Row = { id: string; name: string; file_name: string | null; file_path: string; source_kind: string | null; tenant_id: string | null; updated_at: string | null; drawing_facts: unknown; takeoff: unknown };

const current = (f: unknown): f is DrawingFacts => !!f && typeof f === "object" && (f as DrawingFacts).v === FACTS_V;
const shortName = (r: Row) => (r.file_name ? r.file_name.replace(/\.(dwg|dxf|pdf|png|jpe?g)$/i, "") : r.name);

/** Every drawing file of the plan's project (lead), one row per file (several plans can be made from one file). */
async function projectFiles(supabase: Supa, plan: { lead_id: string | null }): Promise<Row[]> {
  if (!plan.lead_id) return [];
  const { data } = await supabase.from("floor_plans").select("id, name, file_name, file_path, source_kind, tenant_id, updated_at, drawing_facts, takeoff").eq("lead_id", plan.lead_id).order("created_at").limit(200);
  const byFile = new Map<string, Row>();
  for (const r of (data ?? []) as Row[]) {
    const t = r.takeoff as { parentPlan?: string } | null;
    const have = byFile.get(r.file_path);
    // the file's own plan (not a level plan made from it) names the drawing
    if (!have || (have.takeoff as { parentPlan?: string } | null)?.parentPlan && !t?.parentPlan) byFile.set(r.file_path, r);
    else if (!current(have.drawing_facts) && current(r.drawing_facts)) byFile.set(r.file_path, { ...have, drawing_facts: r.drawing_facts });
  }
  return [...byFile.values()];
}

/** What the OTHER drawing files of the project state (this plan's own file left out), merged. Null without a project. */
export async function loadProjectFacts(supabase: Supa, plan: { lead_id: string | null; file_path: string }): Promise<ProjectFacts | null> {
  const files = (await projectFiles(supabase, plan)).filter((r) => r.file_path !== plan.file_path);
  if (!files.length) return null;
  const others: ProjectDrawing[] = files.map((r) => ({ id: r.id, name: shortName(r), facts: current(r.drawing_facts) ? r.drawing_facts : r.source_kind === "dxf" ? null : { v: FACTS_V, at: "", contains: {} } }));
  return mergeFacts(others);
}

/** Reads every drawing file of the project that has not been read for the project yet (its own plan's file too) and
 *  keeps what each states. Returns how many files were read. */
export async function readProjectFiles(supabase: Supa, plan: { lead_id: string | null; file_path: string }, max = 6): Promise<number> {
  let n = 0;
  for (const r of await projectFiles(supabase, plan)) {
    if (current(r.drawing_facts) || r.source_kind !== "dxf" || n >= max) continue;
    const model = await loadModel(supabase, r);
    const facts: DrawingFacts = model ? drawingFacts(model, UNIT_TO_M[model.units]) : { v: FACTS_V, at: new Date().toISOString(), contains: {} };
    await supabase.from("floor_plans").update({ drawing_facts: facts }).eq("file_path", r.file_path);
    n++;
  }
  return n;
}
