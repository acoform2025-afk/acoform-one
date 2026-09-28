import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { hasPermission } from "@/lib/auth/permissions";
import { ActionButton } from "@/components/action-button";
import { date, titleCase } from "@/lib/format";
import { advanceWorkOrder, passQc } from "../actions";
import { FailQcForm } from "./fail-qc-form";

const NEXT_LABEL: Record<string, string> = { pending: "Start cutting", cutting: "Move to assembly", assembly: "Send to QC", on_hold: "Rework → assembly" };
const WO_STYLE: Record<string, string> = {
  pending: "text-graphite-400", cutting: "text-blue-300", assembly: "text-blue-300", qc: "text-signal-amber", completed: "text-signal-green", on_hold: "text-signal-red",
};

export default async function ProductionOrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: o } = await supabase.from("production_orders").select("*, projects ( id, project_code, customer_name ), bom_headers ( id, version )").eq("id", id).single();
  if (!o) notFound();
  const project = Array.isArray(o.projects) ? o.projects[0] : o.projects;
  const bom = Array.isArray(o.bom_headers) ? o.bom_headers[0] : o.bom_headers;

  const [{ data: wos }, { data: ncrs }, canUpdate, canQc] = await Promise.all([
    supabase.from("work_orders").select("id, work_order_code, quantity, status, bom_items ( panel_code, unit_weight_kg ), panels ( qr_code )").eq("production_order_id", id).order("work_order_code"),
    supabase.from("ncr").select("id, ncr_code, severity, status, description, work_order_id, created_at").in("work_order_id", (await supabase.from("work_orders").select("id").eq("production_order_id", id)).data?.map((w) => w.id) ?? []).order("created_at", { ascending: false }),
    hasPermission("production_orders", "update"), hasPermission("qc_inspections", "sign_off"),
  ]);
  const totalPanels = wos?.reduce((s, w) => s + w.quantity, 0) ?? 0;
  const produced = wos?.reduce((s, w) => s + (w.panels?.length ?? 0), 0) ?? 0;

  return (
    <div className="fade-in max-w-5xl">
      <p className="text-xs text-graphite-500">
        <Link href={`/projects/${project?.id}`} className="hover:text-signal-amber">{project?.project_code}</Link> · {project?.customer_name} ·{" "}
        <Link href={`/boms/${bom?.id}`} className="hover:text-signal-amber">BOM v{bom?.version}</Link>
      </p>
      <div className="mt-1 flex items-center gap-3">
        <h1 className="text-2xl font-semibold text-graphite-50">{o.order_code}</h1>
        <span className="rounded-full bg-graphite-800 px-2.5 py-1 text-xs text-graphite-300">{titleCase(o.status)}</span>
      </div>
      <p className="mt-2 text-sm text-graphite-400">{produced} of {totalPanels} panels produced · target {date(o.target_completion)}</p>
      <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-graphite-800">
        <div className="h-full bg-signal-amber" style={{ width: `${totalPanels ? (100 * produced) / totalPanels : 0}%` }} />
      </div>

      <div className="mt-6 space-y-3">
        {(wos ?? []).map((w) => {
          const item = Array.isArray(w.bom_items) ? w.bom_items[0] : w.bom_items;
          return (
            <div key={w.id} className="rounded-lg border border-graphite-800 bg-graphite-900 p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="font-mono text-sm text-aluminium-300">{w.work_order_code}</p>
                  <p className="text-xs text-graphite-400">{item?.panel_code} × {w.quantity}</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`text-xs font-medium ${WO_STYLE[w.status] ?? ""}`}>{titleCase(w.status)}</span>
                  {canUpdate && NEXT_LABEL[w.status] && <ActionButton small label={NEXT_LABEL[w.status]} action={advanceWorkOrder.bind(null, id, w.id, w.status)} />}
                  {canQc && w.status === "qc" && <ActionButton small variant="success" label="Pass QC" pendingLabel="Creating panels…" action={passQc.bind(null, id, w.id)} confirm={`Pass QC for ${w.quantity} × ${item?.panel_code}? This creates ${w.quantity} tracked panels with QR codes.`} />}
                  {canQc && w.status === "qc" && <FailQcForm orderId={id} woId={w.id} />}
                </div>
              </div>
              {(w.panels?.length ?? 0) > 0 && (
                <details className="mt-2 text-xs text-graphite-400">
                  <summary className="cursor-pointer">{w.panels!.length} panel QR codes</summary>
                  <p className="mt-1 font-mono leading-relaxed">{w.panels!.map((p) => p.qr_code).join("  ·  ")}</p>
                </details>
              )}
            </div>
          );
        })}
      </div>

      {(ncrs ?? []).length > 0 && (
        <section className="mt-8">
          <h2 className="mb-2 text-sm font-medium text-graphite-200">Non-conformance reports</h2>
          <ul className="space-y-2">
            {ncrs!.map((n) => (
              <li key={n.id} className="rounded-md border border-graphite-800 bg-graphite-900 px-4 py-2 text-xs">
                <span className="font-mono text-signal-red">{n.ncr_code}</span> · {titleCase(n.severity)} · {titleCase(n.status)} — <span className="text-graphite-300">{n.description}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
