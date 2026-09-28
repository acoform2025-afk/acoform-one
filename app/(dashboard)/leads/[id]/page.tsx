import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { hasPermission } from "@/lib/auth/permissions";
import { EditLeadForm } from "./edit-lead-form";

export default async function LeadDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: lead } = await supabase.from("leads").select("*").eq("id", id).maybeSingle();
  if (!lead) notFound();
  const canEdit = await hasPermission("leads", "update");

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
      {!canEdit ? <p className="mt-3 text-sm text-graphite-500">Your role can view this lead but not edit it.</p> : null}
      <div className="mt-6"><EditLeadForm lead={lead} canEdit={canEdit} /></div>
    </div>
  );
}
