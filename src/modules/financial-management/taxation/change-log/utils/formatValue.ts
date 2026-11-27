import { phtDisplayDate } from "../pht";

const PESO = new Intl.NumberFormat("en-PH", {
  style: "currency",
  currency: "PHP",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const MONEY_FIELDS = new Set(["amount", "tax_withheld", "income_amount", "withheld"]);

const DIRECTION_LABELS: Record<string, string> = {
  RECEIVED: "Received",
  ISSUED: "Issued",
};

const SOURCE_LABELS: Record<string, string> = {
  SALES_INVOICE: "Sales invoice",
  PURCHASE_ORDER: "Purchase order",
  MANUAL: "Manual",
};

const DATE_KEYS = new Set(["paid_on", "date_received", "effective_from", "locked_at", "unlocked_at"]);
const MONEY_KEYS = new Set(["amount", "withheld", "tax_withheld", "income_amount"]);

function formatPesoString(raw: string): string {
  const num = Number(raw.replace(/,/g, "").trim());
  if (!Number.isFinite(num)) return raw;
  return PESO.format(num);
}

function formatSnapshot(value: string): string {
  const parts = value
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean);

  const pairs: Array<{ key: string; val: string }> = [];
  for (const part of parts) {
    const eq = part.indexOf("=");
    if (eq <= 0) return value;
    pairs.push({ key: part.slice(0, eq).trim(), val: part.slice(eq + 1).trim() });
  }

  const hasDetail = pairs.some((p) => p.key === "counterparty" || p.key === "withheld" || p.key === "amount");
  const formatted: string[] = [];

  for (const { key, val } of pairs) {
    if (!val || val === "null") continue;
    if (key === "direction") {
      formatted.push(DIRECTION_LABELS[val.toUpperCase()] ?? val);
    } else if (key === "form" || key === "period" || key === "counterparty") {
      formatted.push(val);
    } else if (MONEY_KEYS.has(key)) {
      formatted.push(formatPesoString(val));
    } else if (DATE_KEYS.has(key)) {
      formatted.push(/^\d{4}-\d{2}-\d{2}/.test(val) ? phtDisplayDate(val) : val);
    } else if (key === "reference") {
      formatted.push(`Ref ${val}`);
    } else if (key === "source") {
      if (hasDetail) continue;
      formatted.push(SOURCE_LABELS[val.toUpperCase()] ?? val);
    } else {
      formatted.push(`${key.replace(/_/g, " ")}: ${val}`);
    }
  }

  return formatted.length > 0 ? formatted.join(" · ") : "—";
}

/**
 * Turns raw serialized audit values (like `form=0619-E; period=M05; amount=1200` or
 * ISO `YYYY-MM-DD` strings) into concise human-readable summaries for tables and exports.
 */
export function formatChangeValue(value: string | null, field?: string | null): string {
  const trimmed = value?.trim() ?? "";
  if (!trimmed) return "—";

  if (trimmed.includes("=") && trimmed.includes(";")) {
    return formatSnapshot(trimmed);
  }

  if (field && MONEY_FIELDS.has(field.toLowerCase()) && /^-?\d+(\.\d+)?$/.test(trimmed)) {
    return formatPesoString(trimmed);
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return phtDisplayDate(trimmed);
  }

  return trimmed;
}
