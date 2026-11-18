"use client";
import { useState } from "react";
import { flexRender, getCoreRowModel, getPaginationRowModel, getSortedRowModel, useReactTable, type ColumnDef, type SortingState } from "@tanstack/react-table";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export function LedgerTable<T>({ rows, columns, label, footer }: { rows: T[]; columns: ColumnDef<T>[]; label: string; footer?: Record<string, React.ReactNode> }) {
  const [sorting, setSorting] = useState<SortingState>([]);
  // TanStack intentionally exposes mutable table functions; do not React-Compiler memoize this call.
  // eslint-disable-next-line react-hooks/incompatible-library
  const table = useReactTable({ data: rows, columns, state: { sorting }, onSortingChange: setSorting, getCoreRowModel: getCoreRowModel(), getSortedRowModel: getSortedRowModel(), getPaginationRowModel: getPaginationRowModel(), initialState: { pagination: { pageSize: 20 } } });
  // Derive the displayed index so filtering cannot strand the user on an empty page.
  const pages = Math.max(1, table.getPageCount());
  return <div className="space-y-3">
    <div className="overflow-hidden rounded-lg border"><Table aria-label={label}><TableHeader>{table.getHeaderGroups().map(group => <TableRow key={group.id}>{group.headers.map(header => <TableHead key={header.id}>{header.isPlaceholder ? null : header.column.getCanSort() ? <button type="button" className="inline-flex items-center gap-1 py-2 text-left" onClick={header.column.getToggleSortingHandler()}>{flexRender(header.column.columnDef.header, header.getContext())}<span aria-hidden>{header.column.getIsSorted() === "asc" ? " ↑" : header.column.getIsSorted() === "desc" ? " ↓" : " ↕"}</span></button> : flexRender(header.column.columnDef.header, header.getContext())}</TableHead>)}</TableRow>)}</TableHeader>
      <TableBody>{table.getRowModel().rows.length ? table.getRowModel().rows.map(row => <TableRow key={row.id}>{row.getVisibleCells().map(cell => <TableCell key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</TableCell>)}</TableRow>) : <TableRow><TableCell colSpan={columns.length} className="h-28 text-center text-muted-foreground">No records to display.</TableCell></TableRow>}</TableBody>
      {footer && rows.length > 0 && <TableFooter><TableRow>{table.getVisibleLeafColumns().map(column => <TableCell key={column.id}>{footer[column.id] ?? "—"}</TableCell>)}</TableRow></TableFooter>}
    </Table></div>
    <div className="flex items-center justify-between gap-2 text-sm"><span className="text-muted-foreground">{rows.length} records · Page {Math.min(table.getState().pagination.pageIndex + 1, pages)} of {pages}</span><div className="flex gap-2"><Button variant="outline" size="sm" onClick={() => table.previousPage()} disabled={!table.getCanPreviousPage()}>Previous</Button><Button variant="outline" size="sm" onClick={() => table.nextPage()} disabled={!table.getCanNextPage()}>Next</Button></div></div>
  </div>;
}
