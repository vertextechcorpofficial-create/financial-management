export type Tone = "neutral" | "success" | "warning" | "danger" | "info" | "accent";

export const TONE_CLASS: Record<Tone, string> = {
  neutral: "border-border bg-muted text-foreground",
  success:
    "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-200",
  warning: "border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200",
  danger: "border-red-200 bg-red-50 text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200",
  info: "border-sky-200 bg-sky-50 text-sky-800 dark:border-sky-900 dark:bg-sky-950 dark:text-sky-200",
  accent: "border-primary/30 bg-primary/10 text-primary",
};

export const toneClass = (tone: Tone) => TONE_CLASS[tone] ?? TONE_CLASS.neutral;

export const ACCENT = {
  rail: "border-t-[3px] border-t-sky-500/70",
  tile: "border-l-[3px] border-l-sky-500",
};

export const PAGE_SIZE = 20;
