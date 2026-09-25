"use client";

import { useTransition, useState } from "react";
import { submitForApproval, approveQuotation, convertToProject } from "../actions";

type Props = { quotationId: string; status: string; canApprove: boolean; canConvert: boolean };

export function QuotationActions({ quotationId, status, canApprove, canConvert }: Props) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [showConvert, setShowConvert] = useState(false);

  function handleSubmit() {
    setError(null);
    startTransition(async () => {
      const result = await submitForApproval(quotationId);
      if (!result.success) setError(result.error ?? "Failed.");
    });
  }

  function handleApprove() {
    setError(null);
    startTransition(async () => {
      const result = await approveQuotation(quotationId);
      if (!result.success) setError(result.error ?? "Failed.");
    });
  }

  return (
    <div className="flex flex-col gap-3">
      {error && <p className="rounded-md border border-signal-red/30 bg-signal-red/10 px-3 py-2 text-xs text-signal-red">{error}</p>}
      <div className="flex flex-wrap gap-2">
        {status === "draft" && (
          <button onClick={handleSubmit} disabled={isPending} className="rounded-md border border-signal-amber/40 bg-signal-amber/10 px-4 py-2 text-sm text-signal-amber transition-colors hover:bg-signal-amber/20 disabled:opacity-40">
            {isPending ? "Submitting…" : "Submit for approval"}
          </button>
        )}
        {status === "pending_approval" && canApprove && (
          <button onClick={handleApprove} disabled={isPending} className="rounded-md border border-signal-green/40 bg-signal-green/10 px-4 py-2 text-sm text-signal-green transition-colors hover:bg-signal-green/20 disabled:opacity-40">
            {isPending ? "Approving…" : "Approve quotation"}
          </button>
        )}
        {status === "approved" && canConvert && (
          <button onClick={() => setShowConvert(true)} className="rounded-md bg-aluminium-300 px-4 py-2 text-sm font-medium text-graphite-950 transition-opacity hover:opacity-90">
            Convert to project →
          </button>
        )}
      </div>

      {showConvert && (
        <form action={async (fd) => { fd.set("quotationId", quotationId); await convertToProject(fd); }} className="mt-2 rounded-lg border border-graphite-700 bg-graphite-900 p-4">
          <h3 className="mb-3 text-sm font-medium text-graphite-200">Convert to project</h3>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs uppercase tracking-wide text-graphite-400">Project code</label>
              <input name="projectCode" required placeholder="PRJ-2026-001" className="rounded-md border border-graphite-700 bg-graphite-800 px-3 py-2 text-sm text-graphite-100 focus:border-signal-amber focus:outline-none" />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs uppercase tracking-wide text-graphite-400">Site address</label>
              <input name="siteAddress" placeholder="Site location" className="rounded-md border border-graphite-700 bg-graphite-800 px-3 py-2 text-sm text-graphite-100 focus:border-signal-amber focus:outline-none" />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs uppercase tracking-wide text-graphite-400">Start date</label>
              <input name="startDate" type="date" className="rounded-md border border-graphite-700 bg-graphite-800 px-3 py-2 text-sm text-graphite-100 focus:border-signal-amber focus:outline-none" />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs uppercase tracking-wide text-graphite-400">Target completion</label>
              <input name="targetCompletion" type="date" className="rounded-md border border-graphite-700 bg-graphite-800 px-3 py-2 text-sm text-graphite-100 focus:border-signal-amber focus:outline-none" />
            </div>
          </div>
          <div className="mt-3 flex gap-2">
            <button type="submit" className="rounded-md bg-aluminium-300 px-4 py-2 text-sm font-medium text-graphite-950 hover:opacity-90">Create project</button>
            <button type="button" onClick={() => setShowConvert(false)} className="rounded-md px-4 py-2 text-sm text-graphite-400 hover:text-graphite-200">Cancel</button>
          </div>
        </form>
      )}
    </div>
  );
}
