import type { ReactNode } from "react";
import Link from "next/link";

import { cn } from "@/lib/utils";

import { TONE_FILL, TONE_TEXT, type Tone } from "./Charts";
import { ERP_KPI_QUALIFIERS, ERP_LIVE_KEYS } from "./analytics-screens";

const TOP_EDGE: Record<Tone, string> = {
  success: "border-l-emerald-600 dark:border-l-emerald-500",
  warning: "border-l-amber-600 dark:border-l-amber-500",
  danger: "border-l-rose-600 dark:border-l-rose-500",
  info: "border-l-sky-600 dark:border-l-sky-500",
  primary: "border-l-teal-700 dark:border-l-teal-400",
  muted: "border-l-muted-foreground/50",
};

export function BoardHeader({
  title,
  subtitle,
  eyebrow,
  meta,
  right,
}: {
  title: string;
  subtitle?: ReactNode;
  eyebrow?: ReactNode;
  meta?: ReactNode;
  right?: ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-4 pb-1">
      <div className="min-w-0 space-y-1">
        {eyebrow ? (
          <p className="text-[11px] font-semibold uppercase tracking-[0.09em] text-teal-700 dark:text-teal-400">
            {eyebrow}
          </p>
        ) : null}
        <h1 className="text-[22px] font-semibold leading-tight tracking-tight text-foreground sm:text-2xl">{title}</h1>
        {subtitle ? <p className="max-w-3xl text-[13px] leading-relaxed text-muted-foreground">{subtitle}</p> : null}
      </div>
      {meta || right ? (
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {meta}
          {right}
        </div>
      ) : null}
    </header>
  );
}

export function MicroLabel({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span className={cn("text-[10.5px] font-semibold uppercase tracking-[0.07em] text-muted-foreground", className)}>
      {children}
    </span>
  );
}

export function SampleBadge({ label = "Sample data" }: { label?: string }) {
  return (
    <span
      className="inline-flex items-center gap-1 rounded-md border border-amber-500/35 bg-amber-500/10 px-2 py-0.5 text-[10.5px] font-semibold tracking-tight text-amber-800 dark:text-amber-300"
      title="Returned by ERP test server with sample: true — preview layout only, not live production numbers"
    >
      <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-amber-500" />
      {label}
    </span>
  );
}

export function LiveBadge({ label = "Live ERP" }: { label?: string }) {
  return (
    <span
      className="inline-flex items-center gap-1 rounded-md border border-emerald-600/30 bg-emerald-600/10 px-2 py-0.5 text-[10.5px] font-semibold tracking-tight text-emerald-800 dark:border-emerald-400/30 dark:bg-emerald-400/10 dark:text-emerald-300"
      title="Live reading computed directly from ERP_SERVER"
    >
      <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
      {label}
    </span>
  );
}

export function SectionHeading({
  title,
  description,
  right,
}: {
  title: ReactNode;
  description?: ReactNode;
  right?: ReactNode;
}) {
  return (
    <div className="mb-3 mt-6 flex flex-wrap items-end justify-between gap-2 first:mt-0">
      <div className="min-w-0">
        <h2 className="text-[14.5px] font-semibold leading-tight tracking-tight text-foreground">{title}</h2>
        {description ? <p className="mt-0.5 text-xs text-muted-foreground">{description}</p> : null}
      </div>
      {right ? <div className="flex flex-wrap items-center gap-2">{right}</div> : null}
    </div>
  );
}

export function Panel({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <section
      className={cn(
        "min-w-0 overflow-hidden rounded-xl border border-border/75 bg-card shadow-[0_1px_2px_rgba(15,23,42,0.04)]",
        className,
      )}
    >
      {children}
    </section>
  );
}

export function PanelHead({
  title,
  description,
  right,
  count,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  right?: ReactNode;
  count?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-center justify-between gap-2 border-b border-border/60 bg-muted/20 px-4 py-3",
        className,
      )}
    >
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-[13.5px] font-semibold leading-tight tracking-tight text-foreground">{title}</h3>
          {count !== undefined && count !== null ? (
            <span className="rounded-md bg-muted px-1.5 py-0.5 font-mono text-[11px] font-medium tabular-nums text-muted-foreground">
              {count}
            </span>
          ) : null}
        </div>
        {description ? <p className="mt-0.5 text-xs text-muted-foreground">{description}</p> : null}
      </div>
      {right ? <div className="flex flex-wrap items-center gap-2">{right}</div> : null}
    </div>
  );
}

export function ErpTags({
  kpiKey,
  sourceCodes,
  basis,
  compact = false,
}: {
  kpiKey?: string | null;
  sourceCodes?: string | null;
  basis?: string | null;
  compact?: boolean;
}) {
  const key = (kpiKey ?? "").trim();
  const isErp = (sourceCodes ?? "").toUpperCase().includes("ERP") || ERP_LIVE_KEYS.has(key);
  const qualifier = ERP_KPI_QUALIFIERS[key];
  const isProvisional = (basis ?? "").toUpperCase() === "PROVISIONAL";

  if (!isErp && !qualifier && !isProvisional) return null;

  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      {qualifier === "STAND_IN" ? (
        <span
          className="rounded border border-amber-500/35 bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-medium text-amber-800 dark:text-amber-300"
          title="Stand-in metric using wrong/excess-item returns because warehouse picking errors are not yet logged"
        >
          Stand-in
        </span>
      ) : null}
      {qualifier === "PARTIAL" ? (
        <span
          className="rounded border border-amber-500/35 bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-medium text-amber-800 dark:text-amber-300"
          title="Partial metric: includes trip allowances & parking only (excludes fuel, repairs, crew salaries)"
        >
          Partial
        </span>
      ) : null}
      {isErp && !compact ? (
        <span
          className="rounded border border-teal-700/25 bg-teal-700/10 px-1.5 py-0.5 text-[10px] font-medium text-teal-800 dark:border-teal-400/25 dark:bg-teal-400/10 dark:text-teal-300"
          title="Computed by ERP_SERVER"
        >
          ERP
        </span>
      ) : null}
      {isProvisional ? (
        <span
          className="rounded border border-sky-600/25 bg-sky-600/10 px-1.5 py-0.5 text-[10px] font-medium text-sky-800 dark:border-sky-400/25 dark:bg-sky-400/10 dark:text-sky-300"
          title="Month still running — provisional reading, not yet final"
        >
          MTD
        </span>
      ) : null}
    </span>
  );
}

