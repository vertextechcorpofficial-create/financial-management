export const accounts: Record<string, string> = {
  1000: "Operating cash", 1010: "Emergency & operating reserve", 1020: "Liquidity & giving reserve",
  1100: "Domestic equities", 1110: "International equities", 1120: "Fixed income & bonds",
  1130: "Cash & equivalents", 1140: "Alternatives / real assets", 1200: "Dividends receivable",
  1210: "Interest receivable", 1220: "Tax credits & refunds receivable", 2000: "Debt payable",
  2100: "Accrued interest payable", 2110: "Accrued expenses payable", 2200: "Taxes payable (BIR)",
  2300: "Dividends payable", 2310: "Stockholder advances", 3000: "Capital stock — issued",
  3010: "Capital stock subscribed", 3020: "Subscriptions receivable", 3100: "Additional paid-in capital",
  3150: "Deposits for future stock subscriptions", 3800: "Retained earnings", 3900: "Opening balance equity",
  4000: "Dividend income", 4010: "Interest income", 4100: "Realized gain (loss) on sale",
  4110: "Gain (loss) on donated securities", 5000: "Charitable contributions",
  5100: "Investment fees & expenses", 5200: "Interest expense", 5300: "Final taxes withheld",
  5310: "Stock transaction tax", 5320: "Capital gains tax", 5330: "Donor’s tax",
};

export type Line = { acct: string; dr: number; cr: number; tag: string };
export type Entry = {
  id: string; no: number; date: string; type: string; memo: string;
  lines: Line[]; reversedBy?: string; data: Record<string, unknown>;
};

export function centavos(value: number) {
  const cents = Math.round(Math.abs(value) * 100 + 1e-8);
  if (!Number.isSafeInteger(cents)) throw new Error("Amount is outside the supported range.");
  return cents * Math.sign(value);
}

export function validateLines(lines: readonly Line[]) {
  const checked = lines.filter(line => line.dr !== 0 || line.cr !== 0);
  if (!checked.length) throw new Error("Enter at least one non-zero line.");
  let total = 0n;
  for (const { acct, dr, cr } of checked) {
    if (!Object.hasOwn(accounts, acct) || dr < 0 || cr < 0 || (dr > 0 && cr > 0) ||
      centavos(dr) / 100 !== dr || centavos(cr) / 100 !== cr) {
      throw new Error("Each line must have a valid account and one debit or credit in whole centavos.");
    }
    total += BigInt(centavos(dr)) - BigInt(centavos(cr));
  }
  if (total !== 0n) throw new Error("Debits and credits must balance to the centavo.");
}

export function balance(entries: readonly Entry[], account?: string, tag?: string, through = "9999-12-31") {
  return entries.reduce((total, entry) => entry.date > through ? total :
    entry.lines.reduce((sum, line) => (!account || line.acct === account) &&
      (tag === undefined || line.tag === tag)
      ? sum + centavos(line.dr) - centavos(line.cr) : sum, total), 0) / 100;
}

const currency = new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP", currencySign: "accounting" });
export const peso = (value: number) => currency.format(value);

export function fiscalDates(date: string, startMonth: number) {
  const month = Number(date.slice(5, 7));
  const year = Number(date.slice(0, 4)) - Number(month < startMonth);
  return {
    from: `${year}-${String(startMonth).padStart(2, "0")}-01`,
    to: new Date(Date.UTC(year + 1, startMonth - 1, 0)).toISOString().slice(0, 10),
  };
}

export function journalCsv(entries: readonly Entry[]) {
  const cell = (value: string | number) => {
    const text = typeof value === "string" && /^(?:\s*[=+\-@]|[\t\r\n])/.test(value) ? `'${value}` : String(value);
    return `"${text.replaceAll('"', '""')}"`;
  };
  return [
    ["JE number", "Date", "Type", "Description", "Account code", "Account name", "Debit", "Credit", "Reversed"],
    ...entries.flatMap(entry => entry.lines.map(line => [
      entry.no, entry.date, entry.type, entry.memo, line.acct, accounts[line.acct],
      line.dr.toFixed(2), line.cr.toFixed(2), entry.reversedBy ? "Yes" : "No",
    ])),
  ].map(row => row.map(cell).join(",")).join("\r\n");
}
