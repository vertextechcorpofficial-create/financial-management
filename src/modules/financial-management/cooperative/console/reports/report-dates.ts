import { isCalendarDate } from "../../members/format";

export function monthPeriod(month: string) {
  const from = month + "-01";
  if (!isCalendarDate(from)) return null;
  const end = new Date(from + "T00:00:00Z");
  end.setUTCMonth(end.getUTCMonth() + 1, 0);
  return { from, to: end.toISOString().slice(0, 10) };
}

export function manilaUtcRange(from: string, to: string) {
  const start = new Date(from + "T00:00:00+08:00");
  const nextDay = new Date(to + "T00:00:00+08:00");
  nextDay.setUTCDate(nextDay.getUTCDate() + 1);
  return { _gte: start.toISOString().slice(0, 19), _lt: nextDay.toISOString().slice(0, 19) };
}

export function utcTimestamp(value: string) {
  const timestamp = value.replace(" ", "T");
  return /(?:Z|[+-]\d{2}:\d{2})$/.test(timestamp) ? timestamp : timestamp + "Z";
}

const manilaTime = new Intl.DateTimeFormat("en-PH", { timeZone: "Asia/Manila", dateStyle: "medium", timeStyle: "medium" });
export function reportManilaTime(value: string) {
  const date = new Date(utcTimestamp(value));
  return Number.isNaN(date.valueOf()) ? value : manilaTime.format(date);
}
