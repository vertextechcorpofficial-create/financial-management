"use client";

import { AlertTriangle, Info, type LucideIcon } from "lucide-react";

/**
 * One notice style for the loan screens: a tinted surface with a short left rail, an
 * icon tile and an optional heading. Three tones only, so a warning is never mistaken
 * for a refusal and neither is mistaken for plain information.
 */
export type NoticeTone = "info" | "warning" | "danger";

const TONE: Record<NoticeTone, { rail: string; surface: string; tile: string; icon: LucideIcon }> = {
  info: {
    rail: "border-l-muted-foreground/50",
    surface: "bg-muted/60",
    tile: "bg-muted-foreground/15 text-foreground",
    icon: Info,
  },
  warning: {
    rail: "border-l-warning",
    surface: "bg-warning-bg",
    tile: "bg-warning text-warning-foreground",
    icon: AlertTriangle,
  },
  danger: {
    rail: "border-l-destructive",
    surface: "bg-destructive/10",
    tile: "bg-destructive text-destructive-foreground",
    icon: AlertTriangle,
  },
};

interface Props {
  tone?: NoticeTone;
  title?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}

export function Notice({ tone = "info", title, children, className }: Props) {
  const style = TONE[tone];
  const Icon = style.icon;

  return (
    <div
      className={[
        "flex items-start gap-2.5 rounded-lg border border-l-[3px] px-3 py-2.5",
        style.rail,
        style.surface,
        className ?? "",
      ].join(" ")}
    >
      <span className={`mt-px flex h-6 w-6 shrink-0 items-center justify-center rounded-md ${style.tile}`}>
        <Icon className="h-3.5 w-3.5" aria-hidden />
      </span>
      <div className="min-w-0 space-y-0.5">
        {title ? <p className="text-[13px] font-medium leading-5 text-foreground">{title}</p> : null}
        <div className="text-xs leading-5 text-muted-foreground">{children}</div>
      </div>
    </div>
  );
}
