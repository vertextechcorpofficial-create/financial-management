export function todayMonth() {
  const parts = new Intl.DateTimeFormat("en", { timeZone: "Asia/Manila", year: "numeric", month: "2-digit" }).formatToParts(new Date());
  return `${parts.find(part => part.type === "year")!.value}-${parts.find(part => part.type === "month")!.value}`;
}
export function formatMonth(value: string) {
  const match = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(value);
  return match ? `${match[2]}/${match[1]}` : value;
}
