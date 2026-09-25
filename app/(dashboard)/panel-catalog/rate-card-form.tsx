"use client";

import { useState, useTransition } from "react";
import { updateRateCard } from "./actions";

type RateCard = {
  id: string;
  rate_name: string;
  rate_per_kg: number;
  effective_from: string;
};

export function RateCardForm({ current }: { current: RateCard | null }) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  async function handleSubmit(formData: FormData) {
    setError(null);
    setSuccess(false);
    startTransition(async () => {
      const result = await updateRateCard(formData);
      if (!result.success) setError(result.error ?? "Failed.");
      else setSuccess(true);
    });
  }

  return (
    <form action={handleSubmit} className="flex flex-col gap-4">
      {error && (
        <p className="rounded-md border border-signal-red/30 bg-signal-red/10 px-3 py-2 text-xs text-signal-red">
          {error}
        </p>
      )}
      {success && (
        <p className="rounded-md border border-signal-green/30 bg-signal-green/10 px-3 py-2 text-xs text-signal-green">
          Rate card updated.
        </p>
      )}

      <div className="grid grid-cols-3 gap-4">
        <div className="flex flex-col gap-1.5">
          <label className="text-xs uppercase tracking-wide text-graphite-400">
            Rate name
          </label>
          <input
            name="rateName"
            defaultValue={current?.rate_name ?? ""}
            placeholder="e.g. Standard FY2027"
            required
            className="rounded-md border border-graphite-700 bg-graphite-800 px-3 py-2 text-sm text-graphite-100 focus:border-signal-amber focus:outline-none"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-xs uppercase tracking-wide text-graphite-400">
            Rate (₹ / kg)
          </label>
          <input
            name="ratePerKg"
            type="number"
            step="0.01"
            defaultValue={current?.rate_per_kg ?? ""}
            placeholder="285.00"
            required
            className="rounded-md border border-graphite-700 bg-graphite-800 px-3 py-2 text-sm text-graphite-100 focus:border-signal-amber focus:outline-none"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-xs uppercase tracking-wide text-graphite-400">
            Effective from
          </label>
          <input
            name="effectiveFrom"
            type="date"
            defaultValue={new Date().toISOString().split("T")[0]}
            required
            className="rounded-md border border-graphite-700 bg-graphite-800 px-3 py-2 text-sm text-graphite-100 focus:border-signal-amber focus:outline-none"
          />
        </div>
      </div>

      <button
        type="submit"
        disabled={isPending}
        className="self-start rounded-md bg-aluminium-300 px-4 py-2 text-sm font-medium text-graphite-950 hover:opacity-90 disabled:opacity-50"
      >
        {isPending ? "Saving…" : "Set active rate"}
      </button>
    </form>
  );
}
