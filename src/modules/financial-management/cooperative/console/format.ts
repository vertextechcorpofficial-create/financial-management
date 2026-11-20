export const money = (value: number) =>
  new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value || 0);

export const moneyShort = (value: number) => {
  const amount = Math.abs(value || 0);
  const sign = value < 0 ? "−" : "";
  if (amount >= 1_000_000) return `${sign}₱${(amount / 1_000_000).toFixed(2)}M`;
  if (amount >= 1_000) return `${sign}₱${(amount / 1_000).toFixed(amount >= 100_000 ? 0 : 1)}k`;
  return `${sign}₱${Math.round(amount)}`;
};

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export const formatDate = (value: string | null | undefined) => {
  if (!value) return "—";
  const [year, month, day] = value.slice(0, 10).split("-").map(Number);
  if (!year || !month || !day) return value;
  return `${day} ${MONTHS[month - 1]} ${year}`;
};

export const formatDateTime = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return value;
  return new Intl.DateTimeFormat("en-PH", {
    timeZone: "Asia/Manila",
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
};

export const percent = (value: number) => `${Number(value.toFixed(2))}%`;
export const round2 = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

export const today = () => {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  return parts;
};

export const addDays = (value: string, days: number) => {
  const date = new Date(`${value}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
};

export const daysBetween = (from: string, to: string) =>
  Math.round((new Date(`${to}T00:00:00Z`).valueOf() - new Date(`${from}T00:00:00Z`).valueOf()) / 86_400_000);

export const lastDayOfMonth = (year: number, month: number) =>
  new Date(Date.UTC(year, month, 0)).getUTCDate();

export const nextCutoff = (value: string) => {
  const [year, month, day] = value.split("-").map(Number);
  const last = lastDayOfMonth(year, month);
  if (day < 15) return `${year}-${String(month).padStart(2, "0")}-15`;
  if (day < last) return `${year}-${String(month).padStart(2, "0")}-${String(last).padStart(2, "0")}`;
  const nextMonth = month === 12 ? 1 : month + 1;
  const nextYear = month === 12 ? year + 1 : year;
  return `${nextYear}-${String(nextMonth).padStart(2, "0")}-15`;
};

export const nextMonthEnd = (value: string) => {
  const [year, month, day] = value.split("-").map(Number);
  const last = lastDayOfMonth(year, month);
  if (day < last) return `${year}-${String(month).padStart(2, "0")}-${String(last).padStart(2, "0")}`;
  const nextMonth = month === 12 ? 1 : month + 1;
  const nextYear = month === 12 ? year + 1 : year;
  const nextLast = lastDayOfMonth(nextYear, nextMonth);
  return `${nextYear}-${String(nextMonth).padStart(2, "0")}-${String(nextLast).padStart(2, "0")}`;
};

export const scheduleDates = (start: string, count: number, frequency: "cutoff" | "monthly") => {
  const dates: string[] = [];
  let cursor = start;
  for (let index = 0; index < count; index += 1) {
    cursor = frequency === "cutoff" ? nextCutoff(cursor) : nextMonthEnd(cursor);
    dates.push(cursor);
  }
  return dates;
};

export const cnDate = (value: string) => formatDate(value);
