import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { date, titleCase } from "@/lib/format";

export const metadata = { title: "Production" };

export default async function ProductionPage() {
  const supabase = await createClient();
  const { data: orders } = await supabase
    .from("production_orders")
    .select("id, order_code, status, target_completion, projects ( project_code, customer_name ), work_orders ( status )")
    .order("created_at", { ascending: false });

  return (
    <div className="fade-in max-w-5xl">
      <h1 className="text-2xl font-semibold text-graphite-50">Production</h1>
      <p className="mt-1 text-sm text-graphite-400">Orders are released from an approved BOM (Project → Design → BOM).</p>
      <div className="mt-6 overflow-hidden rounded-lg border border-graphite-800">
        <table className="w-full text-left text-sm">
          <thead className="bg-graphite-900 text-xs uppercase tracking-wide text-graphite-500">
            <tr><th className="px-4 py-3">Order</th><th className="px-4 py-3">Project</th><th className="px-4 py-3">Progress</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Target</th><th /></tr>
          </thead>
          <tbody className="divide-y divide-graphite-800">
            {(orders ?? []).length === 0 && <tr><td colSpan={6} className="px-4 py-8 text-center text-graphite-600">No production orders yet.</td></tr>}
            {(orders ?? []).map((o) => {
              const p = Array.isArray(o.projects) ? o.projects[0] : o.projects;
              const wos = o.work_orders ?? [];
              const done = wos.filter((w) => w.status === "completed").length;
              return (
                <tr key={o.id} className="bg-graphite-950">
                  <td className="px-4 py-3 font-mono text-xs text-aluminium-300">{o.order_code}</td>
                  <td className="px-4 py-3 text-graphite-200">{p?.project_code} <span className="text-xs text-graphite-500">{p?.customer_name}</span></td>
                  <td className="px-4 py-3 text-xs text-graphite-300">{done}/{wos.length} work orders</td>
                  <td className="px-4 py-3 text-xs text-graphite-300">{titleCase(o.status)}</td>
                  <td className="px-4 py-3 text-xs text-graphite-400">{date(o.target_completion)}</td>
                  <td className="px-4 py-3 text-right"><Link href={`/production/${o.id}`} className="text-xs text-aluminium-300 hover:underline">Open →</Link></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
