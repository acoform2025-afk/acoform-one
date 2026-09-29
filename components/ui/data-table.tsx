"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  flexRender, getCoreRowModel, getFilteredRowModel, getPaginationRowModel, getSortedRowModel, useReactTable,
  type ColumnDef, type ColumnFiltersState, type SortingState, type Row,
} from "@tanstack/react-table";
import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp, ChevronsUpDown, Download, Search, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "./button";

/**
 * The standard ERP list: search, sortable columns, dropdown filters, paging and CSV export (opens in Excel).
 * Built on TanStack Table (MIT). Used by every list screen so they all behave the same way.
 */
export type FilterDef = { columnId: string; label: string; options: { value: string; label: string }[] };

// Extra per-column info: how to export the value, and alignment
export type ColumnMeta = { exportValue?: (row: unknown) => string | number | null | undefined; align?: "right"; nowrap?: boolean };

export function DataTable<T>({
  columns, data, searchPlaceholder = "Search…", filters = [], exportFileName, rowHref, emptyText = "Nothing here yet.",
  pageSize = 20, toolbar,
}: {
  columns: ColumnDef<T, unknown>[];
  data: T[];
  searchPlaceholder?: string;
  filters?: FilterDef[];
  exportFileName?: string;
  rowHref?: (row: T) => string;
  emptyText?: string;
  pageSize?: number;
  toolbar?: React.ReactNode;
}) {
  const router = useRouter();
  const [sorting, setSorting] = React.useState<SortingState>([]);
  const [globalFilter, setGlobalFilter] = React.useState("");
  const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>([]);

  const table = useReactTable({
    data, columns,
    state: { sorting, globalFilter, columnFilters },
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    onColumnFiltersChange: setColumnFilters,
    globalFilterFn: "includesString",
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: { pagination: { pageSize } },
  });

  const filteredCount = table.getFilteredRowModel().rows.length;
  const hasActiveFilter = globalFilter !== "" || columnFilters.length > 0;

  function exportCsv() {
    const cols = table.getAllLeafColumns().filter((c) => c.id !== "actions");
    const header = cols.map((c) => (typeof c.columnDef.header === "string" ? c.columnDef.header : c.id));
    const rows = table.getSortedRowModel().rows.filter((r) => table.getFilteredRowModel().rowsById[r.id]).map((r: Row<T>) =>
      cols.map((c) => {
        const meta = c.columnDef.meta as ColumnMeta | undefined;
        const v = meta?.exportValue ? meta.exportValue(r.original) : r.getValue(c.id);
        return v == null ? "" : String(v);
      }),
    );
    const csv = [header, ...rows].map((line) => line.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(",")).join("\r\n");
    // BOM so Excel reads ₹ and Gujarati/Hindi text correctly
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${exportFileName ?? "export"}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="rounded-lg border border-graphite-800 bg-graphite-950 shadow-sm">
      {/* toolbar */}
      <div className="flex flex-wrap items-center gap-2 border-b border-graphite-800 p-3">
        <div className="relative w-full sm:w-64">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-graphite-500" />
          <input
            value={globalFilter}
            onChange={(e) => setGlobalFilter(e.target.value)}
            placeholder={searchPlaceholder}
            className="h-9 w-full rounded-md border border-graphite-700 bg-graphite-950 pl-8 pr-3 text-sm text-graphite-100 placeholder:text-graphite-600 focus:border-brand-orange focus:outline-none"
          />
        </div>
        {filters.map((f) => {
          const col = table.getColumn(f.columnId);
          const value = (col?.getFilterValue() as string) ?? "";
          return (
            <select
              key={f.columnId}
              value={value}
              onChange={(e) => col?.setFilterValue(e.target.value || undefined)}
              className={cn(
                "h-9 rounded-md border border-graphite-700 bg-graphite-950 px-2.5 text-sm text-graphite-200 focus:border-brand-orange focus:outline-none",
                value && "border-brand-orange text-graphite-50",
              )}
            >
              <option value="">{f.label}: All</option>
              {f.options.map((o) => <option key={o.value} value={o.value}>{f.label}: {o.label}</option>)}
            </select>
          );
        })}
        {hasActiveFilter ? (
          <Button variant="ghost" size="sm" onClick={() => { setGlobalFilter(""); setColumnFilters([]); }}>
            <X /> Clear
          </Button>
        ) : null}
        <div className="ml-auto flex items-center gap-2">
          {toolbar}
          {exportFileName ? (
            <Button variant="secondary" size="sm" onClick={exportCsv} title="Download as a CSV file that opens in Excel">
              <Download /> Export
            </Button>
          ) : null}
        </div>
      </div>

      {/* table */}
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="bg-graphite-900 text-xs uppercase tracking-wide text-graphite-500">
            {table.getHeaderGroups().map((hg) => (
              <tr key={hg.id}>
                {hg.headers.map((h) => {
                  const sortable = h.column.getCanSort();
                  const dir = h.column.getIsSorted();
                  const right = (h.column.columnDef.meta as ColumnMeta | undefined)?.align === "right";
                  return (
                    <th key={h.id} className={cn("whitespace-nowrap px-4 py-2.5 font-medium", right && "text-right")}>
                      {h.isPlaceholder ? null : sortable ? (
                        <button onClick={h.column.getToggleSortingHandler()} className={cn("inline-flex items-center gap-1 uppercase hover:text-graphite-200", right && "flex-row-reverse")}>
                          {flexRender(h.column.columnDef.header, h.getContext())}
                          {dir === "asc" ? <ChevronUp className="size-3.5" /> : dir === "desc" ? <ChevronDown className="size-3.5" /> : <ChevronsUpDown className="size-3.5 opacity-40" />}
                        </button>
                      ) : flexRender(h.column.columnDef.header, h.getContext())}
                    </th>
                  );
                })}
              </tr>
            ))}
          </thead>
          <tbody className="divide-y divide-graphite-800">
            {table.getRowModel().rows.length ? table.getRowModel().rows.map((row) => (
              <tr
                key={row.id}
                onClick={rowHref ? (e) => {
                  // let real links/buttons inside the row work normally
                  if ((e.target as HTMLElement).closest("a,button,input,select")) return;
                  router.push(rowHref(row.original));
                } : undefined}
                className={cn("bg-graphite-950 transition-colors", rowHref && "cursor-pointer hover:bg-graphite-900")}
              >
                {row.getVisibleCells().map((cell) => (
                  <td key={cell.id} className={cn("px-4 py-2.5", (cell.column.columnDef.meta as ColumnMeta | undefined)?.align === "right" && "text-right", (cell.column.columnDef.meta as ColumnMeta | undefined)?.nowrap && "whitespace-nowrap")}>
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                ))}
              </tr>
            )) : (
              <tr><td colSpan={columns.length} className="px-4 py-10 text-center text-sm text-graphite-500">
                {hasActiveFilter ? "No records match your search or filters." : emptyText}
              </td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* footer */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-graphite-800 px-4 py-2.5 text-xs text-graphite-500">
        <span>
          {filteredCount === data.length ? `${data.length} record${data.length === 1 ? "" : "s"}` : `${filteredCount} of ${data.length} records`}
        </span>
        {table.getPageCount() > 1 ? (
          <div className="flex items-center gap-2">
            <span>Page {table.getState().pagination.pageIndex + 1} of {table.getPageCount()}</span>
            <Button variant="secondary" size="icon" className="h-7 w-7" onClick={() => table.previousPage()} disabled={!table.getCanPreviousPage()} aria-label="Previous page"><ChevronLeft /></Button>
            <Button variant="secondary" size="icon" className="h-7 w-7" onClick={() => table.nextPage()} disabled={!table.getCanNextPage()} aria-label="Next page"><ChevronRight /></Button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
