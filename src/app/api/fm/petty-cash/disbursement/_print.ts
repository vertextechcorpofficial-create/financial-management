import { jsPDF } from "jspdf";
import autoTable, { type UserOptions } from "jspdf-autotable";
import type { VoucherFund, VoucherOperations } from "@/modules/financial-management/petty-cash/voucher-types";

export type VoucherPrintList = { fund: VoucherFund; vouchers: VoucherOperations[]; company: Record<string, string>; asOf: string; preparedBy: string };
const status = (value: string) => value.replaceAll("_", " ");
export function printMoney(value: string) {
  const negative = value.startsWith("-"), [whole, cents = "00"] = value.replace(/^-/, "").split(".");
  return `${negative ? "-" : ""}PHP ${BigInt(whole).toLocaleString("en-PH")}.${cents.padEnd(2, "0")}`;
}
export function heading(doc: jsPDF, company: Record<string, string>, title: string, reference: string) {
  let y = 13;
  for (const [text, size] of [[company.registeredName || "Petty Cash", 12], [`${company.address || ""}${company.postalCode ? ` ${company.postalCode}` : ""}`.trim(), 8], [company.tin ? `TIN ${company.tin}` : "", 8], [title, 15], [reference, 9]] as const) {
    if (!text) continue;
    doc.setFontSize(size).setFont("helvetica", size >= 12 ? "bold" : "normal");
    const lines = doc.splitTextToSize(text, 184); doc.text(lines, 13, y); y += lines.length * (size >= 12 ? 6 : 4) + 2;
  }
  return y + 2;
}
export function table(doc: jsPDF, y: number, options: UserOptions) {
  autoTable(doc, { startY: y, margin: { left: 13, right: 13, top: 15, bottom: 48 }, styles: { font: "helvetica", fontSize: 8, cellPadding: 2, overflow: "linebreak", textColor: 20 }, headStyles: { fillColor: [240, 242, 245], textColor: 20, fontStyle: "bold" }, footStyles: { fillColor: [248, 248, 248], textColor: 20 }, theme: "grid", rowPageBreak: "avoid", showFoot: "lastPage", ...options });
  return (doc as jsPDF & { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 7;
}
export function finish(doc: jsPDF, y: number, signatures: string[], reference: string) {
  if (y > 258) { doc.addPage(); y = 25; }
  const cell = 184 / signatures.length;
  signatures.forEach((label, index) => { const x = 13 + cell * index; doc.setDrawColor(90).line(x, y + 12, x + cell - 7, y + 12); doc.setFontSize(8).setFont("helvetica", "normal").text(doc.splitTextToSize(label, cell - 8), x, y + 17); });
  const total = doc.getNumberOfPages();
  for (let page = 1; page <= total; page++) { doc.setPage(page); doc.setFontSize(7).setTextColor(90); doc.text(reference, 13, 288); doc.text(`Page ${page} of ${total}`, 197, 288, { align: "right" }); }
  return new Uint8Array(doc.output("arraybuffer"));
}
export function voucherPdf(data: VoucherOperations) {
  const doc = new jsPDF({ format: "a4", compress: true }), p = data.effective.saved;
  let y = heading(doc, data.company, "Petty Cash Voucher", `${data.voucher.docNo} | ${p.date} | ${status(data.voucher.state)}`);
  if (["DRAFT", "FOR_APPROVAL", "VOID", "REJECTED"].includes(data.voucher.state)) { doc.setFontSize(10).setFont("helvetica", "bold").text(`${status(data.voucher.state)}${["DRAFT", "FOR_APPROVAL"].includes(data.voucher.state) ? " - UNPAID" : ""}`, 13, y); y += 8; }
  y = table(doc, y, { body: [["Fund", `${data.fundDocNo} - ${data.fundName}`], ["Payee", `${p.payee.name}${p.payee.details.tin ? ` | TIN ${p.payee.details.tin}` : ""}`], ["Particulars", p.particulars], ["Status / reason", `${status(data.voucher.state)}${data.reason ? `: ${data.reason}` : ""}`]], columnStyles: { 0: { cellWidth: 35, fontStyle: "bold" } } });
  y = table(doc, y, { head: [["Document", "Receipt no.", "Expense account", "Amount", "VAT", "EWT"]], body: p.lines.map(line => [status(line.documentType), line.receiptNo, `${line.account.code} - ${line.account.name}`, printMoney(line.amounts.gross), printMoney(line.amounts.inputVat), `${printMoney(line.amounts.ewt)}${line.taxSnapshot.ewt.code ? `\n${line.taxSnapshot.ewt.code} (${line.taxSnapshot.ewt.rate}%)` : ""}`]), foot: [["", "", "Total", printMoney(p.totals.gross), printMoney(p.totals.inputVat), printMoney(p.totals.ewt)], ["", "", "Net cash payable", "", "", printMoney(p.totals.netCash)], ["", "", "Actual cash paid", "", "", printMoney(data.paidNetCash)]], columnStyles: { 2: { cellWidth: 48 }, 3: { halign: "right" }, 4: { halign: "right" }, 5: { halign: "right" } } });
  if (data.proposed) y = table(doc, y, { body: [["Pending changes", "This document shows the effective voucher. Proposed changes have not changed its paid cash."]] });
  if (data.effective.attachments.length) y = table(doc, y, { head: [["Supporting documents"]], body: data.effective.attachments.map(file => [file.filename]) });
  if (data.revisions.length > 1) y = table(doc, y, { head: [["Revision", "When / by", "State / amounts / reason"]], body: data.revisions.map(r => [String(r.number), `${r.preparedAt.replace("T", " ")}\n${r.preparedBy}`, `${r.state} | Gross ${printMoney(r.saved.totals.gross)} | Net ${printMoney(r.saved.totals.netCash)}${r.reason ? `\n${r.reason}` : ""}`]) });
  return finish(doc, y, [`Prepared by\n${data.effective.preparedBy}`, `Approved by\n${data.effective.decidedBy || ""}`, "Received by (Payee)"], data.voucher.docNo);
}
export function voucherListPdf(data: VoucherPrintList) {
  const doc = new jsPDF({ format: "a4", compress: true });
  let y = listHeading(doc, data.company, data.fund, data.asOf);
  y = listTable(doc, y, data.vouchers);
  const totalsHeight = 9.5 * 3;
  if (y + totalsHeight > 238) { doc.addPage(); y = listContinuationHeading(doc, data.company, data.fund, data.asOf); }
  y = listTotals(doc, y, data.fund);
  listSignatures(doc, y, data.preparedBy);
  return listFinish(doc, data.fund.docNo);
}
function listContinuationHeading(doc: jsPDF, company: Record<string, string>, fund: VoucherFund, asOf: string) {
  doc.setFont("helvetica", "bold").setFontSize(14).setTextColor(20).text(company.registeredName || "Petty Cash", 13, 22);
  doc.setFont("helvetica", "normal").setFontSize(9).setTextColor(60).text(`PETTY CASH VOUCHER LIST | ${fund.docNo} - ${fund.name} | As of ${asOf}`, 13, 29);
  doc.setDrawColor(20).setLineWidth(0.4).line(13, 33, 197, 33);
  return 42;
}
function listHeading(doc: jsPDF, company: Record<string, string>, fund: VoucherFund, asOf: string) {
  let y = 18;
  doc.setFont("helvetica", "bold").setFontSize(16).setTextColor(20).text(company.registeredName || "Petty Cash", 13, y);
  y += 6;
  const address = `${company.address || ""}${company.postalCode ? ` ${company.postalCode}` : ""}`.trim();
  const detail = [address, company.tin ? `TIN ${company.tin}` : ""].filter(Boolean).join(" | ");
  if (detail) { doc.setFont("helvetica", "normal").setFontSize(8.5).setTextColor(60).text(detail, 13, y); y += 4; }
  doc.setDrawColor(20).setLineWidth(0.4).line(13, y + 2, 197, y + 2);
  y += 12;
  doc.setFont("helvetica", "bold").setFontSize(18).setTextColor(20).text("PETTY CASH VOUCHER LIST", 13, y);
  y += 8;
  doc.setFontSize(9.5).text(`${fund.docNo} - ${fund.name} | As of ${asOf}`, 13, y);
  y += 10;
  doc.setFontSize(10.5).text("VOUCHER DISBURSEMENT SCHEDULE", 13, y);
  return y + 6;
}
function listTable(doc: jsPDF, y: number, vouchers: VoucherOperations[]) {
  const body = vouchers.length ? vouchers.map(v => [v.voucher.docNo, v.effective.saved.date, v.effective.saved.payee.name, v.effective.saved.lines.map(line => line.receiptNo).join(",\n"), status(v.voucher.state).toUpperCase(), printMoney(v.paidNetCash)]) : [["No open vouchers", "", "", "", "", ""]];
  autoTable(doc, {
    startY: y,
    margin: { left: 13, right: 13, top: 15, bottom: 20 },
    theme: "plain",
    showHead: "everyPage",
    rowPageBreak: "avoid",
    styles: { font: "helvetica", fontSize: 9, cellPadding: { top: 2.4, right: 2, bottom: 2.4, left: 2 }, overflow: "linebreak", textColor: 40, lineColor: [205, 205, 205], lineWidth: 0 },
    headStyles: { fillColor: [242, 244, 247], textColor: 20, fontStyle: "bold", fontSize: 9 },
    bodyStyles: { textColor: 40 },
    columnStyles: { 0: { cellWidth: 24 }, 1: { cellWidth: 21 }, 2: { cellWidth: 35 }, 3: { cellWidth: 44 }, 4: { cellWidth: 31 }, 5: { halign: "right", cellWidth: 29 } },
    didDrawCell: cell => {
      if (cell.section === "head" || cell.section === "body") {
        doc.setDrawColor(205).setLineWidth(0.1).line(cell.cell.x, cell.cell.y + cell.cell.height, cell.cell.x + cell.cell.width, cell.cell.y + cell.cell.height);
      }
    },
    head: [["Voucher", "Date", "Payee", "Receipts", "Status", "Cash paid"]],
    body,
  });
  return (doc as jsPDF & { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 10;
}
function listTotals(doc: jsPDF, y: number, fund: VoucherFund) {
  const width = 90, x = 197 - width, rowHeight = 9.5, rows = [["Total open vouchers", printMoney(fund.openVouchers)], ["Cash on hand", printMoney(fund.expectedCash)], ["Imprest amount", printMoney(fund.imprestAmount)]];
  const top = y;
  doc.setDrawColor(190).setLineWidth(0.2).rect(x, top, width, rowHeight * rows.length);
  rows.forEach(([label, value], index) => {
    const baseline = top + rowHeight * (index + 1) - 3.2;
    if (index > 0) doc.setDrawColor(215).line(x, top + rowHeight * index, x + width, top + rowHeight * index);
    doc.setFont("helvetica", "normal").setFontSize(9).setTextColor(50).text(label, x + 3, baseline);
    doc.setFont("helvetica", "bold").setTextColor(20).text(value, x + width - 3, baseline, { align: "right" });
  });
  return top + rowHeight * rows.length + 16;
}
function listSignatures(doc: jsPDF, y: number, preparedBy: string) {
  const top = Math.max(y, 244);
  const width = 184, cell = width / 3, lineY = top + 10;
  [["Prepared by", preparedBy], ["Reviewed by", ""], ["Approved by", ""]].forEach(([label, name], index) => {
    const x = 13 + cell * index;
    if (name) doc.setFont("helvetica", "bold").setFontSize(9.5).setTextColor(20).text(name, x, lineY - 3, { maxWidth: cell - 10 });
    doc.setDrawColor(40).setLineWidth(0.4).line(x, lineY, x + cell - 8, lineY);
    doc.setFont("helvetica", "normal").setFontSize(8.5).setTextColor(90).text(label, x, lineY + 5);
  });
}
function listFinish(doc: jsPDF, reference: string) {
  const total = doc.getNumberOfPages();
  for (let page = 1; page <= total; page++) {
    doc.setPage(page).setDrawColor(190).setLineWidth(0.2).rect(8, 8, 194, 281);
    if (total > 1) { doc.setFont("helvetica", "normal").setFontSize(7).setTextColor(90).text(reference, 13, 288).text(`Page ${page} of ${total}`, 197, 288, { align: "right" }); }
  }
  return new Uint8Array(doc.output("arraybuffer"));
}
