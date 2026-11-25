"use client";

import * as XLSX from "xlsx";

import { PERIOD_KEYS } from "../constants";
import { phtDisplayDate, phtToday } from "../pht";
import { carryOut } from "../vatMath";
import type { CertificateRegister, MonthlyWithholdingRow, QuarterFigures, VatComputation } from "../types";

type Cell = string | number | null;

function sheetOf(header: string[], rows: Cell[][], widths: number[]): XLSX.WorkSheet {
  const sheet = XLSX.utils.aoa_to_sheet([header, ...rows]);
  sheet["!cols"] = widths.map((wch) => ({ wch }));
  return sheet;
}

/**
 * The three tables the page shows, one sheet each, so a reviewer can read the figures without
 * the screen. Money stays numeric so Excel can add it up.
 */
export function downloadVatWorkbook(input: {
  companyName: string;
  taxYear: number;
  figures: QuarterFigures[];
  vat: VatComputation;
  monthly: MonthlyWithholdingRow[];
  register: CertificateRegister;
}) {
  const { companyName, taxYear, figures, vat, monthly, register } = input;
  const carried = carryOut(vat);

  const quarterly = PERIOD_KEYS.map((quarter, index) => [
    quarter,
    figures[index]?.sales ?? null,
    vat.outputVat[index] ?? null,
    vat.inputVat[index] ?? null,
    vat.carriedIn[index] ?? null,
    vat.payable[index] ?? null,
    carried[index] ?? null,
  ]);

  const monthlyRows: Cell[][] = monthly.map((row) => [
    row.label,
    row.quarter,
    row.purchases,
    row.withheld,
    row.agentForm,
    row.agentDue,
    row.quarterlyForm,
    row.quarterlyDue,
  ]);

  const certificates: Cell[][] = register.rows.map((row) => [
    row.periodLabel,
    row.counterpartyName,
    row.counterpartyTin,
    row.incomeType,
    row.incomeAmount,
    row.taxRate,
    row.taxWithheld,
    phtDisplayDate(row.dateReceived),
    row.sourceRef,
  ]);

  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(
    book,
    sheetOf(
      ["Quarter", "VATable sales", "Output VAT", "Input VAT", "Carried in", "Payable", "Carry out"],
      quarterly,
      [10, 16, 14, 14, 14, 14, 14],
    ),
    "Quarterly VAT",
  );
  XLSX.utils.book_append_sheet(
    book,
    sheetOf(
      [
        "Month",
        "Quarter",
        "Purchases",
        "Tax withheld",
        "0619-E form",
        "On 0619-E",
        "1601-EQ form",
        "On 1601-EQ",
      ],
      monthlyRows,
      [16, 10, 16, 16, 14, 16, 14, 16],
    ),
    "Monthly withholding",
  );
  XLSX.utils.book_append_sheet(
    book,
    sheetOf(
      ["Period", "Payee", "TIN", "Income type", "Income", "Rate", "Tax withheld", "Received", "Source"],
      certificates,
      [10, 34, 18, 16, 16, 10, 16, 14, 22],
    ),
    "2307 certificates",
  );

  const today = phtToday(); // PHT, not the UTC date a 01:00 export would otherwise carry
  XLSX.writeFile(book, `vat-withholding-${companyName}-${taxYear}-as-at-${today}.xlsx`);
}
