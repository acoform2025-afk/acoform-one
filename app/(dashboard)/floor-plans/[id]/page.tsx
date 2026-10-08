import Link from "next/link";
import { notFound } from "next/navigation";
import { Download } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { loadRules } from "@/lib/floor-plans/rules";
import { loadDictionary } from "@/lib/floor-plans/dictionary";
import { getCurrentProfile, hasPermission } from "@/lib/auth/permissions";
import { TakeoffTool } from "./takeoff-tool";
import { ProjectDrawings } from "./project-drawings";
import { loadProjectFacts } from "@/lib/floor-plans/project-load";
import { FACTS_V } from "@/lib/floor-plans/project-facts";
import { DeletePlanButton } from "./delete-plan-button";
import { ReReadDwgButton } from "./reread-button";
import type { QuoteOption } from "./use-in-quotation";
import type { Takeoff } from "@/lib/floor-plans/calc";

export const metadata = { title: "Floor plan" };
const TYPE_LABEL: Record<string, string> = { plan: "Floor plan", section: "Section", elevation: "Elevation", other: "Drawing" };
const KIND_LABEL: Record<string, string> = { dxf: "DXF", pdf: "PDF", image: "Picture" };

export default async function FloorPlanPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ quotation?: string }> }) {
  const { id } = await params;
  const { quotation } = await searchParams;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const supabase = await createClient();
  const { data: plan } = await supabase
    .from("floor_plans")
    .select("id, name, source_kind, drawing_type, file_path, original_path, file_name, takeoff, lead_id, updated_at, drawing_facts, leads ( id, lead_code, project_name, customer_name )")
    .eq("id", id).maybeSingle();
  if (!plan) notFound();
  const profile = await getCurrentProfile();
  const canEdit = await hasPermission("quotations", "create");
  const canDesign = await hasPermission("designs", "create");
  const [rules, dict, project] = await Promise.all([loadRules(supabase), loadDictionary(supabase), loadProjectFacts(supabase, plan).catch(() => null)]);
  // drawings of the project (this one included) not yet read for what they state for the whole building
  const ownFacts = plan.drawing_facts as { v?: number } | null;
  const projectPending = !!plan.lead_id && ((plan.source_kind === "dxf" && ownFacts?.v !== FACTS_V) || !!project?.missing.length);

  const bucket = supabase.storage.from("floor-plans");
  const { data: fileUrl } = await bucket.createSignedUrl(plan.file_path, 60 * 60);
  const origPath = plan.original_path ?? plan.file_path;
  const { data: dl } = await bucket.createSignedUrl(origPath, 60 * 60, { download: plan.file_name ?? true });
  const { data: orig } = plan.original_path ? await bucket.createSignedUrl(plan.original_path, 60 * 60) : { data: null };

  const lead = Array.isArray(plan.leads) ? plan.leads[0] : plan.leads;
  // other plans made from the same drawing file (the levels' own plans, other blocks): their measured areas feed the whole-building figure
  const { data: sibRows } = await supabase.from("floor_plans").select("id, name, totals, takeoff").eq("file_path", plan.file_path).neq("id", plan.id).limit(100);
  const siblings = (sibRows ?? []).map((r) => {
    const tt = (r.totals && typeof r.totals === "object" ? r.totals : null) as { contact_area?: number; quote_area?: number } | null;
    const tk = (r.takeoff && typeof r.takeoff === "object" ? r.takeoff : null) as { shapes?: unknown[]; dxf?: { region?: unknown } } | null;
    return { id: r.id, name: r.name, contact: Number(tt?.contact_area) || 0, quote: Number(tt?.quote_area) || 0, measured: !!tt && (Number(tt.contact_area) || 0) > 0 && !!(tk?.dxf?.region || tk?.shapes?.length) };
  });
  // quotations this plan can feed: the lead's open ones + the one we came from
  const quoteSel = "id, quotation_code, quotation_type, formwork_type, status, floor_plan_id, total_area_sqm";
  const lists = await Promise.all([
    plan.lead_id ? supabase.from("quotations").select(quoteSel).eq("lead_id", plan.lead_id).neq("status", "superseded").order("created_at", { ascending: false }) : null,
    quotation && /^[0-9a-f-]{36}$/i.test(quotation) ? supabase.from("quotations").select(quoteSel).eq("id", quotation) : null,
  ]);
  const seen = new Set<string>();
  const quotes: QuoteOption[] = [...(lists[1]?.data ?? []), ...(lists[0]?.data ?? [])].filter((q) => !seen.has(q.id) && seen.add(q.id)).map((q) => ({
    id: q.id, code: q.quotation_code, type: q.quotation_type, formwork_type: q.formwork_type, status: q.status,
    attached: q.floor_plan_id === plan.id, editable: canEdit && ["draft", "pending_approval"].includes(q.status), area: q.total_area_sqm,
  }));

  const { data: designRows } = canDesign
    ? await supabase.from("designs").select("id, design_code, status, projects ( project_code, customer_name )").in("status", ["draft", "calculated", "rejected"]).order("created_at", { ascending: false }).limit(50)
    : { data: null };
  const designs = designRows?.map((d) => {
    const pr = Array.isArray(d.projects) ? d.projects[0] : d.projects;
    return { id: d.id, code: d.design_code, project: pr ? `${pr.project_code} ${pr.customer_name ?? ""}`.trim() : "" };
  }) ?? null;

  return (
    <div className="fade-in">
      <Link href={lead ? `/leads/${lead.id}` : "/floor-plans"} className="text-xs text-graphite-500 hover:text-graphite-300">← {lead ? `${lead.lead_code} · ${lead.project_name ?? lead.customer_name}` : "Floor plans"}</Link>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="truncate text-2xl font-semibold text-graphite-50">{plan.name}</h1>
          <p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-graphite-400">
            <span className="rounded-full bg-graphite-800 px-2 py-0.5 text-graphite-200">{TYPE_LABEL[plan.drawing_type] ?? plan.drawing_type}</span>
            <span>{plan.original_path ? "AutoCAD DWG (read as DXF)" : KIND_LABEL[plan.source_kind]}</span>
            {plan.file_name ? <span className="truncate">· {plan.file_name}</span> : null}
            <span>· updated {new Date(plan.updated_at).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}</span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          {lead && canEdit ? <Link href={`/floor-plans/new?lead=${lead.id}`} className="rounded-md border border-graphite-700 px-3 py-1.5 text-xs text-graphite-200 hover:bg-graphite-800">+ Add section / another drawing</Link> : null}
          {plan.source_kind === "dxf" ? <Link href={`/floor-plans/${plan.id}/review`} className="rounded-md border border-signal-amber px-3 py-1.5 text-xs text-signal-amber hover:bg-graphite-800">Reading review</Link> : null}
          {plan.source_kind === "dxf" ? <Link href={`/floor-plans/${plan.id}/read`} className="rounded-md border border-graphite-700 px-3 py-1.5 text-xs text-graphite-200 hover:bg-graphite-800">Drawing read-out</Link> : null}
          {plan.takeoff ? (
            <a href={`/floor-plans/${plan.id}/area-sheet`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-md bg-brand-orange px-3 py-1.5 text-xs font-medium text-white hover:opacity-90"><Download className="size-3.5" />Area calculation sheet</a>
          ) : null}
          {dl?.signedUrl ? (
            <a href={dl.signedUrl} className="inline-flex items-center gap-1.5 rounded-md border border-graphite-700 px-3 py-1.5 text-xs text-graphite-200 hover:bg-graphite-800"><Download className="size-3.5" />Original file</a>
          ) : null}
          {canEdit && orig?.signedUrl && /\.dwg$/i.test(plan.original_path ?? "") ? <ReReadDwgButton id={plan.id} originalUrl={orig.signedUrl} filePath={plan.file_path} /> : null}
          {canEdit ? <DeletePlanButton id={plan.id} leadId={lead?.id ?? null} /> : null}
        </div>
      </div>

      <ProjectDrawings id={plan.id} project={project} pending={projectPending} canEdit={canEdit} />

      <div className="mt-4">
        {fileUrl?.signedUrl ? (
          <TakeoffTool
            plan={{ id: plan.id, name: plan.name, source_kind: plan.source_kind as "dxf" | "pdf" | "image", file_url: fileUrl.signedUrl, takeoff: plan.takeoff as Partial<Takeoff>, lead: lead ? { id: lead.id, label: `${lead.lead_code} · ${lead.project_name ?? lead.customer_name}` } : null }}
            tenantId={profile!.tenant_id} canEdit={canEdit} quotes={quotes} designs={designs} rules={rules} siblings={siblings} dict={dict} project={project} projectPending={projectPending && !!project?.missing.length}
          />
        ) : <p className="text-sm text-signal-red">The plan file could not be opened.</p>}
      </div>
    </div>
  );
}
