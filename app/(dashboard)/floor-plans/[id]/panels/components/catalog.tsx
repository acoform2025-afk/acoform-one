"use client";

import { useMemo, useState } from "react";
import { PARTS, PART_GROUPS, typicalAssembly } from "@/lib/design-engine/parts3d";
import { PartCanvas } from "./part-canvas";

const ASM_VIEW: [number, number, number] = [1.3, 0.75, 1.7];
const LEGEND: [string, string][] = [["#7aa7e0", "Wall panels"], ["#f2c76b", "Wall-top panels"], ["#a78bfa", "Soffit corner"], ["#9fd3c7", "Deck panels"], ["#94a3b8", "Mid beam"], ["#e0782f", "Props"], ["#b4bac2", "Walers, ties, pins"]];

/** Components & accessories: the typical assembly and every piece as a 3D model, with how many this project needs. */
export function ComponentsCatalog({ qty, tieSystem }: { qty: Record<string, number>; tieSystem: string }) {
  const [sel, setSel] = useState<string>("assembly");
  const asm = useMemo(() => typicalAssembly(), []);
  const part = PARTS.find((p) => p.key === sel);
  const faces = useMemo(() => (part ? part.build() : asm), [part, asm]);
  return (
    <div>
      <div className="grid gap-3 lg:grid-cols-[1fr_320px]">
        <div className="rounded-lg border border-graphite-800 bg-graphite-900 p-2">
          <PartCanvas key={sel} faces={faces} height={460} light view={part ? undefined : ASM_VIEW} />
          <p className="mt-1 text-[11px] text-graphite-500">Drag to turn · wheel to zoom · right-drag to move. It turns by itself until you touch it.</p>
        </div>
        <div className="rounded-lg border border-graphite-800 bg-graphite-900 p-3 text-xs">
          {part ? (
            <>
              <p className="text-[10px] uppercase tracking-wide text-graphite-500">{part.group}</p>
              <h3 className="text-sm font-semibold text-graphite-50">{part.name}</h3>
              <dl className="mt-2 space-y-1.5">
                <div><dt className="text-graphite-500">Typical size</dt><dd className="text-graphite-100">{part.size}</dd></div>
                <div><dt className="text-graphite-500">Material</dt><dd className="text-graphite-100">{part.material}</dd></div>
                <div><dt className="text-graphite-500">What it does</dt><dd className="text-graphite-100">{part.use}</dd></div>
                <div><dt className="text-graphite-500">This project</dt><dd className="text-base font-semibold text-brand-orange">{qty[part.key] ? qty[part.key].toLocaleString("en-IN") + " nos" : "not in the parts list"}</dd></div>
              </dl>
              <button type="button" onClick={() => setSel("assembly")} className="mt-3 text-[11px] text-brand-orange hover:underline">← back to the typical assembly</button>
            </>
          ) : (
            <>
              <h3 className="text-sm font-semibold text-graphite-50">Typical assembly</h3>
              <p className="mt-1 text-graphite-400">One bay: a 200 mm wall formed on both faces, soffit corner, deck panels on a mid beam, prop heads and props, tie rods with sleeves, cones and wing nuts, pins and wedges at the joints, two alignment walers. Concrete is not drawn.</p>
              <ul className="mt-2 space-y-1">{LEGEND.map(([c, t]) => <li key={t} className="flex items-center gap-2"><span className="inline-block size-3 rounded-sm" style={{ background: c }} />{t}</li>)}</ul>
              <p className="mt-2 text-graphite-500">Tie system on this project: {tieSystem}. Click any piece below to see it on its own.</p>
            </>
          )}
        </div>
      </div>
      {PART_GROUPS.map((g) => (
        <section key={g} className="mt-4">
          <h2 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-graphite-400">{g}</h2>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
            {PARTS.filter((p) => p.group === g).map((p) => (
              <button key={p.key} type="button" onClick={() => { setSel(p.key); window.scrollTo({ top: 0, behavior: "smooth" }); }}
                className={`overflow-hidden rounded-md border text-left ${sel === p.key ? "border-brand-orange" : "border-graphite-800 hover:border-graphite-600"} bg-graphite-900`}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={`/parts/${p.key}.png`} alt={p.name} className="aspect-[4/3] w-full bg-[#f4f5f7] object-contain" loading="lazy" />
                <span className="block px-2 pt-1 text-[11px] font-medium text-graphite-100">{p.name}</span>
                <span className="block px-2 pb-1.5 text-[10px] text-graphite-500">{qty[p.key] ? `${qty[p.key].toLocaleString("en-IN")} nos on this project` : p.size}</span>
              </button>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
