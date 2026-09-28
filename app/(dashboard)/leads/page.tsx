import { createClient } from "@/lib/supabase/server";
import { hasPermission } from "@/lib/auth/permissions";
import Link from "next/link";
import { NewLeadForm } from "./new-lead-form";

export default async function LeadsPage() {
  const supabase = await createClient();
  const { data: leads } = await supabase.from("leads").select("*").order("created_at", { ascending: false });
  const canCreate = await hasPermission("leads", "create");

  return (
    <div className="fade-in max-w-5xl">
      <h1 className="font-[family-name:var(--font-display)] text-2xl font-semibold text-graphite-50">Leads</h1>
      <p className="mt-1 text-sm text-graphite-400">
        {canCreate ? "Create and track incoming sales leads. Click a lead to open or edit it." : "Viewing leads. Click a lead to open it."}
      </p>

      <div className="mt-6"><NewLeadForm canCreate={canCreate} /></div>

      <div className="mt-6 overflow-hidden rounded-lg border border-graphite-800">
        <table className="w-full text-left text-sm">
          <thead className="bg-graphite-900 text-xs uppercase tracking-wide text-graphite-500">
            <tr>
              <th className="px-4 py-3 font-medium">Lead no.</th>
              <th className="px-4 py-3 font-medium">Project</th>
              <th className="px-4 py-3 font-medium">Company</th>
              <th className="px-4 py-3 font-medium">Contact</th>
              <th className="px-4 py-3 font-medium">Location</th>
              <th className="px-4 py-3 font-medium">Type</th>
              <th className="px-4 py-3 font-medium">Formwork</th>
              <th className="px-4 py-3 font-medium">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-graphite-800">
            {leads && leads.length > 0 ? (
              leads.map((lead) => (
                <tr key={lead.id} className="bg-graphite-950">
                  <td className="px-4 py-3 font-mono text-xs text-aluminium-300">
                    <Link href={`/leads/${lead.id}`} className="hover:text-signal-amber hover:underline">{lead.lead_code}</Link>
                  </td>
                  <td className="px-4 py-3 text-graphite-100">
                    <Link href={`/leads/${lead.id}`} className="hover:text-signal-amber hover:underline">{lead.project_name ?? lead.customer_name}</Link>
                  </td>
                  <td className="px-4 py-3 text-graphite-300">{lead.company_name ?? "—"}</td>
                  <td className="px-4 py-3 text-xs text-graphite-400">
                    {lead.contact_person_name ?? "—"}{lead.contact_phone ? ` · ${lead.contact_phone}` : ""}
                  </td>
                  <td className="px-4 py-3 text-graphite-400">{lead.project_location ?? "—"}</td>
                  <td className="px-4 py-3 text-xs capitalize text-graphite-400">{lead.project_type ?? "—"}</td>
                  <td className="px-4 py-3 text-xs capitalize text-graphite-400">{lead.formwork_type ?? "—"}</td>
                  <td className="px-4 py-3"><span className="rounded-full bg-graphite-800 px-2.5 py-1 text-xs capitalize text-graphite-300">{lead.status}</span></td>
                </tr>
              ))
            ) : (
              <tr><td colSpan={8} className="px-4 py-8 text-center text-sm text-graphite-600">No leads yet. Create your first lead above.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
