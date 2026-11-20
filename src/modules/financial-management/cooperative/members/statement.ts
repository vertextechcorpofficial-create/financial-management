import { savingsKindLabel, statusText } from "./format";
import type { MemberStatement, StatementPeriod } from "./types";

export function statementPeriods(today: string) {
  const monthStart = today.slice(0, 7) + "-01";
  const priorMonthEnd = new Date(monthStart + "T00:00:00Z");
  priorMonthEnd.setUTCDate(0);
  const threeMonthsAgo = new Date(monthStart + "T00:00:00Z");
  threeMonthsAgo.setUTCMonth(threeMonthsAgo.getUTCMonth() - 3);
  const lastMonthEnd = priorMonthEnd.toISOString().slice(0, 10);
  return {
    "This month": { from: monthStart, to: today },
    "Last month": { from: lastMonthEnd.slice(0, 7) + "-01", to: lastMonthEnd },
    "Last 3 months": { from: threeMonthsAgo.toISOString().slice(0, 10), to: today },
    "Year to date": { from: today.slice(0, 4) + "-01-01", to: today },
  } satisfies Record<string, StatementPeriod>;
}

export const loanStatementColumns = [
  ["opening", "Opening balance"], ["released", "Released"], ["paid", "Installments paid"],
  ["penaltiesPaid", "Penalties paid"], ["offsets", "Clearance offsets"], ["closing", "Closing balance"],
] as const;

export const loanActivityChannels = { OTC: "Over the counter", PAYROLL: "Payroll remittance", CLEARANCE: "Exit clearance" };

export function statementText(statement: MemberStatement) {
  const { member, from, to, loans } = statement;
  const lines = [
    ["Cooperative Statement of Account"],
    ["Member", member.name],
    ["HR employee number", member.employeeNumber],
    ["Department", member.department ?? "No department"],
    ["Membership agreement", member.agreementNo ?? "—"],
    ["Status", statusText(member.status)],
    ["From", from, "To", to],
    [],
    ["Savings"],
    ["Date", "Particulars", "Reference", "Deposits", "Withdrawals", "Balance"],
    [from, "Opening balance", "", "", "", statement.openingBalance],
    ...statement.entries.map(entry => [
      entry.entryDate, savingsKindLabel[entry.kind], entry.reference,
      entry.deposit ?? "", entry.withdrawal ?? "", entry.runningBalance,
    ]),
    ["", "Closing balance", "", statement.deposits, statement.withdrawals, statement.closingBalance],
    [],
    ["Loans"],
  ];
  if (loans.state !== "ready") {
    lines.push([loans.message]);
  } else if (loans.data.entries.length === 0) {
    lines.push(["No loans in this period."]);
  } else {
    lines.push(
      ["Loan", "Product", ...loanStatementColumns.map(([, label]) => label)],
      ...loans.data.entries.map(entry => [entry.loanNo, entry.productName, ...loanStatementColumns.map(([key]) => entry[key])]),
      ["Total", "", ...loanStatementColumns.map(([key]) => loans.data.totals[key])],
    );
    if (loans.data.activity.length) lines.push(
      [],
      ["Loan activity"],
      ["Date", "Loan", "Activity", "Channel", "Reference", "Journal", "Reverses", "Amount"],
      ...loans.data.activity.map(item => [
        item.date, item.loanNo, item.kind, item.channel ? loanActivityChannels[item.channel] : "",
        item.reference, item.journalNo, item.reversesJournalNo ?? "", item.amount,
      ]),
    );
  }
  lines.push(["Generated", statement.generatedOn]);
  return lines.map(row => row.map(cell => cell.replace(/[\t\r\n]/g, " ")).join("\t")).join("\n");
}
