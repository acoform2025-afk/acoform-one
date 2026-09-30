"use client";

import { useActionState, useState, useTransition } from "react";
import { saveCatalogItem, setCatalogItemActive } from "./item-actions";

export type CatRow = { id: string; panel_code: string; panel_category: string; width_mm: number; height_mm: number; weight_kg: number; area_sqm: number | null; description: string | null; unit: string | null; is_active: boolean };

export const CATEGORY_LABELS: Record<string, string> = {
  wall_panel: "Wall panels", deck_panel: "Deck panels", internal_corner: "Internal corners", external_corner: "External corners",
  soffit_corner: "Soffit corners", kicker: "Kickers", extension_panel: "Extension panels", filler_panel: "Filler panels",
  beam_side_panel: "Beam side panels", beam_soffit_panel: "Beam soffit panels", deck_beam: "Mid beams (deck support)",
  prop_head: "Prop heads", accessory: "Props, pins, wedges & ties",
};
const input = "w-full rounded border border-graphite-700 bg-graphite-950 px-2 py-1 text-xs text-graphite-100 focus:border-signal-amber focus:outline-none";

function ItemForm({ row, onDone }: { row?: CatRow; onDone: () => void }) {
  const [state, action, pending] = useActionState(async (p: Awaited<ReturnType<typeof saveCatalogItem>>, f: FormData) => {
    const r = await saveCatalogItem(p, f); if (r?.ok) onDone(); return r;
  }, undefined);
  return (
    <form action={action} className="grid grid-cols-2 gap-2 rounded-md border border-graphite-700 bg-graphite-900 p-3 md:grid-cols-8">
      <input type="hidden" name="id" value={row?.id ?? ""} />
      <label className="col-span-1 text-[10px] uppercase text-graphite-500">Code<input name="panel_code" defaultValue={row?.panel_code} required className={input} /></label>
      <label className="col-span-2 text-[10px] uppercase text-graphite-500">Type
        <select name="panel_category" defaultValue={row?.panel_category ?? "wall_panel"} className={input}>
          {Object.entries(CATEGORY_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select></label>
      <label className="text-[10px] uppercase text-graphite-500">Width mm<input name="width_mm" type="number" step="any" defaultValue={row?.width_mm} required className={input} /></label>
      <label className="text-[10px] uppercase text-graphite-500">Height / length mm<input name="height_mm" type="number" step="any" defaultValue={row?.height_mm} required className={input} /></label>
      <label className="text-[10px] uppercase text-graphite-500">Weight kg<input name="weight_kg" type="number" step="any" defaultValue={row?.weight_kg} required className={input} /></label>
      <label className="col-span-2 text-[10px] uppercase text-graphite-500">Description<input name="description" defaultValue={row?.description ?? ""} className={input} /></label>
      <div className="col-span-2 flex items-center gap-2 md:col-span-8">
        <button disabled={pending} className="rounded bg-signal-amber px-3 py-1 text-xs font-semibold text-graphite-950 disabled:opacity-50">{pending ? "Saving…" : row ? "Save" : "Add item"}</button>
        <button type="button" onClick={onDone} className="text-xs text-graphite-400 hover:text-graphite-200">Cancel</button>
        {state?.error ? <span className="text-xs text-signal-red">{state.error}</span> : null}
      </div>
    </form>
  );
}

export function CatalogEditor({ rows, canEdit }: { rows: CatRow[]; canEdit: boolean }) {
  const [editing, setEditing] = useState<string | null>(null);
  const [showOff, setShowOff] = useState(false);
  const [, start] = useTransition();
  const shown = rows.filter((r) => showOff || r.is_active);
  const groups = Object.keys(CATEGORY_LABELS).map((c) => [c, shown.filter((r) => r.panel_category === c)] as const).filter(([, l]) => l.length);
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        {canEdit ? <button onClick={() => setEditing("new")} className="rounded-md border border-graphite-700 px-3 py-1.5 text-xs font-medium text-graphite-100 hover:bg-graphite-800">+ Add item</button> : null}
        <label className="flex items-center gap-1.5 text-xs text-graphite-400"><input type="checkbox" checked={showOff} onChange={(e) => setShowOff(e.target.checked)} /> Show items not in use</label>
        <span className="text-xs text-graphite-500">Market-default sizes and weights — change them to ACOFORM&apos;s own. The panel layout and BOM use only items in use.</span>
      </div>
      {editing === "new" ? <ItemForm onDone={() => setEditing(null)} /> : null}
      {groups.map(([cat, list]) => (
        <div key={cat}>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-graphite-500">{CATEGORY_LABELS[cat]}</h3>
          <div className="overflow-x-auto rounded-lg border border-graphite-800">
            <table className="w-full text-left text-sm">
              <thead className="bg-graphite-900 text-xs uppercase tracking-wide text-graphite-500">
                <tr><th className="px-4 py-2 font-medium">Code</th><th className="px-4 py-2 font-medium">Description</th><th className="px-4 py-2 font-medium">W × H (mm)</th><th className="px-4 py-2 text-right font-medium">Area (m²)</th><th className="px-4 py-2 text-right font-medium">Weight (kg)</th><th className="px-4 py-2" /></tr>
              </thead>
              <tbody className="divide-y divide-graphite-800">
                {list.map((p) => editing === p.id ? (
                  <tr key={p.id}><td colSpan={6} className="p-2"><ItemForm row={p} onDone={() => setEditing(null)} /></td></tr>
                ) : (
                  <tr key={p.id} className={p.is_active ? "bg-graphite-950" : "bg-graphite-950 opacity-50"}>
                    <td className="px-4 py-2 font-mono text-xs text-aluminium-300">{p.panel_code}</td>
                    <td className="px-4 py-2 text-xs text-graphite-400">{p.description ?? ""}</td>
                    <td className="px-4 py-2 font-mono text-xs text-graphite-300">{Number(p.width_mm)} × {Number(p.height_mm)}</td>
                    <td className="px-4 py-2 text-right font-mono text-xs text-graphite-400">{["wall_panel", "deck_panel", "internal_corner", "external_corner", "soffit_corner", "kicker", "extension_panel", "filler_panel", "beam_side_panel", "beam_soffit_panel"].includes(p.panel_category) ? Number(p.area_sqm ?? 0).toFixed(4) : "—"}</td>
                    <td className="px-4 py-2 text-right font-mono text-xs text-graphite-200">{Number(p.weight_kg)}</td>
                    <td className="whitespace-nowrap px-4 py-2 text-right text-xs">
                      {canEdit ? <>
                        <button onClick={() => setEditing(p.id)} className="text-graphite-300 hover:text-signal-amber">Edit</button>
                        <button onClick={() => start(async () => { await setCatalogItemActive(p.id, !p.is_active); })} className="ml-3 text-graphite-500 hover:text-graphite-200">{p.is_active ? "Stop using" : "Use again"}</button>
                      </> : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </div>
  );
}
