import Link from "next/link";
import { notFound } from "next/navigation";
import { Download } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { runPanels, type PanelQuery } from "@/lib/floor-plans/run-panels";
import { fmtArea } from "@/lib/floor-plans/calc";
import { hasPermission } from "@/lib/auth/permissions";
import { CreateBom } from "./create-bom";
import { SystemSelect } from "./system-select";
import { ColumnSetsInput } from "./column-sets-input";
import { wallMarks } from "@/lib/design-engine/floor-panels";
import { PRESETS, describeLayoutRules } from "@/lib/design-engine/layout-rules";
import { minOf, maxOf } from "@/lib/util/minmax";

export const metadata = { title: "Panel layout & BOM" };
export const dynamic = "force-dynamic";

const GROUP: Record<string, string> = { wall: "Wall panels", "wall-top": "Wall top panels", column: "Column panels", filler: "Fillers / specials", end: "Wall ends", corner: "Corners", deck: "Deck panels", beam: "Beam panels", upstand: "Upstand / planter panels", stair: "Staircase panels", drop: "Drop (suspended) formwork — sunk slabs", accessory: "Props & accessories (elaborated)" };
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
  const canEditPlan = await hasPermission("quotations", "create");
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
          {r.layoutRules ? (
            <p className="mt-1 text-xs text-graphite-400" title={describeLayoutRules(r.layoutRules).join("\n")}>
              Formwork system: <b className="text-graphite-200">{PRESETS[r.layoutRules.system].label}</b>{r.t.system && r.t.system !== r.companySystem ? <span className="ml-1 rounded bg-signal-amber/15 px-1.5 py-0.5 text-signal-amber">this plan only</span> : null} · <Link href="/settings#layout-rules" className="text-aluminium-300 hover:underline">company layout rules</Link>
              <span className="ml-2"><SystemSelect planId={id} value={r.t.system && r.t.system !== r.companySystem ? r.t.system : ""} companyLabel={PRESETS[r.companySystem ?? "acoform"].label} options={(Object.keys(PRESETS) as (keyof typeof PRESETS)[]).filter((k) => k !== r.companySystem).map((k) => ({ key: k, label: PRESETS[k].label }))} canEdit={canEditPlan} /></span>
              {r.layoutRules.columnsSeparate ? <span className="ml-3"><ColumnSetsInput planId={id} value={r.layoutRules.columnSetPct} canEdit={canEditPlan} /></span> : null}
            </p>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-2">
          <a href={`/floor-plans/${id}/panels/drawing?${qs}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-md border border-graphite-700 px-3 py-2 text-xs font-medium text-graphite-200 hover:bg-graphite-800"><Download className="size-3.5" />Layout drawing PDF</a>
          <a href={`/floor-plans/${id}/panels/assembly?${qs}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-md bg-brand-orange px-3 py-2 text-xs font-medium text-white hover:opacity-90"><Download className="size-3.5" />Formwork assembly diagram PDF (every panel with its code)</a>
          <a href={`/floor-plans/${id}/panels/modulation?${qs}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-md bg-brand-orange px-3 py-2 text-xs font-medium text-white hover:opacity-90"><Download className="size-3.5" />Modulation drawings PDF (walls, columns, beams, stairs)</a>
          <Link href={`/floor-plans/${id}/panels/package?${qs}`} className="inline-flex items-center gap-1.5 rounded-md bg-graphite-100 px-3 py-2 text-xs font-semibold text-graphite-950 hover:opacity-90">Design package (all drawings &amp; lists)</Link>
          <Link href={`/floor-plans/${id}/site`} className="inline-flex items-center gap-1.5 rounded-md border border-signal-amber px-3 py-2 text-xs font-medium text-signal-amber hover:bg-graphite-800">Site reports (learn from the site)</Link>
          <Link href={`/floor-plans/${id}/panels/3d?${qs}`} className="inline-flex items-center gap-1.5 rounded-md bg-signal-green px-3 py-2 text-xs font-medium text-white hover:opacity-90">3D model</Link>
          <Link href={`/floor-plans/${id}/panels/levels?${qs}`} className="inline-flex items-center gap-1.5 rounded-md border border-graphite-700 px-3 py-2 text-xs text-graphite-200 hover:bg-graphite-800" title="Typical set + the extra pieces of the floors with their own drawing">Set per level</Link>
          <Link href={`/floor-plans/${id}/panels/edit?${qs}`} className="inline-flex items-center gap-1.5 rounded-md border border-signal-amber px-3 py-2 text-xs font-medium text-signal-amber hover:bg-graphite-800">Edit panels by hand</Link>
          <Link href={`/floor-plans/${id}/panels/check?${qs}`} className="inline-flex items-center gap-1.5 rounded-md bg-signal-red px-3 py-2 text-xs font-medium text-white hover:opacity-90">Design check (clashes)</Link>
          <Link href={`/floor-plans/${id}/panels/stock?${qs}`} className="inline-flex items-center gap-1.5 rounded-md border border-graphite-700 px-3 py-2 text-xs font-medium text-graphite-200 hover:border-brand-orange">Stock check (stock first)</Link>
          <a href={`/floor-plans/${id}/panels/packing?${qs}`} className="inline-flex items-center gap-1.5 rounded-md border border-graphite-700 px-3 py-2 text-xs font-medium text-graphite-200 hover:border-brand-orange"><Download className="size-3.5" />Packing list by zone (Excel)</a>
          <a href={`/floor-plans/${id}/panels/installation?${qs}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-md bg-brand-orange px-3 py-2 text-xs font-medium text-white hover:opacity-90"><Download className="size-3.5" />Installation drawings (numbered zones &amp; panels)</a>
          <form action={`/floor-plans/${id}/panels/installation`} method="get" target="_blank" className="inline-flex items-center gap-1.5 rounded-md border border-graphite-700 px-2 py-1.5 text-xs text-graphite-200">
            <input type="hidden" name="h" value={String(opt.stdHeight)} /><input type="hidden" name="kg" value={String(opt.kgPerM2)} /><input type="hidden" name="prop" value={String(opt.propSpacing)} />
            <span>Drawings by pour phase</span>
            <select name="phases" defaultValue="2" className="rounded border border-graphite-700 bg-graphite-950 px-1 py-1 text-graphite-100">{[2, 3, 4, 5, 6].map((n) => <option key={n} value={n}>{n} pours</option>)}</select>
            <button className="rounded bg-brand-orange px-2 py-1 font-medium text-white">Open</button>
          </form>
          <a href={`/floor-plans/${id}/panels/ifc?${qs}`} className="inline-flex items-center gap-1.5 rounded-md border border-graphite-700 px-3 py-2 text-xs font-medium text-graphite-200 hover:border-brand-orange"><Download className="size-3.5" />Export to Revit (IFC)</a>
          <a href={`/floor-plans/${id}/panels/installation?format=csv&${qs}`} className="inline-flex items-center gap-1.5 rounded-md border border-graphite-700 px-3 py-2 text-xs font-medium text-graphite-200 hover:border-brand-orange"><Download className="size-3.5" />Panel numbering list (Excel)</a>
          <a href={`/floor-plans/${id}/panels/fabrication?${qs}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-md bg-brand-orange px-3 py-2 text-xs font-medium text-white hover:opacity-90"><Download className="size-3.5" />Special panel production drawings</a>
          <a href={`/floor-plans/${id}/panels/fabrication?format=csv&${qs}`} className="inline-flex items-center gap-1.5 rounded-md border border-graphite-700 px-3 py-2 text-xs font-medium text-graphite-200 hover:border-brand-orange"><Download className="size-3.5" />Production order &amp; cutting list (Excel)</a>
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
      {(() => {
        // formwork statistics: contact area by element, concrete volume of the typical floor, panel cover
        const slabM = (Number(r.t.params.slabMm) || 150) / 1000, clear = totals.clear_height || 0;
        const thkM = (Number(r.t.params.wallThkMm) || 150) / 1000;
        const wallVol = (totals.wall_top_drawn > 0 ? totals.wall_top_drawn : totals.wall_length * thkM) * clear;
        const slabVol = totals.plan_area * slabM;
        const beamVol = (r.inp?.beams ?? []).reduce((a: number, b: { length: number; b: number; d: number }) => a + (b.length / 1000) * (b.b / 1000) * Math.max(0, (b.d - slabM * 1000) / 1000), 0);
        const colVol = (r.inp?.columns ?? []).reduce((a: number, c: { w: number; d: number; h: number; qty: number }) => a + (c.w / 1000) * (c.d / 1000) * (c.h / 1000) * c.qty, 0);
        const vol = wallVol + slabVol + beamVol + colVol;
        const rows: [string, string, string][] = [
          ["Walls (both faces)", `${n2(totals.wall_area)} m²`, `${n2(wallVol)} m³`],
          ["Columns", `${n2(totals.column_area)} m²`, `${n2(colVol)} m³`],
          ["Slab soffit", `${n2(totals.slab_soffit)} m²`, `${n2(slabVol)} m³`],
          ["Slab edges", `${n2(totals.slab_edge)} m²`, "—"],
          ["Beams (sides + soffit)", `${n2(totals.beam_area)} m²`, `${n2(beamVol)} m³`],
          ["Stairs / extras", `${n2(totals.extra_area)} m²`, "—"],
        ];
        return (
          <details className="mt-4 rounded-lg border border-graphite-800 bg-graphite-900 p-3" open>
            <summary className="cursor-pointer text-sm font-medium text-graphite-200">Formwork statistics — contact area and concrete volume of the typical floor</summary>
            <table className="mt-2 w-full max-w-xl text-xs">
              <thead><tr className="text-left text-graphite-500"><th className="py-1 font-normal">Element</th><th className="py-1 text-right font-normal">Contact area</th><th className="py-1 text-right font-normal">Concrete</th></tr></thead>
              <tbody className="font-mono text-graphite-300">
                {rows.map(([k, a, v]) => <tr key={k} className="border-t border-graphite-800"><td className="py-1 font-sans">{k}</td><td className="py-1 text-right">{a}</td><td className="py-1 text-right">{v}</td></tr>)}
                <tr className="border-t border-graphite-700 font-semibold text-graphite-100"><td className="py-1 font-sans">Total</td><td className="py-1 text-right">{n2(totals.contact_area)} m²</td><td className="py-1 text-right">{n2(vol)} m³</td></tr>
              </tbody>
            </table>
            <p className="mt-2 text-xs text-graphite-400">
              Panels laid out: {n2(s.panelArea)} m² = {totals.contact_area > 0 ? Math.round((s.panelArea / totals.contact_area) * 100) : 0}% of the contact area{vol > 0 ? ` · ${n2(totals.contact_area / vol)} m² of formwork per m³ of concrete` : ""}. Volumes are estimates from the plan (wall tops, slab area, beam and column sizes) — use them for a quick check against the structural drawings, not for ordering concrete.
            </p>
          </details>
        );
      })()}
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
                {rows.flatMap((b, i) => [
                  ...(g === "accessory" && b.sub && b.sub !== rows[i - 1]?.sub ? [<tr key={`h-${b.sub}`} className="bg-graphite-900/30"><td colSpan={6} className="px-4 pb-1 pt-2.5 text-[11px] font-semibold uppercase tracking-wide text-brand-orange">{b.sub}</td></tr>] : []),
                  <tr key={b.code} className="bg-graphite-950">
                    <td className="px-4 py-2 font-mono text-xs text-graphite-200">{b.code}{b.custom ? <span className="ml-1.5 rounded bg-signal-amber/15 px-1 text-[10px] text-signal-amber">custom</span> : null}</td>
                    <td className="px-4 py-2 text-xs text-graphite-400">{b.description}{b.basis ? <span className="block text-[11px] text-graphite-500">{b.basis}</span> : null}</td>
                    <td className="px-4 py-2 text-right font-mono text-xs text-graphite-400">{b.w ? `${b.w} × ${b.h}` : b.unit && b.unit !== "nos" ? b.unit : "—"}</td>
                    <td className="px-4 py-2 text-right font-mono text-xs text-graphite-100">{n0(b.qty)}</td>
                    <td className="px-4 py-2 text-right font-mono text-xs text-graphite-300">{b.area ? n2(b.area) : "—"}</td>
                    <td className="px-4 py-2 text-right font-mono text-xs text-graphite-300">{b.weight ? n0(b.weight) : "—"}</td>
                  </tr>,
                ])}
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

      {(() => {
        const marks = wallMarks(result.faces);
        return marks.length ? (
          <details className="mt-5 rounded-lg border border-graphite-800 bg-graphite-900 p-3" open>
            <summary className="cursor-pointer text-sm font-medium text-graphite-200">Wall marks — {marks.length} different walls to make ({result.faces.length} wall faces)</summary>
            <p className="mt-1 text-xs text-graphite-400">Walls with the same panels get the same mark (M01, M02 …). The mark is shown on each panel in the 3D view, e.g. F12 [M03].</p>
            <div className="mt-2 max-h-96 overflow-y-auto font-mono text-[11px] text-graphite-400">
              {marks.map((t) => (
                <div key={t.code} className="border-b border-graphite-800 py-1"><span className="text-graphite-200">{t.code}</span> × {t.count} · {t.face.length} mm → {t.face.panels.join(" + ") || "—"}{t.face.filler ? ` + filler ${t.face.filler}` : ""}{t.face.top ? ` · top ${t.face.top}` : ""} <span className="text-graphite-600">({t.faces.slice(0, 8).join(", ")}{t.faces.length > 8 ? ` +${t.faces.length - 8}` : ""})</span></div>
              ))}
            </div>
          </details>
        ) : null;
      })()}

      {(() => {
        // numbers for the other parts of the floor: columns CM1…, beams BM1…, slab zones (the M1, M2 … of the installation drawing)
        const cols = result.columns, beams = result.beams, zs = r.zones ?? [];
        if (!cols.length && !beams.length && !zs.length) return null;
        const bsum = new Map<string, { b: number; d: number; len: number; n: number }>();
        for (const b of beams) { const k = `${b.b}x${b.d}`; const e = bsum.get(k) ?? { b: b.b, d: b.d, len: 0, n: 0 }; e.len += b.length; e.n += b.pieces.length; bsum.set(k, e); }
        const bl = [...bsum.values()].sort((x, y) => y.len - x.len);
        return (
          <details className="mt-5 rounded-lg border border-graphite-800 bg-graphite-900 p-3" open>
            <summary className="cursor-pointer text-sm font-medium text-graphite-200">Component numbers — {cols.length} column type{cols.length === 1 ? "" : "s"} · {bl.length} beam size{bl.length === 1 ? "" : "s"} · {zs.length} slab zone{zs.length === 1 ? "" : "s"}</summary>
            <p className="mt-1 text-xs text-graphite-400">Columns are CM1, CM2 … (same size = same number), beams BM1, BM2 … (same width × depth), slab zones are the M1, M2 … of the installation drawing.</p>
            <div className="mt-2 max-h-96 overflow-y-auto font-mono text-[11px] text-graphite-400">
              {cols.map((c, i) => <div key={`c${i}`} className="border-b border-graphite-800 py-1"><span className="text-graphite-200">CM{i + 1}</span> · {c.round ? `round Ø${c.w}` : `${c.w} × ${c.d}`} mm · height {c.h} mm × {c.qty} nos</div>)}
              {bl.map((b, i) => <div key={`b${i}`} className="border-b border-graphite-800 py-1"><span className="text-graphite-200">BM{i + 1}</span> · {b.b ? `${b.b} × ${b.d}` : `one side, depth ${b.d}`} mm · {(b.len / 1000).toFixed(1)} m in {b.n} piece{b.n === 1 ? "" : "s"}</div>)}
              {[...zs].sort((x, y) => y.specialArea - x.specialArea).map((z) => <div key={z.code} className="border-b border-graphite-800 py-1"><span className="text-graphite-200">{z.code}</span> · slab zone {z.area.toFixed(1)} m² · {z.panels.length} deck panels · special {z.specialArea.toFixed(1)} m²{z.area > 0 && z.specialArea / z.area > 0.15 ? " ⚠ many specials" : ""}</div>)}
            </div>
            {zs.filter((z) => z.specialArea > 2).map((z) => {
              // what the specials of a big zone are: long strips, small odd pieces, or large blocks (size = bounding box in mm)
              const sp = z.specials.map((q) => { const xs = q.rings[0].map((p) => p[0]), ys = q.rings[0].map((p) => p[1]); const a = (maxOf(xs) - minOf(xs)) * 1000, b = (maxOf(ys) - minOf(ys)) * 1000; return { area: q.area, lo: Math.round(Math.min(a, b)), hi: Math.round(Math.max(a, b)), at: [(maxOf(xs) + minOf(xs)) / 2, (maxOf(ys) + minOf(ys)) / 2] as [number, number] }; });
              const strip = sp.filter((q) => q.lo <= 700 && q.hi >= 1500), small = sp.filter((q) => q.area < 0.3 && !(q.lo <= 700 && q.hi >= 1500)), rest = sp.filter((q) => !strip.includes(q) && !small.includes(q));
              const sum = (l: typeof sp) => l.reduce((t, q) => t + q.area, 0).toFixed(1);
              return (
                <div key={`sp${z.code}`} className="mt-3 rounded border border-graphite-800 p-2 text-[11px] text-graphite-400">
                  <div className="text-graphite-200">What the {z.specialArea.toFixed(1)} m² of specials in {z.code} are: long strips {strip.length} pcs / {sum(strip)} m² · small pieces {small.length} pcs / {sum(small)} m² · other blocks {rest.length} pcs / {sum(rest)} m²</div>
                  <div className="mt-1 font-mono">{[...sp].sort((x, y) => y.area - x.area).slice(0, 14).map((q, i) => <div key={i}>{q.area.toFixed(2)} m² · {q.lo} × {q.hi} mm · at x {q.at[0].toFixed(1)} m, y {q.at[1].toFixed(1)} m</div>)}</div>
                </div>
              );
            })}
          </details>
        );
      })()}

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
