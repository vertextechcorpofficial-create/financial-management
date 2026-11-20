"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { NativeSelect } from "@/components/ui/native-select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmptyState, Panel, StatusChip } from "../console/components/ui";
import { LoanDialog } from "../loans/LoansModule";
import { peso } from "./format";
import type { MemberDetail } from "./types";

const openStatuses = new Set(["PENDING", "APPROVED", "ACTIVE"]);

export function MemberLoans({ userId, loans, onRetry }: { userId: number; loans: MemberDetail["loans"]; onRetry: () => void }) {
  const [filter, setFilter] = useState("");
  const [selected, setSelected] = useState<number | null>(null);
  const items = loans?.state === "ready"
    ? loans.data.items.filter(item => !filter || (filter === "OPEN" ? openStatuses.has(item.status) : item.status === filter))
    : [];
  return (
    <Panel title="Loans">
      {!loans ? (
        <EmptyState>Loans are recorded against a Cooperative membership.</EmptyState>
      ) : loans.state !== "ready" ? (
        <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
          <p role={loans.state === "unavailable" ? "alert" : "status"}>{loans.message}</p>
          {loans.state === "unavailable" && <Button type="button" variant="outline" size="sm" onClick={onRetry}>Retry loans</Button>}
        </div>
      ) : (
        <>
          <div className="mb-3 space-y-1.5">
            <label htmlFor="cooperative-member-loan-status" className="block text-xs font-medium text-muted-foreground">Loan status</label>
            <NativeSelect id="cooperative-member-loan-status" value={filter} onChange={event => setFilter(event.target.value)}>
              <option value="">All</option><option value="OPEN">Open</option>
              <option value="FULLY_PAID">Fully paid</option><option value="REJECTED">Rejected</option>
            </NativeSelect>
          </div>
          <div className="overflow-hidden rounded-lg border">
            <Table>
              <TableHeader className="bg-muted/50">
                <TableRow>
                  <TableHead>Loan</TableHead><TableHead>Status</TableHead><TableHead>Documents</TableHead>
                  <TableHead className="text-right">Per payment</TableHead><TableHead className="text-right">Balance</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map(item => (
                  <TableRow key={item.id}>
                    <TableCell>
                      <Button type="button" variant="link" className="h-auto p-0 font-mono" onClick={() => setSelected(item.id)}>
                        {item.loanNo}
                      </Button>
                      <div className="text-xs text-muted-foreground">{item.productName}</div>
                    </TableCell>
                    <TableCell><StatusChip status={item.status} /></TableCell>
                    <TableCell>
                      {item.requiredDocuments ? (item.requiredDocuments - item.documentsMissing) + "/" + item.requiredDocuments + " on file" : "None required"}
                    </TableCell>
                    <TableCell className="text-right font-mono tabular-nums">{item.amountPerPayment === null ? "—" : peso(item.amountPerPayment)}</TableCell>
                    <TableCell className="text-right font-mono tabular-nums">{item.balance === null ? "—" : peso(item.balance)}</TableCell>
                  </TableRow>
                ))}
                {items.length === 0 && (
                  <TableRow><TableCell colSpan={5}><EmptyState>{filter ? "No loans match this status." : "No loans on record."}</EmptyState></TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </>
      )}
      {selected !== null && (
        <LoanDialog
          key={selected}
          id={selected}
          endpoint={"/api/fm/cooperative/members/" + userId + "/loans/" + selected}
          onClose={() => setSelected(null)}
        />
      )}
    </Panel>
  );
}
