"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { planCandidates, suggestedRoles, type DxfModel } from "@/lib/floor-plans/dxf";
import { UNIT_TO_M, type DxfUnits, type LayerRole } from "@/lib/floor-plans/calc";
import { layerKey, type Dictionary } from "@/lib/floor-plans/vocab";
import { HATCH_COLOR, HATCH_LABEL, HATCH_MEANINGS, type AiRead, type HatchMeaning } from "@/lib/floor-plans/ai-read";
import { teachDrawing } from "../../dictionary-actions";

const PALETTE = ["#e11d48", "#2563eb", "#16a34a", "#f59e0b", "#7c3aed", "#0891b2", "#db2777", "#65a30d", "#ea580c", "#4f46e5", "#0d9488", "#be123c"];
type Box = [number, number, number, number];

/** One picture of the drawing (or of a part of it): lines grey, every hatch layer filled in its own colour. */
function picture(m: DxfModel, colorOf: (layer: string) => string | null, box: Box, maxSide: number): string {
  const [x0, y0, x1, y1] = box, w = x1 - x0 || 1, h = y1 - y0 || 1, s = maxSide / Math.max(w, h);
  const c = document.createElement("canvas"); c.width = Math.max(1, Math.round(w * s)); c.height = Math.max(1, Math.round(h * s));
  const ctx = c.getContext("2d")!; ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, c.width, c.height);
  const px = (p: [number, number]): [number, number] => [(p[0] - x0) * s, (y1 - p[1]) * s];
  ctx.lineWidth = 0.8; ctx.strokeStyle = "#374151";
  ctx.beginPath();
  for (const p of m.paths) {
    const b = p.pts; if (b.length < 2) continue;
    let [a0, a1] = px(b[0]); if (a0 < -2000 || a0 > c.width + 2000) continue;
    ctx.moveTo(a0, a1);
    for (let i = 1; i < b.length; i++) { const [q0, q1] = px(b[i]); ctx.lineTo(q0, q1); }
    if (p.closed) ctx.closePath();
  }
  ctx.stroke();
  for (const f of m.fills ?? []) {
    if (f.kind !== "hatch") continue; const col = colorOf(f.layer); if (!col) continue;
    ctx.fillStyle = col + "99"; ctx.beginPath();
    f.pts.forEach((p, i) => { const [q0, q1] = px(p); if (i === 0) ctx.moveTo(q0, q1); else ctx.lineTo(q0, q1); });
    ctx.closePath(); ctx.fill();
  }
  return c.toDataURL("image/jpeg", 0.8);
}

