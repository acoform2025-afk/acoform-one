"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { Images } from "lucide-react";
import { setShowReferences } from "../references-actions";

/** On/off switch for the PDF page with site photos + client logos (pictures are managed in Settings). */
export function ReferencesToggle({ quotationId, value, editable, photos, logos }: {
  quotationId: string; value: boolean; editable: boolean; photos: number; logos: number;
}) {
  const [on, setOn] = useState(value);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const empty = photos + logos === 0;

  function toggle() {
    const next = !on;
    setOn(next); setError(null);
    startTransition(async () => {
      const r = await setShowReferences(quotationId, next);
      if (r.error) { setOn(!next); setError(r.error); }
    });
  }

  return (
    <div className="mt-6 rounded-lg border border-graphite-800 bg-graphite-900 px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-start gap-2.5">
          <Images className="mt-0.5 size-4 shrink-0 text-graphite-500" />
          <div className="min-w-0">
            <p className="text-sm font-medium text-graphite-200">Site photos &amp; client logos page</p>
            <p className="text-xs text-graphite-500">
              {empty
                ? "No pictures added yet, so this page is not printed. "
                : `${photos} photo${photos === 1 ? "" : "s"} · ${logos} logo${logos === 1 ? "" : "s"} · ${on ? "printed on the PDF" : "left out of the PDF"}. `}
              <Link href="/settings#quotation-pictures" className="text-brand-orange hover:underline">Change pictures in Settings</Link>
            </p>
          </div>
        </div>
        <button
          type="button" role="switch" aria-checked={on} aria-label="Include site photos and client logos page in the PDF"
          onClick={toggle} disabled={!editable || isPending}
          title={editable ? undefined : "Locked — create a revision to change"}
          className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${on ? "bg-brand-orange" : "bg-graphite-700"}`}
        >
          <span className={`inline-block size-5 rounded-full bg-white shadow transition-transform ${on ? "translate-x-5" : "translate-x-0.5"}`} />
        </button>
      </div>
      {error ? <p className="mt-2 text-sm text-signal-red">{error}</p> : null}
    </div>
  );
}