export function StatTile({
  label,
  name,
  value,
  unit,
  note,
  foot,
  chart,
  href,
  tone = "primary",
  emphasis = false,
  tags,
}: {
  label: ReactNode;
  name: ReactNode;
  value: ReactNode;
  unit?: ReactNode;
  note?: ReactNode;
  foot?: ReactNode;
  chart?: ReactNode;
  href?: string;
  tone?: Tone;
  emphasis?: boolean;
  tags?: ReactNode;
}) {
  const body = (
    <>
      <div className="flex items-start justify-between gap-2">
        <MicroLabel className="truncate">{label}</MicroLabel>
        {tags}
      </div>
      <p className="mt-1 truncate text-[13.5px] font-semibold text-foreground" title={typeof name === "string" ? name : undefined}>
        {name}
      </p>
      <div className="mt-2.5 flex items-end justify-between gap-2">
        <p className="font-mono text-[22px] font-semibold leading-none tracking-tight tabular-nums text-foreground">
          {value}
          {unit ? <span className="ml-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{unit}</span> : null}
        </p>
        {chart ? <span className="shrink-0">{chart}</span> : null}
      </div>
      {note ? <p className="mt-2 text-[11.5px] text-muted-foreground">{note}</p> : null}
      {foot ? (
        <div className="mt-3 flex items-center justify-between gap-2 border-t border-border/60 pt-2 text-[11px] text-muted-foreground">
          {foot}
        </div>
      ) : null}
    </>
  );

  const shared = cn(
    "flex min-w-0 flex-col rounded-xl border border-border/75 bg-card p-4 shadow-[0_1px_2px_rgba(15,23,42,0.03)]",
    emphasis && `border-l-[3px] ${TOP_EDGE[tone]}`,
  );

  if (!href) {
    return <div className={shared}>{body}</div>;
  }

  return (
    <Link href={href} className={cn(shared, "transition-all hover:border-teal-700/40 hover:shadow-sm dark:hover:border-teal-400/40")}>
      {body}
    </Link>
  );
}

export function Stat({
  label,
  value,
  note,
  tone,
}: {
  label: ReactNode;
  value: ReactNode;
  note?: ReactNode;
  tone?: Tone;
}) {
  return (
    <div className="min-w-0">
      <MicroLabel>{label}</MicroLabel>
      <p className={cn("mt-1.5 font-mono text-2xl font-semibold leading-none tracking-tight tabular-nums", tone && TONE_TEXT[tone])}>
        {value}
      </p>
      {note ? <p className="mt-1.5 text-[11.5px] leading-snug text-muted-foreground">{note}</p> : null}
    </div>
  );
}

export function Dot({ tone, className }: { tone: Tone; className?: string }) {
  return <span aria-hidden className={cn("inline-block h-2 w-2 shrink-0 rounded-full", TONE_FILL[tone], className)} />;
}

export function ChipLink({
  href,
  active,
  children,
  count,
}: {
  href: string;
  active?: boolean;
  children: ReactNode;
  count?: number;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors",
        active
          ? "border-teal-800 bg-teal-800 text-white shadow-xs dark:border-teal-400 dark:bg-teal-400 dark:text-slate-950"
          : "border-border/70 bg-card text-muted-foreground hover:border-foreground/30 hover:text-foreground",
      )}
    >
      {children}
      {count !== undefined ? <span className="font-mono tabular-nums opacity-75">{count}</span> : null}
    </Link>
  );
}

export function Callout({
  tone = "primary",
  title,
  children,
}: {
  tone?: Extract<Tone, "primary" | "warning" | "danger" | "success" | "info">;
  title?: ReactNode;
  children?: ReactNode;
}) {
  const surface: Record<string, string> = {
    primary: "border-l-teal-700 bg-teal-700/5 text-foreground dark:border-l-teal-400 dark:bg-teal-400/10",
    warning: "border-l-amber-600 bg-amber-500/8 text-foreground",
    danger: "border-l-rose-600 bg-rose-500/8 text-foreground",
    success: "border-l-emerald-600 bg-emerald-500/8 text-foreground",
    info: "border-l-sky-600 bg-sky-500/8 text-foreground",
  };
  return (
    <div className={cn("rounded-lg border border-l-[3px] border-border/65 px-3.5 py-2.5 text-[13px]", surface[tone])}>
      {title ? <p className="font-semibold leading-snug">{title}</p> : null}
      {children ? <div className={cn("text-xs leading-5 text-muted-foreground", title && "mt-0.5")}>{children}</div> : null}
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="px-4 py-8 text-center text-sm text-muted-foreground">{children}</p>;
}

export function ReadFailure({ title, reason }: { title: string; reason: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-4">
      <BoardHeader title={title} subtitle="Nothing on this board is a figure until the read returns." />
      <Callout tone="danger" title="This board could not be read">
        {reason}
      </Callout>
    </div>
  );
}
