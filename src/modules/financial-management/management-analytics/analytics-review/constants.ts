import type { StatusCode } from "./types";

export type Tone = "neutral" | "success" | "warning" | "danger" | "info" | "accent";

export const TONE_CLASS: Record<Tone, string> = {
  neutral: "border-border bg-muted text-foreground",
  success: "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-200",
  warning: "border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200",
  danger: "border-red-200 bg-red-50 text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200",
  info: "border-sky-200 bg-sky-50 text-sky-900 dark:border-sky-900 dark:bg-sky-950 dark:text-sky-200",
  accent: "border-primary/30 bg-primary/10 text-primary",
};

export const toneClass = (tone: Tone) => TONE_CLASS[tone] ?? TONE_CLASS.neutral;

export const ACCENT = {
  rail: "border-t-[3px] border-t-sky-500/70",
  tile: "border-l-[3px] border-l-sky-500",
};

export const STATUS_META: Record<StatusCode, { label: string; tone: Tone; dot: string }> = {
  ON_TRACK: { label: "On track", tone: "success", dot: "bg-emerald-500" },
  FAVORABLE: { label: "Favorable · memo required", tone: "info", dot: "bg-sky-500" },
  WATCH: { label: "Watch", tone: "warning", dot: "bg-amber-500" },
  PROVISIONAL: { label: "Provisional", tone: "accent", dot: "bg-indigo-500" },
  CONFIRMED: { label: "Confirmed breach", tone: "danger", dot: "bg-red-500" },
  NO_DATA: { label: "No reading", tone: "neutral", dot: "bg-muted-foreground/40" },
};

export const TIER_LABEL: Record<string, string> = {
  CORE: "Core performance",
  WORKFORCE: "Workforce",
  INDUSTRY: "Industry",
  HOLDINGS: "Holdings",
};

export const DOMAIN_LABEL: Record<string, string> = {
  FIN: "Financial",
  REV: "Revenue",
  QUAL: "Quality",
  OPS: "Operations",
  WF: "Workforce",
  HOLD: "Holdings",
  CO: "Company",
};

export const PAGE_SIZE = 20;

export const EXCEPTION_STATUS_LABEL: Record<string, string> = {
  OPEN: "Open",
  MONITORING: "Monitoring",
  CLOSED: "Closed",
  ESCALATED: "Escalated",
  RECURRENCE: "Recurrence",
};

/** Tone per exception state, so the same word always wears the same colour. */
export const EXCEPTION_STATUS_TONE: Record<string, Tone> = {
  OPEN: "warning",
  MONITORING: "info",
  ESCALATED: "danger",
  CLOSED: "success",
  RECURRENCE: "danger",
};

export const EXCEPTION_STATUS_OPTIONS = [
  { value: "ALL", label: "Every state" },
  { value: "OPEN_BOARD", label: "Still open" },
  { value: "OPEN", label: "Open" },
  { value: "MONITORING", label: "Monitoring" },
  { value: "ESCALATED", label: "Escalated" },
  { value: "CLOSED", label: "Closed" },
  { value: "RECURRENCE", label: "Recurrence" },
];

export const EXCEPTION_PAGE_SIZE = 10;
