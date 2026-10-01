import Link from "next/link";
import { notFound } from "next/navigation";
import { Download } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { runPanels, type PanelQuery } from "@/lib/floor-plans/run-panels";
import { fmtArea } from "@/lib/floor-plans/calc";
import { hasPermission } from "@/lib/auth/permissions";
import { CreateBom } from "./create-bom";

export const metadata = { title: "Panel layout & BOM" };
export const dynamic = "force-dynamic";

const GROUP: Record<string, string> = { wall: "Wall panels", "wall-top": "Wall top panels", column: "Column panels", filler: "Fillers / specials", end: "Wall ends", corner: "Corners", deck: "Deck panels", beam: "Beam panels", accessory: "Props & accessories" };
const n0 = (v: number) => v.toLocaleString("en-IN", { maximumFractionDigits: 0 });
const n2 = (v: number) => v.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default async function PanelsPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<PanelQuery> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const q = await searchParams;
  const supabase = await createClient();
  const r = await runPanels(supabase, id, q);
  if (!r) notFound();
  const back = <Link href={`/floor-plans/${id}`} className="text-xs text-graphite-500 hover:text-graphite-300">← {r.plan.name}</Link>;
  if (r.error) return <div className="fade-in">{back}<p className="mt-4 text-sm text-signal-amber">{r.error}</p></div>;
  const { result, opt, totals } = r;
  const s = result.summary;
  const qs = new URLSearchParams({ h: String(opt.stdHeight), kg: String(opt.kgPerM2), prop: String(opt.propSpacing) }).toString();
  const groups = [...new Set(result.bom.map((b) => b.group))];
  const canBom = await hasPermission("bom", "generate");
  const { data: designRows } = canBom
    ? await supabase.from("designs").select("id, design_code, projects ( project_code, customer_name )").order("created_at", { ascending: false }).limit(100)
    : { data: null };
  const designs = (designRows ?? []).map((d) => {
    const pr = Array.isArray(d.projects) ? d.projects[0] : d.projects;
    return { id: d.id, code: d.design_code, project: pr ? `${pr.project_code} ${pr.customer_name ?? ""}`.trim() : "" };
  });

  return (
    <div className="fade-in">
      {back}
      <div className="mt-2 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-graphite-50">Panel layout &amp; BOM</h1>
          <p className="mt-1 max-w-3xl text-sm text-graphite-400">
            Typical floor of <b>{r.plan.name}</b>{r.lead ? ` · ${r.lead.lead_code} ${r.lead.project_name ?? r.lead.customer_name}` : ""}. First automatic layout on standard aluminium-formwork rules — review with the design team before production.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <a href={`/floor-plans/${id}/panels/drawing?${qs}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-md border border-graphite-700 px-3 py-2 text-xs font-medium text-graphite-200 hover:bg-graphite-800"><Download className="size-3.5" />Layout drawing PDF</a>
          <a href={`/floor-plans/${id}/panels/drawing?${qs}&format=dxf`} className="inline-flex items-center gap-1.5 rounded-md border border-graphite-700 px-3 py-2 text-xs font-medium text-graphite-200 hover:bg-graphite-800"><Download className="size-3.5" />Layout DXF</a>
          <a href={`/floor-plans/${id}/panels/export?${qs}&format=csv`} className="inline-flex items-center gap-1.5 rounded-md border border-graphite-700 px-3 py-2 text-xs font-medium text-graphite-200 hover:bg-graphite-800"><Download className="size-3.5" />Excel (CSV)</a>
          <a href={`/floor-plans/${id}/panels/export?${qs}&format=pdf`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-md bg-brand-orange px-3 py-2 text-xs font-medium text-white hover:opacity-90"><Download className="size-3.5" />BOM PDF</a>
        </div>
      </div>

      <form className="mt-4 flex flex-wrap items-end gap-3 rounded-lg border border-graphite-800 bg-graphite-900 p-3 text-xs">
        <label className="flex flex-col gap-1"><span className="uppercase tracking-wide text-graphite-500">Standard wall panel height (mm)</span><input name="h" type="number" defaultValue={opt.stdHeight} className="w-32 rounded border border-graphite-700 bg-graphite-950 px-2 py-1 text-sm text-graphite-100" /></label>
        <label className="flex flex-col gap-1"><span className="uppercase tracking-wide text-graphite-500">Custom panels kg/m²</span><input name="kg" type="number" step="0.1" defaultValue={opt.kgPerM2} className="w-28 rounded border border-graphite-700 bg-graphite-950 px-2 py-1 text-sm text-graphite-100" /></label>
        <label className="flex flex-col gap-1"><span className="uppercase tracking-wide text-graphite-500">Prop spacing (m)</span><input name="prop" type="number" step="0.05" defaultValue={opt.propSpacing} className="w-24 rounded border border-graphite-700 bg-graphite-950 px-2 py-1 text-sm text-graphite-100" /></label>
        <button className="rounded-md border border-graphite-700 px-3 py-1.5 font-medium text-graphite-100 hover:bg-graphite-800">Re-run layout</button>
      </form>

      <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-6">
        {[
          ["Panel area", `${n2(s.panelArea)} m²`],
          ["Panel weight", `${n0(s.weight)} kg${s.accessoryWeight ? ` + ${n0(s.accessoryWeight)} kg accessories` : ""}`],
          ["Average", `${s.kgPerM2} kg/m²`],
          ["Standard panels", `${s.standardPct}% of area`],
          ["Special panels (this project)", `${s.specials.types} types · ${s.specials.pcs} pcs · ${n2(s.specials.area)} m²`],
          ["Formwork contact area", fmtArea(totals.contact_area)],
        ].map(([k, v]) => (
          <div key={k} className="rounded-lg border border-graphite-800 bg-graphite-900 p-3">
            <p className="text-[11px] uppercase tracking-wide text-graphite-500">{k}</p>
            <p className="mt-1 font-mono text-lg font-semibold text-graphite-50">{v}</p>
          </div>
        ))}
      </div>
      {canBom ? <CreateBom planId={id} designs={designs} query={{ h: String(opt.stdHeight), kg: String(opt.kgPerM2), prop: String(opt.propSpacing) }} /> : null}
      {s.warnings.length ? (
        <ul className="mt-3 space-y-1 rounded-md border border-signal-amber/30 bg-signal-amber/10 px-3 py-2 text-xs text-signal-amber">
          {s.warnings.map((w) => <li key={w}>• {w}</li>)}
        </ul>
      ) : null}

      <div className="mt-5 overflow-x-auto rounded-lg border border-graphite-800">
        <table className="w-full min-w-[760px] text-left text-sm">
          <thead className="bg-graphite-900 text-xs uppercase tracking-wide text-graphite-500">
            <tr><th className="px-4 py-2.5">Code</th><th className="px-4 py-2.5">Description</th><th className="px-4 py-2.5 text-right">Size (mm)</th><th className="px-4 py-2.5 text-right">Qty</th><th className="px-4 py-2.5 text-right">Area m²</th><th className="px-4 py-2.5 text-right">Weight kg</th></tr>
          </thead>
          {groups.map((g) => {
            const rows = result.bom.filter((b) => b.group === g);
            return (
              <tbody key={g} className="divide-y divide-graphite-800">
                <tr className="bg-graphite-900/60"><td colSpan={3} className="px-4 py-1.5 text-xs font-semibold text-graphite-300">{GROUP[g] ?? g}</td>
                  <td className="px-4 py-1.5 text-right font-mono text-xs text-graphite-400">{n0(rows.reduce((a, b) => a + b.qty, 0))}</td>
                  <td className="px-4 py-1.5 text-right font-mono text-xs text-graphite-400">{n2(rows.reduce((a, b) => a + b.area, 0))}</td>
                  <td className="px-4 py-1.5 text-right font-mono text-xs text-graphite-400">{n0(rows.reduce((a, b) => a + b.weight, 0))}</td></tr>
                {rows.map((b) => (
                  <tr key={b.code} className="bg-graphite-950">
                    <td className="px-4 py-2 font-mono text-xs text-graphite-200">{b.code}{b.custom ? <span className="ml-1.5 rounded bg-signal-amber/15 px-1 text-[10px] text-signal-amber">custom</span> : null}</td>
                    <td className="px-4 py-2 text-xs text-graphite-400">{b.description}</td>
                    <td className="px-4 py-2 text-right font-mono text-xs text-graphite-400">{b.w ? `${b.w} × ${b.h}` : "—"}</td>
                    <td className="px-4 py-2 text-right font-mono text-xs text-graphite-100">{n0(b.qty)}</td>
                    <td className="px-4 py-2 text-right font-mono text-xs text-graphite-300">{b.area ? n2(b.area) : "—"}</td>
                    <td className="px-4 py-2 text-right font-mono text-xs text-graphite-300">{b.weight ? n0(b.weight) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            );
          })}
        </table>
      </div>

      {result.elements.length ? (
        <section className="mt-5">
          <h2 className="text-sm font-semibold text-graphite-100">Columns, beams &amp; deck — element by element</h2>
          <p className="mt-0.5 text-xs text-graphite-500">How each column, beam and slab is made up. Sizes in mm; panel sequences read across each face / along each beam. F = filler (custom width).</p>
          <div className="mt-2 overflow-x-auto rounded-lg border border-graphite-800">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="bg-graphite-900 text-xs uppercase tracking-wide text-graphite-500">
                <tr><th className="px-4 py-2">Element</th><th className="px-4 py-2">Code</th><th className="px-4 py-2">Size</th><th className="px-4 py-2 text-right">Qty</th><th className="px-4 py-2 text-right">Area m²</th><th className="px-4 py-2">Panels</th></tr>
              </thead>
              <tbody className="divide-y divide-graphite-800">
                {(["column", "beam", "deck"] as const).flatMap((k) => result.elements.filter((e) => e.kind === k)).map((e, i) => (
                  <tr key={i} className="bg-graphite-950">
                    <td className="px-4 py-2 text-xs capitalize text-graphite-300">{e.kind === "deck" ? "Deck (slab)" : e.kind}</td>
                    <td className="px-4 py-2 font-mono text-xs text-graphite-200">{e.code}</td>
                    <td className="px-4 py-2 font-mono text-xs text-graphite-300">{e.size}</td>
                    <td className="px-4 py-2 text-right font-mono text-xs text-graphite-100">{e.qty}</td>
                    <td className="px-4 py-2 text-right font-mono text-xs text-graphite-300">{n2(e.area)}</td>
                    <td className="px-4 py-2 text-xs text-graphite-400">{e.detail}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      <details className="mt-5 rounded-lg border border-graphite-800 bg-graphite-900 p-3">
        <summary className="cursor-pointer text-sm font-medium text-graphite-200">Wall face layouts ({result.faces.length} faces · {n2(s.faceLength)} m)</summary>
        <div className="mt-2 max-h-96 overflow-y-auto font-mono text-[11px] text-graphite-400">
          {result.faces.slice(0, 600).map((f) => (
            <div key={f.code} className="border-b border-graphite-800 py-1"><span className="text-graphite-200">{f.code}</span> · {f.length} mm → {f.panels.join(" + ") || "—"}{f.filler ? ` + filler ${f.filler}` : ""}{f.top ? ` · top ${f.top}` : ""}</div>
          ))}
        </div>
      </details>
    </div>
  );
}
