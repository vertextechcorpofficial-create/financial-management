const MANILA = "Asia/Manila";

function parse(value: string | null | undefined): Date | null {
  const text = (value ?? "").trim();
  if (!text) return null;
  const normalized = text.replace(" ", "T");
  if (/^\d{4}-\d{2}-\d{2}$/.test(normalized)) return new Date(`${normalized}T00:00:00+08:00`);
  const zoned = /(?:Z|[+-]\d{2}:\d{2})$/.test(normalized) ? normalized : `${normalized}+08:00`;
  const date = new Date(zoned);
  return Number.isNaN(date.getTime()) ? null : date;
}

function fallback(value: string | null | undefined) {
  return (value ?? "").trim() || "-";
}

export function dateTime(value: string | null | undefined) {
  const date = parse(value);
  if (!date) return fallback(value);
  return `${new Intl.DateTimeFormat("en-PH", { dateStyle: "medium", timeStyle: "short", timeZone: MANILA }).format(date)} PHT`;
}

export function dateOnly(value: string | null | undefined) {
  const date = parse(value);
  if (!date) return fallback(value);
  return new Intl.DateTimeFormat("en-PH", { dateStyle: "medium", timeZone: MANILA }).format(date);
}
