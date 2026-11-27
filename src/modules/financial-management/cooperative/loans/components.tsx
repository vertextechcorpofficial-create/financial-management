"use client";

import { AlertTriangle, CheckCircle2, XCircle } from "lucide-react";
import { TableCell, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import type { LoanAssessmentCheck } from "./loan-assessment";

export function RegisterSkeleton() {
  return (
    <>
      {Array.from({ length: 6 }, (_, index) => (
        <TableRow key={index} className="hover:bg-transparent">
          <TableCell>
            <div className="space-y-2">
              <div className="h-3.5 w-24 animate-pulse rounded bg-muted" />
              <div className="h-2.5 w-32 animate-pulse rounded bg-muted" />
            </div>
          </TableCell>
          <TableCell>
            <div className="flex items-center gap-3">
              <div className="size-10 animate-pulse rounded-full bg-muted" />
              <div className="space-y-2">
                <div className="h-3 w-32 animate-pulse rounded bg-muted" />
                <div className="h-2.5 w-24 animate-pulse rounded bg-muted" />
              </div>
            </div>
          </TableCell>
          <TableCell className="hidden 2xl:table-cell"><div className="h-4 w-24 animate-pulse rounded bg-muted" /></TableCell>
          <TableCell><div className="h-5 w-20 animate-pulse rounded-full bg-muted" /></TableCell>
          <TableCell className="hidden lg:table-cell"><div className="h-5 w-16 animate-pulse rounded-full bg-muted" /></TableCell>
          <TableCell className="hidden lg:table-cell"><div className="ml-auto h-4 w-20 animate-pulse rounded bg-muted" /></TableCell>
          <TableCell><div className="ml-auto h-4 w-24 animate-pulse rounded bg-muted" /></TableCell>
          <TableCell className="hidden lg:table-cell"><div className="ml-auto h-4 w-16 animate-pulse rounded bg-muted" /></TableCell>
          <TableCell />
        </TableRow>
      ))}
    </>
  );
}

export function DetailSkeleton() {
  return (
    <div className="space-y-4" aria-busy="true">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => <div key={index} className="h-24 animate-pulse rounded-xl border bg-muted/40" />)}
      </div>
      <div className="h-28 animate-pulse rounded-xl border bg-muted/30" />
      <div className="h-40 animate-pulse rounded-xl border bg-muted/30" />
    </div>
  );
}

export function AssessmentCheck({ ok, label, detail, severity }: Omit<LoanAssessmentCheck, "key">) {
  const warning = !ok && severity === "warning";
  const Icon = ok ? CheckCircle2 : warning ? AlertTriangle : XCircle;
  return (
    <li className={cn(
      "flex items-start gap-2.5 rounded-lg border p-2.5 text-sm",
      ok && "border-emerald-200/70 bg-emerald-50/40 dark:border-emerald-900/60 dark:bg-emerald-950/20",
      warning && "border-amber-300 bg-amber-50/40 dark:border-amber-900 dark:bg-amber-950/20",
      !ok && !warning && "border-rose-200/70 bg-rose-50/40 dark:border-rose-900/60 dark:bg-rose-950/20",
    )}>
      <Icon aria-hidden="true" className={cn("mt-0.5 size-4 shrink-0",
        ok ? "text-emerald-600" : warning ? "text-amber-700 dark:text-amber-400" : "text-rose-600")} />
      <span className="min-w-0">
        <span className="font-medium">{label}</span>
        {warning && <span className="ml-2 text-xs font-medium text-amber-800 dark:text-amber-300">Warning</span>}
        <span className="block text-xs text-muted-foreground">{detail}</span>
      </span>
    </li>
  );
}
