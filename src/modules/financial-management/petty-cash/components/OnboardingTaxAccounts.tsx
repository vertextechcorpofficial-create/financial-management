"use client";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { Choice, Settings } from "../onboarding-types";
import { useOnboardingCommand, useOnboardingRead } from "../hooks/useOnboarding";
import { OnboardingError } from "../providers/onboarding.api";
import { OnboardingChoice } from "./OnboardingChoice";
import { ErrorBox } from "./OnboardingCommon";
import { FormSkeleton } from "./PettyCashSkeletons";
import { onboardingFieldError } from "../utils/onboardingFeedback";

type TaxRole = "INPUT_VAT" | "EWT_PAYABLE" | "CASH_OVER_SHORT" | "DUE_FROM_CUSTODIAN" | "DUE_TO_CUSTODIAN";
function savedAccount(settings: Settings, role: TaxRole): Choice | null {
  const id = settings.accounts[role]?.[0];
  return id == null ? null : settings.resolvedAccounts[role]?.find(account => account.id === id) || {
    id, code: String(id), name: "Unavailable account", status: "UNAVAILABLE", classification: "", eligible: false,
    reason: "The saved account is unavailable. Select a replacement or clear the selection.", details: {},
  };
}

export function OnboardingTaxAccounts({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const read = useOnboardingRead<Settings>("settings"), [busy, setBusy] = useState(false);
  return <Dialog open onOpenChange={open => { if (!open && !busy) onClose(); }}><DialogContent showCloseButton={false} className="max-h-[90dvh] overflow-y-auto sm:max-w-3xl"><DialogHeader><DialogTitle>Configure posting accounts</DialogTitle><DialogDescription>Select the shared accounts used for Input VAT, EWT Payable, custodian balances and Cash Over/Short.</DialogDescription></DialogHeader>
    {read.loading && <FormSkeleton label="Loading posting accounts" fields={5} />}<ErrorBox error={read.error} retry={read.refresh} title="Could not load posting account settings" />
    {read.data ? <TaxAccountEditor key={read.updatedAt} settings={read.data} onClose={onClose} onSaved={onSaved} reload={read.refresh} onBusyChange={setBusy} /> : <div><Button variant="outline" disabled={busy} onClick={onClose}>Cancel</Button></div>}
  </DialogContent></Dialog>;
}

function TaxAccountEditor({ settings, onClose, onSaved, reload, onBusyChange }: { settings: Settings; onClose: () => void; onSaved: () => void; reload: () => void; onBusyChange: (busy: boolean) => void }) {
  const [vat, setVat] = useState(() => savedAccount(settings, "INPUT_VAT")), [ewt, setEwt] = useState(() => savedAccount(settings, "EWT_PAYABLE"));
  const [overShort, setOverShort] = useState(() => savedAccount(settings, "CASH_OVER_SHORT"));
  const [dueFrom, setDueFrom] = useState(() => savedAccount(settings, "DUE_FROM_CUSTODIAN")), [dueTo, setDueTo] = useState(() => savedAccount(settings, "DUE_TO_CUSTODIAN"));
  const command = useOnboardingCommand();
  const conflict = command.error instanceof OnboardingError && command.error.status === 409;
  const unsuitable = Boolean(vat && !vat.eligible || ewt && !ewt.eligible || overShort && !overShort.eligible || dueFrom && !dueFrom.eligible || dueTo && !dueTo.eligible);
  async function save(event: FormEvent) {
    event.preventDefault(); if (command.busy || conflict || unsuitable) return;
    onBusyChange(true);
    try {
      const choices = { INPUT_VAT: vat, EWT_PAYABLE: ewt, CASH_OVER_SHORT: overShort, DUE_FROM_CUSTODIAN: dueFrom, DUE_TO_CUSTODIAN: dueTo };
      const accountUpdates = Object.fromEntries(Object.entries(choices)
        .filter(([role, choice]) => (choice?.id ?? null) !== (settings.accounts[role as TaxRole]?.[0] ?? null))
        .map(([role, choice]) => [role, choice ? [choice.id] : []]));
      const result = await command.run<Settings>("settings", "PUT", { accountUpdates });
      if (result) { toast.success("Posting accounts updated. New previews will use these mappings."); onSaved(); }
    } finally { onBusyChange(false); }
  }
  return <form onSubmit={save} onChange={command.clearError} className="space-y-4"><fieldset disabled={command.busy || conflict} className="grid gap-4 sm:grid-cols-2">
    <OnboardingChoice label="Input VAT" id="tax-input-vat" resource="accounts" role="INPUT_VAT" selected={vat} onSelect={value => { setVat(value); command.clearError(); }} disabled={command.busy || conflict} error={onboardingFieldError(command.error, "accounts.INPUT_VAT")} />
    <OnboardingChoice label="EWT Payable" id="tax-ewt-payable" resource="accounts" role="EWT_PAYABLE" selected={ewt} onSelect={value => { setEwt(value); command.clearError(); }} disabled={command.busy || conflict} error={onboardingFieldError(command.error, "accounts.EWT_PAYABLE")} />
    <OnboardingChoice label="Cash Over/Short" id="posting-over-short" resource="accounts" role="CASH_OVER_SHORT" selected={overShort} onSelect={value => { setOverShort(value); command.clearError(); }} disabled={command.busy || conflict} error={onboardingFieldError(command.error, "accounts.CASH_OVER_SHORT")} />
    <OnboardingChoice label="Due from Custodian (shortage)" id="posting-due-from" resource="accounts" role="DUE_FROM_CUSTODIAN" selected={dueFrom} onSelect={value => { setDueFrom(value); command.clearError(); }} eligibleOnly disabled={command.busy || conflict} error={onboardingFieldError(command.error, "accounts.DUE_FROM_CUSTODIAN")} />
    <OnboardingChoice label="Due to Custodian (overage)" id="posting-due-to" resource="accounts" role="DUE_TO_CUSTODIAN" selected={dueTo} onSelect={value => { setDueTo(value); command.clearError(); }} eligibleOnly disabled={command.busy || conflict} error={onboardingFieldError(command.error, "accounts.DUE_TO_CUSTODIAN")} />
  </fieldset>
    <p className="text-sm text-muted-foreground">Unused accounts may be left blank. Transactions requiring a tax or variance account need a suitable selection before continuing.</p>
    <p className="text-sm text-muted-foreground">Changes apply to new replenishment, accrual and closure previews, including open paid vouchers. Submitted and posted journals keep their saved accounts.</p>
    <p className="text-sm text-muted-foreground">Other Income is valid for cash overages. If Cash Over/Short will also cover shortages, map it to an expense account; otherwise shortages should use Due from Custodian.</p>
    <ErrorBox error={command.error} title="Could not save posting accounts" showFields={false} action={conflict ? { label: "Reload settings", onClick: reload } : undefined} />
    <div className="flex flex-wrap gap-2"><Button type="submit" disabled={command.busy || conflict || unsuitable}>{command.busy ? "Saving..." : "Save changes"}</Button><Button type="button" variant="outline" disabled={command.busy} onClick={onClose}>Cancel</Button></div>
  </form>;
}
