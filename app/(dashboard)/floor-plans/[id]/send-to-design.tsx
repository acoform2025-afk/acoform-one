"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { Loader2 } from "lucide-react";
import { sendWallsToDesign } from "../actions";

export type DesignOption = { id: string; code: string; project: string };

/** Mivan / aluminium panel design hand-off: drawn walls → design walls → layout engine & BOM. */
export function SendToDesign({ planId, designs, wallSegments, dirty }: { planId: string; designs: DesignOption[]; wallSegments: number; dirty: boolean }) {
  const [designId, setDesignId] = useState(designs[0]?.id ?? "");
  const [thk, setThk] = useState("200");
  const [msg, setMsg] = useState<{ ok?: string; error?: string; href?: string } | null>(null);
  const [pending, start] = useTransition();

  function send() {
    setMsg(null);
    start(async () => {
      const r = await sendWallsToDesign(planId, designId, Number(thk));
      setMsg(r.error ? { error: r.error } : { ok: `${r.data?.count} walls added to the design.`, href: `/designs/${designId}` });
    });
  }

  return (
    <section className="rounded-lg border border-graphite-800 bg-graphite-900 p-3">
      <h3 className="text-sm font-medium text-graphite-100">Send walls to panel design</h3>
      <p className="mb-2 mt-0.5 text-[11px] text-graphite-500">
        Each straight segment drawn with the Wall tool becomes a design wall (length, clear height, thickness). Then run the layout engine in the design to get panels and the BOM.
      </p>
      {designs.length === 0 ? (
        <p className="text-xs text-graphite-500">No open design. Create one from a project under <Link href="/projects" className="text-brand-orange hover:underline">Projects &amp; designs</Link>.</p>
      ) : (
        <>
          <div className="grid grid-cols-[1fr_90px] gap-2">
            <select value={designId} onChange={(e) => setDesignId(e.target.value)} className="rounded border border-graphite-700 bg-graphite-950 px-2 py-1 text-sm text-graphite-100">
              {designs.map((d) => <option key={d.id} value={d.id}>{d.code} · {d.project}</option>)}
            </select>
            <label className="flex items-center gap-1 text-xs text-graphite-400">
              <input type="number" min={100} max={1000} value={thk} onChange={(e) => setThk(e.target.value)} className="w-full rounded border border-graphite-700 bg-graphite-950 px-2 py-1 text-sm text-graphite-100" />mm
            </label>
          </div>
          <button type="button" onClick={send} disabled={pending || dirty || wallSegments === 0 || !designId}
            className="mt-2 inline-flex w-full items-center justify-center gap-2 rounded-md border border-graphite-700 px-3 py-2 text-xs font-medium text-graphite-100 hover:bg-graphite-800 disabled:opacity-40">
            {pending ? <Loader2 className="size-3.5 animate-spin" /> : null}
            Send {wallSegments} wall segment{wallSegments === 1 ? "" : "s"} to design
          </button>
          {dirty ? <p className="mt-1 text-[11px] text-signal-amber">Save the measurements first.</p> : null}
        </>
      )}
      {msg?.error ? <p className="mt-2 text-xs text-signal-red">{msg.error}</p> : null}
      {msg?.ok ? <p className="mt-2 text-xs text-signal-green">{msg.ok} {msg.href ? <Link href={msg.href} className="underline">Open design</Link> : null}</p> : null}
    </section>
  );
}
