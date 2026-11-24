"use client";

import type { LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * The family empty state (QA.md §1.4): centred in a block at least 96px tall, one muted icon
 * above one sentence, and an optional second line that names the way out. A sentence alone in a
 * tall box reads as a failed load; the icon says the box is meant to be empty.
 */
export function EmptyState({
  icon: Icon,
  title,
  hint,
  className,
}: {
  icon: LucideIcon;
  title: string;
  hint?: string;
  className?: string;
}) {
  return (
    <div className={cn("flex min-h-24 flex-col items-center justify-center gap-1.5 px-4 py-10 text-center", className)}>
      <Icon className="h-8 w-8 text-muted-foreground/60" aria-hidden />
      <p className="text-sm font-medium text-foreground">{title}</p>
      {hint ? <p className="max-w-sm text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}
