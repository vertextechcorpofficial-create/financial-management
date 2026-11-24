/** Shapes the loan reconciliation module passes around. DECIMAL columns arrive as strings, so every
 *  money field below is already coerced to a number by the service that read it. */

export type ReconciliationResult = "RECONCILED" | "DIFFERENCE";
export type StatementResult = "AGREES" | "DIFFERS";

/** One bucket of the roll-forward, kept beside the figure so the screen can explain it. */
export type RollForwardLine = {
  key: string;
  label: string;
  amount: number;
  /** How many journal entries or documents fed the figure. */
  count: number;
};

export type RollForward = {
  periodStart: string;
  periodEnd: string;
  openingBalance: number;
  newLoans: number;
  interestAmortization: number;
  payments: number;
  partialPrepayments: number;
  restructures: number;
  payoffs: number;
  closingBalance: number;
  /** Ledger balance of the mapped liability accounts at period_end. */
  ledgerClosing: number;
  difference: number;
  result: ReconciliationResult;
  /** One sentence naming both figures; shown beside the difference. */
  sentence: string;
  /** Extra facts worth showing, e.g. a release that was never posted. */
  notes: string[];
  lines: RollForwardLine[];
  lockedThrough: string | null;
  readOnly: boolean;
  /** The GL accounts the ledger side was built from. */
  accounts: { key: string; coaId: number; title: string | null }[];
};

export type ReconciliationRow = {
  id: number;
  periodStart: string;
  periodEnd: string;
  openingBalance: number;
  newLoans: number;
  interestAmortization: number;
  payments: number;
  partialPrepayments: number;
  restructures: number;
  payoffs: number;
  closingBalance: number;
  difference: number;
  result: ReconciliationResult;
  remarks: string | null;
  signedBy: number | null;
  signedByName: string | null;
  signedAt: string | null;
  createdAt: string | null;
  /**
   * A saved period is a snapshot. If a posting dated inside (or before) the period was
   * recorded after the snapshot, the stored figures no longer describe the ledger, so the
   * row says so instead of presenting an out-of-date close as current.
   */
  stale: boolean;
};

export type StatementRow = {
  id: number;
  loanId: number;
  loanNo: string;
  lenderName: string;
  statementDate: string;
  lenderPrincipal: number;
  lenderInterest: number;
  lenderPenalties: number;
  lenderAdvances: number;
  ourPrincipal: number;
  ourInterest: number;
  ourPenalties: number;
  ourAdvances: number;
  result: StatementResult;
  remarks: string | null;
  createdAt: string | null;
};

export type StatementVariance = {
  key: "principal" | "interest" | "penalties" | "advances";
  label: string;
  lender: number;
  ours: number;
  variance: number;
};

export type LoanOption = {
  id: number;
  loanNo: string;
  lenderName: string;
  principal: number;
  status: string;
};
