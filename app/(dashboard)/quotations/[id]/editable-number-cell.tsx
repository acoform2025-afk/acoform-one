"use client";

import { useState, useTransition } from "react";
import { updateExtraLineRate, updateLineQuantity } from "../line-actions";
import { formatQty } from "@/lib/quotations/line-types";

type Props = {
  lineId: string;
  quotationId: string;
  field: "quantity" | "rate";
  value: number | string;
  editable: boolean;
};

/** Click-to-edit number cell for line quantity or (extra lines only) rate. */
export function EditableNumberCell({ lineId, quotationId, field, value, editable }: Props) {
  const display = field === "quantity" ? formatQty(value) : Number(value).toFixed(2);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(String(Number(value)));
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  if (!editable) return <span>{display}</span>;

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => { setDraft(String(Number(value))); setEditing(true); setError(null); }}
        className="rounded px-1 underline decoration-dotted decoration-graphite-600 underline-offset-4 hover:text-signal-amber"
        title="Click to edit"
      >
        {display}
      </button>
    );
  }

  function save() {
    if (draft === String(Number(value))) { setEditing(false); return; }
    startTransition(async () => {
      const result = field === "quantity"
        ? await updateLineQuantity(lineId, quotationId, draft)
        : await updateExtraLineRate(lineId, quotationId, draft);
      if (!result.success) setError(result.error ?? "Could not save.");
      else setEditing(false);
    });
  }

  return (
    <span className="inline-flex flex-col items-end gap-1">
      <input
        type="number"
        min="0"
        step="any"
        autoFocus
        value={draft}
        disabled={isPending}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={save}
        onKeyDown={(e) => {
          if (e.key === "Enter") { e.preventDefault(); save(); }
          if (e.key === "Escape") setEditing(false);
        }}
        className="w-24 rounded border border-signal-amber bg-graphite-800 px-2 py-1 text-right font-mono text-xs text-graphite-100 focus:outline-none"
      />
      {error && <span className="text-[10px] text-signal-red">{error}</span>}
    </span>
  );
}
