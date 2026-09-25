"use client";

import { useTransition } from "react";
import { removeQuotationLine } from "../actions";

export function RemoveLineButton({ lineId, quotationId }: { lineId: string; quotationId: string }) {
  const [isPending, startTransition] = useTransition();
  return (
    <button
      onClick={() => startTransition(async () => { await removeQuotationLine(lineId, quotationId); })}
      disabled={isPending}
      className="text-xs text-graphite-600 transition-colors hover:text-signal-red disabled:opacity-40"
      aria-label="Remove line"
    >
      {isPending ? "…" : "✕"}
    </button>
  );
}
