import { AlertTriangle, Info } from "lucide-react";
import { cn } from "@/lib/utils";

const TONES = {
  info: {
    rail: "border-l-muted-foreground/50",
    surface: "bg-muted/60",
    tile: "bg-muted-foreground/15 text-foreground",
    Icon: Info,
  },
  warning: {
    rail: "border-l-warning",
    surface: "bg-warning-bg",
    tile: "bg-warning text-warning-foreground",
    Icon: AlertTriangle,
  },
  danger: {
    rail: "border-l-destructive",
    surface: "bg-destructive/10",
    tile: "bg-destructive text-destructive-foreground",
    Icon: AlertTriangle,
  },
} as const;

export function Notice({
  tone = "info",
  title,
  children,
  className,
}: {
  tone?: keyof typeof TONES;
  title?: string;
  children?: React.ReactNode;
  className?: string;
}) {
  const style = TONES[tone];
  const Icon = style.Icon;
  return (
    <div
      className={cn(
        "flex items-start gap-2.5 rounded-lg border border-l-[3px] px-3 py-2.5",
        style.rail,
        style.surface,
        className,
      )}
    >
      <span className={cn("flex h-6 w-6 shrink-0 items-center justify-center rounded-md", style.tile)}>
        <Icon className="h-3.5 w-3.5" aria-hidden />
      </span>
      <div className="min-w-0 space-y-0.5">
        {title ? <p className="text-[13px] font-medium leading-5 text-foreground">{title}</p> : null}
        {children ? <div className="text-xs leading-5 text-muted-foreground">{children}</div> : null}
      </div>
    </div>
  );
}
