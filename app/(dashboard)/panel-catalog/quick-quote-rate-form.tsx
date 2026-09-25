"use client";

import { useState, useTransition } from "react";
import { updateQuickQuoteRate } from "./actions";

type Rate = {
  formwork_type: string;
  rate_per_sqm: number;
  effective_from: string;
};

export function QuickQuoteRateForm({
  formworkType,
  current,
}: {
  formworkType: "monolithic" | "vertical";
  current: Rate | null;
}) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  async function handleSubmit(formData: FormData) {
    setError(null);
    setSuccess(false);
    formData.set("formworkType", formworkType);
    startTransition(async () => {
      const result = await updateQuickQuoteRate(formData);
      if (!result.success) setError(result.error ?? "Failed.");
      else setSuccess(true);
    });
  }

  return (
    <form action={handleSubmit} className="rounded-lg border border-graphite-800 bg-graphite-900 p-4">
      <h3 className="mb-3 text-sm font-medium capitalize text-graphite-200">{formworkType}</h3>

      {error && (
        <p className="mb-3 rounded-md border border-signal-red/30 bg-signal-red/10 px-3 py-2 text-xs text-signal-red">
          {error}
        </p>
      )}
      {success && (
        <p className="mb-3 rounded-md border border-signal-green/30 bg-signal-green/10 px-3 py-2 text-xs text-signal-green">
          Rate updated.
        </p>
      )}

      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-1.5">
          <label className="text-xs uppercase tracking-wide text-graphite-400">
            Rate (₹ / sqm)
          </label>
          <input
            name="ratePerSqm"
            type="number"
            step="0.01"
            defaultValue={current?.rate_per_sqm ?? ""}
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
        <button
          type="submit"
          disabled={isPending}
          className="self-start rounded-md bg-aluminium-300 px-4 py-2 text-sm font-medium text-graphite-950 hover:opacity-90 disabled:opacity-50"
        >
          {isPending ? "Saving…" : "Update rate"}
        </button>
      </div>
    </form>
  );
}
