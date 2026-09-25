import { createClient } from "@/lib/supabase/server";
import { hasPermission } from "@/lib/auth/permissions";
import Link from "next/link";
import { QuotationCreationTabs } from "./quotation-creation-tabs";

const STATUS_STYLES: Record<string, string> = {
  draft: "bg-graphite-800 text-graphite-300",
  pending_approval: "bg-signal-amber/15 text-signal-amber",
  approved: "bg-signal-green/15 text-signal-green",
  sent: "bg-blue-900/30 text-blue-300",
  accepted: "bg-signal-green/25 text-signal-green",
  rejected: "bg-signal-red/15 text-signal-red",
  expired: "bg-graphite-800 text-graphite-500",
  superseded: "bg-graphite-800 text-graphite-500 line-through",
};

export const metadata = { title: "Quotations" };

export default async function QuotationsPage({ searchParams }: { searchParams: Promise<{ all?: string }> }) {
  const { all } = await searchParams;
  const showAll = all === "1";
  const supabase = await createClient();
  let query = supabase.from("quotations")
    .select("id, quotation_code, customer_name, total_amount, total_with_gst, total_area_sqm, status, quotation_type, formwork_type, valid_until, created_at")
    .order("created_at", { ascending: false });
  if (!showAll) query = query.neq("status", "superseded");
  const { data: quotations } = await query;
  const { data: leads } = await supabase.from("leads").select("id, lead_code, customer_name").in("status", ["qualified", "contacted", "new"]).order("created_at", { ascending: false });
  const { data: quickRates } = await supabase.from("quick_quote_rates").select("formwork_type, rate_per_sqm").eq("is_active", true);
  const canCreate = await hasPermission("quotations", "create");
  const { data: nextCode } = canCreate ? await supabase.rpc("next_quotation_code") : { data: null };

  return (
    <div className="fade-in max-w-5xl">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="font-[family-name:var(--font-display)] text-2xl font-semibold text-graphite-50">Quotations</h1>
          <p className="mt-1 text-sm text-graphite-400">
            {canCreate ? "Create detailed panel-by-panel quotes or fast area-based quick quotes." : "Viewing quotations. Your role doesn't include quotation creation."}
          </p>
        </div>
      </div>

      {canCreate && <div className="mt-6"><QuotationCreationTabs leads={leads ?? []} rates={quickRates ?? []} nextCode={nextCode ?? ""} /></div>}

      <div className="mt-6 flex justify-end">
        <Link href={showAll ? "/quotations" : "/quotations?all=1"} className="text-xs text-graphite-500 hover:text-signal-amber">
          {showAll ? "Hide superseded versions" : "Show superseded versions"}
        </Link>
      </div>
      <div className="mt-2 overflow-hidden rounded-lg border border-graphite-800">
        <table className="w-full text-left text-sm">
          <thead className="bg-graphite-900 text-xs uppercase tracking-wide text-graphite-500">
            <tr>
              <th className="px-4 py-3 font-medium">Code</th>
              <th className="px-4 py-3 font-medium">Customer</th>
              <th className="px-4 py-3 font-medium">Type</th>
              <th className="px-4 py-3 font-medium">Area (m²)</th>
              <th className="px-4 py-3 font-medium">Total incl. GST (₹)</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-graphite-800">
            {quotations && quotations.length > 0 ? (
              quotations.map((q) => (
                <tr key={q.id} className="bg-graphite-950 hover:bg-graphite-900/40 transition-colors">
                  <td className="px-4 py-3 font-mono text-xs text-aluminium-300">{q.quotation_code}</td>
                  <td className="px-4 py-3 text-graphite-100">{q.customer_name}</td>
                  <td className="px-4 py-3 text-xs capitalize text-graphite-400">{q.quotation_type === "quick" ? `Quick · ${q.formwork_type}` : "Detailed"}</td>
                  <td className="px-4 py-3 font-mono text-xs text-graphite-300">{q.total_area_sqm != null ? Number(q.total_area_sqm).toFixed(2) : "—"}</td>
                  <td className="px-4 py-3 font-mono text-xs text-graphite-100">{q.total_with_gst != null ? `₹ ${Number(q.total_with_gst).toLocaleString("en-IN", { minimumFractionDigits: 2 })}` : "—"}</td>
                  <td className="px-4 py-3"><span className={`rounded-full px-2.5 py-1 text-xs capitalize ${STATUS_STYLES[q.status] ?? "bg-graphite-800 text-graphite-300"}`}>{q.status.replace("_", " ")}</span></td>
                  <td className="px-4 py-3 text-right"><Link href={`/quotations/${q.id}`} className="text-xs text-aluminium-300 underline-offset-4 hover:underline">Open →</Link></td>
                </tr>
              ))
            ) : (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-sm text-graphite-600">No quotations yet. Create your first above.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
