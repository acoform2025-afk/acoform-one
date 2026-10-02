import { applySiteLearning } from "./site-learning-actions";
import { learn, type SiteReportRow } from "@/lib/floor-plans/site-learn";
import { PRESETS, type LayoutRules } from "@/lib/design-engine/layout-rules";

/** "What the site taught us": all site reports of the current formwork system added up, with one-click apply. */
export function SiteLearning({ reports, rules, canEdit }: { reports: SiteReportRow[]; rules: LayoutRules; canEdit: boolean }) {
  const L = learn(reports);
  const btn = "rounded-md bg-brand-orange px-3 py-1.5 text-xs font-medium text-white hover:opacity-90 disabled:opacity-50";
  const spares = Object.entries(L.suggestSpare);
  const now = Object.entries(rules.sparePct ?? {});
  return (
    <section id="site-learning" className="rounded-lg border border-graphite-800 bg-graphite-900 p-5">
      <h2 className="text-sm font-medium text-graphite-200">Learned from the site</h2>
      <p className="mt-1 text-xs text-graphite-500">All site reports for the {PRESETS[rules.system].label} system added up. Add reports from a floor plan&apos;s Panel layout page → Site reports.</p>
      {!L.reports ? <p className="mt-3 text-sm text-graphite-400">No site reports yet.</p> : (
        <>
          <div className="mt-3 grid gap-2 sm:grid-cols-3">
            <div className="rounded-md border border-graphite-800 px-3 py-2"><p className="text-[11px] uppercase text-graphite-500">Site reports</p><p className="text-sm font-semibold text-graphite-100">{L.reports}</p></div>
            <div className="rounded-md border border-graphite-800 px-3 py-2"><p className="text-[11px] uppercase text-graphite-500">Average floor cycle</p><p className="text-sm font-semibold text-graphite-100">{L.cycleDays ? `${L.cycleDays} days` : "—"}</p></div>
            <div className="rounded-md border border-graphite-800 px-3 py-2"><p className="text-[11px] uppercase text-graphite-500">Most frequent problem</p><p className="text-sm font-semibold text-graphite-100">{L.issues[0] ? `${L.issues[0].label} (${L.issues[0].count}×)` : "none"}</p></div>
          </div>
          <table className="mt-4 w-full text-sm">
            <thead className="text-left text-xs text-graphite-500"><tr><th className="py-1 font-medium">Panel family</th><th className="py-1 text-right font-medium">Designed</th><th className="py-1 text-right font-medium">Short on site</th><th className="py-1 text-right font-medium">Not used</th><th className="py-1 text-right font-medium">Spare needed</th></tr></thead>
            <tbody>{L.families.map((f) => (
              <tr key={f.key} className="border-t border-graphite-800"><td className="py-1.5 text-graphite-200">{f.label}</td><td className="py-1.5 text-right tabular-nums">{f.design.toLocaleString("en-IN")}</td><td className="py-1.5 text-right tabular-nums">{f.short}</td><td className="py-1.5 text-right tabular-nums">{f.extra}</td><td className={`py-1.5 text-right tabular-nums ${f.sparePct >= 1 ? "font-semibold text-signal-amber" : "text-graphite-400"}`}>{f.sparePct} %</td></tr>
            ))}</tbody>
          </table>
          <table className="mt-3 w-full text-sm">
            <thead className="text-left text-xs text-graphite-500"><tr><th className="py-1 font-medium">Small parts</th><th className="py-1 text-right font-medium">Designed</th><th className="py-1 text-right font-medium">Lost / broken</th><th className="py-1 text-right font-medium">Loss</th></tr></thead>
            <tbody>{L.acc.map((a) => (
              <tr key={a.key} className="border-t border-graphite-800"><td className="py-1.5 text-graphite-200">{a.label}</td><td className="py-1.5 text-right tabular-nums">{a.design.toLocaleString("en-IN")}</td><td className="py-1.5 text-right tabular-nums">{a.lost.toLocaleString("en-IN")}</td><td className="py-1.5 text-right tabular-nums">{a.lossPct} %</td></tr>
            ))}</tbody>
          </table>
          <div className="mt-4 space-y-2 rounded-md border border-graphite-800 p-3 text-sm">
            <form action={applySiteLearning} className="flex flex-wrap items-center justify-between gap-2">
              <input type="hidden" name="what" value="loss" />
              <span className="text-graphite-300">Loss on pins, wedges, ties: rules say <b>{rules.lossPct} %</b>, site says <b>{L.suggestLoss ?? "—"} %</b></span>
              <button className={btn} disabled={!canEdit || L.suggestLoss == null || L.suggestLoss === rules.lossPct}>Use the site figure</button>
            </form>
            <form action={applySiteLearning} className="flex flex-wrap items-center justify-between gap-2">
              <input type="hidden" name="what" value="spare" />
              <span className="text-graphite-300">Site spares: now <b>{now.length ? now.map(([k, v]) => `${k} ${v} %`).join(", ") : "none"}</b>, site says <b>{spares.length ? spares.map(([k, v]) => `${k} ${v} %`).join(", ") : "none needed"}</b></span>
              <button className={btn} disabled={!canEdit || !spares.length}>Add these spares to every BOM</button>
            </form>
            {now.length ? (
              <form action={applySiteLearning} className="flex justify-end"><input type="hidden" name="what" value="clear" /><button className="text-xs text-graphite-500 hover:text-signal-red" disabled={!canEdit}>Remove site spares</button></form>
            ) : null}
            {!canEdit ? <p className="text-xs text-graphite-500">Only design approvers can apply these.</p> : null}
          </div>
        </>
      )}
    </section>
  );
}
