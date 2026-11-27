"use client";

import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import * as XLSX from "xlsx";

import { entityLabel, fieldLabel } from "../constants";
import { phtDisplayStamp, phtToday } from "../pht";
import { formatChangeValue } from "./formatValue";
import type { ChangeLogRow } from "../types";

type Cell = string | number | null;

function transactionTypeLabel(row: ChangeLogRow): string {
  const entity = entityLabel(row.entity);
  const field = row.field ? fieldLabel(row.field) : "";
  return field && field !== "—" ? `${entity} · ${field}` : entity;
}

function companyLabel(
  row: ChangeLogRow,
  companies: Array<{ companyId: number; name: string }>,
): string {
  const company = companies.find((entry) => entry.companyId === row.companyId)?.name ?? null;
  if (company && row.taxYear) return `${company} · ${row.taxYear}`;
  return company ?? (row.taxYear ? String(row.taxYear) : "—");
}

/**
 * The rows on screen, as a workbook: one line per recorded edit, in the exact table sequence
 * — Date, Company, Transaction Type, Before, After, Modified By, Reason.
 */
export function downloadChanges(
  rows: ChangeLogRow[],
  companies: Array<{ companyId: number; name: string }>,
  year: number,
) {
  const header = ["Date", "Company", "Transaction Type", "Before", "After", "Modified By", "Reason"];
  const body: Cell[][] = rows.map((row) => [
    row.occurredAt ? phtDisplayStamp(row.occurredAt) : "—",
    companyLabel(row, companies),
    transactionTypeLabel(row),
    formatChangeValue(row.beforeValue, row.field),
    formatChangeValue(row.afterValue, row.field),
    row.actor && row.actor.trim() ? row.actor : "—",
    row.reason && row.reason.trim() ? row.reason : "—",
  ]);

  const sheet = XLSX.utils.aoa_to_sheet([header, ...body]);
  sheet["!cols"] = [20, 26, 26, 30, 30, 20, 36].map((wch) => ({ wch }));

  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, sheet, "Changes");
  // PHT date, not the UTC one, so a 01:00 export is not stamped with yesterday.
  XLSX.writeFile(book, `change-log-${year}-as-at-${phtToday()}.xlsx`);
}

/**
 * Exports the filtered change log rows as a landscape PDF audit report.
 */
export function downloadChangesPdf(
  rows: ChangeLogRow[],
  companies: Array<{ companyId: number; name: string }>,
  year: number,
) {
  const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
  doc.setFontSize(13);
  doc.text(`Taxation Change Log (${year})`, 40, 36);
  doc.setFontSize(9);
  doc.setTextColor(100);
  doc.text(`Generated as at ${phtToday()} (PHT) · ${rows.length} entries`, 40, 50);

  autoTable(doc, {
    startY: 62,
    head: [["Date", "Company", "Transaction Type", "Before", "After", "Modified By", "Reason"]],
    body: rows.map((row) => [
      row.occurredAt ? phtDisplayStamp(row.occurredAt) : "—",
      companyLabel(row, companies),
      transactionTypeLabel(row),
      formatChangeValue(row.beforeValue, row.field),
      formatChangeValue(row.afterValue, row.field),
      row.actor && row.actor.trim() ? row.actor : "—",
      row.reason && row.reason.trim() ? row.reason : "—",
    ]),
    styles: { fontSize: 8, cellPadding: 4, overflow: "linebreak" },
    headStyles: { fillColor: [30, 41, 59] },
  });

  doc.save(`change-log-${year}-as-at-${phtToday()}.pdf`);
}
