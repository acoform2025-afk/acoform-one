"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateLead } from "../actions";
import { SelectField } from "@/components/field";
import { LeadFields, LEAD_STATUSES, type LeadValues } from "../lead-fields";

type Lead = LeadValues & { id: string; lead_code: string; status: string; notes: string | null };

export function EditLeadForm({ lead, canEdit }: { lead: Lead; canEdit: boolean }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  function handleSubmit(formData: FormData) {
    setError(null);
    setSaved(false);
    startTransition(async () => {
      try {
        const result = await updateLead(lead.id, formData);
        if (!result.success) setError(result.error ?? "Something went wrong.");
        else { setSaved(true); router.refresh(); }
      } catch {
        setError("Could not reach the server. Please refresh the page and try again.");
      }
    });
  }

  return (
    <form action={handleSubmit} className="rounded-lg border border-graphite-800 bg-graphite-900 p-5">
      <fieldset disabled={!canEdit || isPending} className="contents">
        {error ? <p className="mb-4 rounded-md border border-signal-red/30 bg-signal-red/10 px-3.5 py-2.5 text-sm text-signal-red">{error}</p> : null}
        {saved ? <p className="mb-4 rounded-md border border-graphite-700 bg-graphite-800 px-3.5 py-2.5 text-sm text-graphite-200">Changes saved.</p> : null}

        <p className="mb-2 text-xs font-medium uppercase tracking-wide text-graphite-500">Status</p>
        <div className="grid grid-cols-2 gap-4">
          <SelectField label="Lead status" name="status" options={LEAD_STATUSES} defaultValue={lead.status} />
        </div>

        <div className="my-4 h-px bg-graphite-800" />

        <LeadFields lead={lead} />

        <div className="my-4 h-px bg-graphite-800" />

        <div className="flex flex-col gap-1.5">
          <label htmlFor="notes" className="text-xs font-medium uppercase tracking-wide text-graphite-400">Notes</label>
          <textarea id="notes" name="notes" rows={4} defaultValue={lead.notes ?? ""}
            className="rounded-md border border-graphite-700 bg-graphite-900 px-3.5 py-2.5 text-sm text-graphite-100 placeholder:text-graphite-600 focus:border-signal-amber focus:outline-none" />
        </div>

        {canEdit ? (
          <button type="submit" className="mt-5 rounded-md bg-aluminium-300 px-4 py-2 text-sm font-medium text-graphite-950 transition-opacity hover:opacity-90 disabled:opacity-50">
            {isPending ? "Saving…" : "Save changes"}
          </button>
        ) : null}
      </fieldset>
    </form>
  );
}
