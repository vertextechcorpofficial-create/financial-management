import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

import { toneClass, type Tone } from "../constants";

/** A status pill. The tone is passed in, because this page carries four vocabularies. */
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
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium whitespace-nowrap",
        toneClass(tone),
        className,
      )}
    >
      {children}
    </span>
  );
}
