import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { runPanels } from "@/lib/floor-plans/run-panels";
import { fingerprintDiff, readingFingerprint, type Approved } from "@/lib/floor-plans/reading-record";

export const metadata = { title: "Check approved readings" };
export const dynamic = "force-dynamic";
const MAX = 40;

/**
 * Every approved plan is read again and compared with the reading that was approved: the app's own regression test.
 * Open this page after every update of the app — a plan that reads differently is either a change to check or a
 * reading to approve afresh.
 */
export default async function CheckReadingsPage() {
  const supabase = await createClient();
  const { data: rows } = await supabase.from("floor_plans").select("id, name, takeoff, updated_at").not("takeoff->dxf->approved", "is", null).order("name").limit(MAX);
  const plans = (rows ?? []).filter((p) => (p.takeoff as { dxf?: { approved?: Approved | null } } | null)?.dxf?.approved);
  const out: { id: string; name: string; approved: Approved; status: "same" | "changed" | "error"; diff: string[]; ms: number }[] = [];
  for (const p of plans) {
    const approved = (p.takeoff as { dxf: { approved: Approved } }).dxf.approved;
    const t0 = Date.now();
    try {
      const r = await runPanels(supabase, p.id, {});
      if (!r || r.error || !r.inp) out.push({ id: p.id, name: p.name, approved, status: "error", diff: [r?.error ?? "could not be read"], ms: Date.now() - t0 });
      else { const diff = fingerprintDiff(approved.fp, readingFingerprint(r.inp, r.zones ?? [], r.result)); out.push({ id: p.id, name: p.name, approved, status: diff.length ? "changed" : "same", diff, ms: Date.now() - t0 }); }
    } catch (e) { out.push({ id: p.id, name: p.name, approved, status: "error", diff: [e instanceof Error ? e.message : String(e)], ms: Date.now() - t0 }); }
  }
  const n = { same: out.filter((o) => o.status === "same").length, changed: out.filter((o) => o.status === "changed").length, error: out.filter((o) => o.status === "error").length };
  const date = (s: string) => new Date(s).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
  return (
    <div className="fade-in">
      <Link href="/floor-plans" className="text-xs text-graphite-500 hover:text-graphite-300">← Floor plans</Link>
      <h1 className="mt-1 text-lg font-semibold text-graphite-50">Check approved readings</h1>
      <p className="mb-4 max-w-3xl text-xs text-graphite-400">
        Every plan whose reading was approved on its Reading review is read again here and compared with the approved reading. Open this page after each
        update of the app: a plan that now reads differently is a change to look at — and if the new reading is the right one, approve it on the plan&apos;s review page.
      </p>
      <div className="mb-4 flex flex-wrap items-center gap-2 text-xs">
        <span className="rounded-md bg-signal-green/15 px-2 py-1 text-signal-green">{n.same} same as approved</span>
        <span className="rounded-md bg-signal-red/15 px-2 py-1 text-signal-red">{n.changed} changed</span>
        {n.error ? <span className="rounded-md bg-signal-amber/15 px-2 py-1 text-signal-amber">{n.error} could not be read</span> : null}
        <span className="text-graphite-500">· {out.length} approved plan{out.length === 1 ? "" : "s"}{(rows?.length ?? 0) >= MAX ? ` (first ${MAX})` : ""}</span>
      </div>
      {out.length === 0 ? <p className="rounded-md border border-graphite-800 p-4 text-sm text-graphite-300">No approved reading yet. Open a plan → Reading review → &ldquo;This reading is correct — approve it&rdquo;. From then on the plan is checked here.</p> : null}
      <div className="overflow-x-auto rounded-lg border border-graphite-800">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead className="bg-graphite-900 text-xs uppercase tracking-wide text-graphite-500"><tr><th className="px-3 py-2">Plan</th><th className="px-3 py-2">Approved</th><th className="px-3 py-2">Now</th><th className="px-3 py-2">What differs</th><th className="px-3 py-2 text-right">Read in</th></tr></thead>
          <tbody>
            {out.map((o) => (
              <tr key={o.id} className="border-t border-graphite-800 align-top">
                <td className="px-3 py-2"><Link href={`/floor-plans/${o.id}/review`} className="text-graphite-100 hover:underline">{o.name}</Link><div className="text-[11px] text-graphite-500">{o.approved.fp.walls} walls · {o.approved.fp.faces} faces · {o.approved.fp.zones} zones · {o.approved.fp.stairs} stair{o.approved.fp.stairs === 1 ? "" : "s"} · {o.approved.fp.panels} pieces</div></td>
                <td className="px-3 py-2 text-xs text-graphite-400">{date(o.approved.at)}{o.approved.by ? <div>{o.approved.by}</div> : null}</td>
                <td className="px-3 py-2"><span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase ${o.status === "same" ? "bg-signal-green/15 text-signal-green" : o.status === "changed" ? "bg-signal-red/15 text-signal-red" : "bg-signal-amber/15 text-signal-amber"}`}>{o.status === "same" ? "Same" : o.status === "changed" ? "Changed" : "Error"}</span></td>
                <td className="px-3 py-2 text-xs text-graphite-300">{o.diff.length ? <ul className="list-disc pl-4">{o.diff.map((d, i) => <li key={i}>{d}</li>)}</ul> : "—"}</td>
                <td className="px-3 py-2 text-right text-xs text-graphite-500">{(o.ms / 1000).toFixed(1)} s</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
