import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

import { toneClass, type Tone } from "../constants";

/**
 * A status pill. The tone is passed in rather than looked up from a status string, because the
 * loan tree has four vocabularies (loan status, approval, installment status, change kind) and
 * one badge that guessed would be wrong in three of them.
 */
export function StatusBadge({
  tone,
  children,
  title,
  className,
}: {
  tone: Tone;
  children: ReactNode;
  title?: string;
  className?: string;
}) {
  return (
    <span
      title={title}
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium whitespace-nowrap",
        toneClass(tone),
        className,
      )}
    >
      {children}
    </span>
  );
}
