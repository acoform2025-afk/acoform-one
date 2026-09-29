import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile, requirePermissionOrRedirect } from "@/lib/auth/permissions";
import { UploadFloorPlanForm } from "./upload-form";

export const metadata = { title: "Upload floor plan" };

export default async function NewFloorPlanPage({ searchParams }: { searchParams: Promise<{ lead?: string; quotation?: string }> }) {
  await requirePermissionOrRedirect("quotations", "create", "/floor-plans");
  const { lead, quotation } = await searchParams;
  const supabase = await createClient();
  const profile = await getCurrentProfile();
  const { data: leads } = await supabase.from("leads").select("id, lead_code, customer_name, project_name").order("created_at", { ascending: false }).limit(300);
  const isId = (v?: string) => (v && /^[0-9a-f-]{36}$/i.test(v) ? v : undefined);

  return (
    <div className="fade-in">
      <Link href="/floor-plans" className="text-xs text-graphite-500 hover:text-graphite-300">← Floor plans</Link>
      <h1 className="mt-2 text-2xl font-semibold text-graphite-50">Upload floor plan</h1>
      <p className="mb-6 mt-1 max-w-2xl text-sm text-graphite-400">
        Upload the AutoCAD plan. On the next screen you measure slab, walls, columns and beams, and the formwork area is worked out for the quotation.
      </p>
      <UploadFloorPlanForm
        tenantId={profile!.tenant_id}
        leads={(leads ?? []).map((l) => ({ id: l.id, lead_code: l.lead_code, label: l.project_name ?? l.customer_name }))}
        leadId={isId(lead)} quotationId={isId(quotation)}
      />
    </div>
  );
}
