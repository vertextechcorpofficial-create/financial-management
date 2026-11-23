import { balance, centavos, validateLines, type Entry, type Line } from "./ledger";

export type CashAction = "transfer" | "fee" | "interest" | "taxpay" | "expaccrue" | "exppay" |
  "accrueDividend" | "accrueInterest" | "collectIncome" | "subcollect";
export type CashCommand = { type: CashAction; date: string; amount: number; account: string; target?: string; memo: string; payDate?: string };
const cash = ["1000", "1010", "1020"];

export function buildCashEntry(
  entries: readonly Entry[], closed: readonly string[], command: CashCommand,
  id: string, interestRate: number, dividendRate = 0,
): Entry {
  const { account, target, type, date, memo } = command;
  const day = new Date(`${date}T00:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(day.valueOf()) || day.toISOString().slice(0, 10) !== date) {
    throw new Error("Enter a valid entry date.");
  }
  if (closed.includes(date.slice(0, 7))) throw new Error("This month is closed.");
  // Restrict backdating so a withdrawal cannot invalidate later cash balances.
  if (entries.some(entry => entry.date > date)) throw new Error("Use a date on or after the latest journal entry.");
  if (!cash.includes(account)) throw new Error("Select a cash account.");
  const amount = centavos(command.amount) / 100;
  if (amount <= 0 || amount !== command.amount) throw new Error("Enter a positive amount with up to two decimals.");
  const lines: Line[] = [];
  const add = (acct: string, dr: number, cr: number, tag = "") => {
    if (dr || cr) lines.push({ acct, dr, cr, tag });
  };
  const data: Record<string, unknown> = { cashCommand: type };
  switch (type) {
    case "transfer":
      if (!target || !cash.includes(target) || target === account) throw new Error("Choose a different destination cash account.");
      add(target, amount, 0);
      break;
    case "fee":
      add("5100", amount, 0);
      break;
    case "expaccrue":
      delete data.cashCommand; // Requires dependency-aware reversal.
      add("5100", amount, 0);
      add("2110", 0, amount, id);
      break;
    case "exppay":
      if (!target || amount > -balance(entries, "2110", target, date)) throw new Error("Payment exceeds the outstanding fee.");
      add("2110", amount, 0, target);
      break;
    case "interest": {
      const tax = centavos(amount * interestRate / 100);
      add(account, (centavos(amount) - tax) / 100, 0);
      add("5300", tax / 100, 0);
      add("4010", 0, amount);
      break;
    }
    case "accrueDividend":
    case "accrueInterest": {
      delete data.cashCommand; // A receipt may depend on this entry.
      const dividend = type === "accrueDividend";
      const payDate = command.payDate;
      if (payDate) {
        const expected = new Date(`${payDate}T00:00:00Z`);
        if (!/^\d{4}-\d{2}-\d{2}$/.test(payDate) || !Number.isFinite(+expected) ||
            expected.toISOString().slice(0, 10) !== payDate || payDate < date) {
          throw new Error("Enter an expected payment date on or after the accrual date.");
        }
      }
      Object.assign(data, { kind: dividend ? "Dividend" : "Interest", recId: id, gross: amount, payDate: payDate || null });
      add(dividend ? "1200" : "1210", amount, 0, id);
      add(dividend ? "4000" : "4010", 0, amount);
      break;
    }
    case "collectIncome": {
      const receivable = target && entries.find(entry => entry.type === "accrue" && entry.date <= date &&
        entry.lines.some(line => line.tag === target && line.dr > 0 && ["1200", "1210"].includes(line.acct)));
      const line = receivable ? receivable.lines.find(row => row.tag === target && row.dr > 0 &&
        ["1200", "1210"].includes(row.acct)) : undefined;
      if (!line || !target || amount > balance(entries, line.acct, target, date)) {
        throw new Error("Payment exceeds the outstanding income receivable.");
      }
      const rate = line.acct === "1210" ? interestRate : dividendRate;
      if (!Number.isFinite(rate) || rate < 0 || rate > 100) throw new Error("Invalid withholding policy.");
      const withheld = centavos(amount * rate / 100);
      Object.assign(data, { recId: target, gross: amount, fwt: withheld / 100 });
      add(account, (centavos(amount) - withheld) / 100, 0);
      add("5300", withheld / 100, 0);
      add(line.acct, 0, amount, target);
      break;
    }
    case "taxpay":
      if (!target || amount > -balance(entries, "2200", target, date)) throw new Error("Payment exceeds the outstanding BIR item.");
      add("2200", amount, 0, target);
      data.taxId = target;
      break;
    case "subcollect":
      if (!target || amount > balance(entries, "3020", target, date)) throw new Error("Payment exceeds the unpaid subscription balance.");
      delete data.cashCommand; // Reversal must account for certificates issued after this payment.
      Object.assign(data, { subId: target, amount });
      add(account, amount, 0);
      add("3020", 0, amount, target);
      break;
    default:
      throw new Error("Select a supported transaction type.");
  }
  if (!["interest", "expaccrue", "accrueDividend", "accrueInterest", "collectIncome", "subcollect"].includes(type)) {
    if (amount > balance(entries, account, undefined, date)) throw new Error("Payment exceeds the cash account balance.");
    add(account, 0, amount);
  }
  validateLines(lines);
  return {
    id, no: entries.reduce((max, entry) => Math.max(max, entry.no), 0) + 1, date, lines, data,
    type: type === "interest" || type === "collectIncome" ? "receive" :
      type === "accrueDividend" || type === "accrueInterest" ? "accrue" : type,
    memo: memo.trim() || ({ interest: "Bank interest received", fee: "Investment fee paid", transfer: "Cash transfer",
      taxpay: "Tax payment", expaccrue: "Investment fee accrued", exppay: "Accrued investment fee paid",
      accrueDividend: "Investment dividend accrued", accrueInterest: "Investment interest accrued",
      collectIncome: "Accrued investment income collected", subcollect: "Subscription installment received" })[type],
  };
}
