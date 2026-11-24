"use client";

import * as React from "react";
import {
  ColumnDef,
  ColumnFiltersState,
  SortingState,
  VisibilityState,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { DataTablePagination } from "./table-pagination";
import { DataTableToolbar } from "./table-toolbar";
import { AssetTableData } from "../../types";

interface DataTableProps<TData, TValue> {
  columns: ColumnDef<TData, TValue>[];
  data: TData[];
  onEdit: (asset: AssetTableData) => void;
  onView: (asset: AssetTableData) => void;
  onTransfer?: (asset: AssetTableData) => void;
  onImpairment?: (asset: AssetTableData) => void;
  onChangeLife?: (asset: AssetTableData) => void;
  onDispose?: (asset: AssetTableData) => void;
  onCustodyHistory?: (asset: AssetTableData) => void;
  onHistory?: (asset: AssetTableData) => void;
  onDeactivate?: (asset: AssetTableData) => void;
}

export function AssetDataTable<TData extends AssetTableData, TValue>({
  columns,
  data,
  onEdit,
  onView,
  onTransfer,
  onImpairment,
  onChangeLife,
  onDispose,
  onCustodyHistory,
  onHistory,
  onDeactivate,
}: DataTableProps<TData, TValue>) {
  const [rowSelection, setRowSelection] = React.useState({});
  const [columnVisibility, setColumnVisibility] =
    React.useState<VisibilityState>({});
  const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>([]);
  const [sorting, setSorting] = React.useState<SortingState>([]);
  const [showDeactivated, setShowDeactivated] = React.useState(false);

  // Filter data based on showDeactivated
  const filteredData = React.useMemo(() => {
    if (showDeactivated) {
      return data;
    }
    return data.filter((item) => item.record_status !== "voided" && item.record_status !== "archived");
  }, [data, showDeactivated]);

  const deactivatedCount = React.useMemo(() => {
    return data.filter((item) => item.record_status === "voided" || item.record_status === "archived").length;
  }, [data]);

  const uniqueDepartments = React.useMemo(() => {
    const set = new Set<string>();
    data.forEach((d) => {
      if (d.department_name && d.department_name !== "Unassigned") {
        set.add(d.department_name);
      }
    });
    return Array.from(set);
  }, [data]);

  const uniqueClassifications = React.useMemo(() => {
    const set = new Set<string>();
    data.forEach((d) => {
      if (d.classification_name) {
        set.add(d.classification_name);
      }
    });
    return Array.from(set);
  }, [data]);

  // eslint-disable-next-line react-hooks/incompatible-library
  const table = useReactTable({
    data: filteredData,
    columns,
    state: {
      sorting,
      columnVisibility,
      rowSelection,
      columnFilters,
    },
    meta: {
      onEdit,
      onView,
      onTransfer,
      onImpairment,
      onChangeLife,
      onDispose,
      onCustodyHistory,
      onHistory,
      onDeactivate,
    },
    enableRowSelection: true,
    onRowSelectionChange: setRowSelection,
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onColumnVisibilityChange: setColumnVisibility,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  return (
    <div className="space-y-4">
      <DataTableToolbar
        table={table}
        showDeactivated={showDeactivated}
        setShowDeactivated={setShowDeactivated}
        deactivatedCount={deactivatedCount}
        departments={uniqueDepartments}
        classifications={uniqueClassifications}
        totalCount={filteredData.length}
      />
      <div className="rounded-md border bg-card">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => {
                  return (
                    <TableHead key={header.id} colSpan={header.colSpan}>
                      {header.isPlaceholder
                        ? null
                        : flexRender(
                            header.column.columnDef.header,
                            header.getContext()
                          )}
                    </TableHead>
                  );
                })}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows?.length ? (
              table.getRowModel().rows.map((row) => (
                <TableRow
                  key={row.id}
                  data-state={row.getIsSelected() && "selected"}
                  className="hover:bg-muted/40 transition-colors"
                >
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>
                      {flexRender(
                        cell.column.columnDef.cell,
                        cell.getContext()
                      )}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell
                  colSpan={columns.length}
                  className="h-24 text-center text-xs text-muted-foreground"
                >
                  No assets found.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
      <DataTablePagination table={table} />
    </div>
  );
}
