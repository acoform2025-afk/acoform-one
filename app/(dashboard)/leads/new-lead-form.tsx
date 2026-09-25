"use client";

import { useState, useTransition, useRef } from "react";
import { createLead } from "./actions";
import { Field, SelectField } from "@/components/field";

const PROJECT_TYPES = [
  { value: "residential", label: "Residential" },
  { value: "commercial", label: "Commercial" },
  { value: "industrial", label: "Industrial" },
  { value: "institutional", label: "Institutional" },
  { value: "other", label: "Other" },
];

const SOURCE_CHANNELS = [
  { value: "referral", label: "Referral" },
  { value: "site_visit", label: "Site visit" },
  { value: "tender", label: "Tender" },
  { value: "website", label: "Website" },
  { value: "exhibition", label: "Exhibition" },
  { value: "cold_call", label: "Cold call" },
  { value: "other", label: "Other" },
];

const FORMWORK_TYPES = [
  { value: "undecided", label: "Undecided" },
  { value: "monolithic", label: "Monolithic (walls + slab + beams together)" },
  { value: "vertical", label: "Vertical (walls/columns only, slab separate)" },
  { value: "mixed", label: "Mixed" },
];

export function NewLeadForm({ canCreate }: { canCreate: boolean }) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  if (!canCreate) return null;

  async function handleSubmit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const result = await createLead(formData);
      if (!result.success) {
        setError(result.error ?? "Something went wrong.");
      } else {
        formRef.current?.reset();
        setIsOpen(false);
      }
    });
  }

  if (!isOpen) {
    return (
      <button onClick={() => setIsOpen(true)} className="rounded-md bg-aluminium-300 px-4 py-2 text-sm font-medium text-graphite-950 transition-opacity hover:opacity-90">
        + New lead
      </button>
    );
  }

  return (
    <form ref={formRef} action={handleSubmit} className="rounded-lg border border-graphite-800 bg-graphite-900 p-5">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-sm font-medium text-graphite-200">New lead</h2>
        <button type="button" onClick={() => setIsOpen(false)} className="text-xs text-graphite-500 hover:text-graphite-300">Cancel</button>
      </div>

      {error ? <p className="mb-4 rounded-md border border-signal-red/30 bg-signal-red/10 px-3.5 py-2.5 text-sm text-signal-red">{error}</p> : null}

      <p className="mb-2 text-xs font-medium uppercase tracking-wide text-graphite-500">Identity</p>
      <div className="grid grid-cols-2 gap-4">
        <Field label="Lead code" name="leadCode" placeholder="LD-2026-001" />
        <Field label="Customer / display name" name="customerName" />
        <Field label="Company name" name="companyName" required={false} />
        <Field label="Contact person" name="contactPersonName" required={false} />
        <Field label="Contact phone" name="contactPhone" required={false} />
        <Field label="Contact email" name="contactEmail" type="email" required={false} />
        <Field label="GST number" name="gstNumber" required={false} />
      </div>

      <div className="my-4 h-px bg-graphite-800" />

      <p className="mb-2 text-xs font-medium uppercase tracking-wide text-graphite-500">Project</p>
      <div className="grid grid-cols-2 gap-4">
        <Field label="Project location" name="projectLocation" required={false} />
        <SelectField label="Project type" name="projectType" options={PROJECT_TYPES} required={false} />
        <Field label="Estimated area (sqm)" name="estimatedAreaSqm" type="number" required={false} />
        <Field label="Number of floors" name="numFloors" type="number" required={false} />
        <Field label="Repetitive units (e.g. flats)" name="numRepetitiveUnits" type="number" required={false} />
        <Field label="Expected start date" name="expectedStartDate" type="date" required={false} />
        <SelectField label="Formwork type" name="formworkType" options={FORMWORK_TYPES} required={false} defaultValue="undecided" />
        <SelectField label="Source channel" name="sourceChannel" options={SOURCE_CHANNELS} required={false} />
      </div>

      <button type="submit" disabled={isPending} className="mt-5 rounded-md bg-aluminium-300 px-4 py-2 text-sm font-medium text-graphite-950 transition-opacity hover:opacity-90 disabled:opacity-50">
        {isPending ? "Saving…" : "Create lead"}
      </button>
    </form>
  );
}
