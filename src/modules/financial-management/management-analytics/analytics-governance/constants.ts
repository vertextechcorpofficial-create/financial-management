import type { StatusCode, Tier } from "./types";

export type Tone = "neutral" | "success" | "warning" | "danger" | "info" | "accent";

export const TONE_CLASS: Record<Tone, string> = {
  neutral: "border-border bg-muted text-foreground",
  success: "border-success/30 bg-success-bg text-success",
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

export const STATUS_META: Record<StatusCode, { label: string; tone: Tone; dot: string }> = {
  ON_TRACK: { label: "On track", tone: "success", dot: "bg-success" },
  FAVORABLE: { label: "Favorable · memo required", tone: "info", dot: "bg-info" },
  WATCH: { label: "Watch", tone: "warning", dot: "bg-warning" },
  PROVISIONAL: { label: "Provisional", tone: "accent", dot: "bg-primary" },
  CONFIRMED: { label: "Confirmed breach", tone: "danger", dot: "bg-destructive" },
  NO_DATA: { label: "No reading", tone: "neutral", dot: "bg-muted-foreground/40" },
};

export const TIER_ORDER: Tier[] = ["CORE", "WORKFORCE", "INDUSTRY", "HOLDINGS"];

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
