"use client";

import type { ComponentType, ReactNode } from "react";
import { AlertTriangle, CheckCircle2, Inbox, Info, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { TableCell, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { statusLabel, statusTone } from "./status";

export const tabTriggerClass = "shrink-0 gap-1.5 whitespace-nowrap data-[state=active]:bg-background";

const avatarTones = [
  "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
  "bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-300",
  "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  "bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-300",
  "bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300",
  "bg-cyan-100 text-cyan-700 dark:bg-cyan-950 dark:text-cyan-300",
];

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  return `${parts[0][0] ?? ""}${parts.length > 1 ? parts[parts.length - 1][0] ?? "" : ""}`.toUpperCase();
}

export function PersonAvatar({ name, size = "md", className }: {
  name: string; size?: "sm" | "md" | "lg"; className?: string;
}) {
  const tone = avatarTones[[...name].reduce((sum, character) => sum + character.charCodeAt(0), 0) % avatarTones.length];
  return <span aria-hidden="true" className={cn(
    "grid shrink-0 place-items-center rounded-full font-semibold ring-1 ring-black/5 dark:ring-white/10",
    size === "sm" && "size-8 text-[11px]",
    size === "md" && "size-10 text-xs",
    size === "lg" && "size-12 text-sm",
    tone, className,
  )}>{initials(name)}</span>;
}

const metricTones = {
  emerald: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
  sky: "bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-300",
  amber: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  rose: "bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300",
  slate: "bg-muted text-muted-foreground",
};

export function MetricCard({ icon: Icon, label, value, detail, tone = "emerald", alert = false }: {
  icon?: ComponentType<{ className?: string }>;
  label: string;
  value: ReactNode;
  detail?: ReactNode;
  tone?: keyof typeof metricTones;
  alert?: boolean;
}) {
  return <div className={cn("rounded-xl border bg-card p-4 shadow-xs", alert && "border-rose-300 dark:border-rose-900")}>
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <p className="text-xs font-medium text-muted-foreground">{label}</p>
        <div className="mt-1 truncate font-mono text-xl font-semibold tabular-nums">{value}</div>
        {detail && <p className="mt-1 text-xs text-muted-foreground">{detail}</p>}
      </div>
      {Icon && <span className={cn("grid size-9 shrink-0 place-items-center rounded-lg", metricTones[tone])}>
        <Icon className="size-4" />
      </span>}
    </div>
  </div>;
}

export function MetricButton({ active, onClick, label, ringClass = "ring-emerald-500/40", children }: {
  active?: boolean; onClick?: () => void; label: string; ringClass?: string; children: ReactNode;
}) {
  return <button type="button" aria-label={label} aria-pressed={active} onClick={onClick}
    className={cn("rounded-xl text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/40",
      active && `ring-2 ring-offset-2 ring-offset-background ${ringClass}`)}>
    {children}
  </button>;
}

export function SectionHeading({ step, title, description, aside }: {
  step?: string; title: string; description?: string; aside?: ReactNode;
}) {
  return <div className="flex flex-wrap items-start justify-between gap-3">
    <div className="flex min-w-0 items-start gap-2.5">
      {step && <span className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-full bg-emerald-100 text-[11px] font-semibold text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">{step}</span>}
      <div className="min-w-0">
        <p className="text-sm font-semibold">{title}</p>
        {description && <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>}
      </div>
    </div>
    {aside}
  </div>;
}

export function Panel({ title, description, actions, children, className }: {
  title?: string; description?: string; actions?: ReactNode; children: ReactNode; className?: string;
}) {
  return <section className={cn("min-w-0 rounded-lg border bg-card p-4", className)}>
    {(title || actions) && <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
      <div>
        {title && <h2 className="text-base font-semibold">{title}</h2>}
        {description && <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>}
      </div>
      {actions}
    </div>}
    {children}
  </section>;
}

export function Kv({ rows }: { rows: Array<[string, ReactNode, "total"?]> }) {
  return <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1.5 text-sm">
    {rows.map(([label, value, kind]) => <div key={label} className={cn("contents", kind === "total" && "[&>dt]:border-t [&>dt]:pt-1 [&>dd]:border-t [&>dd]:pt-1")}>
      <dt className={kind === "total" ? "font-semibold" : "text-muted-foreground"}>{label}</dt>
      <dd className={cn("text-right font-mono tabular-nums", kind === "total" && "font-semibold")}>{value}</dd>
    </div>)}
  </dl>;
}

export function EmptyState({ icon: Icon = Inbox, title, description, action }: {
  icon?: ComponentType<{ className?: string }>;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return <div className="flex flex-col items-center gap-2 py-10 text-center">
    <span className="grid size-11 place-items-center rounded-full bg-muted text-muted-foreground"><Icon className="size-5" /></span>
    <p className="text-sm font-medium">{title}</p>
    {description && <p className="max-w-sm text-xs text-muted-foreground">{description}</p>}
    {action && <div className="mt-1">{action}</div>}
  </div>;
}

export function FilterBar({ children, count, noun = "rows" }: { children: ReactNode; count?: number; noun?: string }) {
  return <div className="mb-3 flex flex-wrap items-end gap-2 rounded-xl border bg-muted/20 p-3">
    {children}
    {count !== undefined && <span className="ml-auto self-center font-mono text-xs text-muted-foreground">{count} {noun}</span>}
  </div>;
}

export function FilterField({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return <label className={cn("min-w-36 space-y-1.5 text-[11px] font-medium text-muted-foreground", className)}>
    <span>{label}</span>
    {children}
  </label>;
}

const noticeStyles = {
  success: "border-emerald-200 bg-emerald-50/70 text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/60 dark:text-emerald-200",
  error: "border-destructive/40 bg-destructive/5 text-destructive",
  warning: "border-amber-300 bg-amber-50/70 text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200",
  info: "border-sky-200 bg-sky-50/70 text-sky-900 dark:border-sky-900 dark:bg-sky-950/40 dark:text-sky-200",
} as const;
const noticeIcons = { success: CheckCircle2, error: AlertTriangle, warning: AlertTriangle, info: Info } as const;

export function Notice({ tone = "success", title, children, references, onDismiss, className }: {
  tone?: keyof typeof noticeStyles;
  title?: string;
  children?: ReactNode;
  references?: string[];
  onDismiss?: () => void;
  className?: string;
}) {
  const Icon = noticeIcons[tone];
  return <div role={tone === "error" ? "alert" : "status"}
    className={cn("flex flex-wrap items-start gap-3 rounded-xl border p-3 text-sm", noticeStyles[tone], className)}>
    <Icon className="mt-0.5 size-4 shrink-0" />
    <div className="min-w-0 flex-1">
      {title && <p className="font-semibold">{title}</p>}
      {children && <div className={cn("min-w-0", title && "mt-0.5")}>{children}</div>}
      {!!references?.length && <div className="mt-2 flex flex-wrap gap-2 font-mono text-[11px]">
        {references.map(reference => <span key={reference} className="rounded-md border bg-background/70 px-2 py-1">{reference}</span>)}
      </div>}
    </div>
    {onDismiss && <Button type="button" size="icon" variant="ghost" className="size-7 shrink-0" onClick={onDismiss} aria-label="Dismiss notice">
      <X className="size-4" />
    </Button>}
  </div>;
}

export function StatusChip({ status, label, className }: { status: string; label?: string; className?: string }) {
  return <span className={cn("inline-flex items-center whitespace-nowrap rounded-md border px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide",
    statusTone(status), className)}>
    {label ?? statusLabel(status)}
  </span>;
}

export function DetailDialog({ open, onOpenChange, title, description, children, footer, wide = true, footerClassName }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
  footerClassName?: string;
}) {
  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className={cn("max-h-[92dvh] overflow-x-hidden overflow-y-auto", wide ? "sm:max-w-4xl" : "sm:max-w-xl")}>
      <DialogHeader>
        <DialogTitle>{title}</DialogTitle>
        {description && <DialogDescription>{description}</DialogDescription>}
      </DialogHeader>
      {children}
      {footer && <DialogFooter className={cn("flex-wrap", footerClassName)}>{footer}</DialogFooter>}
    </DialogContent>
  </Dialog>;
}

export function MetricCardsSkeleton({ count = 4 }: { count?: number }) {
  return <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-hidden="true">
    {Array.from({ length: count }, (_, index) => <div key={index} className="h-28 animate-pulse rounded-xl border bg-muted/30" />)}
  </div>;
}

export function TableRowsSkeleton({ rows = 6, columns = 6 }: { rows?: number; columns?: number }) {
  return <>{Array.from({ length: rows }, (_, row) => <TableRow key={row} className="hover:bg-transparent">
    {Array.from({ length: columns }, (_, cell) => <TableCell key={cell}>
      <Skeleton className={cn("h-4", cell === 0 ? "w-32" : "w-full max-w-24")} />
    </TableCell>)}
  </TableRow>)}</>;
}

export function DetailSkeleton() {
  return <div className="space-y-3" aria-hidden="true">
    <Skeleton className="h-8 w-64" />
    <Skeleton className="h-28 w-full rounded-xl" />
    <Skeleton className="h-40 w-full rounded-xl" />
    <Skeleton className="h-40 w-full rounded-xl" />
  </div>;
}
