"use client";

import Link from "next/link";
import type { ColumnDef } from "@tanstack/react-table";
import { DataTable, type ColumnMeta } from "@/components/ui/data-table";
import { StatusBadge, statusLabel } from "@/components/ui/badge";

export type QuotationRow = {
  id: string; quotation_code: string; customer_name: string; project_name: string | null;
  total_area_sqm: number | null; total_with_gst: number | null; status: string;
  quotation_type: string; formwork_type: string | null; valid_until: string | null; created_at: string;
};

const inr = (n: number | null) => (n == null ? "—" : `₹ ${Number(n).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);

const columns: ColumnDef<QuotationRow, unknown>[] = [
  {
    accessorKey: "quotation_code", header: "Quotation no.", meta: { nowrap: true } satisfies ColumnMeta,
    cell: ({ row }) => <Link href={`/quotations/${row.original.id}`} className="font-mono text-xs font-medium text-aluminium-300 hover:underline">{row.original.quotation_code}</Link>,
  },
  { accessorKey: "customer_name", header: "Customer", cell: ({ getValue }) => <span className="font-medium text-graphite-100">{getValue() as string}</span> },
  { id: "project", header: "Project", accessorFn: (r) => r.project_name ?? "", cell: ({ getValue }) => <span className="text-graphite-400">{(getValue() as string) || "—"}</span> },
  {
    id: "type", header: "Type", filterFn: "equalsString",
    accessorFn: (r) => (r.quotation_type === "quick" ? "quick" : "detailed"),
    meta: { exportValue: (r) => { const q = r as QuotationRow; return q.quotation_type === "quick" ? `Quick · ${q.formwork_type ?? ""}` : "Detailed"; } } satisfies ColumnMeta,
    cell: ({ row }) => <span className="text-xs text-graphite-400">{row.original.quotation_type === "quick" ? `Quick · ${row.original.formwork_type ?? ""}` : "Detailed"}</span>,
  },
  {
    accessorKey: "total_area_sqm", header: "Area (m²)", meta: { align: "right", nowrap: true } satisfies ColumnMeta,
    cell: ({ getValue }) => { const v = getValue() as number | null; return <span className="font-mono text-xs">{v != null ? Number(v).toFixed(2) : "—"}</span>; },
  },
  {
    accessorKey: "total_with_gst", header: "Total incl. GST", meta: { align: "right", nowrap: true } satisfies ColumnMeta,
    cell: ({ getValue }) => <span className="font-mono text-xs font-medium text-graphite-100">{inr(getValue() as number | null)}</span>,
  },
  { accessorKey: "status", header: "Status", filterFn: "equalsString", meta: { nowrap: true } satisfies ColumnMeta, cell: ({ getValue }) => <StatusBadge status={getValue() as string} /> },
  {
    accessorKey: "created_at", header: "Date",
    meta: { nowrap: true, exportValue: (r) => (r as QuotationRow).created_at.slice(0, 10) } satisfies ColumnMeta,
    cell: ({ getValue }) => <span className="text-xs text-graphite-500">{new Date(getValue() as string).toLocaleDateString("en-IN")}</span>,
  },
];

const STATUSES = ["draft", "pending_approval", "approved", "sent", "accepted", "rejected", "expired", "superseded"];

export function QuotationsTable({ rows, toolbar }: { rows: QuotationRow[]; toolbar?: React.ReactNode }) {
  const present = STATUSES.filter((s) => rows.some((r) => r.status === s));
  return (
    <DataTable
      columns={columns}
      data={rows}
      searchPlaceholder="Search quotation no., customer, project…"
      filters={[
        { columnId: "status", label: "Status", options: present.map((s) => ({ value: s, label: statusLabel(s) })) },
        { columnId: "type", label: "Type", options: [{ value: "detailed", label: "Detailed" }, { value: "quick", label: "Quick" }] },
      ]}
      exportFileName="acoform-quotations"
      rowHref={(r) => `/quotations/${r.id}`}
      emptyText="No quotations yet. Create your first above."
      toolbar={toolbar}
    />
  );
}
