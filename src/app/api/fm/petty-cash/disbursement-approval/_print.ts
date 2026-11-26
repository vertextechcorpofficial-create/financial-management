import { jsPDF } from "jspdf";
import { heading, table, finish, printMoney } from "../disbursement/_print";
import type { VoucherOperations } from "@/modules/financial-management/petty-cash/voucher-types";
import type { VoucherDecision } from "@/modules/financial-management/petty-cash/voucher-approval-types";

export function approvalPdf(value: VoucherOperations, decision?: VoucherDecision) {
  const doc = new jsPDF({ format: "a4", compress: true }), revision = value.proposed || value.effective, p = revision.saved;
  let y = heading(doc, value.company, decision ? "Voucher Approval Decision" : "Voucher Approval Review", `${value.voucher.docNo} | Revision ${revision.number} | ${decision ? decision.decision : "PENDING - UNCONFIRMED"}`);
  y = table(doc, y, { body: [["Fund", `${value.fundDocNo} - ${value.fundName}`], ["Payee", p.payee.name], ["Voucher date", p.date], ["Particulars", p.particulars], ["Prepared by", revision.preparedBy], ["Cash paid before review", printMoney(value.paidNetCash)], ["Requested cash difference", printMoney(value.cashDelta)]], columnStyles: { 0: { cellWidth: 48, fontStyle: "bold" } } });
  y = table(doc, y, { head: [["Receipt", "Expense account", "Gross", "VAT", "EWT", "Net cash"]], body: p.lines.map(line => [line.receiptNo, `${line.account.code} - ${line.account.name}`, printMoney(line.amounts.gross), printMoney(line.amounts.inputVat), printMoney(line.amounts.ewt), printMoney(line.amounts.netCash)]), foot: [["Total", "", printMoney(p.totals.gross), printMoney(p.totals.inputVat), printMoney(p.totals.ewt), printMoney(p.totals.netCash)]] });
  if (value.proposed) y = table(doc, y, { head: [["Correction", "Effective", "Requested"]], body: [["Particulars", value.effective.saved.particulars, p.particulars], ["Gross", printMoney(value.effective.saved.totals.gross), printMoney(p.totals.gross)], ["Net cash", printMoney(value.effective.saved.totals.netCash), printMoney(p.totals.netCash)]] });
  if (decision) y = table(doc, y, { body: [["Decision", decision.decision], ["Decided by", decision.decidedBy], ["Decided at (PHT)", decision.decidedAt], ["Reason", decision.reason || "-"], ["Cash-box movement", printMoney(decision.cashMovement)], ["Cash paid after decision", printMoney(decision.paidAfter)], ["Cash on hand after decision", printMoney(decision.cashAfter)]], columnStyles: { 0: { cellWidth: 55, fontStyle: "bold" } } });
  if (revision.attachments.length) y = table(doc, y, { head: [["Supporting documents"]], body: revision.attachments.map(file => [file.filename]) });
  return finish(doc, y, [`${revision.preparedBy}\nPrepared by`, `${decision?.decidedBy || ""}\nReviewed by`], `${value.voucher.docNo} | Revision ${revision.number}${decision ? ` | Decision ${decision.eventId}` : ""}`);
}
