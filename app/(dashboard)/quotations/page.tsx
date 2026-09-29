import { createClient } from "@/lib/supabase/server";
import { hasPermission } from "@/lib/auth/permissions";
import Link from "next/link";
import { QuotationCreationTabs, type LeadPrefill } from "./quotation-creation-tabs";
import { QuotationsTable, type QuotationRow } from "./quotations-table";
import { PageHeader } from "@/components/ui/page-header";


export const metadata = { title: "Quotations" };

export default async function QuotationsPage({ searchParams }: { searchParams: Promise<{ all?: string; lead?: string; mode?: string }> }) {
  const { all, lead: leadParam, mode } = await searchParams;
  const showAll = all === "1";
  const supabase = await createClient();
  let query = supabase.from("quotations")
    .select("id, quotation_code, customer_name, project_name, total_amount, total_with_gst, total_area_sqm, status, quotation_type, formwork_type, valid_until, created_at")
    .order("created_at", { ascending: false });
  if (!showAll) query = query.neq("status", "superseded");
  const { data: quotations } = await query;
  const { data: openLeads } = await supabase.from("leads").select("id, lead_code, customer_name, project_name").in("status", ["qualified", "contacted", "new", "quoted"]).order("created_at", { ascending: false });
  let leads = openLeads ?? [];

  // Opened from a lead ("Create quotation" on the lead page): pre-fill the form from that lead
  let fromLead: LeadPrefill | undefined;
  if (leadParam && /^[0-9a-f-]{36}$/i.test(leadParam)) {
    const { data: l } = await supabase.from("leads").select("*").eq("id", leadParam).maybeSingle();
    if (l) {
      if (!leads.some((x) => x.id === l.id)) leads = [{ id: l.id, lead_code: l.lead_code, customer_name: l.customer_name, project_name: l.project_name }, ...leads];
      fromLead = {
        leadId: l.id,
        label: `${l.lead_code} — ${l.project_name ?? l.customer_name}`,
        customer: {
          customerName: l.company_name ?? l.customer_name, kindAttn: l.contact_person_name, customerPhone: l.contact_phone,
          customerEmail: l.contact_email, customerGstin: l.gst_number, projectName: l.project_name, customerAddress: l.project_location,
        },
        areaSqm: l.estimated_area_sqm != null ? String(l.estimated_area_sqm) : undefined,
      };
    }
  }
  const initialMode = mode === "quick" ? "quick" : fromLead ? "detailed" : undefined;
  const { data: quickRates } = await supabase.from("quick_quote_rates").select("formwork_type, rate_per_sqm").eq("is_active", true);
  const canCreate = await hasPermission("quotations", "create");
  const { data: nextCode } = canCreate ? await supabase.rpc("next_quotation_code") : { data: null };

  return (
    <div className="fade-in mx-auto max-w-7xl">
      <PageHeader
        title="Quotations"
        description={canCreate ? "Create detailed panel-by-panel quotes or fast area-based quick quotes." : "Viewing quotations. Your role doesn't include quotation creation."}
      />

      {canCreate && <div className="mt-6"><QuotationCreationTabs key={fromLead?.leadId ?? "none"} leads={leads} rates={quickRates ?? []} nextCode={nextCode ?? ""} initialMode={initialMode} fromLead={fromLead} /></div>}

      <div className="mt-6">
        <QuotationsTable
          rows={(quotations ?? []) as QuotationRow[]}
          toolbar={
            <Link href={showAll ? "/quotations" : "/quotations?all=1"} className="text-xs text-graphite-500 hover:text-brand-orange">
              {showAll ? "Hide superseded versions" : "Show superseded versions"}
            </Link>
          }
        />
      </div>
    </div>
  );
}
