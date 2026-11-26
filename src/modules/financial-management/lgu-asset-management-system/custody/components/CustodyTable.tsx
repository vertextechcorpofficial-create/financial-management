"use client";

import * as React from "react";
import { ArrowDown, ArrowUp, ArrowLeftRight, ChevronsUpDown, History, Undo2, UserPlus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { CustodyRow, LguOffice } from "../../types";
import type { CustodySortKey } from "../services/assetCustody";

interface CustodyTableProps {
  rows: CustodyRow[];
  offices: LguOffice[];
  loading: boolean;
  sort: string;
  dir: string;
  onSort: (key: CustodySortKey) => void;
  onIssue: (row: CustodyRow) => void;
  onTransfer: (row: CustodyRow) => void;
  onReturn: (row: CustodyRow) => void;
  onHistory: (row: CustodyRow) => void;
}

function SortHeader({
  label,
  sortKey,
  sort,
  dir,
  onSort,
  className,
}: {
  label: string;
  sortKey: CustodySortKey;
  sort: string;
  dir: string;
  onSort: (key: CustodySortKey) => void;
  className?: string;
}) {
  const active = sort === sortKey;
  return (
    <TableHead className={className}>
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className="inline-flex items-center gap-1 hover:text-foreground"
        title={active ? "Sorted " + (dir === "desc" ? "descending" : "ascending") + ", click to reverse" : "Click to sort by " + label}
      >
        {label}
        {active ? (
          dir === "desc" ? <ArrowDown className="h-3.5 w-3.5" /> : <ArrowUp className="h-3.5 w-3.5" />
        ) : (
          <ChevronsUpDown className="h-3.5 w-3.5 opacity-40" />
        )}
      </button>
    </TableHead>
  );
}

export function CustodyTable({ rows, offices, loading, sort, dir, onSort, onIssue, onTransfer, onReturn, onHistory }: CustodyTableProps) {
  const officeName = React.useMemo(() => {
    const map = new Map<number, string>();
    for (const o of offices) map.set(o.id, o.name);
    return map;
  }, [offices]);

  if (loading) {
    return <div className="p-8 text-sm text-muted-foreground">Loading custody records...</div>;
  }

  if (rows.length === 0) {
    return (
      <div className="p-10 text-center">
        <p className="text-sm font-medium">Nothing to show</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Register an asset first, then issue it here with a PAR or an ICS.
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <SortHeader label="Property No." sortKey="property_no" sort={sort} dir={dir} onSort={onSort} />
            <TableHead>Description</TableHead>
            <SortHeader label="Form" sortKey="is_semi_expendable" sort={sort} dir={dir} onSort={onSort} />
            <SortHeader label="Accountable officer" sortKey="accountable_officer_name" sort={sort} dir={dir} onSort={onSort} />
            <TableHead>Office</TableHead>
            <TableHead>Documents</TableHead>
            <TableHead>Last movement</TableHead>
            <TableHead className="w-[170px] text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={row.asset.id}>
              <TableCell className="whitespace-nowrap font-mono text-xs">{row.asset.property_no}</TableCell>
              <TableCell className="max-w-[260px] truncate text-sm font-medium" title={row.asset.description}>
                {row.asset.description}
              </TableCell>
              <TableCell>
                <Badge variant="outline">{row.asset.is_semi_expendable ? "ICS" : "PAR"}</Badge>
              </TableCell>
              <TableCell className="text-sm">
                {row.asset.accountable_officer_name ? (
                  row.asset.accountable_officer_name
                ) : (
                  <span className="text-muted-foreground">Unassigned</span>
                )}
              </TableCell>
              <TableCell className="max-w-[200px] truncate text-sm" title={row.asset.office_id ? officeName.get(row.asset.office_id) : ""}>
                {row.asset.office_id ? officeName.get(row.asset.office_id) ?? "-" : "-"}
              </TableCell>
              <TableCell className="text-sm">{row.documentCount}</TableCell>
              <TableCell className="whitespace-nowrap text-sm">{row.lastMovementDate ?? "-"}</TableCell>
              <TableCell className="text-right">
                <div className="flex justify-end gap-1">
                  <Button variant="ghost" size="icon" aria-label="Issue" onClick={() => onIssue(row)}>
                    <UserPlus className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="icon" aria-label="Transfer" onClick={() => onTransfer(row)}>
                    <ArrowLeftRight className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="icon" aria-label="Return" onClick={() => onReturn(row)}>
                    <Undo2 className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="icon" aria-label="History" onClick={() => onHistory(row)}>
                    <History className="h-4 w-4" />
                  </Button>
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
