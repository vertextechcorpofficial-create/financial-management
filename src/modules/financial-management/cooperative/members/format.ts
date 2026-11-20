import type { MemberRegisterStatus } from "./types";

const pesoFormat = new Intl.NumberFormat("en-PH", {
  style: "currency", currency: "PHP", minimumFractionDigits: 2, maximumFractionDigits: 2,
});

export const peso = (value: string | number | null | undefined) => pesoFormat.format(Number(value ?? 0));

export const date = (value: string | null | undefined) => {
  if (!value) return "-";
  const parsed = new Date(`${value.slice(0, 10)}T00:00:00+08:00`);
  if (Number.isNaN(parsed.valueOf())) return value;
  return new Intl.DateTimeFormat("en-PH", { timeZone: "Asia/Manila", dateStyle: "medium" }).format(parsed);
};

export const dateTime = (value: string | null | undefined) => {
  if (!value) return "-";
  const parsed = new Date(value.endsWith("Z") ? value : `${value}Z`);
  if (Number.isNaN(parsed.valueOf())) return value;
  return new Intl.DateTimeFormat("en-PH", {
    timeZone: "Asia/Manila", dateStyle: "medium", timeStyle: "short",
  }).format(parsed);
};

export const todayManila = () => new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Manila", year: "numeric", month: "2-digit", day: "2-digit",
}).format(new Date());

export const MEMBER_STATUS_LABEL: Record<MemberRegisterStatus, string> = {
  MEMBER: "Member",
  NON_MEMBER: "Not a member",
  SEPARATED: "Separated",
};

export const MEMBER_STATUS_CHIP: Record<MemberRegisterStatus, string> = {
  MEMBER: "ACTIVE",
  NON_MEMBER: "NON_MEMBER",
  SEPARATED: "SEPARATED",
};

export const feeChannelLabel = (value: string) => value === "PAYROLL" ? "Payroll deduction" : "Over the counter";

export const savingsKindLabel: Record<string, string> = {
  OPENING: "Opening deposit",
  DEPOSIT: "Savings deposit",
  WITHDRAWAL: "Withdrawal",
  DIVIDEND: "Dividend",
  OFFSET: "Offset",
};

export const fileSize = (bytes: number) => bytes >= 1024 * 1024
  ? `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  : `${Math.max(1, Math.round(bytes / 1024))} KB`;

export const statusText = (value: string) =>
  value.replaceAll("_", " ").toLowerCase().replace(/^./, character => character.toUpperCase());
