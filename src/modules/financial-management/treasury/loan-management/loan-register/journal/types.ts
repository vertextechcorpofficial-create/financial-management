/** Shapes for the loan journal: one entry, its lines, and the per-account roll-up. */

export type EntryType =
  | "RELEASE"
  | "INTEREST_ACCRUAL"
  | "PAYMENT"
  | "CHECK_ENCASHMENT"
  | "PREPAYMENT"
  | "RESTRUCTURE"
  | "PAYOFF"
  | "INVESTMENT_INCOME"
  | "MONTH_END_ACCRUAL"
  | "MONTH_END_REVERSAL"
  | "DST_REMITTANCE";

export type EntryStatus = "POSTED" | "REVERSED";

/** `loan_journal_entry` as stored. Money is a DECIMAL string and is coerced at the boundary. */
export interface RawEntryRow {
  id: number;
  loan_id: number | null;
  entry_no: string;
  entry_date: string;
  entry_type: EntryType;
  description: string | null;
  period_key: string | null;
  status: EntryStatus;
  reverses_entry_no: string | null;
  total_debit: string | number | null;
  total_credit: string | number | null;
}

/** `loan_journal_line` as stored. */
export interface RawLineRow {
  id: number;
  entry_id: number;
  line_no: number;
  coa_id: number | null;
  memo: string | null;
  debit: string | number | null;
  credit: string | number | null;
}

export interface RawLoanRow {
  id: number;
  loan_no: string;
  lender_name: string;
}

export interface RawAccountRow {
  coa_id: number;
  gl_code: string | null;
  account_title: string | null;
}

export interface JournalLine {
  id: number;
  lineNo: number;
  coaId: number | null;
  code: string;
  title: string;
  memo: string;
  debit: number;
  credit: number;
}

/** One entry as the list needs it: header figures, its own lines, and the balance verdict. */
export interface EntryRow {
  id: number;
  entryNo: string;
  entryDate: string;
  entryType: EntryType;
  description: string;
  periodKey: string;
  status: EntryStatus;
  reversesEntryNo: string | null;
  /** The entry that reverses this one, when one exists. */
  reversedByNo: string | null;
  loanId: number | null;
  loanNo: string | null;
  lenderName: string | null;
  totalDebit: number;
  totalCredit: number;
  lineDebit: number;
  lineCredit: number;
  lineCount: number;
  /** Null when the header and the lines agree to the cent, else the signed difference. */
  difference: number | null;
  /** Why it does not balance, in the order the check runs. */
  differenceNote: string | null;
  lines: JournalLine[];
}

export interface EntryTotals {
  debit: number;
  credit: number;
  unbalanced: number;
  posted: number;
  reversed: number;
}

export interface AccountSummaryRow {
  coaId: number;
  code: string;
  title: string;
  debit: number;
  credit: number;
  net: number;
  lineCount: number;
}

export interface AccountSummaryTotals {
  debit: number;
  credit: number;
  net: number;
  lines: number;
  accounts: number;
}

export interface LoanOption {
  id: number;
  label: string;
  searchText: string;
}

export interface AccountOption {
  id: number;
  label: string;
  searchText: string;
}

export interface JournalOptions {
  loans: LoanOption[];
  accounts: AccountOption[];
}

export interface EntriesPayload {
  rows: EntryRow[];
  total: number;
  totals: EntryTotals;
  options: JournalOptions;
}

export interface SummaryPayload {
  rows: AccountSummaryRow[];
  total: number;
  totals: AccountSummaryTotals;
  options: JournalOptions;
}
