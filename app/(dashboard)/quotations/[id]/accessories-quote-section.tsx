import { createClient } from "@/lib/supabase/server";
import { EditableNumberCell } from "./editable-number-cell";
import { RemoveLineButton } from "./remove-line-button";
import { AccessoryAddPanel, AccessoryInfoForm } from "./accessories-quote-panels";

const inr = (n: number | null | undefined) => (n == null ? "—" : `₹ ${Number(n).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);

/** The items of an accessories-only quotation, priced per item, with the delivery place and the totals. */
export async function AccessoriesQuoteSection({ q, editable }: { q: { id: string; delivery_place: string | null; application: string | null; total_amount: number | null; total_with_gst: number | null; gst_percentage: number | null }; editable: boolean }) {
  const supabase = await createClient();
  const [{ data: lines }, { data: known }] = await Promise.all([
    supabase.from("quotation_lines").select("id, line_type, description, unit, quantity, unit_rate, line_total, notes").eq("quotation_id", q.id).order("line_type").order("sort_order").order("created_at"),
    editable ? supabase.from("accessory_rates").select("item, spec, unit, rate").order("times_quoted", { ascending: false }).limit(500) : Promise.resolve({ data: [] as { item: string; spec: string; unit: string; rate: number }[] }),
  ]);
  const rows = lines ?? [];
  const unpriced = rows.filter((l) => !(Number(l.unit_rate) > 0)).length;
  const gst = (q.total_with_gst ?? 0) - (q.total_amount ?? 0);
  return (
    <>
      <AccessoryInfoForm quotationId={q.id} delivery={q.delivery_place ?? ""} application={q.application ?? ""} editable={editable} />
      <div className="mt-6 overflow-hidden rounded-lg border border-graphite-800">
        <div className="flex items-center justify-between border-b border-graphite-800 bg-graphite-900 px-4 py-3">
          <h2 className="text-sm font-medium text-graphite-200">Items</h2>
          {unpriced ? <span className="text-xs text-signal-amber">{unpriced} item{unpriced > 1 ? "s" : ""} without a rate — click a rate to enter it</span> : null}
        </div>
        <table className="w-full text-left text-sm">
          <thead className="bg-graphite-900/50 text-xs uppercase tracking-wide text-graphite-500">
            <tr>
              <th className="px-4 py-2.5 font-medium">Sr</th><th className="px-4 py-2.5 font-medium">Item</th><th className="px-4 py-2.5 font-medium">Size / spec.</th>
              <th className="px-4 py-2.5 text-right font-medium">Qty</th><th className="px-4 py-2.5 font-medium">Unit</th><th className="px-4 py-2.5 text-right font-medium">Rate (₹)</th><th className="px-4 py-2.5 text-right font-medium">Amount (₹)</th>
              {editable && <th />}
            </tr>
          </thead>
          <tbody className="divide-y divide-graphite-800">
            {rows.length === 0 && <tr><td colSpan={editable ? 8 : 7} className="px-4 py-6 text-center text-sm text-graphite-600">No items yet.</td></tr>}
            {rows.map((l, i) => (
              <tr key={l.id} className="bg-graphite-950">
                <td className="px-4 py-3 text-xs text-graphite-500">{i + 1}</td>
                <td className="px-4 py-3 text-xs text-graphite-200">{l.description}{l.line_type === "transport" ? <span className="ml-1 text-[10px] text-graphite-500">(freight)</span> : null}</td>
                <td className="px-4 py-3 text-xs text-graphite-400">{l.notes ?? ""}</td>
                <td className="px-4 py-3 text-right font-mono text-xs text-graphite-200"><EditableNumberCell lineId={l.id} quotationId={q.id} field="quantity" value={l.quantity} editable={editable} /></td>
                <td className="px-4 py-3 text-xs text-graphite-400">{l.unit}</td>
                <td className={`px-4 py-3 text-right font-mono text-xs ${Number(l.unit_rate) > 0 ? "text-graphite-300" : "text-signal-amber"}`}><EditableNumberCell lineId={l.id} quotationId={q.id} field="rate" value={l.unit_rate ?? 0} editable={editable} /></td>
                <td className="px-4 py-3 text-right font-mono text-xs text-graphite-100">{Number(l.line_total ?? 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                {editable && <td className="px-4 py-3 text-right"><RemoveLineButton lineId={l.id} quotationId={q.id} /></td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {editable && <AccessoryAddPanel quotationId={q.id} known={(known ?? []).map((k) => ({ ...k, rate: Number(k.rate) }))} />}
      <div className="mt-6 rounded-lg border border-graphite-800 bg-graphite-900 p-5">
        <table className="w-full text-sm"><tbody>
          <tr><td className="py-1.5 text-graphite-300">Subtotal</td><td className="py-1.5 text-right font-mono text-graphite-200">{inr(q.total_amount)}</td></tr>
          <tr><td className="py-1.5 text-xs text-graphite-500">GST @ {Number(q.gst_percentage ?? 18).toFixed(0)}%</td><td className="py-1.5 text-right font-mono text-xs text-graphite-400">{inr(gst)}</td></tr>
          <tr className="border-t border-graphite-700"><td className="pt-2.5 font-medium text-graphite-100">Total Amount</td><td className="pt-2.5 text-right font-mono text-base font-semibold text-graphite-50">{inr(q.total_with_gst)}</td></tr>
        </tbody></table>
      </div>
    </>
  );
}
