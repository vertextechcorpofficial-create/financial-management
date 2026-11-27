export type Tone = "neutral" | "success" | "warning" | "danger" | "info" | "accent";

export const TONE_CLASS: Record<Tone, string> = {
  neutral: "border-border bg-muted text-foreground",
  success:
    "border-success/30 bg-success-bg text-success",
  warning: "border-warning/30 bg-warning-bg text-warning",
  danger: "border-destructive/30 bg-destructive/10 text-destructive",
  info: "border-info/30 bg-info-bg text-info",
  accent: "border-primary/30 bg-primary/10 text-primary",
};

export const toneClass = (tone: Tone) => TONE_CLASS[tone] ?? TONE_CLASS.neutral;

export const ACCENT = {
  rail: "border-t-[3px] border-t-primary/60",
  tile: "border-l-[3px] border-l-primary",
};

export const PAGE_SIZE = 20;
