import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { date, inr, num, titleCase } from "@/lib/format";

export default async function ProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: p } = await supabase.from("projects").select("*").eq("id", id).single();
  if (!p) notFound();

  const [{ data: quotation }, { data: designs }, { data: orders }] = await Promise.all([
    p.quotation_id
      ? supabase.from("quotations").select("id, quotation_code, total_with_gst, status").eq("id", p.quotation_id).single()
      : Promise.resolve({ data: null }),
    supabase.from("designs").select("id, design_code, status, created_at").eq("project_id", id).order("created_at"),
    supabase.from("production_orders").select("id, order_code, status, target_completion").eq("project_id", id).order("created_at"),
  ]);

  const { data: boms } = designs && designs.length
    ? await supabase.from("bom_headers").select("id, design_id, version, status, total_panel_count, total_weight_kg").in("design_id", designs.map((d) => d.id)).order("version")
    : { data: [] as { id: string; design_id: string; version: number; status: string; total_panel_count: number; total_weight_kg: number }[] };

  return (
    <div className="fade-in max-w-4xl">
      <h1 className="text-2xl font-semibold text-graphite-50">{p.project_code}</h1>
      <p className="mt-1 text-sm text-graphite-400">{p.customer_name} · {p.site_address ?? "no site address"}</p>

      <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        {[["Status", titleCase(p.status)], ["Start", date(p.start_date)], ["Target", date(p.target_completion)],
          ["Quotation", quotation ? inr(quotation.total_with_gst, 0) : "—"]].map(([k, v]) => (
          <div key={k} className="rounded-lg border border-graphite-800 bg-graphite-900 p-4">
            <p className="text-xs uppercase tracking-wide text-graphite-500">{k}</p>
            <p className="mt-1.5 text-sm text-graphite-100">{v}</p>
          </div>
        ))}
      </div>

      {quotation && (
        <p className="mt-4 text-sm text-graphite-400">From quotation <Link href={`/quotations/${quotation.id}`} className="font-mono text-aluminium-300 hover:underline">{quotation.quotation_code}</Link></p>
      )}

      <section className="mt-8">
        <h2 className="mb-2 text-sm font-medium text-graphite-200">Designs</h2>
        <div className="overflow-hidden rounded-lg border border-graphite-800">
          <table className="w-full text-left text-sm">
            <tbody className="divide-y divide-graphite-800">
              {(designs ?? []).length === 0 && <tr><td className="px-4 py-6 text-center text-graphite-600">No designs yet.</td></tr>}
              {(designs ?? []).map((d) => {
                const dBoms = (boms ?? []).filter((b) => b.design_id === d.id);
                return (
                  <tr key={d.id} className="bg-graphite-950">
                    <td className="px-4 py-3 font-mono text-xs text-aluminium-300">{d.design_code}</td>
                    <td className="px-4 py-3 text-xs text-graphite-300">{titleCase(d.status)}</td>
                    <td className="px-4 py-3 text-xs text-graphite-400">
                      {dBoms.length ? dBoms.map((b) => `BOM v${b.version} (${titleCase(b.status)}, ${b.total_panel_count} panels, ${num(b.total_weight_kg, 1)} kg)`).join(" · ") : "No BOM"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mt-8">
        <h2 className="mb-2 text-sm font-medium text-graphite-200">Production orders</h2>
        <div className="overflow-hidden rounded-lg border border-graphite-800">
          <table className="w-full text-left text-sm">
            <tbody className="divide-y divide-graphite-800">
              {(orders ?? []).length === 0 && <tr><td className="px-4 py-6 text-center text-graphite-600">No production orders yet.</td></tr>}
              {(orders ?? []).map((o) => (
                <tr key={o.id} className="bg-graphite-950">
                  <td className="px-4 py-3 font-mono text-xs text-aluminium-300">{o.order_code}</td>
                  <td className="px-4 py-3 text-xs text-graphite-300">{titleCase(o.status)}</td>
                  <td className="px-4 py-3 text-xs text-graphite-400">{date(o.target_completion)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <p className="mt-6 text-xs text-graphite-600">Design, BOM and production screens arrive in the next update.</p>
    </div>
  );
}
