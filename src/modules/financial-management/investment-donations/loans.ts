import { balance, centavos, type Entry, type Line } from "./ledger";
import { dependencyEntries, assertFutureBalances, validPostingDate } from "./financial-engine.mjs";

export type Loan = { id: string; name: string; rate: number; scheduled: boolean; cancelled?: boolean };
type LoanCommand = { type: "borrow" | "repay"; date: string; account: string; amount: number;
  name?: string; rate?: number; target?: string; memo: string; proceeds?: "existing" | "cash"; scheduled?: boolean;
  principal?: number; interest?: number };

export function loanInterest(entries: readonly Entry[], loan: Loan, date: string, dayCount: number) {
  if (!validPostingDate(date) || ![360, 365].includes(dayCount) || !Number.isFinite(loan.rate) || loan.rate < 0 || loan.rate > 100 || Number(loan.rate.toFixed(6)) !== loan.rate) throw new Error("Invalid loan interest settings.");
  const month = date.slice(0, 7);
  const days = Number(date.slice(8, 10));
  let principalDays = 0n;
  for (let day = 1; day <= days; day++) {
    principalDays += BigInt(Math.max(0, -centavos(balance(entries, "2000", loan.id, `${month}-${String(day).padStart(2, "0")}`))));
  }
  const numerator = principalDays * BigInt(Math.round(loan.rate * 1e6));
  const denominator = BigInt(dayCount) * 100000000n;
  const earned = Number((numerator + denominator / 2n) / denominator);
  const booked = centavos(balance(entries.filter(entry => entry.date >= `${month}-01` && entry.type !== "closing" && !entry.data.periodClose), "5200", loan.id, date));
  return (earned - booked) / 100;
}

export function assertPriorLoanAccruals(entries: readonly Entry[], loans: readonly Loan[], date: string, dayCount: number) {
  for (const loan of loans.filter(row => !row.cancelled)) {
    const first = entries.filter(entry => entry.date < `${date.slice(0, 7)}-01` && entry.lines.some(line => line.acct === "2000" && line.tag === loan.id))
      .map(entry => entry.date).sort()[0];
    if (!first) continue;
    const month = new Date(`${first.slice(0, 7)}-01T00:00:00Z`);
    while (month.toISOString().slice(0, 7) < date.slice(0, 7)) {
      const end = new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth() + 1, 0)).toISOString().slice(0, 10);
      if (centavos(loanInterest(entries, loan, end, dayCount)) !== 0) {
        throw new Error(`Post or correct outstanding loan interest accruals for ${end.slice(0, 7)} first.`);
      }
      month.setUTCMonth(month.getUTCMonth() + 1);
    }
  }
}

