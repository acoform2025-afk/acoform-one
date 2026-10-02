import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { hasPermission } from "@/lib/auth/permissions";
import { EditLeadForm } from "./edit-lead-form";
import { fmtArea, type WallOptions } from "@/lib/floor-plans/calc";
import { Download, FileText } from "lucide-react";

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
    .select("id, name, drawing_type, source_kind, original_path, totals, updated_at").eq("lead_id", id).order("name");

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

      {(() => {
        // project summary: every measured block side by side, with both wall options when the drawing allows them
        type T = Record<string, number> & { wall_options?: WallOptions; params?: { scope?: string; floorHeight?: number; slabMm?: number } };
        const blocks = (plans ?? []).filter((p) => p.drawing_type === "plan" && Number((p.totals as T)?.contact_area) > 0).map((p) => ({ id: p.id, name: p.name, t: p.totals as T }));
        if (blocks.length < 1) return null;
        const hasOpt2 = blocks.every((b) => b.t.wall_options);
        const limit = blocks.find((b) => b.t.wall_options)?.t.wall_options?.limitMm ?? 125;
        const o1 = (b: typeof blocks[number]) => b.t.wall_options ? b.t.wall_options.all : { contact: b.t.contact_area, quote: b.t.quote_area };
        const o2 = (b: typeof blocks[number]) => b.t.wall_options?.thin;
        const sum = (f: (b: typeof blocks[number]) => number) => blocks.reduce((a, b) => a + f(b), 0);
        const pct = blocks[0].t.extra_pct ?? 0;
        return (
          <div className="mt-6 overflow-hidden rounded-lg border border-brand-orange/40">
            <div className="flex flex-wrap items-center justify-between gap-2 bg-graphite-900 px-4 py-2">
              <p className="text-xs font-medium uppercase tracking-wide text-brand-orange">Project summary — {blocks.length} block{blocks.length > 1 ? "s" : ""} · typical floor</p>
              <div className="flex flex-wrap gap-1.5">
                <a href={`/leads/${lead.id}/area-sheets`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-md border border-graphite-700 px-2.5 py-1 text-xs text-graphite-200 hover:border-brand-orange"><FileText className="size-3.5" />Area sheets (all blocks)</a>
                {hasOpt2 ? <a href={`/leads/${lead.id}/area-sheets?options=both`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-md border border-graphite-700 px-2.5 py-1 text-xs text-graphite-200 hover:border-brand-orange"><Download className="size-3.5" />Area sheets (both options)</a> : null}
                {canQuote ? <Link href={`/quotations?lead=${lead.id}&mode=quick&blocks=1`} className="rounded-md bg-brand-orange px-2.5 py-1 text-xs font-medium text-white hover:opacity-90">⚡ Quote all blocks{hasOpt2 ? " (both options)" : ""}</Link> : null}
              </div>
            </div>
            <table className="w-full text-left text-sm">
              <thead className="bg-graphite-900/60 text-[10px] uppercase tracking-wide text-graphite-500">
                <tr><th className="px-4 py-1.5">Block</th><th className="px-4 py-1.5 text-right">Option 1 · all walls concrete</th><th className="px-4 py-1.5 text-right">+{pct}%</th>{hasOpt2 ? <><th className="px-4 py-1.5 text-right">Option 2 · walls under {limit} mm in block</th><th className="px-4 py-1.5 text-right">+{pct}%</th></> : null}<th className="px-4 py-1.5 text-right">Chosen</th></tr>
              </thead>
              <tbody className="divide-y divide-graphite-800">
                {blocks.map((b) => (
                  <tr key={b.id} className="bg-graphite-950">
                    <td className="px-4 py-2"><Link href={`/floor-plans/${b.id}`} className="text-graphite-100 hover:text-brand-orange hover:underline">{b.name}</Link><span className="ml-2 text-[11px] text-graphite-500">{b.t.params?.floorHeight ? `${Math.round(b.t.params.floorHeight * 1000)} / ${b.t.params.slabMm} mm` : ""}</span></td>
                    <td className="px-4 py-2 text-right font-mono text-xs text-graphite-200">{fmtArea(o1(b).contact)}</td>
                    <td className="px-4 py-2 text-right font-mono text-xs text-graphite-400">{fmtArea(o1(b).quote)}</td>
                    {hasOpt2 ? <><td className="px-4 py-2 text-right font-mono text-xs text-graphite-200">{fmtArea(o2(b)!.contact)}</td><td className="px-4 py-2 text-right font-mono text-xs text-graphite-400">{fmtArea(o2(b)!.quote)}</td></> : null}
                    <td className="px-4 py-2 text-right text-[11px] text-graphite-400">{b.t.wall_options ? (b.t.wall_options.chosen === "thin" ? "Option 2" : "Option 1") : "—"}</td>
                  </tr>
                ))}
                <tr className="bg-graphite-900 font-medium">
                  <td className="px-4 py-2 text-graphite-100">Total</td>
                  <td className="px-4 py-2 text-right font-mono text-xs text-graphite-50">{fmtArea(sum((b) => o1(b).contact))}</td>
                  <td className="px-4 py-2 text-right font-mono text-xs text-graphite-300">{fmtArea(sum((b) => o1(b).quote))}</td>
                  {hasOpt2 ? <><td className="px-4 py-2 text-right font-mono text-xs text-graphite-50">{fmtArea(sum((b) => o2(b)!.contact))}</td><td className="px-4 py-2 text-right font-mono text-xs text-graphite-300">{fmtArea(sum((b) => o2(b)!.quote))}</td></> : null}
                  <td className="px-4 py-2 text-right text-[11px] text-graphite-500">{hasOpt2 ? `${fmtArea(sum((b) => o1(b).contact) - sum((b) => o2(b)!.contact))} apart` : ""}</td>
                </tr>
              </tbody>
            </table>
          </div>
        );
      })()}

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
