import { balance, centavos, type Entry, type Line } from "./ledger";
import { assertFutureBalances, validPostingDate } from "./financial-engine.mjs";

type Charity = { id: string; name: string; isDAF: boolean; donee: string; accredUntil: string;
  expenseRatio: number; checks: Record<string, string | null>; active?: boolean; inactive?: boolean };
type Policy = { donorRate: number; donorExempt: number };

export function donorTaxBalance(entries: readonly Entry[], year: string, through: string, policy: Policy) {
  if (!Number.isFinite(policy.donorRate) || policy.donorRate < 0 || policy.donorRate > 100 ||
    !Number.isFinite(policy.donorExempt) || policy.donorExempt < 0) throw new Error("Invalid donor's-tax policy.");
  const reversed = new Set(entries.filter(entry => entry.type === "reversal" && entry.date <= through).map(entry => entry.data.reverses));
  const taxable = entries.filter(entry => entry.type === "donation" && entry.date.startsWith(year) &&
    entry.date <= through && entry.data.exempt === false && !reversed.has(entry.id))
    .reduce((sum, entry) => sum + centavos(Number(entry.data.amount)), 0);
  const booked = centavos(balance(entries.filter(row => row.type !== "closing" && !row.data.periodClose &&
    (row.data.taxYear ?? row.date.slice(0, 4)) === year), "5330", undefined, through));
  return { taxable, booked, due: taxOn(taxable, policy) };
}

const taxOn = (base: number, policy: Policy) => centavos(Math.max(0, base / 100 - policy.donorExempt) * policy.donorRate / 100);

export function vetDonee(charity: Charity | undefined, date: string) {
  if (!charity || charity.inactive || charity.active === false) throw new Error("Select an active registered organization.");
  if (!["reg", "gov", "pay"].every(key => {
    const checked = charity.checks?.[key];
    return validPostingDate(checked) && checked! <= date;
  })) throw new Error("Complete all three vetting checks before the gift date.");
  if (!["government", "accredited", "nonaccredited"].includes(charity.donee)) throw new Error("Select an organization with a known donee status.");
  if (charity.donee === "accredited" && (!validPostingDate(charity.accredUntil) || charity.accredUntil < date)) throw new Error("The organization's accreditation has expired or is missing.");
  return charity;
}

export function buildCashDonation(entries: readonly Entry[], closed: readonly string[], command: {
   date: string; amount: number; account: string; target: string; memo: string; vehicle?: "Cash" | "Securities" | "DAF";
}, id: string, organization: Charity | undefined, policy: Policy,
  securities?: { cost: number; lines: Line[]; data: Record<string, unknown>; valuation: string }) {
  const { date, amount, account } = command;
  if (!validPostingDate(date)) throw new Error("Enter a valid gift date.");
  if (closed.includes(date.slice(0, 7))) throw new Error("This month is closed.");
  const charity = vetDonee(organization, date);
  if (command.vehicle && (command.vehicle === "DAF") !== charity.isDAF) throw new Error("Select the pooled-fund vehicle only for a pooled fund.");
  if (!["1000", "1010", "1020"].includes(account) || amount <= 0 || centavos(amount) / 100 !== amount) throw new Error("Enter a valid cash account and amount.");
  if (!securities && amount > balance(entries, account, undefined, date)) throw new Error("Payment exceeds the cash account balance.");
  const exempt = charity.donee === "government" || (charity.donee === "accredited" &&
    Number.isFinite(charity.expenseRatio) && charity.expenseRatio >= 0 && charity.expenseRatio <= 30);
  const taxYear = date.slice(0, 4);
  const prior = donorTaxBalance(entries, taxYear, date, policy);
  const annualTax = taxOn(prior.taxable + (exempt ? 0 : centavos(amount)), policy);
  const donorTax = exempt ? 0 : (annualTax - prior.due) / 100;
  const due = new Date(`${date}T00:00:00Z`);
  due.setUTCDate(due.getUTCDate() + 30);
  const taxDue = exempt ? null : due.toISOString().slice(0, 10);
  const lines: Line[] = [{ acct: "5000", dr: amount, cr: 0, tag: charity.id },
    ...(securities?.lines ?? [{ acct: account, dr: 0, cr: amount, tag: "" }])];
  if (donorTax) lines.push({ acct: "5330", dr: donorTax, cr: 0, tag: id }, { acct: "2200", dr: 0, cr: donorTax, tag: id });
  const entry: Entry = {
    id, no: entries.reduce((max, row) => Math.max(max, row.no), 0) + 1, date, type: "donation",
    memo: command.memo.trim() || `Gift · ${charity.name}`, lines,
    data: { ...securities?.data, valuation: securities?.valuation, charityId: charity.id,
      vehicle: charity.isDAF ? "DAF" : securities ? "Securities" : "Cash", giftCommand: true,
      amount, exempt, donorTax, donee: charity.donee, taxYear,
      deductBasis: securities?.cost ?? amount, receipt: { cert: false, f1800: false }, taxForm: exempt ? null : "1800", taxDue },
  };
  assertFutureBalances(entries, entry);
  const totals = donorTaxBalance([...entries, entry], taxYear, `${taxYear}-12-31`, policy);
  return { entry, adjustment: exempt ? 0 : (totals.due - totals.booked) / 100 };
}

export function pooledBalance(entries: readonly Entry[], grants: readonly { date: string; dafId: string; amount: number }[],
  fund: string, through: string) {
  const reversed = new Set(entries.filter(row => row.type === "reversal" && row.date <= through).map(row => row.data.reverses));
  return (entries.filter(row => row.type === "donation" && row.date <= through && row.data.vehicle === "DAF" &&
    row.data.charityId === fund && !reversed.has(row.id)).reduce((sum, row) => sum + centavos(Number(row.data.amount)), 0) -
    grants.filter(row => row.dafId === fund && row.date <= through).reduce((sum, row) => sum + centavos(row.amount), 0)) / 100;
}
