import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { hasPermission } from "@/lib/auth/permissions";
import { EditLeadForm } from "./edit-lead-form";
import { fmtArea } from "@/lib/floor-plans/calc";

export default async function LeadDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: lead } = await supabase.from("leads").select("*").eq("id", id).maybeSingle();
  if (!lead) notFound();
  const canEdit = await hasPermission("leads", "update");
  const canQuote = await hasPermission("quotations", "create");
  const { data: quotes } = await supabase.from("quotations")
    .select("id, quotation_code, quotation_type, status, total_with_gst, created_at")
    .eq("lead_id", id).neq("status", "superseded").order("created_at", { ascending: false });
  const { data: plans } = await supabase.from("floor_plans")
    .select("id, name, drawing_type, source_kind, original_path, totals, updated_at").eq("lead_id", id).order("created_at", { ascending: false });

  return (
    <div className="fade-in max-w-5xl">
      <Link href="/leads" className="text-xs text-graphite-500 hover:text-graphite-300">← All leads</Link>
      <h1 className="mt-2 font-[family-name:var(--font-display)] text-2xl font-semibold text-graphite-50">
        {lead.project_name ?? lead.customer_name}
      </h1>
      <p className="mt-1 text-sm text-graphite-400">
        <span className="font-mono text-aluminium-300">{lead.lead_code}</span>
        {lead.company_name ? ` · ${lead.company_name}` : ""} · created {new Date(lead.created_at).toLocaleDateString("en-IN")}
      </p>
      {canQuote ? (
        <div className="mt-4 flex gap-2">
          <Link href={`/quotations?lead=${lead.id}`} className="rounded-md bg-aluminium-300 px-4 py-2 text-sm font-medium text-graphite-950 hover:opacity-90">+ Create quotation</Link>
          <Link href={`/quotations?lead=${lead.id}&mode=quick`} className="rounded-md border border-graphite-700 px-4 py-2 text-sm text-graphite-300 hover:bg-graphite-800">⚡ Quick quote</Link>
        </div>
      ) : null}

      {quotes && quotes.length > 0 ? (
        <div className="mt-6 overflow-hidden rounded-lg border border-graphite-800">
          <p className="bg-graphite-900 px-4 py-2 text-xs font-medium uppercase tracking-wide text-graphite-500">Quotations for this lead</p>
          <table className="w-full text-left text-sm">
            <tbody className="divide-y divide-graphite-800">
              {quotes.map((q) => (
                <tr key={q.id} className="bg-graphite-950">
                  <td className="px-4 py-2.5 font-mono text-xs"><Link href={`/quotations/${q.id}`} className="text-aluminium-300 hover:text-signal-amber hover:underline">{q.quotation_code}</Link></td>
                  <td className="px-4 py-2.5 text-xs capitalize text-graphite-400">{q.quotation_type}</td>
                  <td className="px-4 py-2.5 text-xs text-graphite-300">{q.total_with_gst != null ? `₹ ${Number(q.total_with_gst).toLocaleString("en-IN", { minimumFractionDigits: 2 })}` : "—"}</td>
                  <td className="px-4 py-2.5"><span className="rounded-full bg-graphite-800 px-2.5 py-1 text-xs capitalize text-graphite-300">{q.status.replace("_", " ")}</span></td>
                  <td className="px-4 py-2.5 text-xs text-graphite-500">{new Date(q.created_at).toLocaleDateString("en-IN")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      <div className="mt-6 overflow-hidden rounded-lg border border-graphite-800">
        <div className="flex items-center justify-between bg-graphite-900 px-4 py-2">
          <p className="text-xs font-medium uppercase tracking-wide text-graphite-500">Drawings &amp; area take-off</p>
          {canQuote ? <Link href={`/floor-plans/new?lead=${lead.id}`} className="rounded-md bg-brand-orange px-3 py-1 text-xs font-medium text-white hover:opacity-90">+ Upload AutoCAD / PDF drawing</Link> : null}
        </div>
        {plans && plans.length > 0 ? (
          <table className="w-full text-left text-sm">
            <tbody className="divide-y divide-graphite-800">
              {plans.map((p) => {
                const t = (p.totals ?? {}) as Record<string, number>;
                return (
                  <tr key={p.id} className="bg-graphite-950">
                    <td className="px-4 py-2.5"><Link href={`/floor-plans/${p.id}`} className="font-medium text-graphite-100 hover:text-brand-orange hover:underline">{p.name}</Link></td>
                    <td className="px-4 py-2.5 text-xs capitalize text-graphite-400">{p.drawing_type} · {p.original_path ? "DWG" : p.source_kind.toUpperCase()}</td>
                    <td className="px-4 py-2.5 text-right font-mono text-xs text-graphite-300">{t.contact_area ? `${fmtArea(t.contact_area)} contact` : "not measured"}</td>
                    <td className="px-4 py-2.5 text-right">
                      {canQuote && t.plan_area ? <Link href={`/quotations?lead=${lead.id}&mode=quick&plan=${p.id}`} className="text-xs text-brand-orange hover:underline">⚡ Quick quote from plan</Link> : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : <p className="bg-graphite-950 px-4 py-4 text-sm text-graphite-500">No drawings yet. Upload the AutoCAD floor plan (DWG/DXF) or a PDF to measure the formwork area.</p>}
      </div>

      {!canEdit ? <p className="mt-3 text-sm text-graphite-500">Your role can view this lead but not edit it.</p> : null}
      <div className="mt-6"><EditLeadForm lead={lead} canEdit={canEdit} /></div>
    </div>
  );
}