export function buildLoanEntry(entries: readonly Entry[], closed: readonly string[], loans: readonly Loan[],
  command: LoanCommand, id: string, dayCount: number) {
  const { type, date, account, amount } = command;
  if (closed.includes(date.slice(0, 7))) throw new Error("This month is closed.");
  if (!validPostingDate(date) || !["1000", "1010", "1020"].includes(account) || !Number.isFinite(amount) || amount <= 0 || amount > 1e12 || centavos(amount) / 100 !== amount) {
    throw new Error("Enter a valid cash account and amount.");
  }
  const lines: Line[] = [];
  const add = (acct: string, dr: number, cr: number, tag = "") => {
    if (dr || cr) lines.push({ acct, dr, cr, tag });
  };
  let nextLoans: Loan[] | undefined;
  let data: Record<string, unknown>;
  let label: string;
  if (type === "borrow") {
    if (command.proceeds !== undefined && !["existing", "cash"].includes(command.proceeds)) throw new Error("Select how the loan arose.");
    const existing = command.target && loans.find(row => row.id === command.target && !row.cancelled);
    const name = command.name?.trim();
    if (!existing && (!name || name.length > 120 || typeof command.rate !== "number" || !Number.isFinite(command.rate) ||
      command.rate < 0 || command.rate > 100 || Number(command.rate.toFixed(6)) !== command.rate)) throw new Error("Enter a lender name and annual interest rate with up to six decimals.");
    if (command.target && !existing) throw new Error("Select an existing loan.");
    if (existing && dependencyEntries(entries, date).some(entry => entry.date > date && entry.lines.some(line => line.tag === existing.id && ["2000", "2100", "5200"].includes(line.acct)))) {
      throw new Error("Use a date after dependent loan payments and accruals, or reverse those entries first.");
    }
    const debtId = existing ? existing.id : id;
    if (!existing) nextLoans = [...loans, { id, name: name!, rate: command.rate!, scheduled: command.scheduled === true }];
    add(command.proceeds === "existing" ? "3900" : account, amount, 0);
    add("2000", 0, amount, debtId);
    data = { debtId, amount, proceeds: command.proceeds ?? "cash", newDebt: !existing };
    label = `${command.proceeds === "existing" ? "Existing debt recorded" : "Loan proceeds"} · ${existing ? existing.name : name}`;
  } else {
    const loan = loans.find(row => row.id === command.target && !row.cancelled);
    if (!loan) throw new Error("Select an existing loan.");
    assertPriorLoanAccruals(entries, [loan], date, dayCount);
    if (dependencyEntries(entries, date).some(entry => entry.date > date && entry.lines.some(line => line.tag === loan.id && ["2000", "2100", "5200"].includes(line.acct)))) {
      throw new Error("Use a date after dependent loan payments and accruals, or reverse those entries first.");
    }
    const principal = Math.max(0, -centavos(balance(entries, "2000", loan.id, date)));
    const payable = Math.max(0, -centavos(balance(entries, "2100", loan.id, date)));
    const currentInterest = Math.max(0, centavos(loanInterest(entries, loan, date, dayCount)));
    const cents = centavos(amount);
    if (cents > principal + payable + currentInterest) throw new Error("Payment exceeds the outstanding loan and interest.");
    if (amount > balance(entries, account, undefined, date)) throw new Error("Payment exceeds the cash account balance.");
    let paidPrincipal = 0;
    let interestPayment = Math.min(cents, payable + currentInterest);
    if (command.principal !== undefined || command.interest !== undefined) {
      paidPrincipal = centavos(command.principal ?? 0);
      interestPayment = centavos(command.interest ?? 0);
      if (paidPrincipal < 0 || interestPayment < 0 || paidPrincipal / 100 !== (command.principal ?? 0) ||
          interestPayment / 100 !== (command.interest ?? 0) || paidPrincipal + interestPayment !== cents || paidPrincipal > principal) {
        throw new Error("Enter principal and interest in centavos adding up to the payment.");
      }
    } else if (cents > payable + currentInterest) {
      // Solve interest against the post-payment daily principal, avoiding an extra day's interest on repaid principal.
      let low = 0, high = Math.min(principal, cents);
      while (low < high) {
        const mid = Math.floor((low + high) / 2);
        const change: Entry = { id, no: 0, date, type: "debtpay", memo: "", data: {}, lines: [{ acct: "2000", dr: mid / 100, cr: 0, tag: loan.id }] };
        const due = payable + Math.max(0, centavos(loanInterest([...entries, change], loan, date, dayCount)));
        if (mid + due < cents) low = mid + 1; else high = mid;
      }
      paidPrincipal = low;
      interestPayment = cents - paidPrincipal;
    }
    const paidPayable = Math.min(payable, interestPayment);
    const paidInterest = interestPayment - paidPayable;
    const principalChange: Entry = { id, no: 0, date, type: "debtpay", memo: "", data: {}, lines: [{ acct: "2000", dr: paidPrincipal / 100, cr: 0, tag: loan.id }] };
    if (paidInterest > Math.max(0, centavos(loanInterest([...entries, principalChange], loan, date, dayCount)))) {
      throw new Error("Payment exceeds the loan interest earned on the payment date.");
    }
    add("2100", paidPayable / 100, 0, loan.id);
    add("5200", paidInterest / 100, 0, loan.id);
    add("2000", paidPrincipal / 100, 0, loan.id);
    add(account, 0, amount);
    data = { debtId: loan.id, principal: paidPrincipal / 100, interest: (paidPayable + paidInterest) / 100 };
    label = `Loan payment · ${loan.name}`;
  }
  const entry: Entry = { id, no: entries.reduce((max, row) => Math.max(max, row.no), 0) + 1, date,
    type: type === "borrow" ? "debt" : "debtpay", memo: command.memo.trim() || label, data, lines };
  assertFutureBalances(entries, entry);
  return { entry, nextLoans };
}
