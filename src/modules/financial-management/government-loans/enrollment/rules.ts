const pagIbig = /^(MPL|CAL|HL)-\d{4}-\d{7}$/;
const referencePatterns = new Map([
  ["SSS", /^(SL|CL|EL)-\d{4}-\d{6}$/],
  ["HDMF", pagIbig],
  ["PAGIBIG", pagIbig],
  ["BANK", /^PB-SL-\d{8}$/],
]);

export function normalizedReference(reference: string) {
  return reference.trim().toUpperCase();
}

export function unusualReference(code: string, reference: string) {
  const pattern = referencePatterns.get(code);
  return Boolean(reference.trim() && pattern && !pattern.test(reference.trim()));
}

export function deductionMonths(openMonth: string | null) {
  if (!openMonth || !/^\d{4}-(0[1-9]|1[0-2])$/.test(openMonth)) return [];
  const [year, month] = openMonth.split("-").map(Number);
  if (year < 1 || (year === 9999 && month > 9)) return [];
  return Array.from({ length: 4 }, (_, offset) => {
    const index = year * 12 + month - 1 + offset;
    return String(Math.floor(index / 12)).padStart(4, "0") + "-" + String(index % 12 + 1).padStart(2, "0");
  });
}

export function exactMoney(value: string) {
  const [whole, fraction = ""] = value.split(".");
  return BigInt(whole).toString() + "." + fraction.padEnd(2, "0");
}

const monthFormat = new Intl.DateTimeFormat("en-PH", { month: "long", year: "numeric", timeZone: "UTC" });
export const deductionMonthLabel = (month: string) => monthFormat.format(new Date(month + "-01T00:00:00Z"));
