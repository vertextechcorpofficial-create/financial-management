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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

import { ACCOUNT_KINDS, ACCOUNT_KIND_LABEL } from "../constants";
import type { AccountBody } from "../schemas";
import type { AccountKind, GlAccountOption, SettingsAccount } from "../types";
import { OptionCombobox } from "./OptionCombobox";

function options(chart: GlAccountOption[]) {
  return chart.map((row) => ({
    value: String(row.coaId),
    label: `${row.glCode} · ${row.accountTitle}`,
    searchText: `${row.glCode} ${row.accountTitle}`,
  }));
}

/** Create or edit one payment account. Mounted only while open, so its state starts fresh. */
export function AccountDialog({
  account,
  chartAccounts,
  isSaving,
  onClose,
  onSubmit,
}: {
  account: SettingsAccount | null;
  chartAccounts: GlAccountOption[];
  isSaving: boolean;
  onClose: () => void;
  onSubmit: (body: AccountBody) => Promise<unknown>;
}) {
  const [name, setName] = useState(account?.name ?? "");
  const [kind, setKind] = useState<AccountKind>(account?.kind ?? "BANK");
  const [coaId, setCoaId] = useState(account ? String(account.coaId) : "");
  const [chargePct, setChargePct] = useState(account ? String(account.chargePct) : "0");
  const [touched, setTouched] = useState(false);

  const nameError = name.trim().length < 2 ? "Give the account a name." : "";
  const coaError = coaId === "" ? "Choose the GL account this payment account posts to." : "";
  const chargeError = Number.isFinite(Number(chargePct)) && Number(chargePct) >= 0 && Number(chargePct) <= 100
    ? ""
    : "Charges run from 0% to 100%.";
  const invalid = Boolean(nameError || coaError || chargeError);

  async function submit() {
    setTouched(true);
    if (invalid) return;
    const result = await onSubmit({
      name: name.trim(),
      kind,
      coaId: Number(coaId),
      chargePct: Number(chargePct),
    });
    if (result) onClose();
  }

  return (
    <Dialog open onOpenChange={(open) => (open ? undefined : onClose())}>
      <DialogContent showCloseButton={false} className="flex max-h-[85vh] w-[95vw] flex-col overflow-hidden rounded-2xl p-0 sm:max-w-[550px]">
        <DialogHeader className="border-b px-6 py-4">
          <DialogTitle>{account ? `Edit ${account.name}` : "Add a payment account"}</DialogTitle>
          <DialogDescription>
            Money is paid from this account and posted to the GL account you pick.
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-6 py-4">
          <div className="space-y-2">
            <Label htmlFor="account-name">
              Name <span className="text-destructive">*</span>
            </Label>
            <Input
              id="account-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="e.g. BDO current account"
              aria-invalid={touched && Boolean(nameError)}
            />
            {touched && nameError ? <p className="text-xs text-destructive">{nameError}</p> : null}
          </div>

          <div className="space-y-2">
            <Label htmlFor="account-kind">
              Kind <span className="text-destructive">*</span>
            </Label>
            <Select value={kind} onValueChange={(value) => setKind(value as AccountKind)}>
              <SelectTrigger id="account-kind">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="max-h-60">
                {ACCOUNT_KINDS.map((value) => (
                  <SelectItem key={value} value={value}>
                    {ACCOUNT_KIND_LABEL[value]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>
              GL account <span className="text-destructive">*</span>
            </Label>
            <OptionCombobox
              options={options(chartAccounts)}
              value={coaId}
              onChange={setCoaId}
              placeholder="Choose a GL account"
              searchPlaceholder="Search code or title…"
              emptyLabel="No chart account matches that search."
              aria-invalid={touched && Boolean(coaError)}
            />
            <p className="text-xs text-muted-foreground">
              Every payment from this account debits that GL account. A wrong pick sends cash to the wrong line.
            </p>
            {touched && coaError ? <p className="text-xs text-destructive">{coaError}</p> : null}
          </div>

          <div className="space-y-2">
            <Label htmlFor="account-charge">Charge</Label>
            <Input
              id="account-charge"
              inputMode="decimal"
              value={chargePct}
              onChange={(event) => setChargePct(event.target.value)}
              aria-invalid={touched && Boolean(chargeError)}
            />
            <p className="text-xs text-muted-foreground">Percent the bank charges to move money out of this account.</p>
            {touched && chargeError ? <p className="text-xs text-destructive">{chargeError}</p> : null}
          </div>
        </div>

        <DialogFooter className="border-t bg-muted/20 px-6 py-4">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="button" disabled={isSaving} onClick={() => void submit()}>
            {account ? "Save account" : "Add account"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
