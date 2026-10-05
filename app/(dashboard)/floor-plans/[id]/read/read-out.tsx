"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { readDxf, type DxfModel } from "@/lib/floor-plans/dxf";
import { dxfTextFromBlob } from "@/lib/floor-plans/dxf-text";
import { UNIT_TO_M, type DxfUnits, type LayerRole } from "@/lib/floor-plans/calc";
import { buildDrawingIndex, type DrawingIndex, type IndexPart } from "@/lib/floor-plans/drawing-index";
import { KIND_LABEL } from "@/lib/floor-plans/building";
import { CONCEPT_BY_KEY, TEACHABLE, layerKey, type Dictionary } from "@/lib/floor-plans/vocab";
import { teachDrawing } from "../../dictionary-actions";

const ROLES: LayerRole[] = ["ignore", "walls", "columns", "slab", "opening", "beams", "upstand"];
const ROLE_LABEL: Record<LayerRole, string> = { ignore: "Not counted", walls: "Walls", columns: "Columns", slab: "Slab edge", opening: "Openings", beams: "Beams", upstand: "Upstands" };
const ROLE_COL: Record<LayerRole, string> = { ignore: "#59606b", walls: "#4f8cff", columns: "#22c3a6", slab: "#e8b04a", opening: "#b06cf0", beams: "#ff8a3d", upstand: "#f25f8a" };
const KIND_TXT: Record<string, string> = { plan: "Floor plan", section: "Section", elevation: "Elevation", site: "Site plan", detail: "Detail / table", other: "Other" };
const MARK_COL: Record<string, string> = { lift: "#b06cf0", duct: "#ff8a3d", cutout: "#f25f8a", ots: "#f25f8a", stair: "#3ccf6e", ramp: "#3ccf6e" };
const GROUP_LABEL: Record<string, string> = { opening: "Openings in the slab", circulation: "Stairs / ramps", level: "Levels", room: "Rooms", structure: "Structure", "door-window": "Doors / windows", annotation: "Titles, notes, site", services: "Services", ignore: "Not needed" };
const SHOWN_FOUND = ["lift", "duct", "cutout", "ots", "stair", "ramp", "toilet", "kitchen", "balcony", "utility", "bedroom", "living", "lobby"];

type Props = { planId: string; planName: string; fileUrl: string; indexPath: string; dict: Dictionary; canEdit: boolean; roles: Record<string, LayerRole>; units?: string; said: { floors?: number; floorMm?: number; slabMm?: number } };

