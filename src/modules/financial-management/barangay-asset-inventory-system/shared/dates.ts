/**
 * Every date this module treats as "today" belongs to the office, not to the machine.
 *
 * The Municipality of Mapandan keeps Asia/Manila time, UTC+8. A UTC date would be wrong for the
 * first eight hours of every office day, which is exactly when a custodian registers an asset bought
 * that morning or an officer closes a count. So the date is always computed in the office time zone,
 * on the server and in the browser, and never from toISOString().
 */

export const OFFICE_TIME_ZONE = "Asia/Manila";

const isoDate = new Intl.DateTimeFormat("en-CA", {
  timeZone: OFFICE_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** Today at the office, as YYYY-MM-DD. */
export function officeDate(now: Date = new Date()): string {
  return isoDate.format(now);
}

/** The office year, for the yearly count. */
export function officeYear(now: Date = new Date()): number {
  return Number(officeDate(now).slice(0, 4));
}

/** Whole months between two YYYY-MM-DD dates, counted in calendar days with no time zone involved. */
export function monthsBetween(from: string, to: string): number {
  const [ay, am, ad] = from.slice(0, 10).split("-").map(Number);
  const [by, bm, bd] = to.slice(0, 10).split("-").map(Number);
  if (!ay || !by) return 0;
  let months = (by - ay) * 12 + (bm - am);
  if (bd < ad) months -= 1;
  return Math.max(0, months);
}
