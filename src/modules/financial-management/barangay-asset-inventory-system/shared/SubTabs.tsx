"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";

/**
 * One inner tab strip, used by every submodule that has more than one block of content.
 * It exists so no screen ever stacks a second long table under a first one: the reader picks
 * the block they want instead of scrolling to the bottom of the page to find it.
 */
export function SubTabs<T extends string>({
  tabs,
  value,
  onChange,
  label,
}: {
  tabs: readonly { id: T; label: string; count?: number }[];
  value: T;
  onChange: (id: T) => void;
  label?: string;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1 rounded-md border bg-muted/20 p-2">
      {label ? <span className="px-2 text-xs uppercase tracking-wide text-muted-foreground">{label}</span> : null}
      {tabs.map((tab) => (
        <Button key={tab.id} size="sm" variant={value === tab.id ? "secondary" : "ghost"} onClick={() => onChange(tab.id)}>
          {tab.label}
          {typeof tab.count === "number" ? <span className="ml-1.5 text-xs opacity-70">{tab.count}</span> : null}
        </Button>
      ))}
    </div>
  );
}
