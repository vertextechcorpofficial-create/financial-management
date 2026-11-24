"use client";

import type { ComponentType, ReactNode } from "react";
import { FileCheck2, Landmark, Network, Percent, SearchX } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { StatusChip } from "../../console/components/ui";
import { MetricCard } from "../../members/components";
import { policyPercent } from "../policy-labels";
import { accountPurposes, type PolicyState } from "../policy-types";

type PolicyTab = "products" | "settings" | "documents" | "accounts" | "history";

export function PolicyKpis({ state, onSelect }: { state: PolicyState; onSelect: (tab: PolicyTab) => void }) {
  const openProducts = state.products.filter(product => product.isOpen).length;
  const cashProducts = state.products.filter(product => product.kind === "CASH").length;
  const goodsProducts = state.products.filter(product => product.kind === "GOODS").length;
  const activeTypes = state.documentTypes.filter(type => type.isActive).length;
  const activeRules = state.documentRules.filter(rule => rule.isActive).length;
  const mapped = state.mappings.length;
  const purposes = accountPurposes.length;
  const gaps = Math.max(0, purposes - mapped);
  const rates = state.settings?.exitSavingsAnnualRates ?? {};
  const latestYear = Object.keys(rates).sort((left, right) => right.localeCompare(left))[0];
  const latestRate = latestYear ? rates[latestYear] : undefined;
  const cards = [
    {
      key: "products" as const, icon: Landmark, tone: "emerald" as const,
      label: "Loan products", value: state.products.length,
      detail: `${openProducts} open · ${cashProducts} cash · ${goodsProducts} goods`,
    },
    {
      key: "documents" as const, icon: FileCheck2, tone: "sky" as const,
      label: "Document types", value: activeTypes,
      detail: `${activeRules} active requirement${activeRules === 1 ? "" : "s"}`,
    },
    {
      key: "accounts" as const, icon: Network, tone: "slate" as const,
      label: "Accounts mapped", value: `${mapped}/${purposes}`,
      detail: gaps ? `${gaps} purpose${gaps === 1 ? "" : "s"} still unmapped` : "All purposes covered",
    },
    {
      key: "settings" as const, icon: Percent, tone: "amber" as const,
      label: "Exit savings rate", value: latestRate ? policyPercent(latestRate) : "—",
      detail: latestYear ? `${latestYear} annual rate` : "No exit rates configured",
    },
  ];

  return <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
    {cards.map(card => <button key={card.key} type="button" onClick={() => onSelect(card.key)}
      className="rounded-xl text-left transition hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/40">
      <MetricCard icon={card.icon} label={card.label} value={card.value} detail={card.detail} tone={card.tone} />
    </button>)}
  </div>;
}

export function PolicyAreaBadge({ area }: { area: string }) {
  const tones: Record<string, string> = {
    "Loan products": "border-sky-200 bg-sky-50 text-sky-800 dark:border-sky-900 dark:bg-sky-950/60 dark:text-sky-300",
    "Savings & membership": "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/60 dark:text-emerald-300",
    "Required documents": "border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900 dark:bg-amber-950/50 dark:text-amber-300",
    "Chart of accounts & mappings": "border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-800 dark:bg-slate-900/60 dark:text-slate-300",
  };
  return <Badge variant="outline" className={cn("whitespace-nowrap font-medium", tones[area] ?? "text-muted-foreground")}>{area}</Badge>;
}

export function PolicyStatusChip({ active, activeLabel = "Active", inactiveLabel = "Inactive" }: {
  active: boolean;
  activeLabel?: string;
  inactiveLabel?: string;
}) {
  return <StatusChip status={active ? "ACTIVE" : "INACTIVE"} label={active ? activeLabel : inactiveLabel} />;
}

export function PolicyEnforcementChip({ enforcement }: { enforcement: "WARN" | "BLOCK" | "CHECK" }) {
  if (enforcement === "BLOCK") return <StatusChip status="REJECTED" label="Block" />;
  if (enforcement === "WARN") return <StatusChip status="PENDING" label="Warn" />;
  return <StatusChip status="READY" label="Checklist" />;
}

export function PolicyEmpty({ icon: Icon = SearchX, title, description, action, compact = false }: {
  icon?: ComponentType<{ className?: string }>;
  title: string;
  description?: string;
  action?: ReactNode;
  compact?: boolean;
}) {
  return <div className={cn("flex flex-col items-center gap-2 px-4 text-center", compact ? "py-6" : "py-10")}>
    <span className="grid size-11 place-items-center rounded-full bg-muted text-muted-foreground"><Icon className="size-5" /></span>
    <p className="text-sm font-medium">{title}</p>
    {description && <p className="max-w-sm text-xs text-muted-foreground">{description}</p>}
    {action && <div className="mt-1">{action}</div>}
  </div>;
}

export function PolicyKpiSkeleton() {
  return <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-hidden="true">
    {Array.from({ length: 4 }, (_, index) => <div key={index} className="h-28 animate-pulse rounded-xl border bg-muted/30" />)}
  </div>;
}

export function PolicyTableSkeleton({ rows = 6, columns = 5 }: { rows?: number; columns?: number }) {
  return <div className="overflow-hidden rounded-xl border" aria-busy="true">
    <Table>
      <TableHeader><TableRow>{Array.from({ length: columns }, (_, index) =>
        <TableHead key={index}><div className="h-3.5 w-20 animate-pulse rounded bg-muted" /></TableHead>)}</TableRow></TableHeader>
      <TableBody>{Array.from({ length: rows }, (_, row) => <TableRow key={row} className="hover:bg-transparent">
        {Array.from({ length: columns }, (_, cell) => <TableCell key={cell}>
          <div className={cn("h-3.5 animate-pulse rounded bg-muted", cell === 0 ? "w-32" : "w-16")} />
        </TableCell>)}
      </TableRow>)}</TableBody>
    </Table>
  </div>;
}
