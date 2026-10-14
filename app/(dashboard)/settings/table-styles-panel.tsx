"use client";

import { useState } from "react";
import { LIST_COLUMNS, type StyleCol, type TableStyles } from "@/lib/floor-plans/table-styles";

const input = "rounded-md border border-graphite-700 bg-graphite-900 px-2 py-1 text-xs text-graphite-100 focus:border-signal-amber focus:outline-none disabled:opacity-60";

/** Which columns, in which order and under which heading each Excel list of the design package is written. */
export function TableStylesPanel({ styles, onChange, canEdit }: { styles: TableStyles; onChange: (s: TableStyles) => void; canEdit: boolean }) {
  const [key, setKey] = useState<string>("numbering");
  const std = LIST_COLUMNS[key].cols;
  const cur: StyleCol[] = styles[key] ?? std.map((from) => ({ from }));
  const hidden = std.filter((c) => !cur.some((x) => x.from === c));
  const save = (cols: StyleCol[]) => { const next = { ...styles }; if (cols.length === std.length && cols.every((c, i) => c.from === std[i] && !c.as)) delete next[key]; else next[key] = cols; onChange(next); };
  const move = (i: number, d: number) => { const a = [...cur]; const j = i + d; if (j < 0 || j >= a.length) return; [a[i], a[j]] = [a[j], a[i]]; save(a); };
  return (
    <div className="mt-6 rounded-lg border border-graphite-800 bg-graphite-950 p-4">
      <h3 className="text-sm font-medium text-graphite-100">Table styles — Excel lists</h3>
      <p className="text-xs text-graphite-500">Choose which columns each list shows, their order and their headings. Lists you do not change keep the standard columns.</p>
      <div className="mt-3 flex flex-wrap gap-1">
        {Object.entries(LIST_COLUMNS).map(([k, v]) => (
          <button key={k} type="button" onClick={() => setKey(k)} className={`rounded-full border px-3 py-1 text-xs ${key === k ? "border-signal-amber bg-signal-amber/10 text-graphite-100" : "border-graphite-700 text-graphite-400"}`}>{v.label}{styles[k] ? " ●" : ""}</button>
        ))}
      </div>
      <ul className="mt-3 space-y-1">
        {cur.map((c, i) => (
          <li key={c.from} className="flex items-center gap-2">
            <span className="w-6 text-right font-mono text-[11px] text-graphite-500">{i + 1}</span>
            <span className="w-44 truncate text-xs text-graphite-300">{c.from}</span>
            <input value={c.as ?? ""} placeholder={c.from} disabled={!canEdit} onChange={(e) => save(cur.map((x, j) => (j === i ? { from: x.from, as: e.target.value } : x)))} className={`${input} w-48`} />
            <button type="button" disabled={!canEdit} onClick={() => move(i, -1)} className="px-1 text-graphite-400 hover:text-graphite-100">↑</button>
            <button type="button" disabled={!canEdit} onClick={() => move(i, 1)} className="px-1 text-graphite-400 hover:text-graphite-100">↓</button>
            <button type="button" disabled={!canEdit || cur.length <= 1} onClick={() => save(cur.filter((_, j) => j !== i))} className="text-[11px] text-signal-red hover:underline">Hide</button>
          </li>
        ))}
      </ul>
      {hidden.length ? (
        <p className="mt-2 text-xs text-graphite-500">Hidden:{" "}
          {hidden.map((h) => <button key={h} type="button" disabled={!canEdit} onClick={() => save([...cur, { from: h }])} className="mr-2 text-graphite-300 underline">{h}</button>)}</p>
      ) : null}
      {styles[key] ? <button type="button" disabled={!canEdit} onClick={() => { const n = { ...styles }; delete n[key]; onChange(n); }} className="mt-2 text-xs text-graphite-400 underline">Back to the standard columns</button> : null}
    </div>
  );
}
