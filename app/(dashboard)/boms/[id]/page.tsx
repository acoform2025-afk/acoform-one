import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { hasPermission } from "@/lib/auth/permissions";
import { ActionButton } from "@/components/action-button";
import { num, titleCase } from "@/lib/format";
import { approveBom, discardBom } from "../actions";
import { ReleaseForm } from "./release-form";

export default async function BomPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: b } = await supabase.from("bom_headers").select("*, designs ( id, design_code, projects ( project_code ) )").eq("id", id).single();
  if (!b) notFound();
  const design = Array.isArray(b.designs) ? b.designs[0] : b.designs;
  const project = design ? (Array.isArray(design.projects) ? design.projects[0] : design.projects) : null;

  const [{ data: items }, { data: orders }, canApprove, canGen, canRelease] = await Promise.all([
    supabase.from("bom_items").select("*").eq("bom_header_id", id).order("panel_code"),
    supabase.from("production_orders").select("id, order_code, status").eq("bom_header_id", id),
    hasPermission("bom", "approve"), hasPermission("bom", "generate"), hasPermission("production_orders", "create"),
  ]);
  const activeOrder = orders?.find((o) => o.status !== "cancelled");

  return (
    <div className="fade-in max-w-4xl">
      <p className="text-xs text-graphite-500"><Link href={`/designs/${design?.id}`} className="hover:text-signal-amber">{design?.design_code}</Link> · {project?.project_code}</p>
      <div className="mt-1 flex items-center gap-3">
        <h1 className="text-2xl font-semibold text-graphite-50">BOM v{b.version}</h1>
        <span className={`rounded-full px-2.5 py-1 text-xs ${b.status === "approved" ? "bg-signal-green/15 text-signal-green" : "bg-graphite-800 text-graphite-300"}`}>{titleCase(b.status)}</span>
      </div>
      <div className="mt-6 grid grid-cols-3 gap-3">
        {[["Panels", String(b.total_panel_count)], ["Weight", `${num(b.total_weight_kg, 1)} kg`], ["Line items", String(items?.length ?? 0)]].map(([k, v]) => (
          <div key={k} className="rounded-lg border border-graphite-800 bg-graphite-900 p-4"><p className="text-xs uppercase tracking-wide text-graphite-500">{k}</p><p className="mt-1.5 font-mono text-lg text-graphite-100">{v}</p></div>
        ))}
      </div>

      <div className="mt-6 overflow-hidden rounded-lg border border-graphite-800">
        <table className="w-full text-left text-sm">
          <thead className="bg-graphite-900 text-xs uppercase tracking-wide text-graphite-500">
            <tr><th className="px-4 py-2.5">Panel</th><th className="px-4 py-2.5 text-right">Qty</th><th className="px-4 py-2.5 text-right">Unit kg</th><th className="px-4 py-2.5 text-right">Total kg</th></tr>
          </thead>
          <tbody className="divide-y divide-graphite-800">
            {(items ?? []).map((i) => (
              <tr key={i.id} className="bg-graphite-950 text-xs">
                <td className="px-4 py-2.5 font-mono text-aluminium-300">{i.panel_code}{!i.panel_master_id && <span className="ml-2 text-signal-amber">custom · weight estimated</span>}</td>
                <td className="px-4 py-2.5 text-right font-mono">{i.quantity}</td>
                <td className="px-4 py-2.5 text-right font-mono">{num(i.unit_weight_kg, 3)}</td>
                <td className="px-4 py-2.5 text-right font-mono">{num(i.total_weight_kg, 2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-6 flex flex-wrap gap-3">
        {b.status === "draft" && canApprove && <ActionButton variant="success" label="Approve BOM" action={approveBom.bind(null, id)} />}
        {b.status === "draft" && canGen && <ActionButton variant="danger" label="Discard draft" action={discardBom.bind(null, id, design!.id)} confirm="Discard this draft BOM?" />}
      </div>

      {b.status === "approved" && (
        <div className="mt-6">
          {activeOrder ? (
            <p className="text-sm text-graphite-300">Released as <Link href={`/production/${activeOrder.id}`} className="font-mono text-aluminium-300 hover:underline">{activeOrder.order_code}</Link> ({titleCase(activeOrder.status)}).</p>
          ) : canRelease ? (
            <ReleaseForm bomId={id} suggestedCode={`PO-${project?.project_code ?? "X"}-${String(b.version).padStart(2, "0")}`} />
          ) : null}
        </div>
      )}
    </div>
  );
}
