"use client";

import { useState } from "react";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import { buildingTotals, groupLevels, KIND_LABEL, type Building, type Level, type LevelGroup, type LevelUse } from "@/lib/floor-plans/building";
import { fmtArea } from "@/lib/floor-plans/calc";

export type SiblingPlan = { id: string; name: string; contact: number; quote: number; measured: boolean };
export type LevelPartInfo = { n: number; title: string; px: [number, number, number, number] };

const USE_LABEL: Record<LevelUse, string> = { typical: "Typical plan", own: "Own plan", none: "Not formed" };

/**
 * "Whole building" — every level read from the drawing (level table / section level names), which drawing each one
 * has, whether the typical plan stands for it, and the open questions for the architect / structural engineer /
 * client. The whole-building formwork area is the sum over the formed levels.
 */
export function BuildingPanel({ building, parts, typical, siblings, planId, canEdit, onChange, onReread, onMeasure, onShowPart }: {
  building: Building; parts: LevelPartInfo[]; typical: { contact: number; quote: number }; siblings: SiblingPlan[]; planId: string; canEdit: boolean;
  onChange: (b: Building) => void; onReread: () => void;
  onMeasure: (g: LevelGroup, part: LevelPartInfo | null) => Promise<void>;
  onShowPart: (part: LevelPartInfo) => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [showQ, setShowQ] = useState(true);
  const groups = groupLevels(building.levels);
  const own: Record<string, { contact: number; quote: number }> = {};
  for (const s of siblings) if (s.measured) own[s.id] = { contact: s.contact, quote: s.quote };
  const tot = buildingTotals(building, typical, own);
  const patch = (keys: string[], p: Partial<Level>) => onChange({ ...building, edited: true, levels: building.levels.map((l) => (keys.includes(l.key) ? { ...l, ...p } : l)) });
  const setCount = (g: LevelGroup, n: number) => {
    // more / fewer floors in a run of typical floors: add or drop numbered floors at the top of the run
    if (g.kind !== "floor" || n < 1 || n > 200 || n === g.count) return;
    const first = g.first.no ?? 1;
    let levels = building.levels.filter((l) => !g.keys.includes(l.key));
    const add: Level[] = [];
    for (let i = 0; i < n; i++) add.push({ ...g.first, key: `f${first + i}`, no: first + i, name: `Floor ${first + i}` });
    // floors above the run shift by the change
    const d = n - g.count;
    levels = levels.map((l) => (l.kind === "floor" && (l.no ?? 0) >= first + g.count ? { ...l, key: `f${(l.no ?? 0) + d}`, no: (l.no ?? 0) + d, name: /^Floor \d+$/.test(l.name) ? `Floor ${(l.no ?? 0) + d}` : l.name } : l));
    onChange({ ...building, edited: true, levels: [...levels, ...add] });
  };
  const open = building.questions.filter((q) => !q.done);
  const sel = "rounded border border-graphite-700 bg-graphite-950 px-1 py-0.5 text-[11px] text-graphite-100 disabled:opacity-60";
  const copyQuestions = async () => {
    const by = (to: string) => building.questions.filter((q) => q.to === to && !q.done);
    const block = (to: string, who: string) => (by(to).length ? `For the ${who}:\n${by(to).map((q, i) => `${i + 1}. ${q.text}`).join("\n")}\n\n` : "");
    const text = `Clarifications needed before the formwork design can be finalised\n\n${block("architect", "architect")}${block("structure", "structural engineer")}${block("client", "client / site team")}`.trim();
    try { await navigator.clipboard.writeText(text); } catch { /* clipboard blocked */ }
  };
  return (
    <section className="rounded-lg border border-graphite-800 bg-graphite-900 p-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-medium text-graphite-100">Whole building ({tot.floors} formed levels)</h3>
        {canEdit ? <button type="button" onClick={onReread} className="text-[11px] text-brand-orange hover:underline">Read levels again</button> : null}
      </div>
      <p className="mb-2 mt-0.5 text-[11px] text-graphite-500">{building.note}. Every formed level counts: the typical plan stands for the floors without their own drawing.</p>
      <table className="w-full text-[11px]">
        <thead className="text-graphite-500">
          <tr><th className="pb-1 text-left font-normal">Level</th><th className="pb-1 text-right font-normal">Nos</th><th className="pb-1 text-right font-normal">Height</th><th className="pb-1 text-left font-normal">Counted with</th><th className="pb-1 text-right font-normal">m²</th></tr>
        </thead>
        <tbody>
          {[...groups].reverse().map((g) => {
            const part = g.partN ? parts.find((p) => p.n === g.partN) ?? null : null;
            const sib = g.planId ? siblings.find((s) => s.id === g.planId) : undefined;
            const per = g.use === "none" ? 0 : g.use === "own" && sib?.measured ? sib.contact : typical.contact;
            return (
              <tr key={g.keys[0]} className="border-t border-graphite-800 align-top">
                <td className="py-1 pr-1">
                  <span className="block text-graphite-100">{g.name}</span>
                  <span className="block text-graphite-500">{g.kind === "floor" ? "" : KIND_LABEL[g.kind]}{part ? <> · <button type="button" onClick={() => onShowPart(part)} className="text-graphite-400 hover:text-brand-orange hover:underline" title="Show this drawing">#{part.n} {part.title.slice(0, 28)}</button></> : g.use !== "none" ? <span className="text-signal-amber"> · no drawing</span> : null}</span>
                </td>
                <td className="py-1 text-right">
                  {g.kind === "floor" && canEdit ? <input type="number" min={1} max={200} value={g.count} onChange={(e) => setCount(g, Number(e.target.value))} className={`w-12 text-right ${sel}`} /> : g.count}
                </td>
                <td className="py-1 text-right">
                  {canEdit ? <input type="number" min={1500} max={9000} step={5} value={g.floorMm ?? ""} placeholder="—" onChange={(e) => patch(g.keys, { floorMm: Number(e.target.value) || undefined })} className={`w-14 text-right ${sel}`} /> : g.floorMm ?? "—"}
                </td>
                <td className="py-1 pl-1">
                  <select value={g.use} disabled={!canEdit} onChange={(e) => patch(g.keys, { use: e.target.value as LevelUse })} className={sel}>
                    {(Object.keys(USE_LABEL) as LevelUse[]).map((u) => <option key={u} value={u}>{USE_LABEL[u]}</option>)}
                  </select>
                  {g.use === "own" ? (
                    sib ? <Link href={`/floor-plans/${sib.id}`} className="ml-1 text-brand-orange hover:underline">{sib.measured ? "open" : "measure"}</Link>
                      : canEdit ? (
                        <button type="button" disabled={busy === g.keys[0]} onClick={async () => { setBusy(g.keys[0]); try { await onMeasure(g, part); } finally { setBusy(null); } }} className="ml-1 inline-flex items-center gap-1 text-brand-orange hover:underline disabled:opacity-60">
                          {busy === g.keys[0] ? <Loader2 className="size-3 animate-spin" /> : null}make its plan
                        </button>
                      ) : null
                  ) : null}
                </td>
                <td className="py-1 text-right text-graphite-300">{g.use === "none" ? "—" : `${Math.round(per * g.count).toLocaleString("en-IN")}${g.use === "own" && !sib?.measured ? "*" : ""}`}</td>
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr className="border-t border-graphite-700 font-medium text-graphite-100">
            <td className="pt-1.5" colSpan={4}>Whole building · {tot.floors} pours · {(tot.heightMm / 1000).toFixed(1)} m formed height</td>
            <td className="pt-1.5 text-right">{fmtArea(tot.contact)}</td>
          </tr>
        </tfoot>
      </table>
      <p className="mt-1 text-[11px] text-graphite-500">Typical floor {fmtArea(typical.contact)} contact. One set is reused floor by floor; the set size stays the biggest level, the whole-building figure is the concrete contact over all pours{tot.levels.some((l) => l.from === "missing") ? " (* own plan not measured yet — typical figure used)" : ""}.</p>

      <div className="mt-3 flex items-center justify-between">
        <button type="button" onClick={() => setShowQ((v) => !v)} className="text-xs font-medium text-graphite-100">Questions for architect / structure / client ({open.length} open)</button>
        {open.length ? <button type="button" onClick={copyQuestions} className="text-[11px] text-brand-orange hover:underline">Copy for e-mail</button> : null}
      </div>
      {showQ ? (
        <ul className="mt-1.5 space-y-1.5">
          {building.questions.map((q) => (
            <li key={q.id} className={`rounded border px-2 py-1.5 ${q.done ? "border-graphite-800 opacity-50" : "border-graphite-700"}`}>
              <label className="flex items-start gap-2">
                <input type="checkbox" checked={!!q.done} disabled={!canEdit} onChange={(e) => onChange({ ...building, questions: building.questions.map((x) => (x.id === q.id ? { ...x, done: e.target.checked } : x)) })} className="mt-0.5" />
                <span className="min-w-0">
                  <span className="mr-1 rounded bg-graphite-800 px-1 text-[10px] uppercase tracking-wide text-graphite-400">{q.to === "structure" ? "structural" : q.to}</span>
                  <span className="text-[11px] text-graphite-100">{q.text}</span>
                  <span className="block text-[10px] text-graphite-500">{q.why}</span>
                </span>
              </label>
            </li>
          ))}
          {!building.questions.length ? <li className="text-[11px] text-graphite-500">Nothing open — the drawing answered everything the level list needs.</li> : null}
        </ul>
      ) : null}
      {siblings.filter((s) => s.id !== planId && !building.levels.some((l) => l.planId === s.id)).length ? (
        <p className="mt-2 text-[10px] text-graphite-600">Other plans of this drawing: {siblings.filter((s) => s.id !== planId && !building.levels.some((l) => l.planId === s.id)).map((s) => <Link key={s.id} href={`/floor-plans/${s.id}`} className="mr-1 hover:underline">{s.name}</Link>)}</p>
      ) : null}
    </section>
  );
}
