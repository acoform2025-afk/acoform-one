"use client";

import Link from "next/link";
import type { ColumnDef } from "@tanstack/react-table";
import { DataTable, type ColumnMeta } from "@/components/ui/data-table";
import { StatusBadge } from "@/components/ui/badge";
import { FORMWORK_TYPES, LEAD_STATUSES, PROJECT_TYPES } from "./lead-fields";

export type LeadRow = {
  id: string; lead_code: string; project_name: string | null; customer_name: string; company_name: string | null;
  contact_person_name: string | null; contact_phone: string | null; project_location: string | null;
  project_type: string | null; formwork_type: string | null; estimated_area_sqm: number | null;
  status: string; created_at: string;
};

const label = (list: { value: string; label: string }[], v: string | null) => list.find((o) => o.value === v)?.label ?? v ?? "—";
const shortLabel = (v: string | null) => (v ? v.charAt(0).toUpperCase() + v.slice(1) : "—");

const columns: ColumnDef<LeadRow, unknown>[] = [
  {
    accessorKey: "lead_code", header: "Lead no.", meta: { nowrap: true } satisfies ColumnMeta,
    cell: ({ row }) => <Link href={`/leads/${row.original.id}`} className="font-mono text-xs font-medium text-aluminium-300 hover:underline">{row.original.lead_code}</Link>,
  },
  {
    id: "project", header: "Project", accessorFn: (r) => r.project_name ?? r.customer_name,
    cell: ({ getValue }) => <span className="font-medium text-graphite-100">{getValue() as string}</span>,
  },
  { id: "company", header: "Company", accessorFn: (r) => r.company_name ?? "", cell: ({ getValue }) => (getValue() as string) || "—" },
  {
    id: "contact", header: "Contact", accessorFn: (r) => [r.contact_person_name, r.contact_phone].filter(Boolean).join(" · "),
    cell: ({ getValue }) => <span className="text-xs text-graphite-400">{(getValue() as string) || "—"}</span>,
  },
  { id: "location", header: "Location", accessorFn: (r) => r.project_location ?? "", cell: ({ getValue }) => <span className="text-graphite-400">{(getValue() as string) || "—"}</span> },
  {
    accessorKey: "project_type", header: "Type", filterFn: "equalsString",
    cell: ({ getValue }) => <span className="text-xs text-graphite-400">{label(PROJECT_TYPES, getValue() as string | null)}</span>,
  },
  {
    accessorKey: "formwork_type", header: "Formwork", filterFn: "equalsString",
    cell: ({ getValue }) => <span className="text-xs text-graphite-400">{shortLabel(getValue() as string | null)}</span>,
  },
  {
    accessorKey: "estimated_area_sqm", header: "Area (m²)", meta: { align: "right", nowrap: true } satisfies ColumnMeta,
    cell: ({ getValue }) => { const v = getValue() as number | null; return <span className="font-mono text-xs">{v != null ? Number(v).toLocaleString("en-IN") : "—"}</span>; },
  },
  { accessorKey: "status", header: "Status", filterFn: "equalsString", meta: { nowrap: true } satisfies ColumnMeta, cell: ({ getValue }) => <StatusBadge status={getValue() as string} /> },
  {
    accessorKey: "created_at", header: "Created",
    meta: { nowrap: true, exportValue: (r) => (r as LeadRow).created_at.slice(0, 10) } satisfies ColumnMeta,
    cell: ({ getValue }) => <span className="text-xs text-graphite-500">{new Date(getValue() as string).toLocaleDateString("en-IN")}</span>,
  },
];

export function LeadsTable({ rows }: { rows: LeadRow[] }) {
  return (
    <DataTable
      columns={columns}
      data={rows}
      searchPlaceholder="Search project, company, contact…"
      filters={[
        { columnId: "status", label: "Status", options: LEAD_STATUSES },
        { columnId: "formwork_type", label: "Formwork", options: FORMWORK_TYPES.map((f) => ({ value: f.value, label: shortLabel(f.value) })) },
      ]}
      exportFileName="acoform-leads"
      rowHref={(r) => `/leads/${r.id}`}
      emptyText="No leads yet. Create your first lead above."
    />
  );
}
