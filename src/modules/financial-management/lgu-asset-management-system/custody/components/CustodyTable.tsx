"use client";

import * as React from "react";
import { ArrowLeftRight, History, Undo2, UserPlus } from "lucide-react";
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

interface CustodyTableProps {
  rows: CustodyRow[];
  offices: LguOffice[];
  loading: boolean;
  onIssue: (row: CustodyRow) => void;
  onTransfer: (row: CustodyRow) => void;
  onReturn: (row: CustodyRow) => void;
  onHistory: (row: CustodyRow) => void;
}

export function CustodyTable({ rows, offices, loading, onIssue, onTransfer, onReturn, onHistory }: CustodyTableProps) {
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
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Property No.</TableHead>
          <TableHead>Description</TableHead>
          <TableHead>Form</TableHead>
          <TableHead>Accountable officer</TableHead>
          <TableHead>Office</TableHead>
          <TableHead>Documents</TableHead>
          <TableHead>Last movement</TableHead>
          <TableHead className="w-[170px] text-right">Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => (
          <TableRow key={row.asset.id}>
            <TableCell className="font-mono text-xs">{row.asset.property_no}</TableCell>
            <TableCell className="font-medium">{row.asset.description}</TableCell>
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
            <TableCell className="text-sm">
              {row.asset.office_id ? officeName.get(row.asset.office_id) ?? "-" : "-"}
            </TableCell>
            <TableCell className="text-sm">{row.documentCount}</TableCell>
            <TableCell className="text-sm">{row.lastMovementDate ?? "-"}</TableCell>
            <TableCell className="text-right">
              <div className="flex justify-end gap-1">
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Issue"
                  onClick={() => onIssue(row)}
                  disabled={Boolean(row.asset.accountable_officer_name)}
                >
                  <UserPlus className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Transfer"
                  onClick={() => onTransfer(row)}
                  disabled={!row.asset.accountable_officer_name}
                >
                  <ArrowLeftRight className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Return"
                  onClick={() => onReturn(row)}
                  disabled={!row.asset.accountable_officer_name}
                >
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
  );
}
