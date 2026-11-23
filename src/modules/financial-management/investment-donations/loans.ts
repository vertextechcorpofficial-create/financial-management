import { balance, centavos, type Entry, type Line } from "./ledger";

export type Loan = { id: string; name: string; rate: number; scheduled: boolean };
type LoanCommand = { type: "borrow" | "repay"; date: string; account: string; amount: number;
  name?: string; rate?: number; target?: string; memo: string };

export function loanInterest(entries: readonly Entry[], loan: Loan, date: string, dayCount: number) {
  if (![360, 365].includes(dayCount) || !Number.isFinite(loan.rate) || loan.rate < 0) throw new Error("Invalid loan interest settings.");
  const month = date.slice(0, 7);
  const days = Number(date.slice(8, 10));
  let interest = 0;
  for (let day = 1; day <= days; day++) {
    interest += Math.max(0, -balance(entries, "2000", loan.id, `${month}-${String(day).padStart(2, "0")}`)) * loan.rate / 100 / dayCount;
  }
  const booked = balance(entries.filter(entry => entry.date >= `${month}-01`), "5200", loan.id, date);
  return Math.max(0, centavos(interest) - centavos(booked)) / 100;
}

export function buildLoanEntry(entries: readonly Entry[], closed: readonly string[], loans: readonly Loan[],
  command: LoanCommand, id: string, dayCount: number) {
  const { type, date, account, amount } = command;
  if (closed.includes(date.slice(0, 7))) throw new Error("This month is closed.");
  if (entries.some(entry => entry.date > date)) throw new Error("Use a date on or after the latest journal entry.");
  if (!["1000", "1010", "1020"].includes(account) || amount <= 0 || centavos(amount) / 100 !== amount) {
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
    const name = command.name?.trim();
    if (!name || name.length > 120 || typeof command.rate !== "number" || !Number.isFinite(command.rate) ||
      command.rate < 0 || command.rate > 100) throw new Error("Enter a lender name and annual interest rate.");
    nextLoans = [...loans, { id, name, rate: command.rate, scheduled: false }];
    add(account, amount, 0);
    add("2000", 0, amount, id);
    data = { debtId: id, amount };
    label = `Loan proceeds · ${name}`;
  } else {
    const loan = loans.find(row => row.id === command.target);
    if (!loan) throw new Error("Select an existing loan.");
    const principal = Math.max(0, -centavos(balance(entries, "2000", loan.id, date)));
    const payable = Math.max(0, -centavos(balance(entries, "2100", loan.id, date)));
    // Principal repaid on this date will not incur interest for this date, consistent with month-end accrual.
    const yesterday = new Date(`${date}T00:00:00Z`);
    yesterday.setUTCDate(yesterday.getUTCDate() - 1);
    const previous = yesterday.toISOString().slice(0, 10);
    const currentInterest = previous.slice(0, 7) === date.slice(0, 7) ? centavos(loanInterest(entries, loan, previous, dayCount)) : 0;
    const cents = centavos(amount);
    if (cents > principal + payable + currentInterest) throw new Error("Payment exceeds the outstanding loan and interest.");
    if (amount > balance(entries, account, undefined, date)) throw new Error("Payment exceeds the cash account balance.");
    const paidPayable = Math.min(payable, cents);
    const paidInterest = Math.min(currentInterest, cents - paidPayable);
    const paidPrincipal = cents - paidPayable - paidInterest;
    add("2100", paidPayable / 100, 0, loan.id);
    add("5200", paidInterest / 100, 0, loan.id);
    add("2000", paidPrincipal / 100, 0, loan.id);
    add(account, 0, amount);
    data = { debtId: loan.id, principal: paidPrincipal / 100, interest: (paidPayable + paidInterest) / 100 };
    label = `Loan payment · ${loan.name}`;
  }
  const entry: Entry = { id, no: entries.reduce((max, row) => Math.max(max, row.no), 0) + 1, date,
    type: type === "borrow" ? "debt" : "debtpay", memo: command.memo.trim() || label, data, lines };
  return { entry, nextLoans };
}
