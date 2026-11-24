"use client";

import Link from "next/link";
import type { ComponentType, ReactNode } from "react";
import {
  AlertTriangle, ArrowDownLeft, ArrowRight, CheckCircle2, PiggyBank, UsersRound, Wallet, ClipboardCheck,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { transactionMoney } from "@/modules/financial-management/treasury/bank-reconciliation/utils/transactionDisplay";
import { MetricCard } from "../../members/components";
import type { DashboardSection, DashboardSummary, DashboardWorkItem } from "./dashboard-types";

export const money = (amount: string) => transactionMoney(amount, "PHP").replace(/^-/, "−");
export const signedMoney = (amount: string) => amount.startsWith("-") || amount === "0.00" ? money(amount) : `+${money(amount)}`;

const workKindLabels: Record<DashboardWorkItem["kind"], string> = {
  membership: "Membership",
  loan: "Loan",
  withdrawal: "Withdrawal",
  release: "Release",
  clearance: "Clearance",
};

const workKindTones: Record<DashboardWorkItem["kind"], string> = {
  membership: "border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-800 dark:bg-slate-900/60 dark:text-slate-300",
  loan: "border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900 dark:bg-amber-950/50 dark:text-amber-300",
  withdrawal: "border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-900 dark:bg-rose-950/50 dark:text-rose-300",
  release: "border-sky-200 bg-sky-50 text-sky-800 dark:border-sky-900 dark:bg-sky-950/60 dark:text-sky-300",
  clearance: "border-violet-200 bg-violet-50 text-violet-800 dark:border-violet-900 dark:bg-violet-950/50 dark:text-violet-300",
};

function sectionData<T>(section: DashboardSection<T>): T | undefined {
  return "data" in section ? section.data : undefined;
}

function unavailableMessage<T>(section: DashboardSection<T>) {
  return "data" in section ? undefined : section.message;
}

const moneyValue = (value: string) => <span className="text-lg 2xl:text-xl">{money(value)}</span>;

export function DashboardLink({ href, children, className }: { href: string; children: ReactNode; className?: string }) {
  return <Link href={href} className={cn(
    "inline-flex items-center gap-0.5 rounded-sm text-sm text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/40",
    className,
  )}>
    {children}
    <ArrowRight className="size-3 shrink-0 opacity-70" aria-hidden="true" />
  </Link>;
}

export function WorkKindBadge({ kind }: { kind: DashboardWorkItem["kind"] }) {
  return <Badge variant="outline" className={cn("whitespace-nowrap text-[11px] font-medium", workKindTones[kind])}>
    {workKindLabels[kind]}
  </Badge>;
}

export function DashboardEmpty({
  icon: Icon = CheckCircle2,
  title,
  description,
  action,
  compact = false,
}: {
  icon?: ComponentType<{ className?: string }>;
  title: string;
  description?: string;
  action?: ReactNode;
  compact?: boolean;
}) {
  return <div className={cn("flex flex-col items-center gap-1.5 text-center", compact ? "px-2 py-4" : "px-4 py-6")}>
    <span className="grid size-10 place-items-center rounded-full bg-muted text-muted-foreground">
      <Icon className="size-4" />
    </span>
    <p className="text-sm font-medium">{title}</p>
    {description && <p className="max-w-xs text-xs text-muted-foreground">{description}</p>}
    {action && <div className="mt-1">{action}</div>}
  </div>;
}

export function DashboardAlert({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return <div role="alert" className="flex flex-wrap items-center gap-3 rounded-xl border border-destructive/40 bg-destructive/5 p-3">
    <AlertTriangle className="size-4 shrink-0 text-destructive" aria-hidden="true" />
    <p className="min-w-0 flex-1 text-sm text-destructive">{message}</p>
    {onRetry && <Button type="button" size="sm" variant="outline" onClick={onRetry}>Retry</Button>}
  </div>;
}

export function DashboardKpis({ summary }: { summary: DashboardSummary }) {
  const { members, savings, portfolio, moneyIn, work } = summary;
  const prior = summary.months[4] ?? summary.months[0];
  const current = summary.months[5] ?? summary.months[summary.months.length - 1];
  const membersData = sectionData(members);
  const savingsData = sectionData(savings);
  const portfolioData = sectionData(portfolio);
  const moneyInData = sectionData(moneyIn);
  const workData = sectionData(work);
  const actions = workData ? workData.approvals + workData.releases + workData.clearances : 0;
  const pastDueAlert = Boolean(portfolioData && portfolioData.pastDue !== "0.00");

  return <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6">
    <MetricCard icon={UsersRound} label="Members"
      value={membersData?.active ?? "—"}
      detail={membersData ? `${membersData.applying} applying · ${membersData.notJoined} not yet joined` : unavailableMessage(members)}
      tone={membersData ? "emerald" : "slate"} />
    <MetricCard icon={PiggyBank} label="Total savings"
      value={savingsData ? moneyValue(savingsData.total) : "—"}
      detail={savingsData ? `${signedMoney(savingsData.lastMonthChange)} in ${prior?.name ?? "the prior month"}` : unavailableMessage(savings)}
      tone={savingsData ? "emerald" : "slate"} />
    <MetricCard icon={Wallet} label="Loan receivables"
      value={portfolioData ? moneyValue(portfolioData.receivables) : "—"}
      detail={portfolioData ? `${portfolioData.activeLoans} active loans` : unavailableMessage(portfolio)}
      tone={portfolioData ? "sky" : "slate"} />
    <MetricCard icon={ArrowDownLeft} label={`Loan collections, ${prior?.label ?? ""}`.trim()}
      value={moneyInData ? moneyValue(moneyInData.loanPayments[4] ?? "0.00") : "—"}
      detail={moneyInData ? `${money(moneyInData.loanPayments[5] ?? "0.00")} so far in ${current?.name ?? "this month"}` : unavailableMessage(moneyIn)}
      tone={moneyInData ? "sky" : "slate"} />
    <MetricCard icon={portfolioData && !pastDueAlert ? CheckCircle2 : AlertTriangle} label="Past due"
      value={portfolioData ? moneyValue(portfolioData.pastDue) : "—"}
      detail={portfolioData ? `${portfolioData.pastDuePercent}% of receivables · ${money(portfolioData.penalties)} penalties` : unavailableMessage(portfolio)}
      tone={portfolioData ? (pastDueAlert ? "rose" : "emerald") : "slate"}
      alert={pastDueAlert} />
    <MetricCard icon={ClipboardCheck} label="Needs action"
      value={workData ? actions : "—"}
      detail={workData ? `${workData.approvals} approvals · ${workData.releases} for release · ${workData.clearances} clearances` : unavailableMessage(work)}
      tone={workData && actions > 0 ? "amber" : "slate"} />
  </div>;
}

export function DashboardKpiSkeleton() {
  return <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6" aria-hidden="true">
    {Array.from({ length: 6 }, (_, index) => <Skeleton key={index} className="h-28 rounded-xl" />)}
  </div>;
}

function PanelSkeleton({ body }: { body: string }) {
  return <div className="rounded-lg border bg-card p-4">
    <Skeleton className="h-5 w-40" />
    <Skeleton className="mt-1.5 h-3 w-56" />
    <Skeleton className={cn("mt-4 w-full", body)} />
  </div>;
}

export function DashboardSkeleton() {
  return <div className="space-y-4">
    <DashboardKpiSkeleton />
    <div className="grid gap-4 xl:grid-cols-2" aria-hidden="true">
      <PanelSkeleton body="h-52" />
      <PanelSkeleton body="h-52" />
    </div>
    <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3" aria-hidden="true">
      <PanelSkeleton body="h-32" />
      <PanelSkeleton body="h-32" />
      <PanelSkeleton body="h-32" />
    </div>
    <div aria-hidden="true"><PanelSkeleton body="h-52" /></div>
  </div>;
}
