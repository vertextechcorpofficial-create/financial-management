"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatCurrency } from "@/lib/utils";

import { DateField } from "./DateField";
import { OptionCombobox } from "./OptionCombobox";
import { phtToday } from "../pht";
import type { ApprovalDetail, ReleaseChannel } from "../types";

const CHANNELS: { value: ReleaseChannel; label: string }[] = [
  { value: "TRANSFER", label: "Bank transfer" },
  { value: "CHECK", label: "Check" },
  { value: "CASH", label: "Cash" },
];

/** Mounted only while the release is being prepared, with the preview already loaded. */
export function ReleaseDialog({
  detail,
  isSaving,
  onClose,
  onSubmit,
}: {
  detail: ApprovalDetail;
  isSaving: boolean;
  onClose: () => void;
  onSubmit: (input: { releaseDate: string; channel: ReleaseChannel; accountId: number | null }) => void;
}) {
  const { row, preview, accounts } = detail;
  const [releaseDate, setReleaseDate] = useState(preview.releaseDate || phtToday());
  const [channel, setChannel] = useState<ReleaseChannel>(preview.channel);
  const [accountId, setAccountId] = useState<string>(preview.accountId ? String(preview.accountId) : "");

  const blocked = row.releaseBlockedReason;

  return (
    <Dialog open onOpenChange={(open) => (open ? undefined : onClose())}>
      <DialogContent showCloseButton={false} className="flex max-h-[85vh] w-[95vw] flex-col overflow-hidden rounded-2xl p-0 sm:max-w-[700px]">
        <DialogHeader className="border-b px-6 py-4">
          <DialogTitle>
            Release {row.loanNo} · {formatCurrency(row.principal)}
          </DialogTitle>
          <DialogDescription>
            {row.lenderName} · net proceeds {formatCurrency(row.proceedsNet)} · the entry posts when you confirm.
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-6 py-4">
          {blocked ? (
            <p className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
              {blocked}
            </p>
          ) : null}

          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="release-date">
                Date received <span className="text-destructive">*</span>
              </Label>
              <DateField
                id="release-date"
                value={releaseDate}
                onChange={setReleaseDate}
                maxDate={phtToday()}
                inDialog
                aria-label="Date the money arrived"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="release-channel">
                How it arrived <span className="text-destructive">*</span>
              </Label>
              <Select value={channel} onValueChange={(value) => setChannel(value as ReleaseChannel)}>
                <SelectTrigger id="release-channel" className="h-9">
                  <SelectValue className="truncate" />
                </SelectTrigger>
                <SelectContent className="max-h-60">
                  {CHANNELS.map((item) => (
                    <SelectItem key={item.value} value={item.value}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="release-account">
                Into account <span className="text-destructive">*</span>
              </Label>
              <OptionCombobox
                value={accountId}
                onChange={setAccountId}
                placeholder="Choose an account"
                searchPlaceholder="Search account"
                emptyLabel="No payment account is set up."
                className="h-9 w-full justify-between"
                options={accounts.map((account) => ({
                  value: String(account.id),
                  label: account.name,
                  description: account.charge_pct > 0 ? `${account.charge_pct}% charge` : undefined,
                }))}
              />
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground">What will post</p>
            <div className="overflow-x-auto rounded-md border">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-xs text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium">Account</th>
                    <th className="w-[120px] px-3 py-2 text-right font-medium">Debit</th>
                    <th className="w-[120px] px-3 py-2 text-right font-medium">Credit</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.lines.map((line, index) => (
                    <tr key={`${line.label}-${index}`} className="border-t">
                      <td className="px-3 py-2">
                        <span className="block truncate" title={line.accountTitle ?? line.label}>
                          {line.accountTitle ?? line.label}
                        </span>
                        {line.glCode ? (
                          <span className="block text-xs tabular-nums text-muted-foreground">{line.glCode}</span>
                        ) : null}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {line.debit > 0 ? formatCurrency(line.debit) : "—"}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {line.credit > 0 ? formatCurrency(line.credit) : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="border-t bg-muted/20 text-sm font-medium">
                  <tr>
                    <td className="px-3 py-2">Total</td>
                    <td className="px-3 py-2 text-right tabular-nums">{formatCurrency(preview.totalDebit)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{formatCurrency(preview.totalCredit)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
            <p className="text-xs text-muted-foreground">
              {detail.schedulePeriods > 0
                ? `${detail.schedulePeriods} installments are already scheduled for this loan.`
                : "Release builds the installment schedule for this loan."}
            </p>
          </div>
        </div>

        <DialogFooter className="border-t bg-muted/20 px-6 py-4">
          <Button variant="outline" onClick={onClose} disabled={isSaving}>
            Cancel
          </Button>
          <Button
            onClick={() => onSubmit({ releaseDate, channel, accountId: accountId ? Number(accountId) : null })}
            disabled={isSaving || Boolean(blocked) || !releaseDate}
            title={blocked ?? undefined}
          >
            {isSaving ? "Releasing…" : "Release and post"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
