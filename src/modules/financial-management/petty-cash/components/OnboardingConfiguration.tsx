"use client";
import { useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { useOnboardingRead } from "../hooks/useOnboarding";
import type { AccountRole, Settings } from "../onboarding-types";
import { ErrorBox } from "./OnboardingCommon";
import { StatsSkeleton } from "./PettyCashSkeletons";
import { CompanySettingsDialog } from "./CompanySettingsDialog";
import { OnboardingAlerts } from "./OnboardingAlerts";
import { OnboardingTaxAccounts } from "./OnboardingTaxAccounts";

const POSTING_ROLES: Array<[AccountRole, string]> = [
  ["INPUT_VAT", "Input VAT"], ["EWT_PAYABLE", "EWT payable"], ["CASH_OVER_SHORT", "Cash over / short"],
  ["DUE_FROM_CUSTODIAN", "Due from custodian"], ["DUE_TO_CUSTODIAN", "Due to custodian"],
];

const text = (value: unknown) => value == null || value === "" ? "Not set" : String(value);
const percent = (value: number | null | undefined) => value == null ? "Not set" : `${value}%`;
const days = (value: number | null | undefined) => value == null ? "Not set" : `${value} day(s)`;

function accountLabel(settings: Settings, role: AccountRole) {
  const id = settings.accounts[role]?.[0];
  if (id == null) return "Not set";
  const account = settings.resolvedAccounts[role]?.find(item => item.id === id);
  return account ? `${account.code} · ${account.name}` : "Unavailable account";
}

function Row({ label, value }: { label: string; value: string }) {
  return <div className="space-y-0.5"><dt className="text-xs text-muted-foreground">{label}</dt><dd className="break-words font-medium">{value}</dd></div>;
}

function Block({ title, onEdit, children }: { title: string; onEdit: () => void; children: ReactNode }) {
  return <div className="flex flex-col gap-3 rounded-lg border p-4">
    <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-medium">{title}</h3><Button type="button" variant="outline" size="sm" aria-label={`Edit ${title}`} onClick={onEdit}>Edit</Button></div>
    <dl className="flex-1 space-y-2 text-sm">{children}</dl>
  </div>;
}

export function OnboardingConfiguration({ onChanged }: { onChanged: () => void }) {
  const settings = useOnboardingRead<Settings>("settings");
  const [companyOpen, setCompanyOpen] = useState(false), [alertsOpen, setAlertsOpen] = useState(false), [taxAccountsOpen, setTaxAccountsOpen] = useState(false);
  const data = settings.data;
  function saved() { settings.refresh(); onChanged(); }
  return <section aria-labelledby="onboarding-configuration" className="space-y-3 rounded-xl border bg-card p-4 md:p-5">
    <div><h2 id="onboarding-configuration" className="text-lg font-semibold">Configuration</h2><p className="mt-1 text-sm text-muted-foreground">Shared company, alert and posting settings used by every fund.</p></div>
    {settings.loading && <StatsSkeleton label="Loading configuration" count={3} />}
    <ErrorBox error={settings.error} retry={settings.refresh} title="Could not load configuration" />
    {data && <div className="grid gap-4 lg:grid-cols-3">
      <Block title="Company details" onEdit={() => setCompanyOpen(true)}>
        <Row label="Registered name" value={text(data.company?.name)} />
        <Row label="TIN" value={text(data.company?.details?.tin)} />
        <Row label="Signatory (2307)" value={text([data.signatory?.name, data.signatoryTitle].filter(Boolean).join(", "))} />
        <Row label="Signatory TIN" value={text(data.signatoryTin)} />
      </Block>
      <Block title="Alerts" onEdit={() => setAlertsOpen(true)}>
        <Row label="Usage warning" value={percent(data.usageWarning)} />
        <Row label="Critical usage" value={percent(data.usageCritical)} />
        <Row label="Stale voucher age" value={days(data.staleDays)} />
      </Block>
      <Block title="Posting accounts" onEdit={() => setTaxAccountsOpen(true)}>
        {POSTING_ROLES.map(([role, label]) => <Row key={role} label={label} value={accountLabel(data, role)} />)}
      </Block>
    </div>}
    {companyOpen && <CompanySettingsDialog onClose={() => setCompanyOpen(false)} onSaved={saved} />}
    {alertsOpen && <OnboardingAlerts onClose={() => setAlertsOpen(false)} onSaved={() => { setAlertsOpen(false); saved(); }} />}
    {taxAccountsOpen && <OnboardingTaxAccounts onClose={() => setTaxAccountsOpen(false)} onSaved={() => { setTaxAccountsOpen(false); saved(); }} />}
  </section>;
}
