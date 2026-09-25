"use client";

import { useActionState } from "react";
import { saveCompanySettings } from "./actions";

type Tenant = Record<string, string | null>;

const input =
  "rounded-md border border-graphite-700 bg-graphite-900 px-3.5 py-2.5 text-sm text-graphite-100 focus:border-signal-amber focus:outline-none disabled:opacity-60";

function F({ name, label, t, disabled, wide }: { name: string; label: string; t: Tenant; disabled: boolean; wide?: boolean }) {
  return (
    <label className={`flex flex-col gap-1.5 ${wide ? "md:col-span-2" : ""}`}>
      <span className="text-xs font-medium uppercase tracking-wide text-graphite-400">{label}</span>
      <input name={name} defaultValue={t[name] ?? ""} disabled={disabled} className={input} />
    </label>
  );
}

export function CompanyForm({ tenant, canEdit }: { tenant: Tenant; canEdit: boolean }) {
  const [state, action, pending] = useActionState(saveCompanySettings, undefined);
  const d = !canEdit;
  return (
    <form action={action} className="flex flex-col gap-6">
      {state?.error && <p className="rounded-md border border-signal-red/30 bg-signal-red/10 px-3 py-2 text-sm text-signal-red">{state.error}</p>}
      {state?.ok && <p className="rounded-md border border-signal-green/30 bg-signal-green/10 px-3 py-2 text-sm text-signal-green">Saved.</p>}

      <section className="rounded-lg border border-graphite-800 bg-graphite-900 p-5">
        <h2 className="mb-4 text-sm font-medium text-graphite-200">Company (shown on quotations)</h2>
        <div className="grid gap-4 md:grid-cols-2">
          <F name="company_name" label="Company name" t={tenant} disabled={d} />
          <F name="gst_number" label="GSTIN" t={tenant} disabled={d} />
          <F name="company_address" label="Address" t={tenant} disabled={d} wide />
          <F name="company_phone" label="Phone" t={tenant} disabled={d} />
          <F name="company_website" label="Website" t={tenant} disabled={d} />
        </div>
      </section>

      <section className="rounded-lg border border-graphite-800 bg-graphite-900 p-5">
        <h2 className="mb-4 text-sm font-medium text-graphite-200">Bank details (shown on quotations)</h2>
        <div className="grid gap-4 md:grid-cols-2">
          <F name="bank_account_name" label="Account name" t={tenant} disabled={d} />
          <F name="bank_name" label="Bank" t={tenant} disabled={d} />
          <F name="bank_account_number" label="Account number" t={tenant} disabled={d} />
          <F name="bank_ifsc_code" label="IFSC" t={tenant} disabled={d} />
          <F name="bank_branch" label="Branch" t={tenant} disabled={d} wide />
        </div>
      </section>

      {canEdit ? (
        <div>
          <button disabled={pending} className="rounded-md bg-signal-amber px-5 py-2.5 text-sm font-semibold text-graphite-950 hover:opacity-90 disabled:opacity-50">
            {pending ? "Saving…" : "Save settings"}
          </button>
        </div>
      ) : (
        <p className="text-xs text-graphite-500">Only a Super Admin can change these settings.</p>
      )}
    </form>
  );
}
