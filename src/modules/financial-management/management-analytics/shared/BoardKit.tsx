import type { ReactNode } from "react";
import Link from "next/link";

import { cn } from "@/lib/utils";

import { TONE_FILL, TONE_TEXT, type Tone } from "./Charts";

/**
 * The shared board furniture: page header, section headings, stat tiles and the small pieces the
 * nine boards repeat. Shape follows the reference prototype; colour follows the app's tokens.
 */

const TOP_EDGE: Record<Tone, string> = {
  success: "border-t-success",
  warning: "border-t-warning",
  danger: "border-t-destructive",
  info: "border-t-info",
  primary: "border-t-primary",
  muted: "border-t-muted-foreground",
};

export function BoardHeader({
  title,
  subtitle,
  meta,
  right,
}: {
  title: string;
  subtitle?: ReactNode;
  meta?: ReactNode;
  right?: ReactNode;
}) {
  return (
    <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-2xl font-semibold leading-tight tracking-tight">{title}</h1>
        {subtitle ? <p className="mt-1 max-w-3xl text-sm text-muted-foreground">{subtitle}</p> : null}
      </div>
      {meta || right ? (
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {meta}
          {right}
        </div>
      ) : null}
    </div>
  );
}

export function MicroLabel({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span className={cn("text-[11px] font-medium uppercase tracking-[0.06em] text-muted-foreground", className)}>
      {children}
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
    <div className="mb-2.5 mt-6 flex flex-wrap items-end justify-between gap-2 first:mt-0">
      <div className="min-w-0">
        <h2 className="text-[15px] font-semibold leading-tight">{title}</h2>
        {description ? <p className="mt-0.5 text-xs text-muted-foreground">{description}</p> : null}
      </div>
      {right ? <div className="flex flex-wrap items-center gap-2">{right}</div> : null}
    </div>
  );
}

/** The card shell used all over the boards: one border, one radius, no shadow pile-ups. */
export function Panel({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <section className={cn("min-w-0 rounded-xl border border-border/60 bg-card shadow-sm", className)}>{children}</section>
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
    <div className={cn("flex flex-wrap items-start justify-between gap-2 border-b border-border/60 px-4 py-3", className)}>
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-sm font-semibold leading-tight">{title}</h3>
          {count !== undefined && count !== null ? (
            <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium tabular-nums text-muted-foreground">
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

/** The reference's KPI tile: domain, name, figure, target line, one footnote row. */
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
}) {
  const body = (
    <>
      <MicroLabel className="truncate">{label}</MicroLabel>
      <p className="mt-0.5 truncate text-sm font-semibold" title={typeof name === "string" ? name : undefined}>
        {name}
      </p>
      <div className="mt-2 flex items-end justify-between gap-2">
        <p className="font-mono text-2xl leading-none tabular-nums">
          {value}
          {unit ? <span className="ml-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{unit}</span> : null}
        </p>
        {chart ? <span className="shrink-0">{chart}</span> : null}
      </div>
      {note ? <p className="mt-1.5 text-[11.5px] text-muted-foreground">{note}</p> : null}
      {foot ? (
        <div className="mt-3 flex items-center justify-between gap-2 border-t border-dashed border-border pt-2 text-[11px] text-muted-foreground">
          {foot}
        </div>
      ) : null}
    </>
  );

  const shared = cn(
    "flex min-w-0 flex-col rounded-xl border border-border/60 bg-card p-4 shadow-sm",
    emphasis && `border-t-[3px] ${TOP_EDGE[tone]}`,
  );

  if (!href) {
    return <div className={shared}>{body}</div>;
  }

  return (
    <Link href={href} className={cn(shared, "transition-colors hover:border-foreground/25")}>
      {body}
    </Link>
  );
}

/** A compact key/figure/note cell for a row of five inside one panel. */
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
      <p className={cn("mt-0.5 font-mono text-xl leading-none tabular-nums", tone && TONE_TEXT[tone])}>{value}</p>
      {note ? <p className="mt-1 text-[11.5px] leading-snug text-muted-foreground">{note}</p> : null}
    </div>
  );
}

export function Dot({ tone, className }: { tone: Tone; className?: string }) {
  return <span aria-hidden className={cn("inline-block h-2 w-2 shrink-0 rounded-full", TONE_FILL[tone], className)} />;
}

/** Filter or preset chips that are links, so the page stays server rendered. */
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
        "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs transition-colors",
        active
          ? "border-foreground bg-foreground text-background"
          : "border-border bg-card text-muted-foreground hover:border-foreground/30 hover:text-foreground",
      )}
    >
      {children}
      {count !== undefined ? <span className="tabular-nums opacity-70">{count}</span> : null}
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
    primary: "border-l-primary bg-primary/5 text-foreground",
    warning: "border-l-warning bg-warning-bg text-foreground",
    danger: "border-l-destructive bg-destructive/10 text-foreground",
    success: "border-l-success bg-success-bg text-foreground",
    info: "border-l-info bg-info-bg text-foreground",
  };
  return (
    <div className={cn("rounded-r-lg border border-l-[3px] border-border/60 px-3.5 py-2.5 text-[13px]", surface[tone])}>
      {title ? <p className="font-medium">{title}</p> : null}
      {children ? <div className={cn("text-xs leading-5 text-muted-foreground", title && "mt-0.5")}>{children}</div> : null}
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="px-4 py-8 text-center text-sm text-muted-foreground">{children}</p>;
}

/**
 * A board that could not read its data says why. Printing zeroes over a failed
 * read is the one mistake a reader cannot see.
 */
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
