import { balance, centavos, validateLines } from "./ledger.js";
import { assertFutureBalances } from "./financial-engine.mjs";
const cash = ["1000", "1010", "1020"];
export function buildCashEntry(entries, closed, command, id, interestRate, dividendRate = 0) {
    const { account, target, type, date, memo } = command;
    const day = new Date(`${date}T00:00:00Z`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(day.valueOf()) || day.toISOString().slice(0, 10) !== date) {
        throw new Error("Enter a valid entry date.");
    }
    if (closed.includes(date.slice(0, 7)))
        throw new Error("This month is closed.");
    if (!cash.includes(account))
        throw new Error("Select a cash account.");
    const amount = centavos(command.amount) / 100;
    if (amount <= 0 || amount !== command.amount)
        throw new Error("Enter a positive amount with up to two decimals.");
    if (command.fwtRate !== undefined && (!Number.isFinite(command.fwtRate) || command.fwtRate < 0 || command.fwtRate > 100)) {
        throw new Error("Enter a withholding rate between zero and 100.");
    }
    const lines = [];
    const add = (acct, dr, cr, tag = "") => {
        if (dr || cr)
            lines.push({ acct, dr, cr, tag });
    };
    const data = { cashCommand: type };
    switch (type) {
        case "contribution": {
            const source = ({ deposit: "Deposit for future stock subscription", advance: "Advance from stockholder", opening: "Opening balance" })[command.source ?? ""] ?? command.source;
            const contra = ({ "Deposit for future stock subscription": "3150", "Advance from stockholder": "2310", "Opening balance": "3900" })[source ?? ""];
            if (!contra)
                throw new Error("Choose a deposit, stockholder advance, or opening balance.");
            Object.assign(data, { source });
            add(account, amount, 0);
            add(contra, 0, amount);
            break;
        }
        case "transfer":
            if (!target || !cash.includes(target) || target === account)
                throw new Error("Choose a different destination cash account.");
            add(target, amount, 0);
            break;
        case "fee":
            add("5100", amount, 0);
            break;
        case "expaccrue":
            Object.assign(data, { payId: id });
            add("5100", amount, 0);
            add("2110", 0, amount, id);
            break;
        case "exppay":
            if (!target || amount > -balance(entries, "2110", target, date))
                throw new Error("Payment exceeds the outstanding fee.");
            add("2110", amount, 0, target);
            break;
        case "dividend":
        case "interest": {
            const rate = command.fwtRate ?? (type === "interest" ? interestRate : dividendRate);
            if (!Number.isFinite(rate) || rate < 0 || rate > 100)
                throw new Error("Enter a withholding rate between zero and 100.");
            const tax = centavos(amount * rate / 100);
            Object.assign(data, { kind: type === "interest" ? "Interest" : "Dividend", gross: amount, fwt: tax / 100,
                net: (centavos(amount) - tax) / 100, rate, sym: command.sym ?? "", recId: "" });
            add(account, (centavos(amount) - tax) / 100, 0);
            add("5300", tax / 100, 0, command.sym ?? "");
            add(type === "interest" ? "4010" : "4000", 0, amount, command.sym ?? "");
            break;
        }
        case "accrueDividend":
        case "accrueInterest": {
            const dividend = type === "accrueDividend";
            const payDate = command.payDate;
            if (payDate) {
                const expected = new Date(`${payDate}T00:00:00Z`);
                if (!/^\d{4}-\d{2}-\d{2}$/.test(payDate) || !Number.isFinite(+expected) ||
                    expected.toISOString().slice(0, 10) !== payDate || payDate < date) {
                    throw new Error("Enter an expected payment date on or after the accrual date.");
                }
            }
            Object.assign(data, { kind: dividend ? "Dividend" : "Interest", recId: id, gross: amount, payDate: payDate || null, sym: command.sym ?? "" });
            add(dividend ? "1200" : "1210", amount, 0, id);
            add(dividend ? "4000" : "4010", 0, amount, command.sym ?? "");
            break;
        }
        case "collectIncome": {
            const receivable = target ? entries.find(entry => entry.type === "accrue" && entry.date <= date &&
                entry.lines.some(line => line.tag === target && line.dr > 0 && ["1200", "1210"].includes(line.acct))) : undefined;
            const line = receivable ? receivable.lines.find(row => row.tag === target && row.dr > 0 &&
                ["1200", "1210"].includes(row.acct)) : undefined;
            if (!line || !target || amount > balance(entries, line.acct, target, date)) {
                throw new Error("Payment exceeds the outstanding income receivable.");
            }
            const rate = command.fwtRate ?? (line.acct === "1210" ? interestRate : dividendRate);
            if (!Number.isFinite(rate) || rate < 0 || rate > 100)
                throw new Error("Invalid withholding policy.");
            const withheld = centavos(amount * rate / 100);
            const sym = typeof receivable?.data.sym === "string" ? receivable.data.sym : "";
            Object.assign(data, { recId: target, kind: line.acct === "1210" ? "Interest" : "Dividend", gross: amount, fwt: withheld / 100,
                net: (centavos(amount) - withheld) / 100, rate, sym });
            add(account, (centavos(amount) - withheld) / 100, 0);
            add("5300", withheld / 100, 0, sym);
            add(line.acct, 0, amount, target);
            break;
        }
        case "taxpay":
            if (!target || amount > -balance(entries, "2200", target, date))
                throw new Error("Payment exceeds the outstanding BIR item.");
            add("2200", amount, 0, target);
            data.taxId = target;
            break;
        case "subcollect":
            if (!target || amount > balance(entries, "3020", target, date))
                throw new Error("Payment exceeds the unpaid subscription balance.");
            Object.assign(data, { subId: target, amount });
            add(account, amount, 0);
            add("3020", 0, amount, target);
            break;
        default:
            throw new Error("Select a supported transaction type.");
    }
    if (!["interest", "dividend", "contribution", "expaccrue", "accrueDividend", "accrueInterest", "collectIncome", "subcollect"].includes(type)) {
        if (amount > balance(entries, account, undefined, date))
            throw new Error("Payment exceeds the cash account balance.");
        add(account, 0, amount);
    }
    validateLines(lines);
    const entry = {
        id, no: entries.reduce((max, entry) => Math.max(max, entry.no), 0) + 1, date, lines, data,
        type: type === "interest" || type === "dividend" || type === "collectIncome" ? "receive" :
            type === "accrueDividend" || type === "accrueInterest" ? "accrue" : type,
        memo: memo.trim() || ({ interest: "Bank interest received", fee: "Investment fee paid", transfer: "Cash transfer",
            taxpay: "Tax payment", expaccrue: "Investment fee accrued", exppay: "Accrued investment fee paid",
            accrueDividend: "Investment dividend accrued", accrueInterest: "Investment interest accrued",
            collectIncome: "Accrued investment income collected", subcollect: "Subscription installment received",
            dividend: "Investment dividend received", contribution: "Capital deposit or advance" })[type],
    };
    assertFutureBalances(entries, entry);
    return entry;
}
