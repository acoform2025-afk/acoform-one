"use client";

import { useState, useTransition } from "react";
import { addExtraLine } from "../line-actions";
import {
  DESCRIPTION_SUGGESTIONS,
  EXTRA_LINE_TYPES,
  LINE_TYPE_LABELS,
  UNIT_OPTIONS,
  type ExtraLineType,
} from "@/lib/quotations/line-types";

const inputClass =
  "w-full rounded-md border border-graphite-700 bg-graphite-800 px-3 py-2 text-sm text-graphite-100 focus:border-signal-amber focus:outline-none";

export function ExtraLineForm({ quotationId }: { quotationId: string }) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [lineType, setLineType] = useState<ExtraLineType>("accessory");
  const [description, setDescription] = useState("");
  const [unit, setUnit] = useState(UNIT_OPTIONS.accessory[0]);
  const [qty, setQty] = useState("1");
  const [rate, setRate] = useState("");

  const preview = Number(qty) > 0 && Number(rate) >= 0 && rate !== "" ? Number(qty) * Number(rate) : null;

  function changeType(t: ExtraLineType) {
    setLineType(t);
    setUnit(UNIT_OPTIONS[t][0]);
    setDescription("");
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const fd = new FormData();
    fd.set("quotationId", quotationId);
    fd.set("lineType", lineType);
    fd.set("description", description);
    fd.set("unit", unit);
    fd.set("quantity", qty);
    fd.set("unitRate", rate);
    startTransition(async () => {
      const result = await addExtraLine(fd);
      if (!result.success) {
        setError(result.error ?? "Could not add line.");
      } else {
        setDescription("");
        setQty("1");
        setRate("");
      }
    });
  }

  const listId = `extra-desc-${lineType}`;

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      <h3 className="text-xs font-medium uppercase tracking-wide text-graphite-400">Add accessory / transport / design line</h3>
      {error && (
        <p className="rounded-md border border-signal-red/30 bg-signal-red/10 px-3 py-2 text-xs text-signal-red">{error}</p>
      )}

      <div className="flex flex-wrap gap-2">
        {EXTRA_LINE_TYPES.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => changeType(t)}
            className={`rounded-full px-3 py-1 text-xs transition-colors ${
              lineType === t
                ? "bg-signal-amber/20 text-signal-amber"
                : "bg-graphite-800 text-graphite-400 hover:text-graphite-200"
            }`}
          >
            {LINE_TYPE_LABELS[t]}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-12 gap-3">
        <div className="col-span-12 md:col-span-5">
          <input
            list={listId}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Description"
            required
            maxLength={200}
            className={inputClass}
          />
          <datalist id={listId}>
            {DESCRIPTION_SUGGESTIONS[lineType].map((d) => (
              <option key={d} value={d} />
            ))}
          </datalist>
        </div>
        <div className="col-span-4 md:col-span-2">
          <select value={unit} onChange={(e) => setUnit(e.target.value)} className={inputClass} aria-label="Unit">
            {UNIT_OPTIONS[lineType].map((u) => (
              <option key={u} value={u}>{u}</option>
            ))}
          </select>
        </div>
        <div className="col-span-4 md:col-span-2">
          <input type="number" min="0" step="any" value={qty} onChange={(e) => setQty(e.target.value)} placeholder="Qty" required className={inputClass} aria-label="Quantity" />
        </div>
        <div className="col-span-4 md:col-span-2">
          <input type="number" min="0" step="0.01" value={rate} onChange={(e) => setRate(e.target.value)} placeholder="Rate ₹" required className={inputClass} aria-label="Rate" />
        </div>
        <div className="col-span-12 md:col-span-1">
          <button
            type="submit"
            disabled={isPending || !description.trim() || rate === ""}
            className="w-full rounded-md bg-aluminium-300 px-3 py-2 text-sm font-medium text-graphite-950 transition-opacity hover:opacity-90 disabled:opacity-40"
          >
            {isPending ? "…" : "Add"}
          </button>
        </div>
      </div>

      {preview != null && (
        <p className="text-xs text-graphite-500">
          Line total: <span className="font-mono text-graphite-300">₹ {preview.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
        </p>
      )}
    </form>
  );
}
