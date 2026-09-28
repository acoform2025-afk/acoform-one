import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { hasPermission } from "@/lib/auth/permissions";
import { ActionButton } from "@/components/action-button";
import { date } from "@/lib/format";
import { confirmDelivery } from "../../inventory/actions";

export default async function DispatchPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: n } = await supabase.from("dispatch_notes").select("*, projects ( id, project_code, customer_name, site_address )").eq("id", id).single();
  if (!n) notFound();
  const p = Array.isArray(n.projects) ? n.projects[0] : n.projects;
  const [{ data: rows }, canConfirm] = await Promise.all([
    supabase.from("inventory_ledger").select("panels ( id, qr_code, panel_code, status )").eq("dispatch_note_id", id).eq("event_type", "dispatched"),
    Promise.all([hasPermission("dispatches", "create"), hasPermission("dispatches", "read")]).then(([a, b]) => a || b),
  ]);
  const panels = (rows ?? []).map((r) => (Array.isArray(r.panels) ? r.panels[0] : r.panels)).filter(Boolean) as { id: string; qr_code: string; panel_code: string; status: string }[];
  const byCode = panels.reduce<Record<string, number>>((m, x) => ({ ...m, [x.panel_code]: (m[x.panel_code] ?? 0) + 1 }), {});

  return (
    <div className="fade-in max-w-4xl">
      <p className="text-xs text-graphite-500"><Link href="/dispatches" className="hover:text-signal-amber">Delivery challans</Link></p>
      <div className="mt-1 flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-mono text-xl text-graphite-50">{n.dc_number}</h1>
        <div className="flex gap-2">
          <a href={`/dispatches/${id}/pdf`} target="_blank" rel="noopener" className="rounded-md bg-signal-amber px-4 py-2 text-sm font-semibold text-graphite-950 hover:opacity-90">Challan PDF</a>
          {canConfirm && !n.delivered_at && <ActionButton variant="success" label="Confirm delivered at site" action={confirmDelivery.bind(null, id)} />}
        </div>
      </div>
      <p className="mt-2 text-sm text-graphite-400">
        <Link href={`/projects/${p?.id}`} className="hover:text-signal-amber">{p?.project_code}</Link> · {p?.customer_name} · {date(n.dispatch_date)}
        {n.vehicle_no ? ` · ${n.vehicle_no}` : ""}{n.driver_name ? ` · ${n.driver_name}` : ""}
        {n.delivered_at ? <span className="text-signal-green"> · delivered {date(n.delivered_at)}</span> : <span className="text-blue-300"> · in transit</span>}
      </p>
      <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        {Object.entries(byCode).sort().map(([code, q]) => (
          <div key={code} className="rounded-lg border border-graphite-800 bg-graphite-900 p-3"><p className="font-mono text-xs text-graphite-400">{code}</p><p className="mt-1 font-mono text-lg text-graphite-50">{q}</p></div>
        ))}
      </div>
      <details className="mt-6 rounded-lg border border-graphite-800 bg-graphite-900 p-4">
        <summary className="cursor-pointer text-xs uppercase tracking-wide text-graphite-400">{panels.length} panels</summary>
        <ul className="mt-2 grid gap-1 text-xs md:grid-cols-3">
          {panels.map((x) => <li key={x.id} className="font-mono"><Link href={`/inventory/${x.id}`} className="text-aluminium-300 hover:underline">{x.qr_code}</Link> <span className="text-graphite-500">{x.panel_code} · {x.status.replace(/_/g, " ")}</span></li>)}
        </ul>
      </details>
    </div>
  );
}
