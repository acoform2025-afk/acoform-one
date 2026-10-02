"use client";

import { SCOPES, fmtArea, type Params, type Scope, type Totals } from "@/lib/floor-plans/calc";

/**
 * "What is in the order" — the first thing set on a take-off: which parts are formed with this formwork (full Mivan,
 * vertical only, columns only, deck + beams + columns, deck + beams) and whether thin walls are concrete or block.
 * The two wall options are shown side by side so a quote can offer both.
 */
export function ScopePanel({ params, totals, alt, pairs, canEdit, set }: {
  params: Params; totals: Totals; alt: Totals | null; pairs: Record<number, number> | null; canEdit: boolean;
  set: (p: Partial<Params>) => void;
}) {
  const scope: Scope = params.scope ?? "full";
  const thinOut = (Number(params.minWallMm) || 0) > 75;
  const limit = thinOut ? Number(params.minWallMm) : 125;
  const hasWalls = SCOPES[scope].parts.includes("wall");
  const all = thinOut ? alt : totals, noThin = thinOut ? totals : alt;
  const thin = pairs ? Object.entries(pairs).filter(([k, v]) => Number(k) < limit && v >= 1).reduce((s, [, v]) => s + v, 0) : 0;
  const btn = (on: boolean) => `rounded-md border px-2 py-1.5 text-left text-xs transition ${on ? "border-brand-orange bg-brand-orange/15 text-graphite-50" : "border-graphite-700 text-graphite-300 hover:border-graphite-500"} disabled:opacity-60`;
  return (
    <div className="rounded-lg border border-graphite-700 bg-graphite-950/60 p-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-brand-orange">What is in the order</p>
      <div className="mt-2 grid grid-cols-1 gap-1.5 sm:grid-cols-2">
        {(Object.keys(SCOPES) as Scope[]).map((k) => (
          <button key={k} type="button" disabled={!canEdit} onClick={() => set({ scope: k })} className={btn(scope === k)}>
            <span className="block font-medium">{SCOPES[k].label}</span>
            <span className="block text-[11px] text-graphite-500">{SCOPES[k].what}</span>
          </button>
        ))}
      </div>
      {hasWalls ? (
        <>
          <p className="mt-3 text-[11px] uppercase tracking-wide text-graphite-500">Walls</p>
          <div className="mt-1 grid grid-cols-2 gap-1.5">
            <button type="button" disabled={!canEdit} onClick={() => set({ minWallMm: undefined })} className={btn(!thinOut)}>
              <span className="block font-medium">Option 1 · All walls concrete</span>
              <span className="block text-[11px] text-graphite-500">{all ? fmtArea(all.contact_area) : "—"}</span>
            </button>
            <button type="button" disabled={!canEdit} onClick={() => set({ minWallMm: limit })} className={btn(thinOut)}>
              <span className="block font-medium">Option 2 · Walls under {limit} mm in block</span>
              <span className="block text-[11px] text-graphite-500">{noThin ? fmtArea(noThin.contact_area) : "—"}{thin ? ` · ${Math.round(thin)} m of thin walls` : ""}</span>
            </button>
          </div>
          {thinOut ? (
            <label className="mt-1.5 flex items-center gap-2 text-[11px] text-graphite-400">
              Block walls are those thinner than
              <input type="number" min={80} max={300} step={5} disabled={!canEdit} value={limit} onChange={(e) => set({ minWallMm: Math.max(80, Number(e.target.value) || 125) })}
                className="w-16 rounded border border-graphite-700 bg-graphite-950 px-1.5 py-0.5 text-graphite-100" /> mm
            </label>
          ) : null}
          {all && noThin ? (
            <p className="mt-1.5 text-[11px] text-graphite-500">
              Difference {fmtArea(all.contact_area - noThin.contact_area)} ({((1 - noThin.contact_area / Math.max(1, all.contact_area)) * 100).toFixed(1)} %) — quote both if the client has not decided.
            </p>
          ) : null}
          {pairs ? (
            <p className="mt-1 text-[11px] text-graphite-600">Walls found: {Object.entries(pairs).filter(([, v]) => v >= 1).sort((a, b) => Number(a[0]) - Number(b[0])).map(([k, v]) => `${k} mm ${Math.round(v)} m`).join(" · ")}</p>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
