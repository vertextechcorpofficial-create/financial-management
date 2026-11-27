import "server-only";

import * as XLSX from "xlsx";
import { centsToAmount } from "../loans/loan-schedule";
import { LoanError } from "./loans";

const headers = ["Employee number", "Deduction code", "Amount", "Reference"];
const sheetName = "Remittance";
export const remittanceRowLimit = 250;

export type RemittanceFileRow = {
  row_number: number;
  employee_number: string;
  deduction_code: string;
  amount_input: string;
  reference: string;
  input_error: string | null;
};

export function remittanceAmount(input: string) {
  const match = /^(\d{1,10})(?:\.(\d{1,15}))?$/.exec(input);
  if (!match) return null;
  const fraction = (match[2] ?? "").padEnd(3, "0");
  const cents = BigInt(match[1]) * 100n + BigInt(fraction.slice(0, 2)) + (fraction[2] >= "5" ? 1n : 0n);
  return cents > 0n && cents <= 999_999_999_999n ? centsToAmount(cents) : null;
}

function workbookError(message: string) {
  return new LoanError(422, message, "REMITTANCE_FILE");
}

export function readRemittanceFile(bytes: Uint8Array) {
  if (bytes[0] !== 0x50 || bytes[1] !== 0x4b || bytes[2] !== 0x03 || bytes[3] !== 0x04) {
    throw workbookError("Upload an Excel .xlsx workbook.");
  }
  let book: XLSX.WorkBook;
  try {
    book = XLSX.read(bytes, { type: "array", cellDates: true, cellFormula: true, sheetRows: remittanceRowLimit + 2 });
  } catch {
    throw workbookError("Excel could not read this file. Use the remittance template.");
  }
  const sheet = book.Sheets[sheetName];
  if (book.SheetNames.length !== 1 || !sheet?.["!ref"]) throw workbookError("Use the single Remittance worksheet from the template.");
  const range = XLSX.utils.decode_range(sheet["!fullref"] ?? sheet["!ref"]);
  if (range.e.r > remittanceRowLimit) throw workbookError(`Use at most ${remittanceRowLimit} data rows per file.`);
  const cell = (row: number, c: number): XLSX.CellObject | undefined => sheet[XLSX.utils.encode_cell({ r: row, c })];
  if (range.e.c !== headers.length - 1 || headers.some((name, c) => cell(0, c)?.v !== name || cell(0, c)?.f)) {
    throw workbookError("Use these headers in order: Employee number, Deduction code, Amount, Reference.");
  }
  const rows: RemittanceFileRow[] = [];
  for (let r = 1; r <= range.e.r; r++) {
    const cells = headers.map((_, c) => cell(r, c));
    if (cells.every(item => item?.v === undefined && item?.f === undefined)) continue;
    const [employee, code, amount, reference] = cells.map(item => String(item?.v ?? "").trim());
    const error = cells.some(item => item?.f !== undefined || item?.F !== undefined || item?.t === "e")
      ? "Replace formulas and Excel errors with values."
      : cells[3]?.t !== "s"
        ? "Enter the reference in a text cell."
        : (cells[2]?.t !== "s" && cells[2]?.t !== "n")
          ? "Enter the deduction amount as a number."
        : employee.length > 80 || code.length > 80 || amount.length > 80 || reference.length > 120
          ? "One or more values exceed the supported length." : null;
    rows.push({ row_number: r + 1, employee_number: employee.slice(0, 80), deduction_code: code.slice(0, 80),
      amount_input: amount.slice(0, 80), reference: reference.slice(0, 120), input_error: error });
  }
  if (!rows.length) throw workbookError("Enter at least one remittance row.");
  return rows;
}

export function remittanceTemplate() {
  const workbook = XLSX.utils.book_new();
  const sheet = XLSX.utils.aoa_to_sheet([headers]);
  sheet["!cols"] = [{ wch: 20 }, { wch: 20 }, { wch: 14 }, { wch: 35 }];
  XLSX.utils.book_append_sheet(workbook, sheet, sheetName);
  return new Uint8Array(XLSX.write(workbook, { bookType: "xlsx", type: "array" }) as ArrayBuffer);
}
