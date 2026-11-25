/**
 * Shared view models for the Bank Management V2 modules.
 *
 * Server rows are snake_case Directus records; every service maps them to these
 * camelCase shapes so components never see a raw row. Amounts are numbers,
 * dates are PHT wall-clock strings (`YYYY-MM-DD` or `YYYY-MM-DDTHH:mm:ss`).
 */

export type BankAccountStatus = "ACTIVE" | "DORMANT" | "CLOSED";
export type Currency = "PHP" | "USD";

export interface BankAccountV2 {
  bankId: number;
  bankName: string;
  accountNumber: string;
  accountName: string | null;
  accountType: string | null;
  branch: string | null;
  currency: Currency;
  ifrsCategory: string;
  glCoaId: number | null;
  glCode: string | null;
  glTitle: string | null;
  status: BankAccountStatus;
  isActive: boolean;
  openingBalance: number;
  bookBalance: number;
  effectiveDate: string | null;
  lastReconciledAt: string | null;
  createdAt: string | null;
}

export type MemoType = "CREDIT" | "DEBIT" | "INTEREST";

export interface BankMemo {
  id: number;
  refNo: string;
  bankAccountId: number;
  bankAccountLabel: string;
  memoType: MemoType;
  amount: number;
  currency: Currency;
  natureKey: string | null;
  natureLabel: string | null;
  expenseCoaId: number | null;
  expenseLabel: string | null;
  interestGross: number | null;
  interestTax: number | null;
  taxRate: number | null;
  valueDate: string;
  description: string | null;
  status: "POSTED" | "CANCELLED" | "REVERSED";
  journalEntryId: number | null;
  journalNo: string | null;
  createdAt: string;
}

export interface BankTransfer {
  transferId: number;
  transferNo: string;
  transferDate: string;
  valueDate: string | null;
  sourceBankId: number;
  destinationBankId: number;
  sourceLabel: string;
  destinationLabel: string;
  amount: number;
  transferFee: number;
  status: "PREPARED" | "PENDING" | "COMPLETED" | "CANCELLED";
  settledAt: string | null;
  remarks: string | null;
}

export type DepositStatus =
  | "PREPARED"
  | "DEPOSITED"
  | "PARTIALLY_BOUNCED"
  | "BOUNCED"
  | "CLEARED"
  | "CANCELLED";

export interface DepositSlip {
  id: number;
  depositNo: string;
  depositDate: string;
  targetBankId: number;
  targetBankLabel: string;
  /** Name over account number, so a picker never prints one clipped string. */
  targetBankName: string | null;
  targetBankNumber: string | null;
  /** Linked GL of the destination account; null only when the account has no linked GL. */
  glCode: string | null;
  glTitle: string | null;
  /** True when E07 falls back to the shared CASH_IN_BANK mapping instead of the account's own GL. */
  glFallback: boolean;
  referenceNo: string | null;
  validationFileId: string | null;
  /** Derived from the item outcomes, so the header reads Prepared while any item is unresolved. */
  status: DepositStatus;
  totalCash: number;
  totalChecks: number;
  grandTotal: number;
  /** Resolved to the preparer's name, then email, then null (P17). */
  preparedBy: string | null;
  preparedByEmail: string | null;
  datePrepared: string;
  clearedAt: string | null;
  clearedBy: string | null;
  remarks: string | null;
  itemCount: number;
  /** Checks on this slip the bank returned; a badge of its own, never a slip status (P18). */
  bouncedCount: number;
  resolvedCount: number;
}

/** One row of the read-only slip contents table (P17). */
export interface DepositSlipItem {
  collectionInvoiceId: number;
  invoiceNo: string | null;
  assetType: "CASH" | "CHECK";
  /**
   * What the settlement row was applied as: money handed over, or an adjustment such as a
   * discount or rounding. An adjustment moves no cash, so it must not read as "Cash".
   */
  methodLabel: "Cash" | "Check" | "Adjustment";
  documentNumber: string;
  checkNo: string | null;
  customer: string | null;
  customerCode: string | null;
  collectionDate: string | null;
  amount: number;
  /** Clearing outcome of the check backing this item; cash resolves on the deposit. */
  checkStatus: CheckStatus | null;
  /** Stored `deposit_status` of the slip line: IN_TRANSIT until the slip is marked deposited. */
  lineStatus: string;
}

export interface DepositSlipDetail {
  slip: DepositSlip;
  items: DepositSlipItem[];
}

