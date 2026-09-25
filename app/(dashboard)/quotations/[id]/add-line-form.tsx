"use client";

import { useState, useTransition } from "react";
import { addQuotationLine } from "../actions";

type Panel = { id: string; panel_code: string; panel_category: string; width_mm: number; height_mm: number; weight_kg: number };

export function AddLineForm({ quotationId, panels }: { quotationId: string; panels: Panel[] }) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [selectedCode, setSelectedCode] = useState(panels[0]?.panel_code ?? "");
  const [qty, setQty] = useState("1");

  const selectedPanel = panels.find((p) => p.panel_code === selectedCode);
  const categories = Array.from(new Set(panels.map((p) => p.panel_category)));

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const formData = new FormData();
    formData.set("quotationId", quotationId);
    formData.set("panelCode", selectedCode);
    formData.set("quantity", qty);
    startTransition(async () => {
      const result = await addQuotationLine(formData);
      if (!result.success) setError(result.error ?? "Could not add line.");
      else setQty("1");
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      <h3 className="text-xs font-medium uppercase tracking-wide text-graphite-400">Add panel line</h3>
      {error && <p className="rounded-md border border-signal-red/30 bg-signal-red/10 px-3 py-2 text-xs text-signal-red">{error}</p>}
      <div className="flex gap-3">
        <div className="flex-1">
          <select value={selectedCode} onChange={(e) => setSelectedCode(e.target.value)} className="w-full rounded-md border border-graphite-700 bg-graphite-800 px-3 py-2 text-sm text-graphite-100 focus:border-signal-amber focus:outline-none">
            {categories.map((cat) => (
              <optgroup key={cat} label={cat.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}>
                {panels.filter((p) => p.panel_category === cat).map((p) => (
                  <option key={p.id} value={p.panel_code}>{p.panel_code} — {p.width_mm}×{p.height_mm}mm ({p.weight_kg} kg)</option>
                ))}
              </optgroup>
            ))}
          </select>
        </div>
        <div className="w-24">
          <input type="number" min="1" value={qty} onChange={(e) => setQty(e.target.value)} placeholder="Qty" className="w-full rounded-md border border-graphite-700 bg-graphite-800 px-3 py-2 text-sm text-graphite-100 focus:border-signal-amber focus:outline-none" />
        </div>
        <button type="submit" disabled={isPending || !selectedCode} className="rounded-md bg-aluminium-300 px-4 py-2 text-sm font-medium text-graphite-950 transition-opacity hover:opacity-90 disabled:opacity-40">
          {isPending ? "Adding…" : "Add"}
        </button>
      </div>
      {selectedPanel && (
        <p className="text-xs text-graphite-500">
          Area per panel: <span className="font-mono text-graphite-400">{((selectedPanel.width_mm / 1000) * (selectedPanel.height_mm / 1000)).toFixed(4)} m²</span>
          {" "}· Weight per panel: <span className="font-mono text-graphite-400">{selectedPanel.weight_kg} kg</span>
        </p>
      )}
    </form>
  );
}
