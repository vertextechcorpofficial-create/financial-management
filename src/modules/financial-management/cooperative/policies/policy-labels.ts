const labels: Record<string, string> = {
  isOpen: "Status", name: "Name", shortName: "Short name", prefix: "Loan number prefix",
  rateMin: "Minimum monthly rate", rateDefault: "Default monthly rate", rateMax: "Maximum monthly rate",
  termsMonths: "Terms in months", frequencies: "Payment frequencies", modes: "Repayment methods",
  items: "Goods items", documentRules: "Required documents", minimumSavings: "Minimum savings per cutoff",
  floorFixedAmount: "Fixed floor per cutoff", floorPercent: "Floor percentage of gross pay",
  exitSavingsAnnualRates: "Annual savings rates for exit clearance",
  isActive: "Active", isContra: "Contra account", accountId: "Account",
  reservePercent: "Reserve fund share", educationPercent: "Education and training fund share",
  savingsSharePercent: "Interest on savings share",
};

export function policyFieldLabel(key: string) {
  return labels[key] ?? key.replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/_/g, " ").replace(/^./, character => character.toUpperCase());
}

const enums: Record<string, string> = {
  CASH: "Cash loan", GOODS: "Goods on installment",
  SAVINGS_MULTIPLE: "Multiple of savings", FIXED: "Fixed amount", NONE: "No limit", PERCENT: "Percent of gross pay",
  PENALTIES_FIRST: "Penalties first", INSTALLMENTS_FIRST: "Installments first",
  WARN: "Warn", BLOCK: "Block", CHECK: "Checklist",
  cutoff: "Every cutoff", monthly: "Monthly", payroll: "Salary deduction", otc: "Over the counter",
  diminishing: "Diminishing balance", flat: "Flat", markup: "Markup",
  ASSET: "Asset", LIABILITY: "Liability", EQUITY: "Equity", INCOME: "Income", EXPENSE: "Expense",
};

const monetaryFields = new Set(["membershipFee", "minimumSavings", "maintainingBalance", "floorFixedAmount", "processingFee", "fixedCeiling"]);
const percentFields = new Set(["rateMin", "rateDefault", "rateMax", "markup", "penaltyPercent", "floorPercent",
  "reservePercent", "educationPercent", "savingsSharePercent"]);

export function policyPercent(value: string) {
  return `${value.includes(".") ? value.replace(/\.?0+$/, "") : value}%`;
}

export function policyMoney(value: string) {
  const number = Number(value);
  if (!Number.isFinite(number)) return `₱${value}`;
  return `₱${number.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function policyValue(key: string, value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  if (key === "exitSavingsAnnualRates" && typeof value === "object") {
    const rates = Object.entries(value).sort(([a], [b]) => b.localeCompare(a));
    return rates.length ? rates.map(([year, rate]) => `${year} · ${policyPercent(String(rate))}`).join(", ") : "None";
  }
  if (Array.isArray(value)) return value.length ? value.map(item => policyValue(key, item)).join(", ") : "None";
  if (value === true || value === false) return key === "isOpen" ? (value ? "Open" : "Closed") : (value ? "Yes" : "No");
  if (typeof value === "number" && key === "withdrawalsPerYear" && value === 0) return "Unlimited";
  if (typeof value === "string") {
    if (monetaryFields.has(key)) return policyMoney(value);
    if (percentFields.has(key)) return policyPercent(value);
    if (enums[value]) return enums[value];
  }
  return String(value);
}
