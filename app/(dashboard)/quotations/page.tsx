import { createClient } from "@/lib/supabase/server";
import { hasPermission } from "@/lib/auth/permissions";
import Link from "next/link";
import { QuotationCreationTabs, type LeadPrefill } from "./quotation-creation-tabs";
import { QuotationsTable, type QuotationRow } from "./quotations-table";
import { PageHeader } from "@/components/ui/page-header";


export const metadata = { title: "Quotations" };

export default async function QuotationsPage({ searchParams }: { searchParams: Promise<{ all?: string; lead?: string; mode?: string; plan?: string; blocks?: string }> }) {
  const { all, lead: leadParam, mode, plan: planParam, blocks: blocksParam } = await searchParams;
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
  // Opened from a measured floor plan ("Quick quote from this plan"): area comes from the take-off
  if (fromLead && planParam && /^[0-9a-f-]{36}$/i.test(planParam)) {
    const { data: fp } = await supabase.from("floor_plans").select("id, name, totals").eq("id", planParam).maybeSingle();
    const tt = (fp?.totals ?? {}) as Record<string, number>;
    const full = Number(tt.quote_area || tt.contact_area || 0);
    if (fp && (full > 0 || tt.vertical_area > 0)) {
      fromLead.plan = { id: fp.id, name: fp.name, monolithic: full, vertical: Number(tt.vertical_area ?? 0) };
      fromLead.areaSqm = String(full);
    }
  }
  // Opened from the project summary ("Quote all blocks"): one line per measured block, both wall options
  if (fromLead && blocksParam === "1") {
    const { data: fps } = await supabase.from("floor_plans").select("id, name, totals").eq("lead_id", fromLead.leadId).eq("drawing_type", "plan").order("name");
    const blocks = (fps ?? []).map((fp) => {
      const tt = (fp.totals ?? {}) as Record<string, unknown> & { wall_options?: { all: { quote: number }; thin: { quote: number }; limitMm: number } };
      const q1 = Number(tt.quote_area || tt.contact_area || 0); if (!(q1 > 0)) return null;
      const wo = tt.wall_options;
      return { id: fp.id, name: fp.name.replace(/^.*?—\s*/, "").replace(/\s*typical floor$/i, ""), vertical: Number(tt.vertical_area ?? 0), full: wo ? wo.all.quote : q1, thin: wo ? wo.thin.quote : undefined, limitMm: wo?.limitMm };
    }).filter((b): b is NonNullable<typeof b> => !!b);
    if (blocks.length) { fromLead.blocks = blocks; fromLead.areaSqm = String(Math.round(blocks.reduce((s, b) => s + b.full, 0) * 100) / 100); }
  }
  const initialMode = mode === "quick" ? "quick" : mode === "accessories" ? "accessories" : fromLead ? "detailed" : undefined;
  // accessory rates quoted before: offered again for the same item and size
  const { data: knownRates } = await supabase.from("accessory_rates").select("item, spec, unit, rate").order("times_quoted", { ascending: false }).limit(500);
  const { data: quickRates } = await supabase.from("quick_quote_rates").select("formwork_type, rate_per_sqm").eq("is_active", true);
  const canCreate = await hasPermission("quotations", "create");
  const { data: nextCode } = canCreate ? await supabase.rpc("next_quotation_code") : { data: null };

  return (
    <div className="fade-in mx-auto max-w-7xl">
      <PageHeader
        title="Quotations"
        description={canCreate ? "Create detailed panel-by-panel quotes, fast area-based quick quotes, or accessories-only quotes." : "Viewing quotations. Your role doesn't include quotation creation."}
      />

      {canCreate && <div className="mt-6"><QuotationCreationTabs key={fromLead?.leadId ?? "none"} leads={leads} rates={quickRates ?? []} nextCode={nextCode ?? ""} initialMode={initialMode} fromLead={fromLead} knownRates={(knownRates ?? []).map((k) => ({ ...k, rate: Number(k.rate) }))} /></div>}

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
