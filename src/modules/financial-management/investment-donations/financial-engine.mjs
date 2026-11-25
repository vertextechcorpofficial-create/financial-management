import { balance, centavos } from "./ledger.ts";

export const validPostingDate = value => typeof value === "string" && /^[1-9]\d{3}-\d{2}-\d{2}$/.test(value) &&
  Number.isFinite(+new Date(`${value}T00:00:00Z`)) && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;

/** @param {readonly import("./ledger.ts").Entry[]} entries */
export function activeEntries(entries, through = "9999-12-31") {
  const reversed = new Set(entries.filter(row => row.date <= through && row.data?.reverses).map(row => row.data.reverses));
  return entries.filter(row => row.date <= through && row.type !== "reversal" && !row.data?.reverses && !reversed.has(row.id));
}

/** @param {readonly import("./ledger.ts").Entry[]} entries */
export function dependencyEntries(entries, date) {
  const reversals = new Map(entries.filter(row => row.data?.reverses).map(row => [row.data.reverses, row.date]));
  // A later reversal does not remove the dependency's intervening historical effect.
  return entries.filter(row => row.type !== "reversal" && !row.data?.reverses &&
    (!reversals.has(row.id) || reversals.get(row.id) > (row.date > date ? row.date : date)));
}

// A backdated posting must remain valid at every later event, not only at today's balance.
export function assertFutureBalances(entries, entry) {
  const debitNormal = new Set(["1000", "1010", "1020", "1100", "1110", "1120", "1130", "1140", "1200", "1210", "3020"]);
  const creditNormal = new Set(["2000", "2100", "2110", "2200", "2300", "2310", "3000", "3010", "3100", "3150"]);
  const checks = new Map();
  for (const line of entry.lines) {
    if (!debitNormal.has(line.acct) && !creditNormal.has(line.acct)) continue;
    const tag = ["1000", "1010", "1020", "3100", "3150", "2310"].includes(line.acct) ? undefined : line.tag;
    checks.set(`${line.acct}|${tag ?? ""}`, { acct: line.acct, tag });
  }
  const dates = [...new Set([entry.date, ...entries.filter(row => row.date >= entry.date).map(row => row.date)])].sort();
  for (const { acct, tag } of checks.values()) {
    const change = centavos(balance([entry], acct, tag));
    if (debitNormal.has(acct) ? change >= 0 : change <= 0) continue;
    for (const day of dates) {
      const value = centavos(balance([...entries, entry], acct, tag, day));
      if (debitNormal.has(acct) ? value < 0 : value > 0) {
        throw new Error(`Payment exceeds the available balance for account ${acct} on ${day}; reverse dependent entries first.`);
      }
    }
  }
}

export function dividendDeadline(date) {
  const month = Number(date.slice(5, 7));
  const due = new Date(`${date.slice(0, 7)}-01T00:00:00Z`);
  due.setUTCMonth(due.getUTCMonth() + (month % 3 ? 1 : 2), month % 3 ? 10 : 0);
  return { taxForm: month % 3 ? "0619-F" : "1601-FQ", taxDue: due.toISOString().slice(0, 10) };
}
