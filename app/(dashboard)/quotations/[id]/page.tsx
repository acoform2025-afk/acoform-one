import { createClient } from "@/lib/supabase/server";
import { hasPermission } from "@/lib/auth/permissions";
import { notFound } from "next/navigation";
import { AddLineForm } from "./add-line-form";
import { QuotationActions } from "./quotation-actions";
import { RemoveLineButton } from "./remove-line-button";
import { ExtraLinesSection } from "./extra-lines-section";
import { RevisionPanel } from "./revision-panel";
import { DocumentDetails } from "./document-details";

const STATUS_STYLES: Record<string, string> = {
  draft: "bg-graphite-800 text-graphite-300",
  pending_approval: "bg-signal-amber/15 text-signal-amber",
  approved: "bg-signal-green/15 text-signal-green",
  sent: "bg-blue-900/30 text-blue-300",
  accepted: "bg-signal-green/25 text-signal-green",
  rejected: "bg-signal-red/15 text-signal-red",
  expired: "bg-graphite-800 text-graphite-500",
  superseded: "bg-graphite-800 text-graphite-500 line-through",
};

const AREA_BASIS_LABELS: Record<string, string> = {
  floor_plate: "Floor plate area",
  vertical_face: "Vertical formwork face area",
};

function inr(n: number | null): string {
  if (n == null) return "—";
  return `₹ ${Number(n).toLocaleString("en-IN", { minimumFractionDigits: 2 })}`;
}

