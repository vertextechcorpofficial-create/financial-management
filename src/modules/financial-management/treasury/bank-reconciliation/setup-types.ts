import type { AccountReference, BankAccountReference, CompanyReference, BankReconciliationReferencePage } from "./reference-types";

export type BankConfiguration = BankAccountReference & {
  companyId: number | null; glCoaId: number | null; version: number;
  company: CompanyReference | null; account: AccountReference | null;
};
export type PeriodDraft = {
  version?: number; bankId: number; companyId: number | null; currency: string;
  periodEnd: string | null; statementOpening: string | null; statementEnding: string | null;
};
export type LedgerCheck = {
  state: "NOT_AVAILABLE"; message: string;
} | {
  state: "AGREES" | "WARNING"; message: string;
  openingBalance: string; movement: string; calculated: string; difference: string;
  expectedLines: number; loadedLines: number; voidReviewLines: number; fallbackLines: number;
};
export type LedgerJournalReference = {
  type: string; journalId: string; lineId: string; leg: string; journalNumber: string | null;
};
export type LedgerJournalDetails = {
  journal: LedgerJournalReference; date: string; reference: string;
  lines: { lineId: string; leg: string; accountCode: string; accountName: string; description: string; debit: string; credit: string; selected: boolean }[];
};
export type ReconciliationPeriod = PeriodDraft & {
  id: number; version: number; status: "OPEN" | "CLOSED"; bank: BankConfiguration;
  ledgerBlockers: string[]; ledgerBalance: string | null; ledgerAsOf: string | null; updatedAt: string;
  setupWarning?: string; changedSources?: number;
  ledgerSignature?: string | null;
  ledgerCheck?: LedgerCheck;
  lifecycle?: { previousPeriodId: number | null; successorId: number | null; currentOpenPeriodId: number | null; canReopen: boolean; canStartNext: boolean; historical: boolean; nextAllowedMonth?: string; closureId?: number; revision?: number; closedAt?: string; closedBy?: { id: number; name: string } };
  statementCheck: { state: "NOT_AVAILABLE" | "AGREES" | "WARNING"; message: string; calculated?: string; difference?: string };
};
export type LedgerLine = { id: number; sourceKey: string | null; sourceFingerprint: string | null; date: string; reference: string; description: string; amount: string; sourceJournal?: LedgerJournalReference | null };
export type LedgerPage = BankReconciliationReferencePage<LedgerLine>;
export type MasterOptions = { bsis: { id: number; name: string }[]; accountTypes: { id: number; name: string }[]; balanceTypes: { id: number; name: string }[] };
