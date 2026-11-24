"use client";

import type { ReactNode } from "react";
import { AlertTriangle, CheckCircle2, HandCoins, PiggyBank, Scale, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { centsToAmount } from "../../loans/loan-schedule";
import { peso } from "../../members/format";
import { MetricCard } from "../../members/components";
import { ConsoleDialog } from "../components/ui";
import type { DividendPreview } from "./allocation";

const money = (value?: bigint) => <span className="text-lg 2xl:text-xl">{value === undefined ? "—" : peso(centsToAmount(value))}</span>;

export function DividendKpis({ preview, loading }: { preview?: DividendPreview; loading: boolean }) {
  if (loading && !preview) return <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-hidden="true">
    {Array.from({ length: 4 }, (_, index) => <div key={index} className="h-28 animate-pulse rounded-xl border bg-muted/30" />)}
  </div>;
  const detail = preview ? undefined : loading ? "Loading allocation data" : "Complete the reviewed allocation";
  return <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
    <MetricCard icon={Wallet} label="Net surplus" value={money(preview?.netSurplus)}
      detail={preview ? "Reviewed surplus" : detail} tone="emerald" />
    <MetricCard icon={Scale} label="Distributable" value={money(preview?.distributable)}
      detail={preview ? "After reserve and education" : detail} tone="sky" />
    <MetricCard icon={PiggyBank} label="Savings credits" value={money(preview?.savings.allocated)}
      detail={preview?.effectiveSavingsRate ? `${preview.effectiveSavingsRate} effective rate` : preview ? "Allocated to member savings" : detail}
      tone="amber" />
    <MetricCard icon={HandCoins} label="Patronage refunds" value={money(preview?.patronage.allocated)}
      detail={preview ? "Allocated from loan interest" : detail} tone="slate" />
  </div>;
}

export type ReadinessCheck = {
  label: string;
  detail: string;
  state: "ok" | "pending" | "blocked";
};

export function PostingReadiness({ checks }: { checks: ReadinessCheck[] }) {
  return <section className="rounded-xl border bg-card p-4 shadow-xs">
    <h3 className="text-sm font-semibold">Posting readiness</h3>
    <ul className="mt-3 space-y-3">
      {checks.map(check => <li key={check.label} className="flex items-start gap-2.5">
        {check.state === "ok"
          ? <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
          : <AlertTriangle className={check.state === "blocked"
            ? "mt-0.5 size-4 shrink-0 text-rose-600 dark:text-rose-400"
            : "mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-400"} />}
        <div className="min-w-0">
          <p className="text-sm font-medium">{check.label}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">{check.detail}</p>
        </div>
      </li>)}
    </ul>
  </section>;
}

export function DividendAlert({ tone, message, action }: {
  tone: "success" | "error" | "warning";
  message: ReactNode;
  action?: ReactNode;
}) {
  const Icon = tone === "success" ? CheckCircle2 : AlertTriangle;
  return <div role={tone === "success" ? "status" : "alert"} className={tone === "error"
    ? "flex flex-wrap items-start gap-3 rounded-xl border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive"
    : tone === "warning"
      ? "flex flex-wrap items-start gap-3 rounded-xl border border-amber-300 bg-amber-50/70 p-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200"
      : "flex flex-wrap items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50/70 p-3 text-sm text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/60 dark:text-emerald-200"}>
    <Icon className="mt-0.5 size-4 shrink-0" />
    <p className="min-w-0 flex-1">{message}</p>
    {action}
  </div>;
}

export function DiscardYearDialog({ year, nextYear, onCancel, onConfirm }: {
  year: string;
  nextYear: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return <ConsoleDialog open onOpenChange={open => { if (!open) onCancel(); }}
    title={`Open ${nextYear}?`}
    description={`Unsaved allocation changes for ${year} will be discarded.`}
    footer={<>
      <Button variant="outline" type="button" onClick={onCancel}>Keep editing</Button>
      <Button type="button" onClick={onConfirm}>Discard and open {nextYear}</Button>
    </>}>
    <p className="text-sm text-muted-foreground">The saved draft for {year} remains unchanged.</p>
  </ConsoleDialog>;
}
