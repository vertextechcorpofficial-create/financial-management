import type { LedgerJournalReference, ReconciliationPeriod } from "./setup-types";
import type { AccountReference } from "./reference-types";

export type LedgerTreatment = "DEPOSIT_IN_TRANSIT" | "OUTSTANDING_CHECK" | "BOOK_ERROR";
export type LineTreatmentCode = "RECORD_IN_BOOKS" | "BANK_ERROR" | LedgerTreatment;
export type TransactionSide = "BANK" | "LEDGER";
export type LineState = "UNMATCHED" | "CLASSIFIED" | "MATCHED" | "RECONCILED";
export type TransactionFilter = "ALL" | LineState;
export const LINE_STATUS_LABELS = { UNMATCHED: "Unmatched", CLASSIFIED: "Classified", MATCHED: "Matched", RECONCILED: "Reconciled" } as const;
export type TransactionLine = {
  id: number; date: string; reference: string; description: string; amount: string;
  origin: "MANUAL" | "IMPORT" | "GL"; sourceKey: string | null; status: string; lineState: LineState;
  sourceJournal?: LedgerJournalReference | null; sourceVoidReview?: boolean;
  carriedFromPeriodId?: number | null; carriedFromLineId?: number | null;
  matchId: number | null; workbenchPosted: boolean; stale: boolean; offsetAccount: string; canDelete: boolean;
  canMatch: boolean; canUnmatch: boolean; canEditTreatment: boolean; canEditOffset: boolean; needsAccount: boolean;
  canClassifyBookError: boolean; canResetTreatment: boolean; canQueueAdjustment: boolean; canUnqueueAdjustment: boolean;
  matchLabel: string | null; matchDifference: string | null; matchClassification: "BOOK_ERROR" | "BANK_ERROR" | null;
  treatment: LineTreatmentCode | null; offsetAccountReference: AccountReference | null;
};
export type ReconciliationSummary = {
  adjustedBankBalance: string | null; adjustedBookBalance: string | null; difference: string | null;
  status: "UNRECONCILED" | "BALANCED_NEEDS_ACCOUNT" | "RECONCILED" | null; statusLabel: string;
  needsAccountCount: number; unpostedCount: number; adjustmentCount: number; matchedLines: number; totalLines: number;
  unmatchedCount?: number; unqueuedAdjustmentCount?: number;
  ditTotal: string; outstandingCheckTotal: string; bankErrorCorrection: string; creditMemoTotal: string; debitMemoTotal: string; bookErrorCorrection: string;
};
export type TransactionPane = {
  items: TransactionLine[]; total: number; matched: number; open: number; net: string;
  filtered: number; page: number; pageSize: number;
  statusCounts: Record<LineState, number>;
};
export type TransactionData = {
  period: ReconciliationPeriod; bank: TransactionPane; ledger: TransactionPane;
  counts: { all: number; toReview: number; matched: number };
  statusCounts: Record<LineState, number>; canUndoMatches: boolean;
  reconciliation: ReconciliationSummary;
};
export type ImportRow = { row: number; date: string; reference: string; description: string; moneyIn: string; moneyOut: string; error: string };
export type ImportReport = {
  id: number; side: TransactionSide; requestId: string; fileName: string; imported: number; invalid: number; duplicates: number;
  issues: { row: number; kind: "INVALID" | "DUPLICATE"; message: string }[];
};
export type TransactionResult = {
  period: ReconciliationPeriod; lineId?: number; deletedLineId?: number; side?: TransactionSide; report?: ImportReport; reconciliation?: ReconciliationSummary;
  matches?: { id: number; label: string }[]; undone?: number; locked?: number;
  autoMatch?: { groups: number; passes: { pass1: number; pass2: number; bankToLedger: number; ledgerToBank: number }; bankLines: number; ledgerLines: number; ambiguousLines: number; deferredLines: number };
};
export const IMPORT_LAYOUTS = {
  BANK: { sheet: "Bank statement", filename: "Bank statement import template.xlsx", headers: ["Date", "Reference", "Description", "Deposit (money in)", "Withdrawal (money out)"] },
  LEDGER: { sheet: "Ledger", filename: "Ledger import template.xlsx", headers: ["Date", "Reference", "Description", "Debit (money in)", "Credit (money out)"] },
} as const;