export function AiPanel({ planId, model, units, indexPath, canEdit, dict }: { planId: string; model: React.MutableRefObject<DxfModel | null>; units?: string; indexPath: string; canEdit: boolean; dict: Dictionary }) {
  const aiPath = indexPath.replace(/[^/]+$/, "ai.json");
  const [res, setRes] = useState<AiRead | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [noKey, setNoKey] = useState(false);
  const [meaning, setMeaning] = useState<Record<string, HatchMeaning>>({});
  const [accept, setAccept] = useState<Record<string, boolean>>({});
  const [look, setLook] = useState<string | null>(null);
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    void (async () => {
      const { data } = await createClient().storage.from("floor-plans").download(aiPath);
      if (!data || !alive.current) return;
      try { const j = JSON.parse(await data.text()) as AiRead; setRes(j); setMeaning(Object.fromEntries(j.hatches.map((h) => [h.layer, h.meaning]))); } catch { /* ignore */ }
    })();
    return () => { alive.current = false; };
  }, [aiPath]);

  const hatchLayers = () => {
    const n = new Map<string, number>(); for (const f of model.current?.fills ?? []) if (f.kind === "hatch") n.set(f.layer, (n.get(f.layer) ?? 0) + 1);
    return [...n.entries()].sort((a, b) => b[1] - a[1]).map(([l]) => l);
  };

  const run = async () => {
    const m = model.current; if (!m) return;
    setMsg(null); setNoKey(false); setBusy("Preparing the pictures…"); await new Promise((r) => setTimeout(r, 30));
    try {
      const hl = hatchLayers(), col = new Map(hl.map((l, i) => [l, PALETTE[i % PALETTE.length]]));
      const u = UNIT_TO_M[(units as DxfUnits) ?? m.units] ?? UNIT_TO_M[m.units];
      const sug = suggestedRoles(m);
      const pad = Math.max(m.bbox[2] - m.bbox[0], m.bbox[3] - m.bbox[1]) * 0.02;
      const whole: Box = [m.bbox[0] - pad, m.bbox[1] - pad, m.bbox[2] + pad, m.bbox[3] + pad];
      const images = [picture(m, (l) => col.get(l) ?? null, whole, 1800)];
      const cands = planCandidates(m, sug, u).slice(0, 2);
      for (const c of cands) { const p = Math.max(c.box[2] - c.box[0], c.box[3] - c.box[1]) * 0.03; images.push(picture(m, (l) => col.get(l) ?? null, [c.box[0] - p, c.box[1] - p, c.box[2] + p, c.box[3] + p], 2000)); }
      const hcount = new Map<string, number>(); for (const f of m.fills ?? []) if (f.kind === "hatch") hcount.set(f.layer, (hcount.get(f.layer) ?? 0) + 1);
      const rows = m.layers.filter((l) => l.count || l.fills || l.texts).slice(0, 220).map((l) => `${l.name} | lines ${l.count} (closed ${l.closed}) | texts ${l.texts ?? 0} | hatches ${hcount.get(l.name) ?? 0}${col.has(l.name) ? ` (shown in ${col.get(l.name)})` : ""} | app guess: ${dict.layers[layerKey(l.name)] ?? sug[l.name] ?? l.suggested}`);
      const seen = new Set<string>(), notes: string[] = [];
      for (const t of m.texts ?? []) { const s = t.text.replace(/\s+/g, " ").trim(); if (s.length < 4 || s.length > 90 || /^[\d\s.,+\-x×/]+$/.test(s) || seen.has(s.toLowerCase())) continue; seen.add(s.toLowerCase()); notes.push(`${s}  [${t.layer ?? "?"}]`); if (notes.length >= 260) break; }
      const parts = cands.map((c, i) => `Zoom picture ${i + 2}: ${c.title ?? "plan"} (${c.w.toFixed(0)} × ${c.h.toFixed(0)} units)`).join("\n");
      const table = `Drawing units: ${units ?? m.units}\nLAYERS (name | content | app's current guess):\n${rows.join("\n")}\n\n${parts}\n\nWRITTEN NOTES / LABELS (text [layer]):\n${notes.join("\n")}`;
      setBusy("The AI is reading the whole drawing — this can take a minute or two…");
      const r = await fetch("/api/ai-read", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ images: images.map((d) => d.split(",")[1]), table }) });
      const j = await r.json();
      if (!alive.current) return;
      if (!r.ok) { if (j.error === "NO_KEY") setNoKey(true); else setMsg(j.error ?? "The AI reading failed."); return; }
      const out = j.read as AiRead; setRes(out); setMeaning(Object.fromEntries(out.hatches.map((h) => [h.layer, h.meaning]))); setAccept({});
      if (canEdit) void createClient().storage.from("floor-plans").upload(aiPath, new Blob([JSON.stringify(out)], { type: "application/json" }), { contentType: "application/json", upsert: true });
    } catch (e) { setMsg(e instanceof Error ? e.message : String(e)); } finally { setBusy(null); }
  };

  // the colour hatching review: every hatch layer in the colour of its meaning
  useEffect(() => {
    const m = model.current; if (!m || !res) { setLook(null); return; }
    const pad = Math.max(m.bbox[2] - m.bbox[0], m.bbox[3] - m.bbox[1]) * 0.02;
    const t = setTimeout(() => setLook(picture(m, (l) => (meaning[l] ? HATCH_COLOR[meaning[l]] : null), [m.bbox[0] - pad, m.bbox[1] - pad, m.bbox[2] + pad, m.bbox[3] + pad], 1600)), 20);
    return () => clearTimeout(t);
  }, [res, meaning, model]);

  const nowRole = (n: string): LayerRole => (dict.layers[layerKey(n)] ?? model.current?.layers.find((l) => l.name === n)?.suggested ?? "ignore") as LayerRole;
  const diff = (res?.layers ?? []).filter((l) => nowRole(l.name) !== l.role);

  const applyLayers = async () => {
    const pick = diff.filter((l) => accept[l.name] ?? l.confidence !== "low");
    if (!pick.length) { setMsg("Nothing selected."); return; }
    setMsg("Saving…");
    const r = await teachDrawing({ terms: {}, layers: Object.fromEntries(pick.map((l) => [layerKey(l.name), l.role])) });
    setMsg(r.error ?? `${pick.length} layer meanings saved to the company dictionary. Open the measuring screen again (or press "Read drawing again") to use them.`);
  };
  const applyHatch = async () => {
    if (!res) return;
    const next: AiRead = { ...res, hatches: res.hatches.filter((h) => meaning[h.layer]).map((h) => ({ ...h, meaning: meaning[h.layer] })), applied: { at: new Date().toISOString(), hatches: true } };
    const { error } = await createClient().storage.from("floor-plans").upload(aiPath, new Blob([JSON.stringify(next)], { type: "application/json" }), { contentType: "application/json", upsert: true });
    if (!error) setRes(next);
    setMsg(error ? error.message : "Hatch meanings saved for this drawing. Open the measuring screen and press \"Read drawing again\": concrete hatches are added as walls and void hatches as openings.");
  };

  return (
    <section className="mb-6 rounded border border-graphite-700 bg-graphite-900/60 p-3">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-sm font-semibold text-graphite-50">AI reading of the whole drawing</h2>
        {canEdit ? <button type="button" disabled={!!busy} onClick={() => void run()} className="rounded bg-brand-orange px-3 py-1 text-xs font-medium text-black disabled:opacity-50">{res ? "Read again with AI" : "Read with AI"}</button> : null}
        {busy ? <span className="text-xs text-graphite-300">{busy}</span> : null}
      </div>
      <p className="mt-1 text-[11px] text-graphite-400">The AI looks at every part of the drawing, the layers, the hatching and the notes, and proposes what each one is. The exact outlines still come from the file; you check and accept.</p>
      {noKey ? <p className="mt-2 rounded border border-yellow-700/50 bg-yellow-900/20 p-2 text-xs text-yellow-200">The AI key is not set up yet. In Render open acoform-one → Environment → add <b>ANTHROPIC_API_KEY</b> (from console.anthropic.com) → Save. Then press the button again.</p> : null}
      {msg ? <p className="mt-2 text-xs text-graphite-200">{msg}</p> : null}
      {res ? (
        <div className="mt-3 space-y-3 text-xs text-graphite-200">
          <div><p className="whitespace-pre-wrap">{res.summary}</p>{res.typicalFloor ? <p className="mt-1 text-graphite-300"><b>Typical floor:</b> {res.typicalFloor}</p> : null}</div>
          {res.findings.length ? <div><b>What the formwork team must know</b><ul className="ml-4 list-disc">{res.findings.map((f, i) => <li key={i}>{f}</li>)}</ul></div> : null}
          {res.questions.length ? <div className="text-yellow-200"><b>Please confirm</b><ul className="ml-4 list-disc">{res.questions.map((f, i) => <li key={i}>{f}</li>)}</ul></div> : null}
          {res.hatches.length ? (
            <div>
              <b>Hatching — what each hatch layer is</b>
              <div className="mt-1 space-y-1">
                {res.hatches.map((h) => (
                  <div key={h.layer} className="flex items-center gap-2">
                    <span className="inline-block size-3 shrink-0 rounded-sm" style={{ background: HATCH_COLOR[meaning[h.layer] ?? h.meaning] }} />
                    <span className="w-56 shrink-0 truncate" title={h.layer}>{h.layer}</span>
                    <select disabled={!canEdit} value={meaning[h.layer] ?? h.meaning} onChange={(e) => setMeaning((p) => ({ ...p, [h.layer]: e.target.value as HatchMeaning }))} className="rounded border border-graphite-700 bg-graphite-950 px-1.5 py-0.5">
                      {HATCH_MEANINGS.map((k) => <option key={k} value={k}>{HATCH_LABEL[k]}</option>)}
                    </select>
                    <span className="text-graphite-500">{h.why}</span>
                  </div>
                ))}
              </div>
              {look ? <img src={look} alt="Hatching coloured by meaning" className="mt-2 max-h-[520px] w-full rounded border border-graphite-700 bg-white object-contain" /> : null}
              <p className="mt-1 text-[11px] text-graphite-500">Red = concrete wall · grey = brick · purple = void / cut-out · orange = column · blue = slab · green = stair.</p>
              {canEdit ? <button type="button" onClick={() => void applyHatch()} className="mt-2 rounded border border-brand-orange px-3 py-1 text-brand-orange hover:bg-brand-orange/10">{res.applied?.hatches ? "Hatch meanings saved ✓ — save again" : "Use these hatch meanings for this drawing"}</button> : null}
            </div>
          ) : null}
          {diff.length ? (
            <div>
              <b>Layers the AI reads differently from the app ({diff.length})</b>
              <div className="mt-1 max-h-72 space-y-1 overflow-y-auto pr-1">
                {diff.map((l) => (
                  <label key={l.name} className="flex items-start gap-2">
                    <input type="checkbox" disabled={!canEdit} checked={accept[l.name] ?? l.confidence !== "low"} onChange={(e) => setAccept((p) => ({ ...p, [l.name]: e.target.checked }))} className="mt-0.5" />
                    <span className="min-w-0"><b>{l.name}</b>: {nowRole(l.name)} → <b>{l.role}</b> <span className="text-graphite-500">({l.confidence}) {l.why}</span></span>
                  </label>
                ))}
              </div>
              {canEdit ? <button type="button" onClick={() => void applyLayers()} className="mt-2 rounded border border-brand-orange px-3 py-1 text-brand-orange hover:bg-brand-orange/10">Save the ticked layer meanings</button> : null}
            </div>
          ) : <p className="text-graphite-400">The AI agrees with the app on every layer.</p>}
          <p className="text-[11px] text-graphite-500">Read on {new Date(res.at).toLocaleString()}{res.model ? ` · ${res.model}` : ""}</p>
        </div>
      ) : null}
    </section>
  );
}
