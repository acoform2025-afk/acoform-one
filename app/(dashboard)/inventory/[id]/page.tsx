import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { hasPermission } from "@/lib/auth/permissions";
import { ActionButton } from "@/components/action-button";
import { titleCase } from "@/lib/format";
import { closeRepair } from "../actions";

export default async function PanelPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: p } = await supabase.from("panels").select("*, work_orders ( work_order_code, production_orders ( id, order_code ) )").eq("id", id).single();
  if (!p) notFound();
  const wo = Array.isArray(p.work_orders) ? p.work_orders[0] : p.work_orders;
  const po = wo ? (Array.isArray(wo.production_orders) ? wo.production_orders[0] : wo.production_orders) : null;
  const [{ data: events }, canAdjust] = await Promise.all([
    supabase.from("inventory_ledger").select("id, event_type, from_location, to_location, notes, created_at, projects ( project_code ), dispatch_notes ( id, dc_number )").eq("panel_id", id).order("created_at", { ascending: false }),
    hasPermission("inventory", "adjust"),
  ]);

  return (
    <div className="fade-in max-w-3xl">
      <p className="text-xs text-graphite-500"><Link href="/inventory" className="hover:text-signal-amber">Inventory</Link></p>
      <h1 className="mt-1 font-mono text-2xl text-graphite-50">{p.qr_code}</h1>
      <p className="mt-1 text-sm text-graphite-400">{p.panel_code} · {titleCase(p.status)} · {p.current_location} · {p.cycle_count} reuse cycle(s)</p>
      {po && <p className="mt-1 text-xs text-graphite-500">Made under <Link href={`/production/${po.id}`} className="hover:text-signal-amber">{po.order_code} / {wo?.work_order_code}</Link></p>}

      {canAdjust && p.status === "under_repair" && (
        <div className="mt-4 flex gap-2">
          <ActionButton variant="success" label="Repaired → back to stock" action={closeRepair.bind(null, id, false)} />
          <ActionButton variant="danger" label="Scrap panel" action={closeRepair.bind(null, id, true)} confirm="Scrap this panel permanently?" />
        </div>
      )}

      <h2 className="mt-8 mb-2 text-sm font-medium text-graphite-200">History</h2>
      <ol className="space-y-2">
        {(events ?? []).map((e) => {
          const proj = Array.isArray(e.projects) ? e.projects[0] : e.projects;
          const dn = Array.isArray(e.dispatch_notes) ? e.dispatch_notes[0] : e.dispatch_notes;
          return (
            <li key={e.id} className="rounded-md border border-graphite-800 bg-graphite-900 px-4 py-2 text-xs">
              <span className="text-graphite-500">{new Date(e.created_at).toLocaleString("en-IN")}</span> ·{" "}
              <span className="font-medium text-graphite-100">{titleCase(e.event_type)}</span>
              {e.from_location || e.to_location ? <span className="text-graphite-400"> · {e.from_location ?? "—"} → {e.to_location ?? "—"}</span> : null}
              {proj ? <span className="text-graphite-400"> · {proj.project_code}</span> : null}
              {dn ? <> · <Link href={`/dispatches/${dn.id}`} className="text-aluminium-300 hover:underline">{dn.dc_number}</Link></> : null}
              {e.notes ? <span className="block text-graphite-500">{e.notes}</span> : null}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
