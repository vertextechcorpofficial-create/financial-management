"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { SetupError } from "@/modules/financial-management/treasury/bank-reconciliation/providers/bankReconciliationSetupApi";
import { GL_PICKER_EMPTY, GL_PICKER_NON_CASH_BLOCKED, GL_PICKER_PLACEHOLDER, isCashAccountTitle } from "../constants";
import { getReconciliationConfiguration, saveReconciliationConfiguration } from "../providers/onboardingApi";
import type { BankAccountV2, GlAccountOption } from "../types";
import { OptionCombobox } from "./OptionCombobox";

type Configuration = Awaited<ReturnType<typeof getReconciliationConfiguration>>;
type Props = { account: BankAccountV2; cashAccounts: GlAccountOption[]; onClose: () => void; onSaved: () => void };

export function ReconciliationSettingsDialog({ account, cashAccounts, onClose, onSaved }: Props) {
  const bankId = account.bankId;
  const [configuration, setConfiguration] = useState<Configuration | null>(null);
  const [loadError, setLoadError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [companyId, setCompanyId] = useState("");
  const [glCoaId, setGlCoaId] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [stale, setStale] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    getReconciliationConfiguration(bankId, controller.signal).then(result => {
      if (controller.signal.aborted) return;
      setCompanyId(String(result.bank.companyId ?? ""));
      setGlCoaId(String(result.bank.glCoaId ?? ""));
      setConfiguration(result);
    }).catch(error => {
      if (!controller.signal.aborted) setLoadError(error instanceof Error ? error.message : "Unable to load reconciliation settings.");
    });
    return () => controller.abort();
  }, [bankId, attempt]);

  const bank = configuration?.bank;
  const linkedGl = bank?.account;
  const pickerAccounts = linkedGl && !cashAccounts.some(gl => gl.coaId === linkedGl.id)
    ? [...cashAccounts, { coaId: linkedGl.id, glCode: linkedGl.code, accountTitle: linkedGl.name }]
    : cashAccounts;
  const selectedGl = pickerAccounts.find(gl => String(gl.coaId) === glCoaId);
  const nonCash = Boolean(selectedGl && !isCashAccountTitle(selectedGl.accountTitle));
  const canSave = bank && companyId && selectedGl && !nonCash && !saving && !stale
    && (Number(companyId) !== bank.companyId || selectedGl.coaId !== bank.glCoaId);

  function loadLatest() {
    setConfiguration(null);
    setLoadError("");
    setSaveError("");
    setStale(false);
    setAttempt(value => value + 1);
  }

  async function save() {
    if (!canSave) return;
    setSaving(true);
    setSaveError("");
    try {
      await saveReconciliationConfiguration(bankId, { version: bank.version, companyId: Number(companyId), glCoaId: selectedGl.coaId });
      toast.success("Reconciliation settings saved");
      onSaved();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to save reconciliation settings.";
      setSaveError(message);
      setStale(error instanceof SetupError && error.status === 409 && message.startsWith("Bank configuration changed"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={open => { if (!open && !saving) onClose(); }}>
      <DialogContent showCloseButton={!saving} className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Reconciliation settings</DialogTitle>
          <DialogDescription>{account.bankName} · {account.branch || "Branch not specified"}</DialogDescription>
        </DialogHeader>
        {loadError ? (
          <div className="space-y-2">
            <p role="alert" className="text-sm text-destructive">{loadError}</p>
            <Button type="button" variant="outline" size="sm" onClick={loadLatest}>Retry</Button>
          </div>
        ) : configuration ? (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="reconciliation-company">Company</Label>
              <OptionCombobox
                id="reconciliation-company"
                options={configuration.companies.map(company => ({
                  value: String(company.id),
                  label: company.name,
                  searchText: `${company.code} ${company.name}`,
                }))}
                value={companyId}
                onChange={setCompanyId}
                placeholder="Select company"
                searchPlaceholder="Search by company name or code"
                emptyLabel="No matching companies."
                disabled={saving || stale}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="reconciliation-cash-gl">Cash in Bank GL account</Label>
              <OptionCombobox
                id="reconciliation-cash-gl"
                options={pickerAccounts.map(gl => ({
                  value: String(gl.coaId),
                  label: `${gl.glCode} · ${gl.accountTitle}`,
                  searchText: `${gl.glCode} ${gl.accountTitle}`,
                }))}
                value={glCoaId}
                onChange={setGlCoaId}
                placeholder={GL_PICKER_PLACEHOLDER}
                searchPlaceholder="Search GL code or title"
                emptyLabel={GL_PICKER_EMPTY}
                disabled={saving || stale}
              />
              {nonCash && <p className="text-sm text-destructive">{GL_PICKER_NON_CASH_BLOCKED}</p>}
            </div>
            {saveError && <p role="alert" className="text-sm text-destructive">{saveError}</p>}
            {stale && <Button type="button" variant="outline" size="sm" onClick={loadLatest}>Load latest</Button>}
          </div>
        ) : <p role="status" className="text-sm text-muted-foreground">Loading reconciliation settings…</p>}
        <DialogFooter>
          <Button type="button" variant="outline" disabled={saving} onClick={onClose}>Cancel</Button>
          <Button type="button" disabled={!canSave} onClick={() => { void save(); }}>
            {saving ? "Saving…" : "Save settings"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
