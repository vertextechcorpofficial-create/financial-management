import "server-only";

import { csvCell } from "../loans/register-csv";
import { readCloseExport } from "./month-end-close";
import { LoanRequestError } from "./request-input";

export async function exportMonthEndClose(month: string | null, report: "checklist" | "rollforward") {
  const { checklist, rollforward, saved } = await readCloseExport(month);
  const metadata = [checklist.month, saved ? "Closed" : "Open", saved?.id ?? null, saved?.actor ?? null,
    saved?.closedAt ?? null, saved?.reason ?? null];
  const headers = ["Month", "Period status", "Snapshot ID", "Closed by", "Closed at", "Close reason"];
  const lines: (string | number | null)[][] = [];
  if (report === "checklist") {
    lines.push([...headers, "Check", "Result", "Item", "Detail", "Source references"]);
    const payroll = checklist.payroll;
    lines.push([...metadata, "Payroll deductions received", payroll ? "Passed" : "Blocked", null,
      payroll ? String(checklist.resultCount) + " results confirmed" : "Confirmed Payroll results required", JSON.stringify(payroll)]);
    for (const group of checklist.groups) {
      if (!group.items.length) lines.push([...metadata, group.label,
        group.key === "billing" && !payroll ? "Awaiting Payroll" : "Passed", null, null, null]);
      for (const item of group.items) lines.push([...metadata, group.label, "Open", item.label, item.detail, JSON.stringify(item.source)]);
    }
    for (const item of checklist.finalPay) lines.push([...metadata, "Final pay", "Reported", item.label, item.detail, JSON.stringify(item.source)]);
  } else {
    if (!rollforward) throw new LoanRequestError(404, "This period was closed before rollforward snapshots were available.");
    lines.push([...headers, "Rollforward status", "Agency code", "Agency", "Opening", "Withheld", "Remitted principal",
      "Closing", "From this month", "From earlier months", "Opening snapshot", "Opening Payroll receipts",
      "Opening remittances", "Current Payroll receipt", "Current remittances"]);
    const prefix = [...metadata, rollforward.complete ? "Complete" : "Awaiting Payroll"];
    for (const row of rollforward.rows) lines.push([...prefix, row.code, row.agency, row.opening, row.withheld, row.remitted,
      row.closing, row.current, row.earlier, JSON.stringify(row.openingSnapshot), JSON.stringify(row.openingReceipts),
      JSON.stringify(row.openingPayments), JSON.stringify(row.receipt), JSON.stringify(row.payments)]);
    const total = rollforward.totals;
    lines.push([...prefix, null, "Total", total.opening, total.withheld, total.remitted, total.closing,
      total.current, total.earlier, null, null, null, null, null]);
  }
  return new Response("\uFEFF" + lines.map(line => line.map(csvCell).join(",")).join("\r\n") + "\r\n", { headers: {
    "Content-Type": "text/csv; charset=utf-8",
    "Content-Disposition": `attachment; filename="government-loans-${checklist.month}-${report}.csv"`,
  } });
}
