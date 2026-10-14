"use client";

import { useState } from "react";
import { savePanelEdits } from "./actions";
import { faceBalance, panelText, parsePanelString } from "@/lib/floor-plans/panel-edit";
import { fillRun } from "@/lib/design-engine/floor-panels";

type Face = { code: string; length: number; panels: number[]; filler: number; hand: boolean };
const sel = "rounded border border-graphite-700 bg-graphite-900 px-1.5 py-1 text-xs text-graphite-100";

/** Wall faces laid out by hand: change, add or remove panels; the filler and any overrun are shown at once. */
export function FaceEditor({ planId, faces, widths, canEdit }: { planId: string; faces: Face[]; widths: number[]; canEdit: boolean }) {
  const [edits, setEdits] = useState<Record<string, number[]>>(() => Object.fromEntries(faces.filter((f) => f.hand).map((f) => [f.code, f.panels])));
  const [typed, setTyped] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState<{ ok?: string; error?: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [only, setOnly] = useState<"all" | "edited" | "problems">("all");
  const cur = (f: Face) => edits[f.code] ?? f.panels;
  const put = (f: Face, p: number[]) => { setEdits((e) => ({ ...e, [f.code]: p })); setMsg(null); };
  const clear = (f: Face) => { setEdits((e) => { const n = { ...e }; delete n[f.code]; return n; }); setTyped((t) => { const n = { ...t }; delete n[f.code]; return n; }); setMsg(null); };
  const ws = [...new Set(widths)].sort((a, b) => b - a);
  async function save() {
    setSaving(true); setMsg(null);
    const r = await savePanelEdits(planId, edits);
    setSaving(false);
    setMsg(r.error ? { error: r.error } : { ok: "Saved. Open the panel layout to see the new lists and drawings." });
  }
  const rows = faces.filter((f) => {
    if (only === "edited") return edits[f.code];
    if (only === "problems") { const b = faceBalance(f.length, cur(f)); return b.status === "over" || b.status === "narrow"; }
    return true;
  });
  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2 text-xs">
        {(["all", "edited", "problems"] as const).map((k) => (
          <button key={k} type="button" onClick={() => setOnly(k)} className={`rounded-full border px-3 py-1 ${only === k ? "border-signal-amber bg-signal-amber/10 text-graphite-100" : "border-graphite-700 text-graphite-400"}`}>
            {k === "all" ? `All faces (${faces.length})` : k === "edited" ? `Changed by hand (${Object.keys(edits).length})` : "With a problem"}</button>
        ))}
        {canEdit ? <button type="button" onClick={save} disabled={saving} className="ml-auto rounded-md bg-brand-orange px-4 py-1.5 font-medium text-white hover:opacity-90 disabled:opacity-50">{saving ? "Saving…" : "Save hand layout"}</button> : null}
        {msg ? <span className={msg.error ? "text-signal-red" : "text-signal-green"}>{msg.error ?? msg.ok}</span> : null}
      </div>
      <div className="overflow-x-auto rounded-lg border border-graphite-800">
        <table className="w-full min-w-[760px] text-left text-sm">
          <thead className="bg-graphite-900 text-xs uppercase tracking-wide text-graphite-500"><tr><th className="px-3 py-2">Face</th><th className="px-3 py-2">Length</th><th className="px-3 py-2">Panels (left to right)</th><th className="px-3 py-2">Result</th></tr></thead>
          <tbody>
            {rows.map((f) => {
              const p = cur(f), b = faceBalance(f.length, p), hand = !!edits[f.code];
              return (
                <tr key={f.code} className={`border-t border-graphite-800 align-top ${hand ? "bg-signal-amber/5" : ""}`}>
                  <td className="px-3 py-2 font-mono text-xs text-graphite-100">{f.code}{hand ? <span className="ml-1 text-[10px] text-signal-amber">by hand</span> : null}</td>
                  <td className="px-3 py-2 text-xs text-graphite-300">{Math.round(f.length)} mm</td>
                  <td className="px-3 py-2">
                    <div className="flex flex-wrap items-center gap-1">
                      {p.map((w, i) => (
                        <span key={i} className="inline-flex items-center rounded border border-graphite-700 bg-graphite-950">
                          <select value={w} disabled={!canEdit} onChange={(e) => put(f, p.map((x, j) => (j === i ? Number(e.target.value) : x)))} className={`${sel} border-0 bg-transparent`}>
                            {[...new Set([w, ...ws])].sort((a, c) => c - a).map((x) => <option key={x} value={x}>{x}</option>)}
                          </select>
                          {canEdit ? <button type="button" onClick={() => put(f, p.filter((_, j) => j !== i))} className="px-1 text-graphite-500 hover:text-signal-red" title="Remove this panel">×</button> : null}
                        </span>
                      ))}
                      {canEdit ? (
                        <select value="" onChange={(e) => { if (e.target.value) put(f, [...p, Number(e.target.value)]); }} className={sel}>
                          <option value="">+ add</option>{ws.map((x) => <option key={x} value={x}>{x}</option>)}
                        </select>
                      ) : null}
                    </div>
                    {canEdit ? (
                      <div className="mt-1.5 flex flex-wrap items-center gap-2">
                        <input value={typed[f.code] ?? ""} placeholder={`or type: ${panelText(p) || "3×600 + 450"}`} onChange={(e) => setTyped((t) => ({ ...t, [f.code]: e.target.value }))}
                          onKeyDown={(e) => { if (e.key === "Enter") { const q = parsePanelString(typed[f.code] ?? ""); if (q) { put(f, q); setTyped((t) => ({ ...t, [f.code]: "" })); } } }} className={`${sel} w-56`} />
                        <button type="button" onClick={() => { const q = parsePanelString(typed[f.code] ?? ""); if (q) { put(f, q); setTyped((t) => ({ ...t, [f.code]: "" })); } else setMsg({ error: `Could not read "${typed[f.code] ?? ""}". Write it like 3×600 + 450.` }); }} className="text-[11px] text-graphite-300 underline">Apply</button>
                        <button type="button" onClick={() => put(f, fillRun(f.length, ws).panels)} className="text-[11px] text-graphite-300 underline">Fit panels</button>
                        {hand ? <button type="button" onClick={() => clear(f)} className="text-[11px] text-signal-amber underline">Back to automatic</button> : null}
                      </div>
                    ) : null}
                  </td>
                  <td className="px-3 py-2 text-xs">
                    <span className="font-mono text-graphite-300">{b.sum} mm</span>
                    {b.status === "over" ? <span className="ml-2 text-signal-red">{b.over} mm too long — the panels run past the wall</span>
                      : b.status === "exact" ? <span className="ml-2 text-signal-green">fits</span>
                      : b.status === "narrow" ? <span className="ml-2 text-signal-amber">filler {b.filler} mm — too narrow, use a solid strip</span>
                      : <span className="ml-2 text-graphite-300">filler {b.filler} mm</span>}
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 ? <tr><td colSpan={4} className="px-3 py-4 text-sm text-graphite-400">Nothing to show here.</td></tr> : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
