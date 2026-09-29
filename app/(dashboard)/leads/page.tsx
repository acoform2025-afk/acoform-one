import { createClient } from "@/lib/supabase/server";
import { hasPermission } from "@/lib/auth/permissions";
import { PageHeader } from "@/components/ui/page-header";
import { NewLeadForm } from "./new-lead-form";
import { LeadsTable, type LeadRow } from "./leads-table";

export const metadata = { title: "Leads" };

export default async function LeadsPage() {
  const supabase = await createClient();
  const { data: leads } = await supabase
    .from("leads")
    .select("id, lead_code, project_name, customer_name, company_name, contact_person_name, contact_phone, project_location, project_type, formwork_type, estimated_area_sqm, status, created_at")
    .order("created_at", { ascending: false });
  const canCreate = await hasPermission("leads", "create");

  return (
    <div className="fade-in mx-auto max-w-7xl">
      <PageHeader
        title="Leads"
        description={canCreate ? "Track enquiries from first contact to quotation. Click a lead to open or edit it." : "Viewing leads. Click a lead to open it."}
      />
      <div className="mt-6"><NewLeadForm canCreate={canCreate} /></div>
      <div className="mt-6"><LeadsTable rows={(leads ?? []) as LeadRow[]} /></div>
    </div>
  );
}
