import { Field, SelectField } from "@/components/field";

export const PROJECT_TYPES = [
  { value: "residential", label: "Residential" },
  { value: "commercial", label: "Commercial" },
  { value: "industrial", label: "Industrial" },
  { value: "institutional", label: "Institutional" },
  { value: "other", label: "Other" },
];

export const SOURCE_CHANNELS = [
  { value: "referral", label: "Referral" },
  { value: "site_visit", label: "Site visit" },
  { value: "tender", label: "Tender" },
  { value: "website", label: "Website" },
  { value: "exhibition", label: "Exhibition" },
  { value: "cold_call", label: "Cold call" },
  { value: "other", label: "Other" },
];

export const FORMWORK_TYPES = [
  { value: "undecided", label: "Undecided" },
  { value: "monolithic", label: "Monolithic (walls + slab + beams together)" },
  { value: "vertical", label: "Vertical (walls/columns only, slab separate)" },
  { value: "mixed", label: "Mixed" },
];

export const LEAD_STATUSES = [
  { value: "new", label: "New" },
  { value: "contacted", label: "Contacted" },
  { value: "qualified", label: "Qualified" },
  { value: "quoted", label: "Quoted" },
  { value: "won", label: "Won" },
  { value: "lost", label: "Lost" },
];

export type LeadValues = {
  project_name: string | null; customer_name: string; company_name: string | null;
  contact_person_name: string | null; contact_phone: string | null; contact_email: string | null;
  gst_number: string | null; project_location: string | null; estimated_area_sqm: number | null;
  project_type: string | null; num_floors: number | null; num_repetitive_units: number | null;
  source_channel: string | null; expected_start_date: string | null; formwork_type: string | null;
};

const v = (x: string | number | null | undefined) => (x == null ? undefined : String(x));

/** The shared lead fields, used by both "New lead" and "Edit lead". */
export function LeadFields({ lead }: { lead?: LeadValues }) {
  return (
    <>
      <p className="mb-2 text-xs font-medium uppercase tracking-wide text-graphite-500">Identity</p>
      <div className="grid grid-cols-2 gap-4">
        <Field label="Project name" name="projectName" placeholder="e.g. Shivalik Heights, Tower A" defaultValue={v(lead?.project_name ?? lead?.customer_name)} />
        <Field label="Company name" name="companyName" required={false} defaultValue={v(lead?.company_name)} />
        <Field label="Contact person" name="contactPersonName" required={false} defaultValue={v(lead?.contact_person_name)} />
        <Field label="Contact phone" name="contactPhone" required={false} defaultValue={v(lead?.contact_phone)} />
        <Field label="Contact email" name="contactEmail" type="email" required={false} defaultValue={v(lead?.contact_email)} />
        <Field label="GST number" name="gstNumber" required={false} defaultValue={v(lead?.gst_number)} />
      </div>

      <div className="my-4 h-px bg-graphite-800" />

      <p className="mb-2 text-xs font-medium uppercase tracking-wide text-graphite-500">Project</p>
      <div className="grid grid-cols-2 gap-4">
        <Field label="Project location" name="projectLocation" required={false} defaultValue={v(lead?.project_location)} />
        <SelectField label="Project type" name="projectType" options={PROJECT_TYPES} required={false} defaultValue={v(lead?.project_type) ?? ""} />
        <Field label="Estimated area (sqm)" name="estimatedAreaSqm" type="number" required={false} defaultValue={v(lead?.estimated_area_sqm)} />
        <Field label="Number of floors" name="numFloors" type="number" required={false} defaultValue={v(lead?.num_floors)} />
        <Field label="Repetitive units (e.g. flats)" name="numRepetitiveUnits" type="number" required={false} defaultValue={v(lead?.num_repetitive_units)} />
        <Field label="Expected start date" name="expectedStartDate" type="date" required={false} defaultValue={v(lead?.expected_start_date)} />
        <SelectField label="Formwork type" name="formworkType" options={FORMWORK_TYPES} required={false} defaultValue={v(lead?.formwork_type) ?? "undecided"} />
        <SelectField label="Source channel" name="sourceChannel" options={SOURCE_CHANNELS} required={false} defaultValue={v(lead?.source_channel) ?? ""} />
      </div>
    </>
  );
}
