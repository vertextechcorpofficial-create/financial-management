"use client";

import type { ComponentType, ReactNode } from "react";
import { cn } from "@/lib/utils";

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

export function PersonAvatar({
  name,
  size = "md",
  className,
}: {
  name: string;
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const tone = avatarTones[[...name].reduce((sum, character) => sum + character.charCodeAt(0), 0) % avatarTones.length];
  return (
    <span
      aria-hidden="true"
      className={cn(
        "grid shrink-0 place-items-center rounded-full font-semibold ring-1 ring-black/5 dark:ring-white/10",
        size === "sm" && "size-8 text-[11px]",
        size === "md" && "size-10 text-xs",
        size === "lg" && "size-12 text-sm",
        tone,
        className,
      )}
    >
      {initials(name)}
    </span>
  );
}

export function MetricCard({
  icon: Icon,
  label,
  value,
  detail,
  tone = "emerald",
  alert = false,
}: {
  icon: ComponentType<{ className?: string }>;
  label: string;
  value: ReactNode;
  detail?: ReactNode;
  tone?: "emerald" | "sky" | "amber" | "rose" | "slate";
  alert?: boolean;
}) {
  const tones = {
    emerald: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
    sky: "bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-300",
    amber: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
    rose: "bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300",
    slate: "bg-muted text-muted-foreground",
  };
  return (
    <div className={cn("rounded-xl border bg-card p-4 shadow-xs", alert && "border-rose-300 dark:border-rose-900")}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-medium text-muted-foreground">{label}</p>
          <div className="mt-1 truncate font-mono text-xl font-semibold tabular-nums">{value}</div>
          {detail && <p className="mt-1 text-xs text-muted-foreground">{detail}</p>}
        </div>
        <span className={cn("grid size-9 shrink-0 place-items-center rounded-lg", tones[tone])}>
          <Icon className="size-4" />
        </span>
      </div>
    </div>
  );
}

export function SectionHeading({
  step,
  title,
  description,
  aside,
}: {
  step?: string;
  title: string;
  description?: string;
  aside?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="flex min-w-0 items-start gap-2.5">
        {step && (
          <span className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-full bg-emerald-100 text-[11px] font-semibold text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
            {step}
          </span>
        )}
        <div className="min-w-0">
          <p className="text-sm font-semibold">{title}</p>
          {description && <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>}
        </div>
      </div>
      {aside}
    </div>
  );
}
