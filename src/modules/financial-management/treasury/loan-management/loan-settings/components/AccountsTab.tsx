"use client";

import { useMemo, useState } from "react";
import { Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatNumber } from "@/lib/utils";

import { ACCENT, ACCOUNT_KIND_LABEL, SETTINGS_PAGE_SIZE } from "../constants";
import type { AccountBody } from "../schemas";
import type { GlAccountOption, SettingsAccount } from "../types";
import { AccountDialog } from "./AccountDialog";
import { Notice } from "./Notice";
import { StatusBadge } from "./StatusBadge";
import { TablePager, pageCountFor, pageSlice, usePageSize } from "./TablePager";

type Props = {
  accounts: SettingsAccount[];
  chartAccounts: GlAccountOption[];
  isSaving: boolean;
  onAdd: (body: AccountBody) => Promise<unknown>;
  onEdit: (id: number, patch: { isActive?: boolean }) => Promise<unknown>;
};

/** Where money is paid from. A retired row stays listed, because payments point at it. */
export function AccountsTab({ accounts, chartAccounts, isSaving, onAdd, onEdit }: Props) {
  const [pageSize, setPageSize] = usePageSize("fm.loan-settings.accounts-rows", SETTINGS_PAGE_SIZE);
  const [page, setPage] = useState(1);
  const [dialogOpen, setDialogOpen] = useState(false);
  const pageCount = pageCountFor(accounts.length, pageSize);
  const rows = useMemo(() => pageSlice(accounts, page, pageSize), [accounts, page, pageSize]);
  const active = accounts.filter((row) => row.isActive);

  return (
    <div className="space-y-3">
      {active.length === 0 ? (
        <Notice tone="warning" title="No active payment account.">
          The Payments screen cannot record a payment until one is active here: every payment needs an account to pay from
          and a GL account to debit.
        </Notice>
      ) : (
        <Notice tone="info" title="What this controls">
          A payment is only offered from an account that is active. Each payment debits the GL account named here, and the charge
          percent is added to the money leaving.
        </Notice>
      )}

      <Card className={`border-t-[3px] ${ACCENT}`}>
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
          <div className="min-w-0">
            <h3 className="text-sm font-semibold">Payment accounts</h3>
            <p className="text-xs text-muted-foreground">
              {formatNumber(active.length)} active of {formatNumber(accounts.length)} · every payment posts to the GL account
              chosen here.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-medium tabular-nums text-muted-foreground">
              {formatNumber(accounts.length)} accounts
            </span>
            <Button type="button" className="min-h-11 md:min-h-0" disabled={isSaving} onClick={() => setDialogOpen(true)}>
              <Plus className="mr-1.5 h-4 w-4" aria-hidden />
              Add account
            </Button>
          </div>
        </div>

        <ul className="divide-y divide-border min-[1300px]:hidden">
          {rows.map((account) => (
            <li key={account.id} className="space-y-2 px-4 py-3">
              <div className="flex items-start justify-between gap-2">
                <span className="min-w-0 truncate font-medium" title={account.name}>
                  {account.name}
                </span>
                <StatusBadge tone={account.isActive ? "success" : "neutral"}>
                  {account.isActive ? "Active" : "Retired"}
                </StatusBadge>
              </div>
              <p className="truncate text-xs text-muted-foreground" title={`${account.glCode} · ${account.glTitle}`}>
                {ACCOUNT_KIND_LABEL[account.kind]} · {account.glCode} · {account.glTitle}
              </p>
              <p className="text-xs text-muted-foreground">
                Charge {account.chargePct}% · {formatNumber(account.paymentCount)} payments recorded
              </p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="min-h-11 w-full md:min-h-0"
                disabled={isSaving}
                onClick={() => void onEdit(account.id, { isActive: !account.isActive })}
              >
                {account.isActive ? "Retire account" : "Make active"}
              </Button>
            </li>
          ))}
          {rows.length === 0 ? (
            <li className="px-4 py-10 text-center text-sm text-muted-foreground">
              No payment account is set up yet.
            </li>
          ) : null}
        </ul>

        <div className="hidden overflow-x-auto min-[1300px]:block">
          <Table className="table-fixed">
            <TableHeader>
              <TableRow>
                <TableHead>Account</TableHead>
                <TableHead className="w-[130px]">Kind</TableHead>
                <TableHead className="w-[260px]">GL account</TableHead>
                <TableHead className="w-[92px] text-right">Charge</TableHead>
                <TableHead className="w-[104px] text-right">Payments</TableHead>
                <TableHead className="w-[104px]">Status</TableHead>
                <TableHead className="w-[132px] text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((account) => (
                <TableRow key={account.id}>
                  <TableCell className="max-w-[240px] truncate font-medium" title={account.name}>
                    {account.name}
                  </TableCell>
                  <TableCell className="truncate text-sm text-muted-foreground">{ACCOUNT_KIND_LABEL[account.kind]}</TableCell>
                  <TableCell className="truncate text-sm" title={`${account.glCode} · ${account.glTitle}`}>
                    <span className="tabular-nums">{account.glCode}</span> · {account.glTitle}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{account.chargePct}%</TableCell>
                  <TableCell className="text-right tabular-nums">{formatNumber(account.paymentCount)}</TableCell>
                  <TableCell>
                    <StatusBadge tone={account.isActive ? "success" : "neutral"}>
                      {account.isActive ? "Active" : "Retired"}
                    </StatusBadge>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={isSaving}
                      title={
                        account.isActive
                          ? account.paymentCount > 0
                            ? `${account.paymentCount} payments point at this account. Retiring stops new payments and keeps the history.`
                            : "Retiring stops this account being offered for new payments."
                          : "Offer this account again when recording a payment."
                      }
                      onClick={() => void onEdit(account.id, { isActive: !account.isActive })}
                    >
                      {account.isActive ? "Retire" : "Activate"}
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="py-10 text-center text-sm text-muted-foreground">
                    No payment account is set up yet.
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
        </div>

        <TablePager
          page={page}
          pageCount={pageCount}
          total={accounts.length}
          pageSize={pageSize}
          onPageChange={setPage}
          onPageSizeChange={(size) => {
            setPageSize(size);
            setPage(1);
          }}
          allowAll={false}
          className="border-t border-border px-4 py-3"
        />
      </Card>

      <p className="text-xs text-muted-foreground">
        A retired account is never deleted: the payments recorded against it keep their account. Its charge column is shown as a
        percentage of the money moved.
      </p>

      {dialogOpen ? (
        <AccountDialog
          account={null}
          chartAccounts={chartAccounts}
          isSaving={isSaving}
          onClose={() => setDialogOpen(false)}
          onSubmit={onAdd}
        />
      ) : null}
    </div>
  );
}
