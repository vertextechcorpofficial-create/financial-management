"use client";

import type { ReactNode } from "react";
import { PettyCashReloadButton } from "./PettyCashReload";

export function PettyCashPageHeader({ title, description }: { title: ReactNode; description: ReactNode }) {
  return <div className="flex items-start justify-between gap-3">
    <div className="min-w-0">
      <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
      <p className="mt-2 max-w-4xl text-sm text-muted-foreground">{description}</p>
    </div>
    <PettyCashReloadButton />
  </div>;
}
