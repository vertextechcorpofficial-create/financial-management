/**
 * House date display for the analytics boards.
 *
 * Stored stamps are PHT wall clock (`YYYY-MM-DDTHH:mm:ss`); the boards print the
 * day as mm/dd/yyyy so a reader cannot confuse a month and a day.
 */
export function displayDay(value: string | null | undefined): string {
  if (!value) return "not recorded";
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (!match) return value;
  const [, year, month, day] = match;
  return `${month}/${day}/${year}`;
}
