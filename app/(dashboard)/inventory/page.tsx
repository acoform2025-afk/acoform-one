import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { hasPermission } from "@/lib/auth/permissions";
import { titleCase } from "@/lib/format";
import { PanelTable } from "./panel-table";

export const metadata = { title: "Inventory & dispatch" };

const STATUSES = ["in_stock", "dispatched", "on_site", "under_repair", "scrapped"];

export default async function InventoryPage({ searchParams }: { searchParams: Promise<{ status?: string; q?: string; code?: string }> }) {
  const { status, q, code } = await searchParams;
  const supabase = await createClient();

  let query = supabase.from("panels").select("id, qr_code, panel_code, status, cycle_count, current_location").order("panel_code").order("qr_code").limit(500);
  if (status && STATUSES.includes(status)) query = query.eq("status", status);
  if (code) query = query.eq("panel_code", code);
  if (q) query = query.ilike("qr_code", `%${q.trim()}%`);

  const [{ data: panels }, { data: all }, { data: projects }, { data: repairs }, canDispatch, canReturn] = await Promise.all([
    query,
    supabase.from("panels").select("status, panel_code"),
    supabase.from("projects").select("id, project_code, customer_name").not("status", "in", "(completed,cancelled)").order("project_code"),
    supabase.from("panels").select("id, qr_code, panel_code").eq("status", "under_repair"),
    hasPermission("dispatches", "create"),
    hasPermission("inventory", "adjust"),
  ]);

  const onSiteIds = (panels ?? []).filter((p) => p.status === "dispatched" || p.status === "on_site").map((p) => p.id);
  const { data: ledger } = onSiteIds.length
    ? await supabase.from("inventory_ledger").select("panel_id, project_id, created_at").eq("event_type", "dispatched").in("panel_id", onSiteIds).order("created_at", { ascending: false })
    : { data: [] as { panel_id: string; project_id: string | null; created_at: string }[] };
  const projCode = new Map((projects ?? []).map((p) => [p.id, p.project_code]));
  const panelProject = new Map<string, string | null>();
  (ledger ?? []).forEach((l) => { if (!panelProject.has(l.panel_id)) panelProject.set(l.panel_id, l.project_id ? projCode.get(l.project_id) ?? null : null); });

  const counts = STATUSES.map((s) => [s, (all ?? []).filter((p) => p.status === s).length] as const);
  const codes = [...new Set((all ?? []).map((p) => p.panel_code))].sort();

  return (
    <div className="fade-in max-w-6xl">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-graphite-50">Inventory &amp; dispatch</h1>
          <p className="mt-1 text-sm text-graphite-400">Every panel made through QC, tracked by QR code. Select panels to dispatch or return.</p>
        </div>
        <Link href="/dispatches" className="text-sm text-aluminium-300 hover:underline">Delivery challans →</Link>
      </div>

      <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-5">
        {counts.map(([s, n]) => (
          <Link key={s} href={status === s ? "/inventory" : `/inventory?status=${s}`}
            className={`rounded-lg border p-3 ${status === s ? "border-signal-amber bg-signal-amber/5" : "border-graphite-800 bg-graphite-900 hover:border-graphite-700"}`}>
            <p className="text-xs uppercase tracking-wide text-graphite-500">{titleCase(s)}</p>
            <p className="mt-1 font-mono text-xl text-graphite-50">{n}</p>
          </Link>
        ))}
      </div>

      <form className="mt-4 flex flex-wrap gap-2" action="/inventory">
        {status && <input type="hidden" name="status" value={status} />}
        <input name="q" defaultValue={q ?? ""} placeholder="Search QR code" className="rounded-md border border-graphite-700 bg-graphite-900 px-3 py-1.5 text-sm text-graphite-100" />
        <select name="code" defaultValue={code ?? ""} className="rounded-md border border-graphite-700 bg-graphite-900 px-3 py-1.5 text-sm text-graphite-100">
          <option value="">All panel types</option>
          {codes.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <button className="rounded-md border border-graphite-700 px-3 py-1.5 text-sm text-graphite-300 hover:bg-graphite-800">Filter</button>
      </form>

      {(repairs ?? []).length > 0 && (
        <p className="mt-4 rounded-md border border-signal-red/30 bg-signal-red/10 px-4 py-2 text-sm text-signal-red">
          {repairs!.length} panel(s) waiting for repair — open a panel to mark it repaired or scrapped.
        </p>
      )}

      <div className="mt-4">
        <PanelTable
          panels={(panels ?? []).map((p) => ({ ...p, project_code: panelProject.get(p.id) ?? null }))}
          projects={projects ?? []}
          canDispatch={canDispatch}
          canReturn={canReturn}
        />
      </div>
    </div>
  );
}
