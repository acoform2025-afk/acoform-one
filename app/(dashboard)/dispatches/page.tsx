import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { date } from "@/lib/format";

export const metadata = { title: "Delivery challans" };

export default async function DispatchesPage() {
  const supabase = await createClient();
  const { data: notes } = await supabase.from("dispatch_notes")
    .select("id, dc_number, dispatch_date, vehicle_no, delivered_at, projects ( project_code, customer_name ), inventory_ledger ( id )")
    .order("created_at", { ascending: false });
  return (
    <div className="fade-in max-w-5xl">
      <h1 className="text-2xl font-semibold text-graphite-50">Delivery challans</h1>
      <p className="mt-1 text-sm text-graphite-400">Create a challan from <Link href="/inventory?status=in_stock" className="text-aluminium-300 hover:underline">Inventory</Link> by selecting in-stock panels.</p>
      <div className="mt-6 overflow-hidden rounded-lg border border-graphite-800">
        <table className="w-full text-left text-sm">
          <thead className="bg-graphite-900 text-xs uppercase tracking-wide text-graphite-500">
            <tr><th className="px-4 py-3">Challan</th><th className="px-4 py-3">Project</th><th className="px-4 py-3">Date</th><th className="px-4 py-3">Vehicle</th><th className="px-4 py-3">Status</th><th /></tr>
          </thead>
          <tbody className="divide-y divide-graphite-800">
            {(notes ?? []).length === 0 && <tr><td colSpan={6} className="px-4 py-8 text-center text-graphite-600">No dispatches yet.</td></tr>}
            {(notes ?? []).map((n) => {
              const p = Array.isArray(n.projects) ? n.projects[0] : n.projects;
              return (
                <tr key={n.id} className="bg-graphite-950 text-xs">
                  <td className="px-4 py-3 font-mono text-aluminium-300"><Link href={`/dispatches/${n.id}`} className="hover:underline">{n.dc_number}</Link></td>
                  <td className="px-4 py-3 text-graphite-200">{p?.project_code} <span className="text-graphite-500">{p?.customer_name}</span></td>
                  <td className="px-4 py-3">{date(n.dispatch_date)}</td>
                  <td className="px-4 py-3">{n.vehicle_no ?? "—"}</td>
                  <td className="px-4 py-3">{n.delivered_at ? <span className="text-signal-green">Delivered</span> : <span className="text-blue-700 dark:text-blue-300">In transit</span>}</td>
                  <td className="px-4 py-3 text-right"><a href={`/dispatches/${n.id}/pdf`} target="_blank" rel="noopener" className="text-aluminium-300 hover:underline">PDF</a></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
