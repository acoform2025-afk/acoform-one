"use client";

import { useState } from "react";
import { DEFAULT_PK, normalisePk, type PkRules, type PropGroup } from "@/lib/design-engine/layout-rules";

const input = "rounded-md border border-graphite-700 bg-graphite-900 px-3 py-2 text-sm text-graphite-100 focus:border-signal-amber focus:outline-none disabled:opacity-60";
const lbl = "text-xs font-medium uppercase tracking-wide text-graphite-400";
const arrow = (a: number[]) => a.join(" → ");
const parse = (s: string) => s.split(/[\s,;>\-→]+/).map(Number).filter((n) => Number.isFinite(n) && n > 0);

type NumKey = { [K in keyof PkRules]: PkRules[K] extends number ? K : never }[keyof PkRules];
type ListKey = { [K in keyof PkRules]: PkRules[K] extends number[] ? K : never }[keyof PkRules];
type BoolKey = { [K in keyof PkRules]: PkRules[K] extends boolean ? K : never }[keyof PkRules];

/** Detailed beam + wall rules (as in the "one-key panel layout" window of PKPM-LMB): priority lists, back-ribs, K-plates, props. */
export function PkRulesPanel({ pk, onChange, canEdit }: { pk: PkRules; onChange: (p: PkRules) => void; canEdit: boolean }) {
  const [tab, setTab] = useState<"beam" | "slab" | "wall">("beam");
  const [msg, setMsg] = useState("");
  const set = <K extends keyof PkRules>(k: K, val: PkRules[K]) => onChange({ ...pk, [k]: val });
  const n = (k: NumKey, label: string, hint = "") => (
    <label className="flex flex-col gap-1.5"><span className={lbl}>{label} <span className="normal-case text-graphite-600">{hint}</span></span>
      <input type="number" value={pk[k]} disabled={!canEdit} onChange={(e) => set(k, Number(e.target.value) as never)} className={input} /></label>
  );
  const l = (k: ListKey, label: string, hint = "(mm, first is tried first)") => (
    <label className="flex flex-col gap-1.5"><span className={lbl}>{label} <span className="normal-case text-graphite-600">{hint}</span></span>
      <input defaultValue={arrow(pk[k])} key={arrow(pk[k])} disabled={!canEdit} onBlur={(e) => { const a = parse(e.target.value); if (a.length) set(k, a as never); }} className={input} /></label>
  );
  const c = (k: BoolKey, label: string) => (
    <label className="flex items-center gap-2 text-sm text-graphite-200">
      <input type="checkbox" checked={pk[k]} disabled={!canEdit} onChange={(e) => set(k, e.target.checked as never)} className="accent-signal-amber" />{label}</label>
  );
  const setGroup = (i: number, g: Partial<PropGroup>) => set("propGroups", pk.propGroups.map((x, j) => (j === i ? { ...x, ...g } : x)));

  const exportFile = () => {
    const blob = new Blob([JSON.stringify(pk, null, 2)], { type: "application/json" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "acoform-detailed-rules.json"; a.click();
    setMsg("Rules file saved to your Downloads.");
  };
  const importFile = async (f: File | undefined) => {
    if (!f) return;
    try { onChange(normalisePk({ ...JSON.parse(await f.text()), enabled: true })); setMsg("Rules loaded. Press Save layout rules to keep them."); } catch { setMsg("That file could not be read."); }
  };

  return (
    <div className="mt-6 rounded-lg border border-graphite-800 bg-graphite-950 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-medium text-graphite-100">Detailed rules — beam, slab and wall</h3>
          <p className="text-xs text-graphite-500">Panel sizes are tried in the order shown (first one that fits is used). Values are the starting point from the PKPM video; change them to ACOFORM's own sizes.</p>
        </div>
        <div className="flex gap-2">
          <label className="cursor-pointer rounded-md border border-graphite-700 px-3 py-1.5 text-xs text-graphite-200 hover:border-graphite-500">Import<input type="file" accept=".json" className="hidden" disabled={!canEdit} onChange={(e) => importFile(e.target.files?.[0])} /></label>
          <button type="button" onClick={exportFile} className="rounded-md border border-graphite-700 px-3 py-1.5 text-xs text-graphite-200 hover:border-graphite-500">Export</button>
          <button type="button" disabled={!canEdit} onClick={() => onChange({ ...DEFAULT_PK, enabled: pk.enabled })} className="rounded-md border border-graphite-700 px-3 py-1.5 text-xs text-graphite-200 hover:border-graphite-500">Reset</button>
        </div>
      </div>
      {msg && <p className="mt-2 text-xs text-signal-amber">{msg}</p>}
      <div className="mt-3">{c("enabled", "Use these detailed rules in layouts and lists (off = simple rules above only)")}</div>

      <div className="mt-4 flex gap-1 border-b border-graphite-800">
        {(["beam", "slab", "wall"] as const).map((t) => (
          <button key={t} type="button" onClick={() => setTab(t)} className={`px-4 py-2 text-sm ${tab === t ? "border-b-2 border-signal-amber text-graphite-100" : "text-graphite-400"}`}>{t === "beam" ? "Beam" : t === "slab" ? "Slab" : "Wall"}</button>
        ))}
      </div>

      {tab === "beam" && (
        <div className="mt-4 space-y-5">
          <section>
            <h4 className="text-xs font-semibold uppercase tracking-wide text-brand-orange">Beam side</h4>
            <div className="mt-2 grid gap-4 md:grid-cols-3">
              {n("beamTallVertMm", "Beam taller than → panels vertical", "(mm)")}
              {l("beamSideWidths", "Side panel width priority")}
              {l("beamSideLens", "Side panel length priority")}
              {n("beamMinSplit", "Min split width", "(mm)")}
              {l("beamSplitWidths", "Cross split width priority")}
              {n("beamKWidth", "K-plate width", "(mm)")}
              {l("beamKLens", "K-plate length priority")}
              {l("beamRibLens", "Straight back-rib length priority")}
              {n("beamRibWidth", "Back-rib width", "(mm)")}
              {n("beamRibFromBeam", "Back-rib position from beam", "(mm)")}
              {n("beamRib2Height", "2nd back-rib beam-side height", "(mm)")}
              {n("beamRib2From", "2nd back-rib position from beam", "(mm)")}
              {n("beamRibTie", "Back-rib tie-rod spacing", "(mm)")}
            </div>
            <div className="mt-3">{c("beamKUpturn50", "K-plate upturn 50 mm")}</div>
          </section>
          <section>
            <h4 className="text-xs font-semibold uppercase tracking-wide text-brand-orange">Beam bottom</h4>
            <div className="mt-2 grid gap-4 md:grid-cols-3">
              {n("beamCornerWidth", "Inside-corner width", "(mm)")}
              {n("beamCornerOut", "Inside-corner extension, no member", "(mm, 50 or 65)")}
              <label className="flex flex-col gap-1.5"><span className={lbl}>Bottom panels</span>
                <select value={pk.beamBottomMode} disabled={!canEdit} onChange={(e) => set("beamBottomMode", e.target.value as PkRules["beamBottomMode"])} className={input}>
                  <option value="auto">Automatic</option><option value="slab">Use slab (P) panel</option><option value="wall">Use wall panel</option></select></label>
              {l("beamBottomLens", "Bottom panel length priority")}
              {n("beamBottomMin", "Min bottom panel length", "(mm)")}
              <label className="flex flex-col gap-1.5"><span className={lbl}>Prop spread</span>
                <select value={pk.propSpread} disabled={!canEdit} onChange={(e) => set("propSpread", e.target.value as PkRules["propSpread"])} className={input}>
                  <option value="even">Spread evenly</option><option value="multiple100">100-multiple, remainder at the end</option><option value="maxlen">Longest bottom panel</option></select></label>
            </div>
            <p className="mt-3 text-xs text-graphite-400">Beam support block (support head under every beam bottom plate, wingless plates, cover plates)</p>
            <div className="mt-1 grid gap-3 md:grid-cols-3">
              <div className="flex flex-col gap-2">{c("beamHeads", "Support head (LC) under every beam bottom plate")}{c("beamWingless", "Beam bottom plates wingless (LDD)")}{c("beamCover", "Cover plate (GBB) and cover head (GC) with each plate")}</div>
              {n("beamHeadW", "Head width along the beam", "(mm)")}
              {n("beamHeadSide", "Head length = beam width minus", "(mm)")}
              {n("beamCoverHeadW", "Cover head width", "(mm)")}{n("beamBulkheads", "Soffit bulkheads (SB) per beam — open ends", "(0–2)")}
            </div>
            <p className="mt-3 text-xs text-graphite-400">Beam-bottom props, by beam width</p>
            <div className="mt-1 grid gap-3 md:grid-cols-3">
              {pk.propGroups.map((g, i) => (
                <div key={i} className="rounded-md border border-graphite-800 p-3">
                  <p className="text-xs text-graphite-300">Group {i + 1}</p>
                  <div className="mt-2 grid grid-cols-3 gap-2 text-[11px] text-graphite-500">
                    <label>Beam ≤<input type="number" value={g.maxBeamW} disabled={!canEdit} onChange={(e) => setGroup(i, { maxBeamW: Number(e.target.value) })} className={`${input} mt-1 w-full`} /></label>
                    <label>Extend<input type="number" value={g.extend} disabled={!canEdit} onChange={(e) => setGroup(i, { extend: Number(e.target.value) })} className={`${input} mt-1 w-full`} /></label>
                    <label>Width<input type="number" value={g.width} disabled={!canEdit} onChange={(e) => setGroup(i, { width: Number(e.target.value) })} className={`${input} mt-1 w-full`} /></label>
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-3 grid gap-2 md:grid-cols-2">
              {c("beamAutoProps", "Auto-generate beam-bottom props")}
              {c("beamAutoRib", "Auto-generate beam back-ribs")}
              {c("beamTiePlate", "Beam tie-plate panels")}
              {c("beamUseSupport", "Use beam-bottom support")}
              {c("beam200250Support", "Beam-bottom support when beam is 200 / 250 wide")}
            </div>
          </section>
        </div>
      )}

      {tab === "slab" && (
        <div className="mt-4 space-y-5">
          <section>
            <h4 className="text-xs font-semibold uppercase tracking-wide text-brand-orange">Slab corner (soffit corner)</h4>
            <div className="mt-2 grid gap-4 md:grid-cols-3">
              {n("slabCornerWidth", "Corner width", "(mm)")}
              {l("slabCornerLens", "Corner length priority")}
              {n("slabInnerCornerLen", "Inside turning corner length", "(mm)")}
              {n("slabCornerMin", "Corner min length", "(mm)")}
            </div>
          </section>
          <section>
            <h4 className="text-xs font-semibold uppercase tracking-wide text-brand-orange">Deck panels</h4>
            <div className="mt-2 grid gap-4 md:grid-cols-3">
              {l("slabPanelWidths", "Panel width priority")}
              {l("slabPanelLens", "Panel length priority")}
              {n("slabPanelMinW", "Panel min width", "(mm)")}
              {n("slabPanelMinL", "Panel min length", "(mm)")}
              {n("slabFirstLen", "First panel length", "(mm)")}
              {n("slabRemainEvenAt", "Remainder of", "(mm or more: split evenly)")}
              {n("slabRemainCrossAt", "Remainder of", "(mm or more: lay panels across)")}
            </div>
            <div className="mt-3">{c("slabFirstEqLast", "First panel as long as the last one")}</div>
          </section>
          <section>
            <h4 className="text-xs font-semibold uppercase tracking-wide text-brand-orange">Joists (keels)</h4>
            <div className="mt-2 grid gap-4 md:grid-cols-3">
              {l("joistMidLens", "Middle joist length priority")}
              {n("joistEdgeMin", "Edge joist min length", "(mm)")}
              {n("joistEdgeMax", "Edge joist max length", "(mm)")}
              {l("joistEdgeLens", "Edge joist length priority", "(used when ticked below)")}
              {n("joistMaxDiff", "Max difference between the two edge joists", "(mm)")}
              <label className="flex flex-col gap-1.5"><span className={lbl}>Slab panel direction</span>
                <select value={pk.slabDirection} disabled={!canEdit} onChange={(e) => set("slabDirection", e.target.value as PkRules["slabDirection"])} className={input}>
                  <option value="auto">Automatic</option><option value="across">Across (横向)</option><option value="along">Along (纵向)</option></select></label>
              <label className="flex flex-col gap-1.5"><span className={lbl}>Left-over strip of a deck row</span>
                <select value={pk.slabStrip} disabled={!canEdit} onChange={(e) => set("slabStrip", e.target.value as PkRules["slabStrip"])} className={input}>
                  <option value="end">At one end (default)</option><option value="edges">Split to both edges</option><option value="middle">In the middle</option></select></label>
            </div>
            <div className="mt-3 grid gap-2 md:grid-cols-2">
              {c("joistEdgeLensOn", "Use the edge joist length priority")}
              {c("joistUneven", "Joists not evenly spaced (default) — off: evenly spaced")}
              {c("autoSlabProps", "Auto-generate slab-bottom props")}
            </div>
          </section>
        </div>
      )}

      {tab === "wall" && (
        <div className="mt-4 space-y-5">
          <section>
            <h4 className="text-xs font-semibold uppercase tracking-wide text-brand-orange">Switches</h4>
            <div className="mt-2 grid gap-2 md:grid-cols-3">
              {c("wallAutoTie", "Auto opposite tie-rod")}
              {c("wallAutoRib", "Auto back-rib")}
              {c("wallAutoBrace", "Auto diagonal brace")}
              {c("wallPanelWithAngle", "Wall panel and corner angle in one")}
              {c("wallTiePlate", "Tie-plate panels")}
              {c("extWallUpturn50", "External wall upturn 50 mm")}
              {c("tubeStagger", "Stagger square tubes floor to floor")}
            </div>
          </section>
          <section>
            <h4 className="text-xs font-semibold uppercase tracking-wide text-brand-orange">Sizes</h4>
            <div className="mt-2 grid gap-4 md:grid-cols-3">
              {n("wallPanelWidth", "Standard panel width", "(mm)")}
              {l("wallWidthPriority", "Wall panel width priority — inside faces")}
              {c("wallOutSame", "Outside faces use the same widths")}
              {!pk.wallOutSame && l("wallWidthPriorityOut", "Wall panel width priority — outside faces")}
              {n("clampMinGap", "Min gap of square-tube clamp", "(mm)")}
              {n("bottomAngle", "Bottom angle height", "(mm)")}
              {n("sunkAngle", "Sunk-slab bottom angle height", "(mm)")}
              {n("insideFromFloor", "Wall inside distance from floor", "(mm)")}
              {n("sunkC", "Sunk-slab embedded C length", "(mm)")}
              {n("cornerFloorGap", "Inside-column chamfer clearance from floor", "(mm)")}
              {n("wallKHeight", "K-plate height", "(mm)")}
              {n("wallKMin", "K-plate min length", "(mm)")}
              {l("wallKLens", "K-plate length priority")}
            </div>
          </section>
          <section>
            <h4 className="text-xs font-semibold uppercase tracking-wide text-brand-orange">Back-ribs and square tubes</h4>
            <div className="mt-2 grid gap-4 md:grid-cols-3">
              {l("ribHeights", "Back-rib centre heights", "(mm from floor)")}
              {l("tubeHeights", "Square-tube centre heights", "(mm from floor)")}
              {n("ribWidth", "Back-rib width", "(mm)")}
              {n("rib45Width", "4th / 5th back-rib width", "(mm)")}
              {n("tubeWidth", "Square-tube width", "(mm)")}
              {n("ribMax", "Max back-rib length", "(mm)")}
              {n("tubeMax", "Max square-tube length", "(mm)")}
              {n("ribGap", "Back-rib break gap", "(mm)")}
              {n("ribEndExt", "Back-rib extension at wall-column end", "(mm)")}
              {n("angleExt", "Back-rib angle-steel extension", "(mm)")}
              {n("diagExt", "Back-rib diagonal-cut extension", "(mm)")}
              {n("uClip", "U-clip length", "(mm)")}
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
