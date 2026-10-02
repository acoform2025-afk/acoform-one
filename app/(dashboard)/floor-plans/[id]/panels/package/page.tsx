import Link from "next/link";
import { notFound } from "next/navigation";
import { Download, FileText, Table2 } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { runPanels, type PanelQuery } from "@/lib/floor-plans/run-panels";
import { PRESETS } from "@/lib/design-engine/layout-rules";

export const metadata = { title: "Design package" };
export const dynamic = "force-dynamic";

type Item = { no: string; title: string; what: string; links: { label: string; href: string; kind: "pdf" | "xls" | "page" }[] };

export default async function PackagePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<PanelQuery & { areas?: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const q = await searchParams;
  const supabase = await createClient();
  const r = await runPanels(supabase, id, q);
  if (!r) notFound();
  const opt = r.opt;
  const qs = opt ? new URLSearchParams({ h: String(opt.stdHeight), kg: String(opt.kgPerM2), prop: String(opt.propSpacing) }).toString() : "";
  const areas = Math.max(1, Math.min(12, Number(q.areas) || 4));
  const back = <Link href={`/floor-plans/${id}/panels?${qs}`} className="text-xs text-graphite-500 hover:text-graphite-300">← Panel layout &amp; BOM</Link>;
  if (r.error) return <div className="fade-in">{back}<p className="mt-4 text-sm text-signal-amber">{r.error}</p></div>;
  const P = `/floor-plans/${id}`, L = (k: string) => `${P}/panels/package-files?file=${k}&areas=${areas}&${qs}`;
  const items: Item[] = [
    { no: "01", title: "Shell drawing", what: "Concrete outline of the typical floor with levels, beams, openings and the area statement.", links: [{ label: "Shell plan PDF", href: `${P}/shell-plan`, kind: "pdf" }, { label: "Area statement", href: `${P}/area-sheet`, kind: "pdf" }] },
    { no: "02", title: "Assembly (installation) drawings", what: "One plan per panel family: wall panels, corners & kickers, beams, deck panels with numbers, supports (prop heads and mid beams).", links: [{ label: "Assembly plans PDF", href: `${P}/panels/assembly?${qs}`, kind: "pdf" }, { label: "Deck installation PDF", href: `${P}/panels/installation?${qs}`, kind: "pdf" }, { label: "Wall / column / beam / stair modulation PDF", href: `${P}/panels/modulation?${qs}`, kind: "pdf" }, { label: "Panel numbering list", href: L("numbering"), kind: "xls" }, { label: "3D model (spin 360°)", href: `${P}/panels/3d?${qs}`, kind: "page" }] },
    { no: "03", title: "Main panel list by area", what: `Every panel type with its quantity in each area (${areas} areas) and in the whole floor, unit and total area, "standard" or "as per drawing".`, links: [{ label: "Main panel list", href: L("main"), kind: "xls" }] },
    { no: "04", title: "Special panels — production", what: "Made-to-size pieces with pin-hole pattern, stiffeners, cutting list and weight.", links: [{ label: "Production drawings PDF", href: `${P}/panels/fabrication?${qs}`, kind: "pdf" }, { label: "Production order", href: L("production"), kind: "xls" }] },
    { no: "05", title: "Walers / back stiffeners", what: "One per tie row on each wall face, cut to the face length (max 6 m).", links: [{ label: "Walers list", href: L("walers"), kind: "xls" }] },
    { no: "06", title: "Staircase formwork", what: "Soffit, riser, stringer and landing panels (in the main list) and the staircase modulation sheets.", links: [{ label: "Modulation PDF (stairs sheets)", href: `${P}/panels/modulation?${qs}`, kind: "pdf" }] },
    { no: "07", title: "Drop formwork (sunk slabs)", what: "Edge plates round toilets / balconies read from sunk-slab layers, with square tubes — in the main list and the accessories.", links: [{ label: "Main panel list", href: L("main"), kind: "xls" }] },
    { no: "08", title: "Accessories & support-head sets", what: "Pins, wedges, ties, sleeves, walers, props, prop heads (sets 2 and 3 when props stay up), with the loss % of the layout rules.", links: [{ label: "Accessories list", href: L("accessories"), kind: "xls" }] },
    { no: "09", title: "Packing list by zone", what: "One bundle per room: its deck panels and the wall panels around it.", links: [{ label: "Packing list", href: L("packing"), kind: "xls" }] },
    { no: "10", title: "Design check", what: "Clashes, narrow gaps, panels on walls / beams, uncovered slab, pin-hole problems.", links: [{ label: "Check page", href: `${P}/panels/check?${qs}`, kind: "page" }, { label: "Check list", href: L("check"), kind: "xls" }] },
    { no: "11", title: "Panel QR labels", what: "One label per panel for a thermal label printer: code, size, panel number and bundle; scanning the QR opens the panel in the app. Print by family, bundle or range.", links: [] },
  ];
  return (
    <div className="fade-in max-w-5xl">
      {back}
      <div className="mt-2 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-graphite-50">Design package</h1>
          <p className="mt-1 max-w-3xl text-sm text-graphite-400">Everything the factory and the site need for <b>{r.plan.name}</b>, in the order of a professional formwork design package. Formwork system: <b className="text-graphite-200">{r.layoutRules ? PRESETS[r.layoutRules.system].label : "—"}</b>.</p>
        </div>
        <a href={L("all")} className="inline-flex items-center gap-1.5 rounded-md bg-brand-orange px-3 py-2 text-xs font-medium text-white hover:opacity-90"><Download className="size-3.5" />All Excel lists (ZIP)</a>
      </div>
      <form className="mt-3 flex items-end gap-2 text-xs">
        {opt ? <><input type="hidden" name="h" value={opt.stdHeight} /><input type="hidden" name="kg" value={opt.kgPerM2} /><input type="hidden" name="prop" value={opt.propSpacing} /></> : null}
        <label className="flex flex-col gap-1"><span className="uppercase tracking-wide text-graphite-500">Areas (flats / wings) in the main list</span>
          <input name="areas" type="number" min={1} max={12} defaultValue={areas} className="w-28 rounded border border-graphite-700 bg-graphite-950 px-2 py-1 text-sm text-graphite-100" /></label>
        <button className="rounded-md border border-graphite-700 px-3 py-1.5 text-graphite-100 hover:bg-graphite-800">Apply</button>
      </form>
      <ol className="mt-4 space-y-2">
        {items.map((it) => (
          <li key={it.no} className="rounded-lg border border-graphite-800 bg-graphite-900 p-3">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="max-w-2xl">
                <p className="text-sm font-medium text-graphite-100"><span className="mr-2 font-mono text-brand-orange">{it.no}</span>{it.title}</p>
                <p className="mt-0.5 text-xs text-graphite-400">{it.what}</p>
              </div>
              {it.no === "11" ? (
                <form action={`${P}/panels/labels`} method="get" target="_blank" className="flex flex-wrap items-end gap-1.5 text-xs">
                  {opt ? <><input type="hidden" name="h" value={opt.stdHeight} /><input type="hidden" name="kg" value={opt.kgPerM2} /><input type="hidden" name="prop" value={opt.propSpacing} /></> : null}
                  <label className="flex flex-col gap-0.5"><span className="text-graphite-500">Label</span>
                    <select name="size" defaultValue="100x50" className="rounded border border-graphite-700 bg-graphite-950 px-1.5 py-1 text-graphite-100"><option value="100x50">100 × 50 mm</option><option value="100x75">100 × 75 mm</option><option value="75x50">75 × 50 mm</option></select></label>
                  <label className="flex flex-col gap-0.5"><span className="text-graphite-500">Panels</span>
                    <select name="family" defaultValue="" className="rounded border border-graphite-700 bg-graphite-950 px-1.5 py-1 text-graphite-100">
                      <option value="">All</option><option value="wall">Wall panels</option><option value="wall-top">Wall tops</option><option value="deck">Deck panels</option><option value="column">Column panels</option><option value="beam">Beam panels</option><option value="corner">Corners</option><option value="end">Wall ends</option><option value="stair">Staircase</option><option value="filler,drop,upstand">Specials / drop / upstand</option>
                    </select></label>
                  <label className="flex flex-col gap-0.5"><span className="text-graphite-500">Bundle</span><input name="bundle" placeholder="e.g. M4" className="w-16 rounded border border-graphite-700 bg-graphite-950 px-1.5 py-1 text-graphite-100" /></label>
                  <label className="flex flex-col gap-0.5"><span className="text-graphite-500">From no.</span><input name="from" type="number" min={1} className="w-16 rounded border border-graphite-700 bg-graphite-950 px-1.5 py-1 text-graphite-100" /></label>
                  <label className="flex flex-col gap-0.5"><span className="text-graphite-500">To no.</span><input name="to" type="number" min={1} className="w-16 rounded border border-graphite-700 bg-graphite-950 px-1.5 py-1 text-graphite-100" /></label>
                  <button className="inline-flex items-center gap-1 rounded-md bg-brand-orange px-2.5 py-1.5 font-medium text-white hover:opacity-90"><FileText className="size-3.5" />Print labels PDF</button>
                </form>
              ) : null}
              <div className="flex flex-wrap gap-1.5">
                {it.links.map((l) => (
                  <a key={l.label + l.href} href={l.href} target={l.kind === "pdf" ? "_blank" : undefined} rel="noreferrer"
                    className="inline-flex items-center gap-1 rounded-md border border-graphite-700 px-2.5 py-1.5 text-xs text-graphite-200 hover:border-brand-orange">
                    {l.kind === "xls" ? <Table2 className="size-3.5" /> : <FileText className="size-3.5" />}{l.label}
                  </a>
                ))}
              </div>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
