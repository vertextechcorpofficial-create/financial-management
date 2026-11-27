import { money, type DocumentType, type Product } from "./policy-types";

type Method = "diminishing" | "flat" | "markup" | "upfront";
type Frequency = "cutoff" | "monthly";

function units(value: string, scale: number): bigint {
  const [whole, fraction = ""] = value.split(".");
  return BigInt(whole) * 10n ** BigInt(scale) + BigInt(fraction.padEnd(scale, "0"));
}

function decimal(cents: bigint) {
  return `${cents / 100n}.${String(cents % 100n).padStart(2, "0")}`;
}

const round = (numerator: bigint, denominator: bigint) => (2n * numerator + denominator) / (2n * denominator);
const atMost = (value: bigint, max: bigint) => value > max ? max : value;

export function calculateLoanExample(
  principal: string, ratePercent: string, method: Method, months: number, frequency: Frequency,
) {
  const original = units(principal, 2);
  const count = frequency === "cutoff" ? months * 2 : months;
  const rate = units(ratePercent, 6);
  const base = 100_000_000n;
  const upfrontInterest = method === "upfront" ? round(original * rate, base) : 0n;
  const periodicBase = frequency === "cutoff" ? base * 2n : base;
  const n = BigInt(count);
  const interest = method === "flat" ? round(original * rate * BigInt(months), base)
    : method === "markup" ? round(original * rate, base) : 0n;
  const power = (periodicBase + rate) ** n;
  const regular = method === "diminishing" && rate > 0n
    ? round(original * rate * power, periodicBase * (power - periodicBase ** n))
    : round(original, n) + round(interest, n);
  const regularPrincipal = round(original, n);
  const regularInterest = round(interest, n);
  let balance = original;
  let unallocatedInterest = interest;
  let totalInterest = 0n;
  const installments = Array.from({ length: count }, (_, i) => {
    const last = i === count - 1;
    const cost = method === "diminishing" ? round(balance * rate, periodicBase)
      : last ? unallocatedInterest : atMost(regularInterest, unallocatedInterest);
    const repayment = last ? balance
      : atMost(method === "diminishing" ? (regular > cost ? regular - cost : 0n) : regularPrincipal, balance);
    balance -= repayment;
    if (method !== "diminishing") unallocatedInterest -= cost;
    totalInterest += cost;
    return { principal: decimal(repayment), interest: decimal(cost), total: decimal(repayment + cost) };
  });
  return {
    paymentCount: count, regularPayment: installments[0].total, finalPayment: installments[count - 1].total,
    totalInterest: decimal(totalInterest), totalPayable: decimal(original + totalInterest), installments,
    upfrontInterest: decimal(upfrontInterest), netProceeds: decimal(original - upfrontInterest),
  };
}

export function createLoanTermsSnapshot(
  product: Product,
  documentTypes: readonly DocumentType[],
  policyRevision: number,
  selection: { principal?: string; itemId?: number; quantity?: number; rate?: string; method: Method; term: number; frequency: Frequency; mode: "payroll" | "otc" },
) {
  if (!product.isOpen || !product.termsMonths.includes(selection.term) || !product.frequencies.includes(selection.frequency) ||
      !product.modes.includes(selection.mode) || !(product.methods as readonly Method[]).includes(selection.method)) {
    throw new Error("The selected repayment options are unavailable.");
  }
  const item = product.kind === "GOODS" && selection.itemId ? product.items.find(row => row.id === selection.itemId) : undefined;
  if (product.kind === "GOODS" && !item) throw new Error("Choose an available goods item.");
  const quantity = item ? selection.quantity ?? 1 : 1;
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 10) throw new Error("Choose a quantity from 1 to 10.");
  const amount = item ? decimal(units(item.price, 2) * BigInt(quantity)) : selection.principal;
  const parsedAmount = money.safeParse(amount);
  if (!parsedAmount.success) throw new Error("Enter a loan amount within the supported range.");
  const principal = parsedAmount.data;
  if (units(principal, 2) <= 0n) throw new Error("Enter a positive loan amount.");
  const rate = product.kind === "CASH" ? selection.rate ?? product.rateDefault : product.markup;
  if (!/^\d{1,3}(?:\.\d{1,6})?$/.test(rate) ||
      product.kind === "CASH" && (units(rate, 6) < units(product.rateMin, 6) || units(rate, 6) > units(product.rateMax, 6))) {
    throw new Error("Choose a rate within the product range.");
  }
  if (selection.method === "upfront" && round(units(principal, 2) * units(rate, 6), 100_000_000n) >= units(principal, 2)) {
    throw new Error("Upfront interest must leave positive net proceeds.");
  }
  const documents = product.documentRules.map(rule => {
    const type = documentTypes.find(doc => doc.id === rule.documentTypeId && doc.isActive);
    if (!type) throw new Error("A required document type is unavailable.");
    return { documentTypeId: type.id, name: type.name, enforcement: rule.enforcement };
  });
  return {
    policyRevision, productId: product.id, productCode: product.code, productName: product.name,
    prefix: product.prefix, kind: product.kind, principal, ratePercent: rate, method: selection.method,
    term: selection.term, frequency: selection.frequency, mode: selection.mode,
    processingFee: product.processingFee, penaltyPercent: product.penaltyPercent, graceDays: product.graceDays,
    eligibilityRules: {
      rateMin: product.rateMin, rateMax: product.rateMax, minimumMembershipMonths: product.minimumMembershipMonths,
      limitType: product.limitType, savingsMultiple: product.savingsMultiple, fixedCeiling: product.fixedCeiling,
    },
    item: item ? { id: item.id, name: item.name, price: item.price, quantity } : null,
    documents,
  };
}
