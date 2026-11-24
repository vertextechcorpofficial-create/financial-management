"use client";

import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import * as XLSX from "xlsx";

import { formatCurrency } from "@/lib/utils";

import { statusLabel } from "../components/PairStatusBadge";
import { formatMonth } from "../constants";
import type { IntercompanyMonthlyRow, IntercompanyPair, WithholdingRow } from "../types";
import { VERDICT_STYLE } from "../withholding";

type Cell = string | number | null;

/** PHT calendar date, formatted here because this module carries no pht helper of its own. */
function today(): string {
  return new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function writeSheet(filename: string, sheetName: string, header: string[], rows: Cell[][], widths: number[]): void {
  const sheet = XLSX.utils.aoa_to_sheet([header, ...rows]);
  sheet["!cols"] = widths.map((wch) => ({ wch }));
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, sheet, sheetName);
  XLSX.writeFile(book, filename);
}

export function downloadPairs(pairs: IntercompanyPair[], year: number): void {
  writeSheet(
    `intercompany-pairs-${year}-as-at-${today()}.xlsx`,
    "Pair matrix",
    [
      "Seller",
      "Buyer",
      "Invoices",
      "Sales amount",
      "VAT",
      "Withheld",
      "Buyer documents",
      "Buyer amount",
      "Status",
    ],
    pairs.map((pair) => [
      `${pair.fromCode} ${pair.fromName}`,
      `${pair.toCode} ${pair.toName}`,
      pair.invoices,
      pair.amount,
      pair.vat,
      pair.withheld,
      pair.reciprocalInvoices,
      pair.reciprocalAmount,
      statusLabel(pair),
    ]),
    [30, 30, 10, 16, 14, 14, 15, 16, 20],
  );
}

export function downloadMonthly(rows: IntercompanyMonthlyRow[], year: number): void {
  writeSheet(
    `intercompany-monthly-${year}-as-at-${today()}.xlsx`,
    "Monthly breakdown",
    ["Month", "Counterparty", "Direction", "Documents", "Amount", "VAT", "Withheld"],
    rows.map((row) => [
      formatMonth(row.month),
      `${row.counterpartyCode} ${row.counterpartyName}`,
      row.direction === "SALE" ? "Sale" : "Purchase",
      row.documents,
      row.amount,
      row.vat,
      row.withheld,
    ]),
    [18, 32, 12, 12, 16, 14, 14],
  );
}

export function downloadWithholding(rows: WithholdingRow[], year: number): void {
  writeSheet(
    `intercompany-withholding-${year}-as-at-${today()}.xlsx`,
    "Withholding",
    ["Payer", "Payee", "Basis", "Rate", "Base", "Expected", "Recorded", "Difference", "Verdict"],
    rows.map((row) => [
      `${row.fromCode} ${row.fromName}`,
      `${row.toCode} ${row.toName}`,
      row.basis === "SALES_INVOICE" ? "Sales invoice" : row.basis === "PURCHASE_ORDER" ? "Purchase order" : "No basis",
      row.rateLabel,
      row.base,
      row.expected,
      row.recorded,
      row.difference,
      VERDICT_STYLE[row.verdict].label,
    ]),
    [30, 30, 16, 12, 16, 16, 16, 14, 20],
  );
}

function writePdf(filename: string, title: string, head: string[], body: string[][]): void {
  const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
  doc.setFontSize(13);
  doc.text(title, 40, 36);
  doc.setFontSize(9);
  doc.setTextColor(100);
  doc.text(`Generated as at ${today()} (PHT) · ${body.length} rows`, 40, 50);
  autoTable(doc, {
    startY: 62,
    head: [head],
    body,
    styles: { fontSize: 8, cellPadding: 4, overflow: "linebreak" },
    headStyles: { fillColor: [30, 41, 59] },
  });
  doc.save(filename);
}

export function downloadPairsPdf(pairs: IntercompanyPair[], year: number): void {
  writePdf(
    `intercompany-pairs-${year}-as-at-${today()}.pdf`,
    `Intercompany Pair Matrix (${year})`,
    ["Seller", "Buyer", "Invoices", "Sales Amount", "VAT", "Withheld", "Buyer Docs", "Buyer Amount", "Status"],
    pairs.map((pair) => [
      `${pair.fromCode} ${pair.fromName}`,
      `${pair.toCode} ${pair.toName}`,
      String(pair.invoices),
      formatCurrency(pair.amount),
      formatCurrency(pair.vat),
      formatCurrency(pair.withheld),
      String(pair.reciprocalInvoices),
      formatCurrency(pair.reciprocalAmount),
      statusLabel(pair),
    ]),
  );
}

export function downloadMonthlyPdf(rows: IntercompanyMonthlyRow[], year: number): void {
  writePdf(
    `intercompany-monthly-${year}-as-at-${today()}.pdf`,
    `Intercompany Monthly Breakdown (${year})`,
    ["Month", "Counterparty", "Direction", "Documents", "Amount", "VAT", "Withheld"],
    rows.map((row) => [
      formatMonth(row.month),
      `${row.counterpartyCode} ${row.counterpartyName}`,
      row.direction === "SALE" ? "Sale" : "Purchase",
      String(row.documents),
      formatCurrency(row.amount),
      formatCurrency(row.vat),
      formatCurrency(row.withheld),
    ]),
  );
}

export function downloadWithholdingPdf(rows: WithholdingRow[], year: number): void {
  writePdf(
    `intercompany-withholding-${year}-as-at-${today()}.pdf`,
    `Intercompany Withholding (${year})`,
    ["Payer", "Payee", "Basis", "Rate", "Base", "Expected", "Recorded", "Difference", "Verdict"],
    rows.map((row) => [
      `${row.fromCode} ${row.fromName}`,
      `${row.toCode} ${row.toName}`,
      row.basis === "SALES_INVOICE" ? "Sales invoice" : row.basis === "PURCHASE_ORDER" ? "Purchase order" : "No basis",
      row.rateLabel,
      formatCurrency(row.base),
      row.expected === null ? "—" : formatCurrency(row.expected),
      row.recorded === null ? "—" : formatCurrency(row.recorded),
      row.difference === null ? "—" : formatCurrency(row.difference),
      VERDICT_STYLE[row.verdict].label,
    ]),
  );
}
