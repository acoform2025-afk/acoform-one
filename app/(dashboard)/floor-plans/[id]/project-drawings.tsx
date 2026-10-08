"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Layers, Loader2, RefreshCw } from "lucide-react";
import type { ProjectFacts } from "@/lib/floor-plans/project-facts";
import { readProjectDrawings } from "../actions";

/**
 * The project's other drawings and what this plan takes from each (section → floor height and slab, level list,
 * beam schedule …), with the points where the drawings disagree. Drawings not read for the project yet are read
 * here once, in the background.
 */
export function ProjectDrawings({ id, project, pending, canEdit }: { id: string; project: ProjectFacts | null; pending: boolean; canEdit: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const tried = useRef(false);
  const run = async () => {
    setBusy(true); setErr(null);
    const r = await readProjectDrawings(id);
    setBusy(false);
    if (r.error) setErr(r.error); else if (r.data?.read) { tried.current = false; router.refresh(); }   // more may be left: read on
  };
  useEffect(() => { if (pending && canEdit && !tried.current) { tried.current = true; void run(); } }, [pending, canEdit, project?.missing.length]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!project && !pending) return null;
  const used = project?.drawings.filter((d) => d.gave.length) ?? [];
  return (
    <div className="mt-3 rounded-lg border border-graphite-800 bg-graphite-900 px-4 py-3 text-xs">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 font-medium text-graphite-100"><Layers className="size-3.5 text-brand-orange" />Other drawings of this project ({project?.drawings.length ?? 0})</p>
        {busy ? <span className="inline-flex items-center gap-1 text-graphite-400"><Loader2 className="size-3.5 animate-spin" />Reading the project drawings…</span>
          : canEdit && project?.missing.length ? <button type="button" onClick={run} className="inline-flex items-center gap-1 text-graphite-300 underline hover:text-graphite-100"><RefreshCw className="size-3" />Read them</button> : null}
      </div>
      {project ? (
        <ul className="mt-2 space-y-1 text-graphite-300">
          {project.drawings.map((d) => (
            <li key={d.id}>
              <a href={`/floor-plans/${d.id}`} className="text-graphite-100 hover:underline">{d.name}</a>
              <span className="text-graphite-500"> — {d.what}</span>
              {d.gave.length ? <span className="text-signal-green"> · used here: {d.gave.join("; ")}</span> : null}
            </li>
          ))}
        </ul>
      ) : null}
      {used.length ? <p className="mt-2 text-graphite-500">This plan uses them only where its own drawing says nothing. After a new drawing is added, use “Read drawing again” on this plan to take it in.</p> : null}
      {project?.conflicts.length ? (
        <div className="mt-2 rounded-md border border-signal-amber/40 bg-signal-amber/10 px-3 py-2 text-signal-amber">
          <p className="font-medium">The drawings disagree — ask the architect / structural engineer:</p>
          <ul className="mt-1 list-disc pl-4">{project.conflicts.map((c) => <li key={c}>{c}</li>)}</ul>
        </div>
      ) : null}
      {err ? <p className="mt-2 text-signal-red">{err}</p> : null}
    </div>
  );
}
