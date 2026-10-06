import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { hasPermission } from "@/lib/auth/permissions";
import { fmtArea } from "@/lib/floor-plans/calc";

export const metadata = { title: "Floor plans" };

const KIND: Record<string, string> = { dxf: "AutoCAD DXF", pdf: "PDF", image: "Picture" };

export default async function FloorPlansPage() {
  const supabase = await createClient();
  const canCreate = await hasPermission("quotations", "create");
  const { data: plans } = await supabase
    .from("floor_plans")
    .select("id, name, source_kind, totals, updated_at, leads ( id, lead_code, project_name, customer_name )")
    .order("updated_at", { ascending: false });

  return (
    <div className="fade-in">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-graphite-50">Floor plans &amp; area take-off</h1>
          <p className="mt-1 max-w-2xl text-sm text-graphite-400">Upload an AutoCAD plan, measure it, and use the formwork area in a quotation.</p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/floor-plans/check" className="rounded-md border border-graphite-700 px-3 py-2 text-xs text-graphite-200 hover:bg-graphite-800">Check approved readings</Link>
          {canCreate ? <Link href="/floor-plans/new" className="rounded-md bg-brand-orange px-4 py-2 text-sm font-medium text-white hover:opacity-90">+ Upload floor plan</Link> : null}
        </div>
      </div>

      <div className="mt-6 overflow-x-auto rounded-lg border border-graphite-800">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead className="bg-graphite-900 text-xs uppercase tracking-wide text-graphite-500">
            <tr>
              <th className="px-4 py-2.5 font-medium">Name</th>
              <th className="px-4 py-2.5 font-medium">Lead</th>
              <th className="px-4 py-2.5 font-medium">File</th>
              <th className="px-4 py-2.5 text-right font-medium">Floor plate</th>
              <th className="px-4 py-2.5 text-right font-medium">Contact area</th>
              <th className="px-4 py-2.5 font-medium">Updated</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-graphite-800">
            {(plans ?? []).map((p) => {
              const t = (p.totals ?? {}) as Record<string, number>;
              const l = Array.isArray(p.leads) ? p.leads[0] : p.leads;
              return (
                <tr key={p.id} className="bg-graphite-950 hover:bg-graphite-900">
                  <td className="px-4 py-2.5"><Link href={`/floor-plans/${p.id}`} className="font-medium text-graphite-100 hover:text-brand-orange hover:underline">{p.name}</Link></td>
                  <td className="px-4 py-2.5 text-xs text-graphite-400">{l ? <Link href={`/leads/${l.id}`} className="hover:underline">{l.lead_code} · {l.project_name ?? l.customer_name}</Link> : "—"}</td>
                  <td className="px-4 py-2.5 text-xs text-graphite-400">{KIND[p.source_kind] ?? p.source_kind}</td>
                  <td className="px-4 py-2.5 text-right font-mono text-xs text-graphite-300">{t.plan_area ? fmtArea(t.plan_area) : "—"}</td>
                  <td className="px-4 py-2.5 text-right font-mono text-xs text-graphite-100">{t.contact_area ? fmtArea(t.contact_area) : <span className="text-graphite-500">not measured</span>}</td>
                  <td className="px-4 py-2.5 text-xs text-graphite-500">{new Date(p.updated_at).toLocaleDateString("en-IN")}</td>
                </tr>
              );
            })}
            {!plans?.length ? (
              <tr><td colSpan={6} className="px-4 py-10 text-center text-sm text-graphite-500">No floor plans yet.{canCreate ? " Click “Upload floor plan” to add one." : ""}</td></tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
