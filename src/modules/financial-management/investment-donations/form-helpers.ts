export type FormLot = {
  id: string; sym: string; acctType: string; date: string; qty: number;
  openQty: number; cost: number; openCost?: number; seq?: number;
};
export type LotPick = { lotId: string; qty: number };
export type LotOrder = "smallestgain" | "largestgain" | "oldest";
export type FeeBreakdown = { comm: number; vat: number; pse: number; sccp: number };
export type FeePolicy = { brokerRate: number; brokerMin: number; vatRate: number; pseFee: number; sccpFee: number };
export const roundMoney = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;
const units = (value: number) => Math.round(value * 1e6);

export function eligibleFormLots(lots: readonly FormLot[], sym: string, account: string, date: string) {
  return lots.filter(lot => lot.sym === sym && lot.acctType === account && lot.date <= date && lot.openQty > 0);
}

export function lotUnitCost(lot: FormLot) {
  return lot.openQty > 0 ? (lot.openCost ?? lot.cost * lot.openQty / lot.qty) / lot.openQty : 0;
}

export function fillLotPicks(lots: readonly FormLot[], quantity: number, order: LotOrder) {
  if (!Number.isFinite(quantity) || quantity <= 0 || units(quantity) / 1e6 !== quantity) {
    throw new Error("Enter a positive quantity with up to six decimal places first.");
  }
  const sorted = [...lots].sort((a, b) => {
    const cost = lotUnitCost(a) - lotUnitCost(b);
    return (order === "oldest" ? 0 : order === "smallestgain" ? -cost : cost) ||
      a.date.localeCompare(b.date) || (a.seq ?? 0) - (b.seq ?? 0) || a.id.localeCompare(b.id);
  });
  let left = units(quantity);
  const picks: LotPick[] = [];
  for (const lot of sorted) {
    const take = Math.min(left, units(lot.openQty));
    if (take > 0) picks.push({ lotId: lot.id, qty: take / 1e6 });
    left -= take;
  }
  return { picks, shortfall: left / 1e6 };
}

export function previewLotCost(lots: readonly FormLot[], picks: readonly LotPick[]) {
  return roundMoney(picks.reduce((total, pick) => {
    const lot = lots.find(row => row.id === pick.lotId);
    if (!lot) return total;
    const openCost = roundMoney(lot.openCost ?? lot.cost * lot.openQty / lot.qty);
    return total + openCost - roundMoney(openCost * (lot.openQty - pick.qty) / lot.openQty);
  }, 0));
}

export function automaticFees(gross: number, taxClass: string, policy: FeePolicy): FeeBreakdown {
  if (!Number.isFinite(gross) || gross <= 0 || taxClass !== "listed") return { comm: 0, vat: 0, pse: 0, sccp: 0 };
  const comm = roundMoney(Math.max(policy.brokerMin, gross * policy.brokerRate / 100));
  return { comm, vat: roundMoney(comm * policy.vatRate / 100),
    pse: roundMoney(gross * policy.pseFee / 100), sccp: roundMoney(gross * policy.sccpFee / 100) };
}

export function totalFees(fees: FeeBreakdown) {
  return roundMoney(fees.comm + fees.vat + fees.pse + fees.sccp);
}

export function isIsoDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export type PriceRow = { sym: string; price: number; date: string };
export function parsePriceCsv(csv: string, defaultDate: string, symbols: readonly string[]): PriceRow[] {
  if (!isIsoDate(defaultDate)) throw new Error("Choose a valid price date.");
  const known = new Set(symbols);
  const seen = new Set<string>();
  return csv.replace(/^\uFEFF/, "").split(/\r?\n/).flatMap((line, index) => {
    if (!line.trim()) return [];
    const cells = line.split(/[,;\t]/).map(cell => cell.trim().replace(/^"([^"]*)"$/, "$1"));
    if (index === 0 && /^(symbol|sym|ticker)$/i.test(cells[0]) && /^price$/i.test(cells[1] ?? "")) return [];
    const [rawSymbol, rawPrice, rawDate] = cells;
    const sym = rawSymbol.toUpperCase(), date = rawDate || defaultDate, price = Number(rawPrice);
    if (cells.length < 2 || cells.length > 3 || !known.has(sym) || !rawPrice || !Number.isFinite(price) || price <= 0 || !isIsoDate(date)) {
      throw new Error(`Line ${index + 1}: use a known SYMBOL, positive price, optional YYYY-MM-DD.`);
    }
    const key = `${sym}:${date}`;
    if (seen.has(key)) throw new Error(`Line ${index + 1}: duplicate price for ${sym} on ${date}.`);
    seen.add(key);
    return [{ sym, price, date }];
  });
}

export function donationTaxPreview(input: {
  date: string; amount: number; cost: number; donee: string; accredUntil?: string; expenseRatio?: number; priorTaxableGifts: number;
  policy: { donorRate: number; donorExempt: number; itemizes: string; deductCap: number; taxableIncome: number };
}) {
  const { policy, amount, cost, priorTaxableGifts } = input;
  const accredited = input.donee === "accredited" && !!input.accredUntil && input.accredUntil >= input.date;
  const exempt = input.donee === "government" || (accredited && Number.isFinite(input.expenseRatio) && input.expenseRatio! >= 0 && input.expenseRatio! <= 30);
  const tax = (total: number) => roundMoney(Math.max(0, total - policy.donorExempt) * policy.donorRate / 100);
  return { exempt, expired: input.donee === "accredited" && !accredited,
    donorTax: exempt ? 0 : roundMoney(tax(priorTaxableGifts + amount) - tax(priorTaxableGifts)),
    deduction: policy.itemizes !== "yes" ? 0 : exempt ? cost : Math.min(cost, policy.taxableIncome * policy.deductCap / 100),
    limited: !exempt, basis: cost };
}

export function priorTaxableGifts(entries: readonly { id?: string; date: string; type: string; reversedBy?: string; data: Record<string, unknown> }[], date: string) {
  const reversals = entries.filter(row => row.type === "reversal");
  const reversed = new Set(reversals.filter(row => row.date <= date).map(row => row.data.reverses));
  return roundMoney(entries.filter(row => row.type === "donation" && (!row.id || !reversed.has(row.id)) &&
    (!row.reversedBy || reversals.some(reversal => reversal.date > date && (reversal.id === row.reversedBy || reversal.data.reverses === row.id))) && row.date <= date &&
    row.date.slice(0, 4) === date.slice(0, 4) && row.data.exempt === false)
    .reduce((sum, row) => sum + Number(row.data.amount ?? 0), 0));
}
