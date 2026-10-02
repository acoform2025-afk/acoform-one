"use client";

import { useActionState, useState } from "react";
import { saveLayoutRules } from "./layout-rules-actions";
import { PRESETS, describeLayoutRules, type FormworkSystem, type LayoutRules } from "@/lib/design-engine/layout-rules";

const input = "rounded-md border border-graphite-700 bg-graphite-900 px-3 py-2 text-sm text-graphite-100 focus:border-signal-amber focus:outline-none disabled:opacity-60";
const lbl = "text-xs font-medium uppercase tracking-wide text-graphite-400";
const listTxt = (a: number[]) => a.join(", ");
const parseList = (s: string) => s.split(/[\s,;]+/).map(Number).filter((n) => Number.isFinite(n) && n > 0);

export function LayoutRulesForm({ r, canEdit }: { r: LayoutRules; canEdit: boolean }) {
  const [state, action, pending] = useActionState(saveLayoutRules, undefined);
  const [v, setV] = useState<LayoutRules>(r);
  const [walls, setWalls] = useState(listTxt(r.wallWidths));
  const [decks, setDecks] = useState(listTxt(r.deckWidths));
  const [lens, setLens] = useState(listTxt(r.deckLengths));
  const set = <K extends keyof LayoutRules>(k: K, val: LayoutRules[K]) => setV((o) => ({ ...o, [k]: val }));
  const pick = (s: FormworkSystem) => { const p = PRESETS[s].rules; setV(p); setWalls(listTxt(p.wallWidths)); setDecks(listTxt(p.deckWidths)); setLens(listTxt(p.deckLengths)); };
  const out: LayoutRules = { ...v, wallWidths: parseList(walls), deckWidths: parseList(decks), deckLengths: parseList(lens) };
  const n = (k: keyof LayoutRules, label: string, hint: string, step = 1) => (
    <label className="flex flex-col gap-1.5"><span className={lbl}>{label} <span className="normal-case text-graphite-600">{hint}</span></span>
      <input type="number" step={step} value={Number(v[k] as number)} disabled={!canEdit} onChange={(e) => set(k, Number(e.target.value) as never)} className={input} /></label>
  );
  const chk = (k: keyof LayoutRules, label: string, hint: string) => (
    <label className="flex items-start gap-2 text-sm text-graphite-200">
      <input type="checkbox" checked={Boolean(v[k])} disabled={!canEdit} onChange={(e) => set(k, e.target.checked as never)} className="mt-1 accent-signal-amber" />
      <span>{label}<span className="block text-xs text-graphite-500">{hint}</span></span>
    </label>
  );
  return (
    <form id="layout-rules" action={action} className="rounded-lg border border-graphite-800 bg-graphite-900 p-5">
      <input type="hidden" name="rules" value={JSON.stringify(out)} />
      <h2 className="text-sm font-medium text-graphite-200">Panel layout rules (formwork system)</h2>
      <p className="mt-1 text-xs text-graphite-500">How ACOFORM ONE lays out panels: the formwork system, which sizes come first, deck lengths, supports, ties and losses. Every panel layout, drawing and list follows these.</p>
      {state?.error && <p className="mt-3 rounded-md border border-signal-red/30 bg-signal-red/10 px-3 py-2 text-sm text-signal-red">{state.error}</p>}
      {state?.ok && <p className="mt-3 rounded-md border border-signal-green/30 bg-signal-green/10 px-3 py-2 text-sm text-signal-green">Saved. Panel layouts now follow these rules.</p>}

      <div className="mt-4 grid gap-2 md:grid-cols-3">
        {(Object.keys(PRESETS) as FormworkSystem[]).map((s) => (
          <button key={s} type="button" disabled={!canEdit} onClick={() => pick(s)}
            className={`rounded-lg border p-3 text-left ${v.system === s ? "border-signal-amber bg-signal-amber/10" : "border-graphite-700 hover:border-graphite-500"}`}>
            <p className="text-sm font-medium text-graphite-100">{PRESETS[s].label}</p>
            <p className="mt-1 text-[11px] leading-snug text-graphite-400">{PRESETS[s].note}</p>
          </button>
        ))}
      </div>
      <p className="mt-2 text-[11px] text-graphite-500">Choosing a system fills in its values below; change any of them to suit ACOFORM.</p>

      <h3 className="mt-5 text-xs font-semibold uppercase tracking-wide text-brand-orange">Walls</h3>
      <div className="mt-2 grid gap-4 md:grid-cols-4">
        <label className="flex flex-col gap-1.5 md:col-span-2"><span className={lbl}>Wall panel widths <span className="normal-case text-graphite-600">(mm, blank = panel catalogue)</span></span>
          <input value={walls} disabled={!canEdit} onChange={(e) => setWalls(e.target.value)} className={input} placeholder="600, 575, 550 …" /></label>
        {n("stdHeight", "Standard panel height", "(mm)")}
        {n("minFiller", "Smallest framed filler", "(mm)")}
        {n("bottomStrip", "Bottom strip", "(mm, full-height panels)")}
        {n("internalCorner", "Internal corner leg", "(mm)")}
        {n("externalCorner", "External corner leg", "(mm)", 0.5)}
        {n("kickerMm", "External kicker", "(mm, 0 = none)")}
        <label className="flex flex-col gap-1.5"><span className={lbl}>Wall ties</span>
          <select value={v.tie} disabled={!canEdit} onChange={(e) => set("tie", e.target.value as LayoutRules["tie"])} className={input}><option value="rod">Tie rods</option><option value="flat">Flat ties</option></select></label>
        {n("tieH", "Tie spacing along wall", "(mm)")}
        {n("tieV", "Tie spacing up wall", "(mm)")}
      </div>
      <div className="mt-3">{chk("fullHeight", "One full-height wall panel per face", "No top panel: each panel is made to the clear height (minus the bottom strip).")}</div>

      <h3 className="mt-5 text-xs font-semibold uppercase tracking-wide text-brand-orange">Deck (slab)</h3>
      <div className="mt-2 grid gap-4 md:grid-cols-4">
        <label className="flex flex-col gap-1.5 md:col-span-2"><span className={lbl}>Deck panel widths <span className="normal-case text-graphite-600">(mm, blank = catalogue)</span></span>
          <input value={decks} disabled={!canEdit} onChange={(e) => setDecks(e.target.value)} className={input} /></label>
        <label className="flex flex-col gap-1.5 md:col-span-2"><span className={lbl}>Deck panel lengths <span className="normal-case text-graphite-600">(mm, first = preferred)</span></span>
          <input value={lens} disabled={!canEdit} onChange={(e) => setLens(e.target.value)} className={input} /></label>
        {n("midBeam", "Mid beam width", "(mm)")}
        <label className="flex flex-col gap-1.5"><span className={lbl}>Prop head <span className="normal-case text-graphite-600">(mm × mm)</span></span>
          <span className="flex gap-1">
            <input type="number" value={v.propHead[0]} disabled={!canEdit} onChange={(e) => set("propHead", [Number(e.target.value), v.propHead[1]])} className={`${input} w-1/2`} />
            <input type="number" value={v.propHead[1]} disabled={!canEdit} onChange={(e) => set("propHead", [v.propHead[0], Number(e.target.value)])} className={`${input} w-1/2`} />
          </span></label>
        {n("propSpacing", "Max prop spacing", "(m)", 0.05)}
        {n("soffitCornerLen", "Soffit corner length", "(mm)")}
        {n("soffitCornerW", "Soffit corner width", "(mm, deck starts inside it)")}
        {n("supportSets", "Sets of props / support heads", "(floors kept up)")}
      </div>

      <h3 className="mt-5 text-xs font-semibold uppercase tracking-wide text-brand-orange">Beams, columns, accessories</h3>
      <div className="mt-2 grid gap-4 md:grid-cols-4">
        {n("beamLenStep", "Beam panel length step", "(mm)")}
        {n("columnFirstCast", "Column first pour height", "(mm)")}
        {n("lossPct", "Loss on small parts", "(%)")}
      </div>
      <div className="mt-3">{chk("columnsSeparate", "Columns cast first with their own formwork", "They are listed as a separate column set, panels up to the first pour height.")}</div>
      <div className="mt-2">{chk("coresWithColumns", "Lift cores and L-shaped shear walls (drawn on the column layer) go with the column set", "Off: they are formed with the walls, as in the Royce One BOM.")}</div>

      <ul className="mt-4 space-y-0.5 rounded-md border border-graphite-800 bg-graphite-950 px-3 py-2 text-[11px] text-graphite-400">
        {describeLayoutRules(out).map((l) => <li key={l}>• {l}</li>)}
      </ul>
      {canEdit ? (
        <button disabled={pending} className="mt-4 rounded-md bg-signal-amber px-5 py-2 text-sm font-semibold text-graphite-950 hover:opacity-90 disabled:opacity-50">{pending ? "Saving…" : "Save layout rules"}</button>
      ) : <p className="mt-3 text-xs text-graphite-500">Only design approvers can change these.</p>}
    </form>
  );
}
