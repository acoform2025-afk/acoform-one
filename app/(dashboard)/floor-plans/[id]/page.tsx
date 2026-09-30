import Link from "next/link";
import { notFound } from "next/navigation";
import { Download } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { loadRules } from "@/lib/floor-plans/rules";
import { getCurrentProfile, hasPermission } from "@/lib/auth/permissions";
import { TakeoffTool } from "./takeoff-tool";
import { DeletePlanButton } from "./delete-plan-button";
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
    .select("id, name, source_kind, drawing_type, file_path, original_path, file_name, takeoff, lead_id, updated_at, leads ( id, lead_code, project_name, customer_name )")
    .eq("id", id).maybeSingle();
  if (!plan) notFound();
  const profile = await getCurrentProfile();
  const canEdit = await hasPermission("quotations", "create");
  const canDesign = await hasPermission("designs", "create");
  const rules = await loadRules(supabase);

  const bucket = supabase.storage.from("floor-plans");
  const { data: fileUrl } = await bucket.createSignedUrl(plan.file_path, 60 * 60);
  const origPath = plan.original_path ?? plan.file_path;
  const { data: dl } = await bucket.createSignedUrl(origPath, 60 * 60, { download: plan.file_name ?? true });

  const lead = Array.isArray(plan.leads) ? plan.leads[0] : plan.leads;
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
          {dl?.signedUrl ? (
            <a href={dl.signedUrl} className="inline-flex items-center gap-1.5 rounded-md border border-graphite-700 px-3 py-1.5 text-xs text-graphite-200 hover:bg-graphite-800"><Download className="size-3.5" />Original file</a>
          ) : null}
          {canEdit ? <DeletePlanButton id={plan.id} leadId={lead?.id ?? null} /> : null}
        </div>
      </div>

      <div className="mt-4">
        {fileUrl?.signedUrl ? (
          <TakeoffTool
            plan={{ id: plan.id, name: plan.name, source_kind: plan.source_kind as "dxf" | "pdf" | "image", file_url: fileUrl.signedUrl, takeoff: plan.takeoff as Partial<Takeoff>, lead: lead ? { id: lead.id, label: `${lead.lead_code} · ${lead.project_name ?? lead.customer_name}` } : null }}
            tenantId={profile!.tenant_id} canEdit={canEdit} quotes={quotes} designs={designs} rules={rules}
          />
        ) : <p className="text-sm text-signal-red">The plan file could not be opened.</p>}
      </div>
    </div>
  );
}
