"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createRevision } from "../revision-actions";

type Props = { quotationId: string; isQuick: boolean; currentArea: number | null };

export function ReviseButton({ quotationId, isQuick, currentArea }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reprice, setReprice] = useState(false);
  const [area, setArea] = useState(currentArea != null ? String(currentArea) : "");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function submit() {
    setError(null);
    startTransition(async () => {
      const areaArg = isQuick && area !== String(currentArea ?? "") ? area : undefined;
      const result = await createRevision(quotationId, reprice, areaArg);
      if (!result.success || !result.data) setError(result.error ?? "Could not create revision.");
      else router.push(`/quotations/${result.data.id}`);
    });
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-md border border-signal-amber/40 bg-signal-amber/10 px-4 py-2 text-sm text-signal-amber transition-colors hover:bg-signal-amber/20"
      >
        Create revision
      </button>
    );
  }

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-graphite-700 bg-graphite-900 p-4">
      <p className="text-sm text-graphite-200">
        This copies the quotation into a new draft revision. This version will be marked <span className="text-graphite-400">superseded</span>.
      </p>
      {error && <p className="rounded-md border border-signal-red/30 bg-signal-red/10 px-3 py-2 text-xs text-signal-red">{error}</p>}
      <label className="flex items-center gap-2 text-sm text-graphite-300">
        <input type="checkbox" checked={reprice} onChange={(e) => setReprice(e.target.checked)} className="accent-signal-amber" />
        Re-price at today&apos;s rates {isQuick ? "(quick-quote rate)" : "(active rate card, for panel lines)"}
      </label>
      {isQuick && (
        <label className="flex items-center gap-3 text-sm text-graphite-300">
          New area (sqm)
          <input
            type="number" min="0" step="any" value={area} onChange={(e) => setArea(e.target.value)}
            className="w-32 rounded-md border border-graphite-700 bg-graphite-800 px-3 py-1.5 text-right font-mono text-sm text-graphite-100 focus:border-signal-amber focus:outline-none"
          />
        </label>
      )}
      <div className="flex gap-2">
        <button type="button" onClick={submit} disabled={isPending}
          className="rounded-md bg-aluminium-300 px-4 py-2 text-sm font-medium text-graphite-950 hover:opacity-90 disabled:opacity-40">
          {isPending ? "Creating…" : "Create revision"}
        </button>
        <button type="button" onClick={() => setOpen(false)} disabled={isPending}
          className="rounded-md px-4 py-2 text-sm text-graphite-400 hover:text-graphite-200">
          Cancel
        </button>
      </div>
    </div>
  );
}
