"use client";
import { useState, type ComponentType } from "react";
import { Bell, Building2, ChevronRight, Landmark } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useOnboardingRead } from "../hooks/useOnboarding";
import type { AccountRole, Settings } from "../onboarding-types";
import { ErrorBox } from "./OnboardingCommon";
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

function SettingsAction({ icon: Icon, title, summary, onClick }: {
  icon: ComponentType<{ className?: string }>;
  title: string;
  summary: string;
  onClick: () => void;
}) {
  return <Button type="button" variant="outline" onClick={onClick}
    className="h-auto w-full justify-start gap-3 whitespace-normal px-3 py-3 text-left">
    <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground">
      <Icon className="size-4" aria-hidden="true" />
    </span>
    <span className="min-w-0 flex-1">
      <span className="block truncate text-sm font-medium">{title}</span>
      <span className="block truncate text-xs text-muted-foreground">{summary}</span>
    </span>
    <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
  </Button>;
}

export function OnboardingConfiguration({ onChanged }: { onChanged: () => void }) {
  const settings = useOnboardingRead<Settings>("settings");
  const [companyOpen, setCompanyOpen] = useState(false), [alertsOpen, setAlertsOpen] = useState(false), [taxAccountsOpen, setTaxAccountsOpen] = useState(false);
  const data = settings.data;
  const mapped = data ? POSTING_ROLES.filter(([role]) => data.accounts[role]?.[0] != null).length : 0;
  function saved() { settings.refresh(); onChanged(); }
  return <section aria-labelledby="onboarding-configuration" className="space-y-3 rounded-xl border bg-card p-4 md:p-5">
    <div><h2 id="onboarding-configuration" className="text-lg font-semibold">Configuration</h2><p className="mt-1 text-sm text-muted-foreground">Shared company, alert and posting settings used by every fund.</p></div>
    {settings.loading && <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3" aria-hidden="true">
      {Array.from({ length: 3 }, (_, index) => <div key={index} className="h-[70px] animate-pulse rounded-lg border bg-muted/30" />)}
    </div>}
    <ErrorBox error={settings.error} retry={settings.refresh} title="Could not load configuration" />
    {data && <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      <SettingsAction icon={Building2} title="Company details"
        summary={[text(data.company?.name), data.company?.details?.tin ? `TIN ${text(data.company.details.tin)}` : null].filter(Boolean).join(" · ")}
        onClick={() => setCompanyOpen(true)} />
      <SettingsAction icon={Bell} title="Alerts"
        summary={`${percent(data.usageWarning)} warning · ${percent(data.usageCritical)} critical · ${days(data.staleDays)} stale`}
        onClick={() => setAlertsOpen(true)} />
      <SettingsAction icon={Landmark} title="Posting accounts"
        summary={`${mapped} of ${POSTING_ROLES.length} accounts mapped`}
        onClick={() => setTaxAccountsOpen(true)} />
    </div>}
    {companyOpen && <CompanySettingsDialog onClose={() => setCompanyOpen(false)} onSaved={saved} />}
    {alertsOpen && <OnboardingAlerts onClose={() => setAlertsOpen(false)} onSaved={() => { setAlertsOpen(false); saved(); }} />}
    {taxAccountsOpen && <OnboardingTaxAccounts onClose={() => setTaxAccountsOpen(false)} onSaved={() => { setTaxAccountsOpen(false); saved(); }} />}
  </section>;
}
