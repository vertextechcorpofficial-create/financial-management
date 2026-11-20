import { balance, centavos, validateLines } from "./ledger.mjs";
const cash = ["1000", "1010", "1020"];
export function buildCashEntry(entries, closed, command, id, interestRate) {
    const { account, target, type, date, memo } = command;
    const day = new Date(`${date}T00:00:00Z`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(day.valueOf()) || day.toISOString().slice(0, 10) !== date) {
        throw new Error("Enter a valid entry date.");
    }
    if (closed.includes(date.slice(0, 7)))
        throw new Error("This month is closed.");
    // Restrict backdating so a withdrawal cannot invalidate later cash balances.
    if (entries.some(entry => entry.date > date))
        throw new Error("Use a date on or after the latest journal entry.");
    if (!cash.includes(account))
        throw new Error("Select a cash account.");
    const amount = centavos(command.amount) / 100;
    if (amount <= 0 || amount !== command.amount)
        throw new Error("Enter a positive amount with up to two decimals.");
    const lines = [];
    const add = (acct, dr, cr, tag = "") => {
        if (dr || cr)
            lines.push({ acct, dr, cr, tag });
    };
    const data = { cashCommand: type };
    switch (type) {
        case "transfer":
            if (!target || !cash.includes(target) || target === account)
                throw new Error("Choose a different destination cash account.");
            add(target, amount, 0);
            break;
        case "fee":
            add("5100", amount, 0);
            break;
        case "interest": {
            const tax = centavos(amount * interestRate / 100);
            add(account, (centavos(amount) - tax) / 100, 0);
            add("5300", tax / 100, 0);
            add("4010", 0, amount);
            break;
        }
        case "taxpay":
            if (!target || amount > -balance(entries, "2200", target, date))
                throw new Error("Payment exceeds the outstanding BIR item.");
            add("2200", amount, 0, target);
            data.taxId = target;
            break;
        default:
            throw new Error("Select a supported transaction type.");
    }
    if (type !== "interest") {
        if (amount > balance(entries, account, undefined, date))
            throw new Error("Payment exceeds the cash account balance.");
        add(account, 0, amount);
    }
    validateLines(lines);
    return {
        id, no: entries.reduce((max, entry) => Math.max(max, entry.no), 0) + 1, date, lines, data,
        type: type === "interest" ? "receive" : type === "fee" ? "fee" : type,
        memo: memo.trim() || (type === "interest" ? "Bank interest received" : type === "fee" ? "Investment fee paid" : type === "transfer" ? "Cash transfer" : "Tax payment"),
    };
}
