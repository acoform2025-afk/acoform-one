import { createClient } from "@/lib/supabase/server";
import { EXTRA_LINE_TYPES, LINE_TYPE_LABELS, summariseLines, type ExtraLineType } from "@/lib/quotations/line-types";
import { EditableNumberCell } from "./editable-number-cell";
import { ExtraLineForm } from "./extra-line-form";
import { RemoveLineButton } from "./remove-line-button";

function inr(n: number | null | undefined): string {
  if (n == null) return "—";
  return `₹ ${Number(n).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

type Props = {
  quotationId: string;
  editable: boolean; // status is draft / pending_approval AND user can create
  totalAmount: number | null;
  totalWithGst: number | null;
  gstPercentage: number | null;
};

/**
 * Accessories, transport and design/supervision lines for a detailed quotation,
 * plus the full summary (panels + extras -> subtotal -> GST -> total).
 * Server component: fetches its own data.
 */
export async function ExtraLinesSection({ quotationId, editable, totalAmount, totalWithGst, gstPercentage }: Props) {
  const supabase = await createClient();
  const { data: allLines } = await supabase
    .from("quotation_lines")
    .select("id, line_type, description, unit, quantity, unit_rate, line_total, notes, sort_order")
    .eq("quotation_id", quotationId)
    .order("sort_order")
    .order("created_at");

  const lines = allLines ?? [];
  const extras = lines.filter((l) => l.line_type !== "panel");
  const summary = summariseLines(lines);
  const gstAmount = (totalWithGst ?? 0) - (totalAmount ?? 0);
  const colCount = editable ? 6 : 5;

  return (
    <>
      <div className="mt-6 overflow-hidden rounded-lg border border-graphite-800">
        <div className="border-b border-graphite-800 bg-graphite-900 px-4 py-3">
          <h2 className="text-sm font-medium text-graphite-200">Accessories, transport &amp; design</h2>
        </div>
        <table className="w-full text-left text-sm">
          <thead className="bg-graphite-900/50 text-xs uppercase tracking-wide text-graphite-500">
            <tr>
              <th className="px-4 py-2.5 font-medium">Description</th>
              <th className="px-4 py-2.5 font-medium">Unit</th>
              <th className="px-4 py-2.5 font-medium text-right">Qty</th>
              <th className="px-4 py-2.5 font-medium text-right">Rate (₹)</th>
              <th className="px-4 py-2.5 font-medium text-right">Line total (₹)</th>
              {editable && <th className="px-4 py-2.5 font-medium"></th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-graphite-800">
            {extras.length === 0 && (
              <tr>
                <td colSpan={colCount} className="px-4 py-6 text-center text-sm text-graphite-600">
                  No accessories, transport or design charges added.
                </td>
              </tr>
            )}
            {EXTRA_LINE_TYPES.map((type: ExtraLineType) => {
              const group = extras.filter((l) => l.line_type === type);
              if (group.length === 0) return null;
              return [
                <tr key={`${type}-head`} className="bg-graphite-900/40">
                  <td colSpan={colCount} className="px-4 py-2 text-xs font-medium uppercase tracking-wide text-signal-amber">
                    {LINE_TYPE_LABELS[type]}
                  </td>
                </tr>,
                ...group.map((line) => (
                  <tr key={line.id} className="bg-graphite-950">
                    <td className="px-4 py-3 text-xs text-graphite-200">
                      {line.description}
                      {line.notes && <span className="block text-[11px] text-graphite-500">{line.notes}</span>}
                    </td>
                    <td className="px-4 py-3 text-xs text-graphite-400">{line.unit}</td>
                    <td className="px-4 py-3 text-right font-mono text-xs text-graphite-200">
                      <EditableNumberCell lineId={line.id} quotationId={quotationId} field="quantity" value={line.quantity} editable={editable} />
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-xs text-graphite-400">
                      <EditableNumberCell lineId={line.id} quotationId={quotationId} field="rate" value={line.unit_rate ?? 0} editable={editable} />
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-xs text-graphite-100">
                      {Number(line.line_total).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                    {editable && (
                      <td className="px-4 py-3 text-right"><RemoveLineButton lineId={line.id} quotationId={quotationId} /></td>
                    )}
                  </tr>
                )),
                <tr key={`${type}-sub`} className="bg-graphite-950">
                  <td colSpan={4} className="px-4 py-2 text-right text-[11px] text-graphite-500">{LINE_TYPE_LABELS[type]} subtotal</td>
                  <td className="px-4 py-2 text-right font-mono text-xs text-graphite-300">{inr(summary.byType[type])}</td>
                  {editable && <td />}
                </tr>,
              ];
            })}
          </tbody>
        </table>
      </div>

      {editable && (
        <div className="mt-4 rounded-lg border border-graphite-800 bg-graphite-900 p-4">
          <ExtraLineForm quotationId={quotationId} />
        </div>
      )}

      {/* Full quotation summary */}
      <div className="mt-6 rounded-lg border border-graphite-800 bg-graphite-900 p-5">
        <h2 className="mb-3 text-sm font-medium text-graphite-200">Quotation summary</h2>
        <table className="w-full text-sm">
          <tbody>
            <tr>
              <td className="py-1.5 text-graphite-400">{LINE_TYPE_LABELS.panel}</td>
              <td className="py-1.5 text-right font-mono text-graphite-300">{inr(summary.byType.panel)}</td>
            </tr>
            {EXTRA_LINE_TYPES.filter((t) => summary.byType[t] > 0).map((t) => (
              <tr key={t}>
                <td className="py-1.5 text-graphite-400">{LINE_TYPE_LABELS[t]}</td>
                <td className="py-1.5 text-right font-mono text-graphite-300">{inr(summary.byType[t])}</td>
              </tr>
            ))}
            <tr className="border-t border-graphite-800">
              <td className="pt-2.5 text-graphite-300">Subtotal</td>
              <td className="pt-2.5 text-right font-mono text-graphite-200">{inr(totalAmount)}</td>
            </tr>
            <tr>
              <td className="py-1.5 text-xs text-graphite-500">GST @ {Number(gstPercentage ?? 18).toFixed(0)}%</td>
              <td className="py-1.5 text-right font-mono text-xs text-graphite-400">{inr(gstAmount)}</td>
            </tr>
            <tr className="border-t border-graphite-700">
              <td className="pt-2.5 font-medium text-graphite-100">Total Amount</td>
              <td className="pt-2.5 text-right font-mono text-base font-semibold text-graphite-50">{inr(totalWithGst)}</td>
            </tr>
          </tbody>
        </table>
        {Math.abs(summary.subtotal - Number(totalAmount ?? 0)) > 0.01 && (
          <p className="mt-3 text-xs text-signal-red">
            Line totals ({inr(summary.subtotal)}) don&apos;t match the stored subtotal. Refresh the page; if it persists, report it.
          </p>
        )}
      </div>
    </>
  );
}
