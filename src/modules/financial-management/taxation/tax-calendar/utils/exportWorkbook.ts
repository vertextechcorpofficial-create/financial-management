"use client";

import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import * as XLSX from "xlsx";

import { formatCurrency } from "@/lib/utils";

import { CALENDAR_CATEGORIES, statusLabel } from "../constants";
import { phtDisplayDate, phtToday } from "../pht";
import type { CalendarObligation } from "../types";

type Cell = string | number | null;

function categoryLabel(category: CalendarObligation["category"]): string {
  return CALENDAR_CATEGORIES.find((option) => option.value === category)?.label ?? category;
}

/** The deadlines table as filtered: one row per filing, date in house style. */
export function downloadDeadlines(rows: CalendarObligation[], year: number): void {
  const header = ["Due Date", "Company", "Form", "Period", "Category", "Estimate", "Status", "Why the Date Moved"];
  const body: Cell[][] = rows.map((row) => [
    phtDisplayDate(row.dueDate),
    `${row.companyCode} ${row.companyName}`,
    row.formCode,
    row.periodLabel,
    categoryLabel(row.category),
    row.estimated,
    statusLabel(row.status),
    row.moveReason
      ? `${row.movedFrom ? `From ${phtDisplayDate(row.movedFrom)}: ` : ""}${row.moveReason}`
      : "—",
  ]);

  const sheet = XLSX.utils.aoa_to_sheet([header, ...body]);
  sheet["!cols"] = [14, 30, 12, 18, 20, 16, 18, 40].map((wch) => ({ wch }));
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, sheet, "Deadlines");
  XLSX.writeFile(book, `tax-calendar-${year}-as-at-${phtToday()}.xlsx`);
}

/** Exports all filtered deadlines as a landscape PDF schedule. */
export function downloadDeadlinesPdf(rows: CalendarObligation[], year: number): void {
  const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
  doc.setFontSize(13);
  doc.text(`Tax Calendar Deadlines (${year})`, 40, 36);
  doc.setFontSize(9);
  doc.setTextColor(100);
  doc.text(`Generated as at ${phtToday()} (PHT) · ${rows.length} obligations`, 40, 50);

  autoTable(doc, {
    startY: 62,
    head: [["Due Date", "Company", "Form", "Period", "Category", "Estimate", "Status", "Why the Date Moved"]],
    body: rows.map((row) => [
      phtDisplayDate(row.dueDate),
      `${row.companyCode} ${row.companyName}`,
      row.formCode,
      row.periodLabel,
      categoryLabel(row.category),
      row.estimated === null ? "—" : formatCurrency(row.estimated),
      statusLabel(row.status),
      row.moveReason
        ? `${row.movedFrom ? `From ${phtDisplayDate(row.movedFrom)}: ` : ""}${row.moveReason}`
        : "—",
    ]),
    styles: { fontSize: 8, cellPadding: 4, overflow: "linebreak" },
    headStyles: { fillColor: [30, 41, 59] },
  });

  doc.save(`tax-calendar-${year}-as-at-${phtToday()}.pdf`);
}