export function ReadOut({ planName, fileUrl, indexPath, dict: dict0, canEdit, units, said }: Props) {
  const [busy, setBusy] = useState<string | null>("Downloading the drawing…");
  const [err, setErr] = useState<string | null>(null);
  const [dict, setDict] = useState<Dictionary>(dict0);
  const [ix, setIx] = useState<DrawingIndex | null>(null);
  const [terms, setTerms] = useState<Record<string, string | null>>({});
  const [layers, setLayers] = useState<Record<string, LayerRole | null>>({});
  const [saved, setSaved] = useState<string | null>(null);
  const model = useRef<DxfModel | null>(null);

  const build = useCallback((d: Dictionary) => {
    const m = model.current; if (!m) return null;
    const u = UNIT_TO_M[((units as DxfUnits) ?? m.units)] ?? UNIT_TO_M[m.units];
    const out = buildDrawingIndex(m, u, { dict: d, planName, said });
    setIx(out);
    return out;
  }, [units, planName, said]);

  useEffect(() => {
    let off = false;
    (async () => {
      try {
        const res = await fetch(fileUrl); if (!res.ok) throw new Error("Could not download the drawing.");
        const text = await dxfTextFromBlob(await res.blob());
        setBusy("Reading every line and text…");
        await new Promise((r) => setTimeout(r, 30));
        model.current = readDxf(text);
        if (off) return;
        setBusy("Sorting it into drawings, layers and words…");
        await new Promise((r) => setTimeout(r, 30));
        const out = build(dict0);
        setBusy(null);
        // stored next to the drawing, so later steps can take what they need without reading the file again
        if (out && canEdit) {
          const blob = new Blob([JSON.stringify(out)], { type: "application/json" });
          void createClient().storage.from("floor-plans").upload(indexPath, blob, { contentType: "application/json", upsert: true });
        }
      } catch (e) { if (!off) { setErr(e instanceof Error ? e.message : String(e)); setBusy(null); } }
    })();
    return () => { off = true; };
  }, [fileUrl]); // eslint-disable-line react-hooks/exhaustive-deps

  const pending = Object.keys(terms).length + Object.keys(layers).length;
  const save = async () => {
    setSaved("Saving…");
    const r = await teachDrawing({ terms, layers });
    if (r.error) { setSaved(r.error); return; }
    const next: Dictionary = { terms: { ...dict.terms }, layers: { ...dict.layers } };
    for (const [k, v] of Object.entries(terms)) { if (v == null) delete next.terms[k]; else next.terms[k] = v; }
    for (const [k, v] of Object.entries(layers)) { if (v == null) delete next.layers[k]; else next.layers[k] = v; }
    setDict(next); setTerms({}); setLayers({});
    const out = build(next);
    if (out && canEdit) void createClient().storage.from("floor-plans").upload(indexPath, new Blob([JSON.stringify(out)], { type: "application/json" }), { contentType: "application/json", upsert: true });
    setSaved("Saved to the company dictionary — this drawing has been read again with it. Open the measuring screen again to use the new layer meanings.");
  };

  if (err) return <p className="text-sm text-signal-red">{err}</p>;
  if (busy || !ix) return <p className="text-sm text-graphite-300">{busy ?? "…"}</p>;

  const unknown = ix.terms.filter((t) => !t.meaning && (t.cat === "words" || t.cat === "title"));
  const known = ix.terms.filter((t) => t.meaning);
  const groups = new Map<string, typeof known>();
  for (const t of known) { const g = t.meaning!.group; groups.set(g, [...(groups.get(g) ?? []), t]); }
  const levels = ix.building?.levels ?? [];

  return (
    <div className="space-y-6">
      {/* summary */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
        {[
          ["Drawings in the file", ix.counts.drawings],
          ["Floor plans", ix.parts.filter((p) => p.kind === "plan").length],
          ["Marked for formwork", ix.parts.filter((p) => p.scope === "formwork").length],
          ["Levels of the building", levels.length],
          ["Layers", ix.counts.layers],
          ["Words understood", ix.counts.known],
          ["Words not known yet", ix.counts.unknown],
        ].map(([k, v]) => (
          <div key={k as string} className="rounded-md border border-graphite-800 bg-graphite-900/60 px-3 py-2">
            <div className="text-[11px] text-graphite-400">{k}</div>
            <div className="text-lg font-semibold text-graphite-50">{v}</div>
          </div>
        ))}
      </div>

      {ix.checks.length ? (
        <div className="rounded-md border border-signal-amber/50 bg-signal-amber/10 px-3 py-2 text-xs text-graphite-100">
          <div className="mb-1 font-medium">Please check</div>
          <ul className="list-disc space-y-0.5 pl-4">{ix.checks.map((c) => <li key={c}>{c}</li>)}</ul>
        </div>
      ) : <div className="rounded-md border border-signal-green/40 bg-signal-green/10 px-3 py-2 text-xs text-graphite-100">Everything needed was found: wall layers, floor plans, building levels, and every word is understood.</div>}

      {(pending || saved) && canEdit ? (
        <div className="sticky top-2 z-10 flex flex-wrap items-center gap-3 rounded-md border border-brand-orange/50 bg-graphite-900 px-3 py-2 text-xs">
          {pending ? <span className="text-graphite-200">{pending} change(s) not saved yet</span> : null}
          {pending ? <button type="button" onClick={save} className="rounded-md bg-brand-orange px-3 py-1.5 font-medium text-white hover:opacity-90">Save to company dictionary</button> : null}
          {saved ? <span className="text-graphite-300">{saved}</span> : null}
        </div>
      ) : null}

      {/* drawings */}
      <section>
        <h2 className="mb-2 text-sm font-semibold text-graphite-100">1 · Drawings in the file</h2>
        <p className="mb-2 text-xs text-graphite-400">Each drawing found in the file, its type and level, and what is written inside it. Blue = walls, purple dots = lifts, orange = ducts, green = stairs. A drawing the architect put under a caption such as &quot;FOR Alu. Formwork&quot; is tagged <span className="rounded bg-brand-orange/20 px-1 text-brand-orange">for formwork</span> and is used first.</p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {ix.parts.map((p) => <PartCard key={p.n} p={p} ix={ix} model={model.current!} />)}
        </div>
      </section>

      {/* building */}
      <section>
        <h2 className="mb-2 text-sm font-semibold text-graphite-100">2 · Levels of the building</h2>
        <p className="mb-2 text-xs text-graphite-400">{ix.building?.note ?? "Not read."}</p>
        {levels.length ? (
          <div className="overflow-x-auto rounded-md border border-graphite-800">
            <table className="w-full text-xs">
              <thead className="bg-graphite-900 text-left text-graphite-400"><tr><th className="px-2 py-1.5">Level</th><th className="px-2 py-1.5">Type</th><th className="px-2 py-1.5 text-right">Level (mm)</th><th className="px-2 py-1.5 text-right">Floor height (mm)</th><th className="px-2 py-1.5">Its drawing</th></tr></thead>
              <tbody>
                {[...levels].reverse().map((l) => (
                  <tr key={l.key} className="border-t border-graphite-800">
                    <td className="px-2 py-1 text-graphite-100">{l.name}</td>
                    <td className="px-2 py-1 text-graphite-300">{KIND_LABEL[l.kind]}</td>
                    <td className="px-2 py-1 text-right text-graphite-300">{l.elevMm != null ? (l.elevMm > 0 ? `+${l.elevMm}` : l.elevMm) : "—"}</td>
                    <td className="px-2 py-1 text-right text-graphite-300">{l.floorMm ?? "—"}</td>
                    <td className="px-2 py-1 text-graphite-400">{l.partTitle ?? (l.kind === "floor" ? "typical floor plan" : "—")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </section>

      {/* layers */}
      <section>
        <h2 className="mb-2 text-sm font-semibold text-graphite-100">3 · Layers</h2>
        <p className="mb-2 text-xs text-graphite-400">What each layer is, and why the app thinks so. Change one and save: every later drawing with a layer of the same name is read the same way.</p>
        <div className="overflow-x-auto rounded-md border border-graphite-800">
          <table className="w-full text-xs">
            <thead className="bg-graphite-900 text-left text-graphite-400"><tr><th className="px-2 py-1.5">Layer</th><th className="px-2 py-1.5 text-right">Lines</th><th className="px-2 py-1.5 text-right">Texts</th><th className="px-2 py-1.5">Counted as</th><th className="px-2 py-1.5">Why</th></tr></thead>
            <tbody>
              {ix.layers.map((l) => {
                const k = layerKey(l.name); const cur = layers[k] !== undefined ? (layers[k] ?? "ignore") : l.role;
                return (
                  <tr key={l.name} className="border-t border-graphite-800 align-top">
                    <td className="px-2 py-1 font-mono text-[11px] text-graphite-100"><span className="mr-1.5 inline-block size-2 rounded-full" style={{ background: ROLE_COL[cur] }} />{l.name}</td>
                    <td className="px-2 py-1 text-right text-graphite-300">{l.lines || ""}</td>
                    <td className="px-2 py-1 text-right text-graphite-300">{l.texts || ""}</td>
                    <td className="px-2 py-1">
                      {canEdit && l.kind === "geometry" ? (
                        <select value={cur} onChange={(e) => { const r = e.target.value as LayerRole; setSaved(null); setLayers((p) => { const n = { ...p }; if (r === l.role && l.from !== "taught") delete n[k]; else n[k] = r; return n; }); }}
                          className="rounded border border-graphite-700 bg-graphite-900 px-1 py-0.5 text-graphite-100">
                          {ROLES.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
                        </select>
                      ) : <span className="text-graphite-300">{l.kind === "doors-windows" ? "Doors / windows" : l.kind === "railings" ? "Railings" : ROLE_LABEL[l.role]}</span>}
                    </td>
                    <td className="px-2 py-1 text-graphite-400">
                      {l.from === "taught" ? <span className="mr-1 rounded bg-signal-green/20 px-1 text-signal-green">taught</span> : null}{l.why}
                      {l.hint ? <div className="mt-0.5 text-signal-amber">Looks like {ROLE_LABEL[l.hint.role].toLowerCase()}: {l.hint.why}{canEdit && cur !== l.hint.role ? <button type="button" className="ml-2 text-brand-orange hover:underline" onClick={() => { setSaved(null); setLayers((p) => ({ ...p, [k]: l.hint!.role })); }}>Use as {ROLE_LABEL[l.hint.role].toLowerCase()}</button> : null}</div> : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* words */}
      <section>
        <h2 className="mb-2 text-sm font-semibold text-graphite-100">4 · Words on the drawing</h2>
        <p className="mb-2 text-xs text-graphite-400">Every architect writes things differently (P.LIFT, PASS. LIFT, ELEV; O.H.W.T, OHT; MUMTY, STAIR CABIN). The words below are not known yet — choose what each one means (only the ones that matter) and save.</p>
        {unknown.length ? (
          <div className="overflow-x-auto rounded-md border border-graphite-800">
            <table className="w-full text-xs">
              <thead className="bg-graphite-900 text-left text-graphite-400"><tr><th className="px-2 py-1.5">Word / phrase</th><th className="px-2 py-1.5 text-right">Times</th><th className="px-2 py-1.5">In drawing</th><th className="px-2 py-1.5">Means</th></tr></thead>
              <tbody>{unknown.slice(0, 300).map((t) => <TermRow key={t.norm} norm={t.norm} sample={t.sample} count={t.count} parts={t.parts} value={terms[t.norm]} canEdit={canEdit} onPick={(v) => { setSaved(null); setTerms((p) => ({ ...p, [t.norm]: v })); }} />)}</tbody>
            </table>
          </div>
        ) : <p className="text-xs text-signal-green">Every word on this drawing is understood.</p>}

        <h3 className="mb-1 mt-4 text-xs font-semibold text-graphite-200">Words understood ({known.length}) — open a group to check or correct</h3>
        <div className="space-y-1.5">
          {[...groups.entries()].map(([g, list]) => (
            <details key={g} className="rounded-md border border-graphite-800 bg-graphite-900/40 px-2 py-1.5">
              <summary className="cursor-pointer text-xs text-graphite-200">{GROUP_LABEL[g] ?? g} <span className="text-graphite-500">({list.length})</span> <span className="ml-2 text-graphite-500">{list.slice(0, 8).map((t) => t.sample).join(" · ")}</span></summary>
              <table className="mt-1 w-full text-xs"><tbody>
                {list.map((t) => <TermRow key={t.norm} norm={t.norm} sample={t.sample} count={t.count} parts={t.parts} value={terms[t.norm] !== undefined ? terms[t.norm] : t.meaning!.key} taught={t.meaning!.how === "taught"} canEdit={canEdit} onPick={(v) => { setSaved(null); setTerms((p) => ({ ...p, [t.norm]: v })); }} />)}
              </tbody></table>
            </details>
          ))}
        </div>
      </section>
    </div>
  );
}

function TermRow({ norm, sample, count, parts, value, taught, canEdit, onPick }: { norm: string; sample: string; count: number; parts: number[]; value: string | null | undefined; taught?: boolean; canEdit: boolean; onPick: (v: string | null) => void }) {
  return (
    <tr className="border-t border-graphite-800">
      <td className="px-2 py-1 text-graphite-100" title={norm}>{sample}{taught ? <span className="ml-1 rounded bg-signal-green/20 px-1 text-signal-green">taught</span> : null}</td>
      <td className="px-2 py-1 text-right text-graphite-400">{count}</td>
      <td className="px-2 py-1 text-graphite-500">{parts.slice(0, 6).map((n) => `#${n}`).join(" ")}</td>
      <td className="px-2 py-1">
        {canEdit ? (
          <select value={value ?? ""} onChange={(e) => onPick(e.target.value || null)} className="rounded border border-graphite-700 bg-graphite-900 px-1 py-0.5 text-graphite-100">
            <option value="">— not taught —</option>
            {Object.entries(GROUP_LABEL).filter(([g]) => g !== "ignore").map(([g, gl]) => (
              <optgroup key={g} label={gl}>{TEACHABLE.filter((c) => c.group === g && c.key !== "ignore").map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}</optgroup>
            ))}
            <option value="ignore">Not needed (ignore)</option>
          </select>
        ) : <span className="text-graphite-300">{value ? CONCEPT_BY_KEY.get(value)?.label ?? value : "—"}</span>}
      </td>
    </tr>
  );
}

/** One drawing: a small picture of its lines (walls blue) with lifts / ducts / stairs marked, and what is in it. */
function PartCard({ p, ix, model }: { p: IndexPart; ix: DrawingIndex; model: DxfModel }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const roleOf = useMemo(() => new Map(ix.layers.map((l) => [l.name, l.role])), [ix]);
  useEffect(() => {
    const c = ref.current; if (!c) return;
    const W = c.width, H = c.height, ctx = c.getContext("2d")!; ctx.clearRect(0, 0, W, H);
    const [x0, y0, x1, y1] = p.box; const s = Math.min((W - 8) / (x1 - x0 || 1), (H - 8) / (y1 - y0 || 1));
    const ox = (W - (x1 - x0) * s) / 2, oy = (H - (y1 - y0) * s) / 2;
    const X = (x: number) => ox + (x - x0) * s, Y = (y: number) => H - (oy + (y - y0) * s);
    const by: Record<string, Path2D> = {};
    for (const q of model.paths) {
      const [fx, fy] = q.pts[0]; if (fx < x0 || fx > x1 || fy < y0 || fy > y1) continue;
      const r = roleOf.get(q.layer) ?? "ignore"; const path = by[r] ?? (by[r] = new Path2D());
      path.moveTo(X(q.pts[0][0]), Y(q.pts[0][1])); for (let i = 1; i < q.pts.length; i++) path.lineTo(X(q.pts[i][0]), Y(q.pts[i][1])); if (q.closed) path.closePath();
    }
    for (const r of ["ignore", "slab", "beams", "upstand", "columns", "opening", "walls"] as LayerRole[]) if (by[r]) { ctx.strokeStyle = r === "ignore" ? "rgba(140,148,160,0.35)" : ROLE_COL[r]; ctx.lineWidth = r === "walls" ? 1.2 : 0.7; ctx.stroke(by[r]); }
    for (const l of p.labels) { const col = MARK_COL[l.key]; if (!col) continue; ctx.fillStyle = col; ctx.beginPath(); ctx.arc(X(l.x), Y(l.y), 3, 0, Math.PI * 2); ctx.fill(); }
  }, [p, model, roleOf]);
  const lvl = p.kind === "plan" && p.level.kind !== "other" ? `${KIND_LABEL[p.level.kind]}${p.level.nos.length ? ` ${p.level.nos.length > 1 ? `${p.level.nos[0]}–${p.level.nos[p.level.nos.length - 1]}` : p.level.nos[0]}` : ""}${p.level.typical ? " (typical)" : ""}` : null;
  const chips = SHOWN_FOUND.filter((k) => p.found[k]).map((k) => `${p.found[k]} ${CONCEPT_BY_KEY.get(k)?.label.split(" /")[0].toLowerCase()}`);
  return (
    <div className="rounded-md border border-graphite-800 bg-graphite-900/50 p-2">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate text-xs font-medium text-graphite-100" title={p.title}>#{p.n} · {p.title}{p.scope === "formwork" ? <span className="ml-1.5 rounded bg-brand-orange/20 px-1 text-[10px] text-brand-orange" title={p.scopeNote}>for formwork</span> : null}</div>
          <div className="text-[11px] text-graphite-400">{KIND_TXT[p.kind] ?? p.kind}{lvl ? ` · ${lvl}` : ""}{p.levelFrom === "labels" ? " (no title — level read from its labels)" : ""} · {p.wM} × {p.hM} m{p.scale ? ` · ${p.scale}` : ""}</div>
        </div>
      </div>
      <canvas ref={ref} width={420} height={260} className="mt-1.5 h-auto w-full rounded bg-graphite-950" />
      {chips.length ? <div className="mt-1.5 flex flex-wrap gap-1">{chips.map((c) => <span key={c} className="rounded bg-graphite-800 px-1.5 py-0.5 text-[10px] text-graphite-200">{c}</span>)}</div> : null}
    </div>
  );
}

