"use client";

import * as XLSX from "xlsx";

import {
  DIRECTION_LABELS,
  PAYMENT_PERIOD_LABELS,
  PERIOD_LABELS,
  WITHHOLDING_LABELS,
  certificateStatusLabel,
  effectiveRatePercent,
  lockStateLabel,
} from "../constants";
import { phtDisplayDate, phtDisplayStamp, phtToday } from "../pht";
import type { CertificateRow, PaymentRow, PeriodLockRow } from "../types";

type Cell = string | number | null;

/** One sheet, one file: `XLSX.writeFile` triggers the browser download. */
function writeSheet(filename: string, sheetName: string, header: string[], rows: Cell[][], widths: number[]) {
  const sheet = XLSX.utils.aoa_to_sheet([header, ...rows]);
  sheet["!cols"] = widths.map((wch) => ({ wch }));
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, sheet, sheetName);
  XLSX.writeFile(book, filename);
}

/** `payments-2307-certificates-2026-as-at-2026-11-17.xlsx` — the date keeps repeat downloads
 * apart. It is the PHT date, not `toISOString()`'s UTC one, so an export at 01:00 PHT is not
 * stamped with yesterday. */
function fileName(sheet: string, taxYear: number): string {
  return `payments-2307-${sheet}-${taxYear}-as-at-${phtToday()}.xlsx`;
}

export function downloadCertificates(certificates: CertificateRow[]) {
  const taxYear = certificates[0]?.taxYear ?? new Date().getFullYear();
  writeSheet(
    fileName("certificates", taxYear),
    "Certificates",
    [
      "Issuer / payee",
      "TIN",
      "Direction",
      "Period",
      "Income type",
      "Income",
      "Rate %",
      "Tax withheld",
      "Status",
      "Received",
      "Source",
      "Source reference",
    ],
    certificates.map((row) => [
      row.counterpartyName,
      row.counterpartyTin,
      DIRECTION_LABELS[row.direction],
      PERIOD_LABELS[row.periodKey],
      WITHHOLDING_LABELS[row.incomeType],
      row.incomeAmount,
      Number(
        effectiveRatePercent(row.incomeAmount, row.taxWithheld, row.taxRate).toFixed(4),
      ),
      row.taxWithheld,
      certificateStatusLabel(row.status),
      phtDisplayDate(row.dateReceived),
      row.source,
      row.sourceRef,
    ]),
    [36, 18, 12, 10, 16, 14, 10, 14, 14, 12, 16, 18],
  );
}

export function downloadPayments(payments: PaymentRow[]) {
  const taxYear = payments[0]?.taxYear ?? new Date().getFullYear();
  writeSheet(
    fileName("payments", taxYear),
    "Payments",
    ["Form", "Period", "Paid on", "Amount", "Reference", "Recorded by", "Remarks"],
    payments.map((row) => [
      row.formCode,
      PAYMENT_PERIOD_LABELS[row.periodKey],
      phtDisplayDate(row.paidOn),
      row.amount,
      row.referenceNo,
      row.createdByName,
      row.remarks,
    ]),
    [12, 12, 14, 16, 22, 26, 40],
  );
}

export function downloadLocks(locks: PeriodLockRow[]) {
  const taxYear = locks[0]?.taxYear ?? new Date().getFullYear();
  writeSheet(
    fileName("locks", taxYear),
    "Locks",
    ["Period", "State", "Locked by", "Locked at", "Unlock reason", "Unlocked at"],
    locks.map((row) => [
      PERIOD_LABELS[row.periodKey],
      lockStateLabel(row.unlockedAt && row.unlockedAt > row.lockedAt ? "OPEN" : "LOCKED"),
      row.lockedByName,
      phtDisplayStamp(row.lockedAt),
      row.unlockReason,
      phtDisplayStamp(row.unlockedAt),
    ]),
    [10, 14, 26, 22, 40, 22],
  );
}
