"use client";

import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import * as XLSX from "xlsx";

import { formatCurrency } from "@/lib/utils";

import { phtToday } from "../pht";
import type { WorksheetLine } from "../types";

type Cell = string | number | null;

/** The worksheet as shown: one row per line, the four quarters, then the year. */
export function downloadWorksheet(lines: WorksheetLine[], taxYear: number): void {
  const header = ["Line", "Item", "Q1", "Q2", "Q3", "Q4", "Year"];
  const rows: Cell[][] = lines.map((line) => [line.lineNo, line.label, ...line.values, line.yearValue]);

  const sheet = XLSX.utils.aoa_to_sheet([header, ...rows]);
  sheet["!cols"] = [8, 52, 14, 14, 14, 14, 16].map((wch) => ({ wch }));
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, sheet, "Worksheet");
  XLSX.writeFile(book, `entity-worksheet-${taxYear}-as-at-${phtToday()}.xlsx`);
}

/** Exports the 1702Q entity worksheet as a landscape PDF working paper. */
export function downloadWorksheetPdf(lines: WorksheetLine[], taxYear: number, companyName?: string): void {
  const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
  doc.setFontSize(13);
  doc.text(`BIR Form 1702Q Entity Worksheet (${taxYear})${companyName ? ` — ${companyName}` : ""}`, 40, 36);
  doc.setFontSize(9);
  doc.setTextColor(100);
  doc.text(`Generated as at ${phtToday()} (PHT) · Cumulative YTD Lines 1–11a; Quarterly Payable Line 12`, 40, 50);

  autoTable(doc, {
    startY: 62,
    head: [["Line", "Item", "Q1", "Q2", "Q3", "Q4", "Year"]],
    body: lines.map((line) => [
      line.lineNo,
      line.label,
      ...line.values.map((v) => formatCurrency(v)),
      formatCurrency(line.yearValue),
    ]),
    styles: { fontSize: 8, cellPadding: 4, overflow: "linebreak" },
    columnStyles: {
      2: { halign: "right" },
      3: { halign: "right" },
      4: { halign: "right" },
      5: { halign: "right" },
      6: { halign: "right" },
    },
    headStyles: { fillColor: [30, 41, 59] },
  });

  doc.save(`entity-worksheet-${taxYear}-as-at-${phtToday()}.pdf`);
}
