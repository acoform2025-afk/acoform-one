import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { inr, titleCase } from "@/lib/format";

type Kpis = {
  leads: { total: number; by_status: Record<string, number> };
  quotations: { pipeline_value: number; won_value: number; by_status: Record<string, number> };
  projects: { total: number; active: number; by_status: Record<string, number> };
  production: { orders_by_status: Record<string, number>; work_orders_by_status: Record<string, number> };
  inventory: { panels_total: number; panels_in_stock: number; estimated_stock_value: number; avg_cycle_count: number };
  quality: { open_ncr_count: number; critical_open_ncr_count: number };
};

function Tile({ label, value, sub, href }: { label: string; value: string; sub?: string; href?: string }) {
  const body = (
    <div className="h-full rounded-lg border border-graphite-800 bg-graphite-900 p-4 transition-colors hover:border-graphite-700">
      <p className="text-xs uppercase tracking-wide text-graphite-500">{label}</p>
      <p className="mt-1.5 font-mono text-xl text-graphite-50">{value}</p>
      {sub && <p className="mt-1 text-xs text-graphite-500">{sub}</p>}
    </div>
  );
  return href ? <Link href={href}>{body}</Link> : body;
}

function Breakdown({ title, data }: { title: string; data: Record<string, number> }) {
  const entries = Object.entries(data ?? {});
  return (
    <div className="rounded-lg border border-graphite-800 bg-graphite-900 p-4">
      <p className="mb-2 text-xs uppercase tracking-wide text-graphite-500">{title}</p>
      {entries.length === 0 ? (
        <p className="text-sm text-graphite-600">Nothing yet</p>
      ) : (
        <ul className="space-y-1 text-sm">
          {entries.map(([k, v]) => (
            <li key={k} className="flex justify-between"><span className="text-graphite-400">{titleCase(k)}</span><span className="font-mono text-graphite-200">{v}</span></li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default async function DashboardPage() {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_dashboard_kpis");
  const k = data as unknown as Kpis | null;

  return (
    <div className="fade-in max-w-6xl">
      <h1 className="text-2xl font-semibold text-graphite-50">Dashboard</h1>
      {error || !k ? (
        <p className="mt-6 text-sm text-graphite-500">You don&apos;t have access to the dashboard figures.</p>
      ) : (
        <>
          <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Tile label="Quotation pipeline" value={inr(k.quotations.pipeline_value, 0)} sub="Draft → sent, before GST" href="/quotations" />
            <Tile label="Won (accepted)" value={inr(k.quotations.won_value, 0)} href="/quotations" />
            <Tile label="Active projects" value={String(k.projects.active)} sub={`${k.projects.total} total`} href="/projects" />
            <Tile label="Leads" value={String(k.leads.total)} href="/leads" />
            <Tile label="Panels in stock" value={String(k.inventory.panels_in_stock)} sub={`${k.inventory.panels_total} tracked`} />
            <Tile label="Stock value (est.)" value={inr(k.inventory.estimated_stock_value, 0)} />
            <Tile label="Open NCRs" value={String(k.quality.open_ncr_count)} sub={`${k.quality.critical_open_ncr_count} critical`} />
            <Tile label="Avg panel cycles" value={String(k.inventory.avg_cycle_count)} />
          </div>
          <div className="mt-6 grid gap-3 md:grid-cols-2 lg:grid-cols-4">
            <Breakdown title="Quotations by status" data={k.quotations.by_status} />
            <Breakdown title="Leads by status" data={k.leads.by_status} />
            <Breakdown title="Projects by status" data={k.projects.by_status} />
            <Breakdown title="Work orders by status" data={k.production.work_orders_by_status} />
          </div>
        </>
      )}
    </div>
  );
}