export default async function QuotationDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: quotation } = await supabase.from("quotations").select("*").eq("id", id).single();
  if (!quotation) notFound();

  const isQuick = quotation.quotation_type === "quick";

  const { data: lines } = !isQuick
    ? await supabase.from("quotation_lines")
        .select(`id, quantity, unit_weight_kg, rate_per_kg, line_total, notes, panel_master_id, panel_master ( panel_code, panel_category, width_mm, height_mm, area_sqm )`)
        .eq("quotation_id", id).eq("line_type", "panel").order("sort_order").order("created_at")
    : { data: null };

  const { data: panels } = !isQuick
    ? await supabase.from("panel_master").select("id, panel_code, panel_category, width_mm, height_mm, weight_kg").eq("is_active", true).order("panel_category").order("width_mm")
    : { data: null };

  const canCreate = await hasPermission("quotations", "create");
  const canApprove = await hasPermission("quotations", "approve");
  const canConvert = await hasPermission("projects", "create");

  const isEditable = ["draft", "pending_approval"].includes(quotation.status);
  const totalPanels = lines?.reduce((s, l) => s + l.quantity, 0) ?? 0;
  const gstAmount = (quotation.total_with_gst ?? 0) - (quotation.total_amount ?? 0);

  return (
    <div className="fade-in max-w-4xl">
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="font-[family-name:var(--font-display)] text-2xl font-semibold text-graphite-50">{quotation.quotation_code}</h1>
            <span className={`rounded-full px-2.5 py-1 text-xs capitalize ${STATUS_STYLES[quotation.status] ?? ""}`}>{quotation.status.replace("_", " ")}</span>
            {isQuick && <span className="rounded-full bg-purple-900/30 px-2.5 py-1 text-xs capitalize text-purple-300">Quick · {quotation.formwork_type}</span>}
          </div>
          <p className="mt-1 text-sm text-graphite-400">{quotation.customer_name}</p>
          <p className="mt-0.5 text-xs text-graphite-500">
            {[quotation.kind_attn, quotation.customer_phone, quotation.customer_email, quotation.project_name].filter(Boolean).join(" · ") || "Add contact person, phone and email under Customer & proposal details"}
          </p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <a href={`/quotations/${id}/pdf`} target="_blank" rel="noopener" className="rounded-md bg-signal-amber px-4 py-2 text-sm font-semibold text-graphite-950 hover:opacity-90">Download PDF</a>
          <p className="text-right text-xs text-graphite-500">Date <span className="font-mono text-graphite-300">{quotation.quotation_date}</span> · valid {quotation.validity_days} days</p>
        </div>
      </div>

      <DocumentDetails q={quotation} editable={isEditable && canCreate} />

      {isQuick && (
        <div className="mt-6 rounded-lg border border-graphite-800 bg-graphite-900 p-5">
          <p className="mb-3 text-xs uppercase tracking-wide text-graphite-500">Area basis: {AREA_BASIS_LABELS[quotation.area_basis ?? ""] ?? quotation.area_basis}</p>
          <table className="w-full text-left text-sm">
            <thead className="text-xs uppercase tracking-wide text-graphite-500">
              <tr>
                <th className="pb-2 font-medium">Description</th>
                <th className="pb-2 font-medium text-right">Qty (sqm)</th>
                <th className="pb-2 font-medium text-right">Rate</th>
                <th className="pb-2 font-medium text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-t border-graphite-800">
                <td className="py-2.5 text-graphite-200">Acoform Aluminium Formwork ({quotation.formwork_type})</td>
                <td className="py-2.5 text-right font-mono text-graphite-300">{Number(quotation.total_area_sqm).toFixed(2)}</td>
                <td className="py-2.5 text-right font-mono text-graphite-300">₹{Number(quotation.quick_rate_per_sqm).toFixed(2)}</td>
                <td className="py-2.5 text-right font-mono text-graphite-100">{inr(quotation.total_amount)}</td>
              </tr>
              {quotation.nalco_rate_per_kg && (
                <tr><td colSpan={3} className="pt-2 text-xs text-graphite-500">Nalco rate ref.: ₹{Number(quotation.nalco_rate_per_kg).toFixed(2)}/kg</td><td></td></tr>
              )}
              <tr>
                <td colSpan={3} className="pt-2 text-xs text-graphite-500">GST @ {Number(quotation.gst_percentage).toFixed(0)}%</td>
                <td className="pt-2 text-right font-mono text-xs text-graphite-400">{inr(gstAmount)}</td>
              </tr>
              <tr className="border-t border-graphite-700">
                <td colSpan={3} className="pt-2 font-medium text-graphite-100">Total Amount</td>
                <td className="pt-2 text-right font-mono font-semibold text-graphite-50">{inr(quotation.total_with_gst)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {!isQuick && (
        <>
          <div className="mt-6 grid grid-cols-4 gap-3">
            <div className="rounded-lg border border-graphite-800 bg-graphite-900 p-4"><p className="text-xs uppercase tracking-wide text-graphite-500">Panels</p><p className="mt-1.5 font-mono text-base text-graphite-100">{totalPanels}</p></div>
            <div className="rounded-lg border border-graphite-800 bg-graphite-900 p-4"><p className="text-xs uppercase tracking-wide text-graphite-500">Total area</p><p className="mt-1.5 font-mono text-base text-graphite-100">{Number(quotation.total_area_sqm ?? 0).toFixed(2)} m²</p></div>
            <div className="rounded-lg border border-graphite-800 bg-graphite-900 p-4"><p className="text-xs uppercase tracking-wide text-graphite-500">Subtotal</p><p className="mt-1.5 font-mono text-base text-graphite-100">{inr(quotation.total_amount)}</p></div>
            <div className="rounded-lg border border-graphite-800 bg-graphite-900 p-4"><p className="text-xs uppercase tracking-wide text-graphite-500">Total incl. GST</p><p className="mt-1.5 font-mono text-base text-graphite-100">{inr(quotation.total_with_gst)}</p></div>
          </div>

          <div className="mt-6 overflow-hidden rounded-lg border border-graphite-800">
            <div className="border-b border-graphite-800 bg-graphite-900 px-4 py-3"><h2 className="text-sm font-medium text-graphite-200">Panel line items</h2></div>
            <table className="w-full text-left text-sm">
              <thead className="bg-graphite-900/50 text-xs uppercase tracking-wide text-graphite-500">
                <tr>
                  <th className="px-4 py-2.5 font-medium">Panel</th>
                  <th className="px-4 py-2.5 font-medium">Size</th>
                  <th className="px-4 py-2.5 font-medium text-right">Qty</th>
                  <th className="px-4 py-2.5 font-medium text-right">Unit wt (kg)</th>
                  <th className="px-4 py-2.5 font-medium text-right">Rate (₹/kg)</th>
                  <th className="px-4 py-2.5 font-medium text-right">Line total (₹)</th>
                  {isEditable && canCreate && <th className="px-4 py-2.5 font-medium"></th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-graphite-800">
                {lines && lines.length > 0 ? (
                  lines.map((line) => {
                    const pm = Array.isArray(line.panel_master) ? line.panel_master[0] : line.panel_master;
                    return (
                      <tr key={line.id} className="bg-graphite-950">
                        <td className="px-4 py-3 font-mono text-xs text-aluminium-300">{pm?.panel_code ?? "—"}</td>
                        <td className="px-4 py-3 text-xs text-graphite-400">{pm ? `${pm.width_mm}×${pm.height_mm}mm` : "—"}</td>
                        <td className="px-4 py-3 text-right font-mono text-xs text-graphite-200">{line.quantity}</td>
                        <td className="px-4 py-3 text-right font-mono text-xs text-graphite-400">{Number(line.unit_weight_kg).toFixed(3)}</td>
                        <td className="px-4 py-3 text-right font-mono text-xs text-graphite-400">{Number(line.rate_per_kg).toFixed(2)}</td>
                        <td className="px-4 py-3 text-right font-mono text-xs text-graphite-100">{Number(line.line_total).toLocaleString("en-IN", { minimumFractionDigits: 2 })}</td>
                        {isEditable && canCreate && <td className="px-4 py-3 text-right"><RemoveLineButton lineId={line.id} quotationId={id} /></td>}
                      </tr>
                    );
                  })
                ) : (
                  <tr><td colSpan={isEditable && canCreate ? 7 : 6} className="px-4 py-6 text-center text-sm text-graphite-600">No panels added yet.</td></tr>
                )}
              </tbody>
            </table>
          </div>

          {isEditable && canCreate && panels && panels.length > 0 && (
            <div className="mt-4 rounded-lg border border-graphite-800 bg-graphite-900 p-4"><AddLineForm quotationId={id} panels={panels} /></div>
          )}

          <ExtraLinesSection
            quotationId={id}
            editable={isEditable && canCreate}
            totalAmount={quotation.total_amount}
            totalWithGst={quotation.total_with_gst}
            gstPercentage={quotation.gst_percentage}
          />
        </>
      )}

      <RevisionPanel
        quotationId={id}
        revisionOf={quotation.revision_of}
        status={quotation.status}
        isQuick={isQuick}
        currentArea={quotation.total_area_sqm}
        canCreate={canCreate}
      />

      <div className="mt-6"><QuotationActions quotationId={id} status={quotation.status} canApprove={canApprove} canConvert={canConvert} /></div>
    </div>
  );
}
