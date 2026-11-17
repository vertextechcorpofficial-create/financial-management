import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function ReviewActions({ children, align = "start" }: { children: ReactNode; align?: "start" | "end" }) {
  return <div className={cn("sticky bottom-0 z-10 -mx-6 -mb-6 -mt-4 flex flex-wrap items-center gap-2 border-t bg-background p-4", align === "end" && "justify-end")}>{children}</div>;
}
