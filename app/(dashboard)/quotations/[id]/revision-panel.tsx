import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { ReviseButton } from "./revise-button";

const REVISABLE = ["approved", "sent", "rejected", "expired"];

function inr(n: number | null): string {
  if (n == null) return "—";
  return `₹ ${Number(n).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

type Props = {
  quotationId: string;
  revisionOf: string | null;
  status: string;
  isQuick: boolean;
  currentArea: number | null;
  canCreate: boolean;
};

/** Revision history (Original, R1, R2 ...) + "Create revision" for locked quotations. Server component. */
export async function RevisionPanel({ quotationId, revisionOf, status, isQuick, currentArea, canCreate }: Props) {
  const supabase = await createClient();
  const rootId = revisionOf ?? quotationId;

  const { data: family } = await supabase
    .from("quotations")
    .select("id, quotation_code, revision_no, status, total_with_gst, created_at")
    .or(`id.eq.${rootId},revision_of.eq.${rootId}`)
    .order("revision_no");

  const versions = family ?? [];
  const latest = versions[versions.length - 1];
  const showHistory = versions.length > 1;
  const canRevise = canCreate && REVISABLE.includes(status);

  if (!showHistory && !canRevise) return null;

  return (
    <div className="mt-6 flex flex-col gap-4">
      {status === "superseded" && latest && latest.id !== quotationId && (
        <p className="rounded-md border border-signal-amber/30 bg-signal-amber/10 px-4 py-3 text-sm text-signal-amber">
          This version has been superseded. Latest:{" "}
          <Link href={`/quotations/${latest.id}`} className="font-mono underline">{latest.quotation_code}</Link>
        </p>
      )}

      {showHistory && (
        <div className="overflow-hidden rounded-lg border border-graphite-800">
          <div className="border-b border-graphite-800 bg-graphite-900 px-4 py-3">
            <h2 className="text-sm font-medium text-graphite-200">Revision history</h2>
          </div>
          <table className="w-full text-left text-sm">
            <tbody className="divide-y divide-graphite-800">
              {versions.map((v) => (
                <tr key={v.id} className={v.id === quotationId ? "bg-graphite-900" : "bg-graphite-950"}>
                  <td className="px-4 py-2.5 text-xs text-graphite-500">{v.revision_no === 0 ? "Original" : `R${v.revision_no}`}</td>
                  <td className="px-4 py-2.5 font-mono text-xs">
                    {v.id === quotationId
                      ? <span className="text-graphite-100">{v.quotation_code} (this)</span>
                      : <Link href={`/quotations/${v.id}`} className="text-aluminium-300 hover:underline">{v.quotation_code}</Link>}
                  </td>
                  <td className="px-4 py-2.5 text-xs capitalize text-graphite-400">{v.status.replace("_", " ")}</td>
                  <td className="px-4 py-2.5 text-right font-mono text-xs text-graphite-300">{inr(v.total_with_gst)}</td>
                  <td className="px-4 py-2.5 text-right text-xs text-graphite-500">{new Date(v.created_at).toLocaleDateString("en-IN")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {canRevise && <div><ReviseButton quotationId={quotationId} isQuick={isQuick} currentArea={currentArea} /></div>}
    </div>
  );
}