/** A settlement row sitting in the vault, not yet deposited. */
export interface UndepositedAsset {
  /** `collection_invoices.id`: the invoice-level line this money settled. */
  collectionInvoiceId: number;
  collectionId: number;
  invoiceId: number | null;
  invoiceNo: string | null;
  /** What arrived: cash, a cheque, or an adjustment applied to the invoice. */
  methodLabel: "Cash" | "Check" | "Adjustment";
  documentNumber: string;
  collectionReference: string | null;
  assetType: "CASH" | "CHECK";
  /** Customer name from the customer master; falls back to the raw code when no row matches. */
  customer: string | null;
  /** `sales_invoice.customer_code` behind this settlement row. */
  customerCode: string | null;
  bankName: string | null;
  checkNo: string | null;
  chequeDate: string | null;
  collectionDate: string | null;
  amount: number;
  ageDays: number;
  alreadyDeposited: boolean;
  /** Parent `collection.isPosted`; false or null means the collection is still unposted. */
  isPosted: boolean;
  /** Parent `collection.isCancelled`; a voided collection can never be deposited. */
  isCancelled: boolean;
}

export type CheckDirection = "ISSUED" | "RECEIVED";

/** Filters on the undeposited tab, mirroring the prototype's `dp` filter bar. */
export interface UndepositedFilters {
  type: "ALL" | "CASH" | "CHECK";
  canDeposit: "ALL" | "READY" | "PDC";
  from: string;
  to: string;
  q: string;
}

/** Filters on the deposit-slips tab, mirroring the prototype's `ds` filter bar. */
export interface SlipFilters {
  bank: string;
  status: string;
  from: string;
  to: string;
  q: string;
}

export type CheckStatus =
  | "PENDING"
  | "RECEIVED"
  | "IN_CLEARING"
  | "CLEARED"
  | "RETURNED"
  | "CANCELLED";

export interface BankCheck {
  id: number;
  bankAccountId: number;
  bankAccountLabel: string;
  direction: CheckDirection;
  checkNo: string;
  checkDate: string;
  amount: number;
  draweeBank: string | null;
  payee: string | null;
  payor: string | null;
  controlKey: string | null;
  status: CheckStatus;
  isPdc: boolean;
  returnReason: string | null;
  releasedAt: string | null;
  depositedAt: string | null;
  clearedAt: string | null;
  returnedAt: string | null;
  replacedById: number | null;
  replacesId: number | null;
  sourceType: "MANUAL" | "COLLECTIONS" | "DISBURSEMENT" | "REPLACEMENT";
  sourceRef: string | null;
  remarks: string | null;
  createdAt: string;
  ageDays: number;
  isStale: boolean;
}

export interface CheckEvent {
  id: number;
  checkId: number;
  action: string;
  fromStatus: string | null;
  toStatus: string | null;
  eventCode: string | null;
  journalNo: string | null;
  note: string | null;
  actorName: string | null;
  occurredAt: string;
}

export interface CheckbookSeries {
  id: number;
  bankAccountId: number;
  bankAccountLabel: string;
  seriesStart: string;
  seriesEnd: string;
  nextNo: string | null;
  isActive: boolean;
  createdAt: string;
}

/** One leg of a proposed journal entry, before GL codes are resolved. */
export interface JournalLineDraft {
  mappingKey: GlMappingKey | string;
  debit: number;
  credit: number;
  memo?: string;
}

export interface JournalEntryDraft {
  eventCode: string;
  sourceModule: string;
  sourceRef: string;
  postingDate: string;
  description: string;
  lines: JournalLineDraft[];
}

export interface ResolvedJournalLine {
  lineNo: number;
  coaId: number | null;
  glCode: string | null;
  accountTitle: string | null;
  debit: number;
  credit: number;
  memo: string | null;
}

export interface ResolvedJournalEntry {
  eventCode: string;
  sourceModule: string;
  sourceRef: string;
  postingDate: string;
  description: string;
  lines: ResolvedJournalLine[];
  totalDebit: number;
  totalCredit: number;
  missingMappingKeys: string[];
}

export interface PostedJournalEntry extends ResolvedJournalEntry {
  id: number;
  jeNo: string;
  status: "POSTED" | "REVERSED";
  reversesJeNo: string | null;
  createdAt: string;
}

export type GlMappingKey =
  | "CASH_IN_BANK"
  | "CASH_ON_HAND"
  | "BANK_CLEARING"
  | "TRANSFER_IN_TRANSIT"
  | "INTEREST_INCOME"
  | "OTHER_INCOME"
  | "FINAL_TAX_EXPENSE"
  | "BANK_CHARGES_EXPENSE"
  | "AR_CONTROL"
  | "AP_CONTROL"
  | "NTP_CONTROL"
  | "OPENING_EQUITY";

export interface GlMappingRow {
  mappingKey: string;
  coaId: number | null;
  glCode: string | null;
  accountTitle: string | null;
  updatedAt: string | null;
}

export type ArfSeverity = "CRITICAL" | "HIGH" | "MEDIUM";

export interface ArfFinding {
  key: string;
  severity: ArfSeverity;
  subModule: string;
  title: string;
  detail: string;
  reference: string | null;
  occurredAt: string | null;
}

export interface AuditLogRow {
  id: number;
  occurredAt: string;
  module: string;
  action: string;
  reference: string | null;
  detail: string | null;
  actorName: string | null;
  legacyUtcAt: string | null;
}

export interface Paginated<T> {
  rows: T[];
  page: number;
  pageSize: number;
  total: number;
}
