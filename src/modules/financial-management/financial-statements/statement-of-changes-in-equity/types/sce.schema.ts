import { z } from "zod";

// ─── Core Column Components ───
export const EquityComponentKeySchema = z.enum([
  "shareCapital",
  "apic",
  "reRetainedEarnings",
  "reAppropriated",
  "oci",
  "treasuryShares",
  "totalEquity",
]);

export type EquityComponentKey = z.infer<typeof EquityComponentKeySchema>;

export interface ComponentAmounts {
  shareCapital: number;
  apic: number;
  reRetainedEarnings: number;
  reAppropriated: number;
  oci: number;
  treasuryShares: number;
  totalEquity: number;
}

// ─── Movement Tag Schema ───
export const SCEMovementTagSchema = z.enum([
  "beginning_balance",
  "prior_period_adjustment",
  "balance_restated",
  "net_income",
  "oci_revaluation",
  "oci_translation",
  "oci_fvoci",
  "total_comprehensive_income",
  "share_issuance",
  "dividends_cash",
  "dividends_stock",
  "appropriation_transfer",
  "treasury_acquisition",
  "treasury_reissuance",
  "total_changes",
  "ending_balance",
  "close",
  "unmapped",
]);

export type SCEMovementTag = z.infer<typeof SCEMovementTagSchema>;

// ─── Statement Row Schema ───
export const SCEStatementRowSchema = z.object({
  id: z.string(),
  label: z.string(),
  tag: SCEMovementTagSchema,
  isGroupHeader: z.boolean().nullish(),
  isSubtotal: z.boolean().nullish(),
  isEnding: z.boolean().nullish(),
  indent: z.number().nullish(),
  standardRef: z.string().optional(),
  amounts: z.object({
    shareCapital: z.number(),
    apic: z.number(),
    reRetainedEarnings: z.number(),
    reAppropriated: z.number(),
    oci: z.number(),
    treasuryShares: z.number(),
    totalEquity: z.number(),
  }),
  comparisonAmounts: z
    .object({
      totalEquity: z.number(),
      change: z.number(),
    })
    .optional(),
  subRows: z.array(z.any()).optional(),
  children: z.array(z.any()).optional(),
  hasChildren: z.boolean().optional(),
  itemCount: z.number().optional(),
});

export type SCEStatementRow = z.infer<typeof SCEStatementRowSchema>;

// ─── Summary Cards Schema ───
export const SCESummaryCardsSchema = z.object({
  beginningEquity: z.number(),
  netIncome: z.number(),
  netCapitalAndDividend: z.number(),
  issuances: z.number(),
  dividends: z.number(),
  treasuryNet: z.number(),
  endingEquity: z.number(),
  isReconciled: z.boolean(),
  variance: z.number(),
  isSegmentView: z.boolean().default(false),
  segmentNetActivity: z.number().optional(),
});

export type SCESummaryCards = z.infer<typeof SCESummaryCardsSchema>;

// ─── Equation Check Banner Schema ───
export const SCEEquationCheckSchema = z.object({
  glEndingEquity: z.number(),
  restatedBeginningEquity: z.number(),
  netIncome: z.number(),
  oci: z.number(),
  capitalContributions: z.number(),
  cashDividends: z.number(),
  netTreasuryPurchases: z.number(),
  variance: z.number(),
  isBalanced: z.boolean(),
  appropriationTransferNet: z.number(),
  stockDividendNet: z.number(),
  statementEndingEquity: z.number(),
  unmappedCount: z.number(),
});

export type SCEEquationCheck = z.infer<typeof SCEEquationCheckSchema>;

// ─── Account Breakdown Schema ───
export const SCEAccountBreakdownItemSchema = z.object({
  coaId: z.number(),
  glCode: z.string(),
  accountTitle: z.string(),
  category: z.string(),
  componentKey: EquityComponentKeySchema,
  beginningBalance: z.number(),
  netMovement: z.number(),
  endingBalance: z.number(),
  movementPercent: z.number(),
  comparisonBalance: z.number().optional(),
  comparisonChange: z.number().optional(),
});

export type SCEAccountBreakdownItem = z.infer<typeof SCEAccountBreakdownItemSchema>;

// ─── Drill-down & Journal Line Schema ───
export const SCEJournalLineSchema = z.object({
  id: z.string(),
  date: z.string(),
  jeNo: z.string(),
  description: z.string(),
  glCode: z.string(),
  accountTitle: z.string(),
  debit: z.number(),
  credit: z.number(),
  netAmount: z.number(), // credit positive, debit negative
  sceMovement: SCEMovementTagSchema,
  division: z.string().nullable().optional(),
  department: z.string().nullable().optional(),
  note: z.string().nullable().optional(),
  isVirtualRestatement: z.boolean().nullish(),
  sourceJeNo: z.string().optional(),
});

export type SCEJournalLine = z.infer<typeof SCEJournalLineSchema>;

// ─── Cell Drill-Down Model (Clicking cell in statement table) ───
export interface CellDrillDownAccountBreakout {
  glCode: string;
  accountTitle: string;
  category: string;
  amount: number;
}

export interface CellDrillDownDetails {
  columnKey: EquityComponentKey;
  columnTitle: string;
  rowLabel: string;
  totalAmount: number;
  periodLabel?: string;
  contributingAccounts: CellDrillDownAccountBreakout[];
}


// ─── Historical Trend Point ───
export const SCETrendPointSchema = z.object({
  periodKey: z.string(),
  periodLabel: z.string(),
  isRestated: z.boolean().default(false),
  beginningEquity: z.number(),
  profit: z.number(),
  oci: z.number(),
  shareIssuance: z.number(),
  dividends: z.number(),
  treasuryNet: z.number(),
  endingEquity: z.number(),
  equityChangePercent: z.number(),
  isBalanced: z.boolean(),
  comparisonEndingEquity: z.number().optional(),
  comparisonProfit: z.number().optional(),
});

export type SCETrendPoint = z.infer<typeof SCETrendPointSchema>;

// ─── Filter State ───
export type SCEViewBy = "Monthly" | "Quarterly" | "Annually";
export type SCEPriorPeriodBasis = "restated" | "reported";
export type SCECompareMode = "none" | "previous_period" | "same_period_last_year";

export interface SCEFilterState {
  viewBy: SCEViewBy;
  periodDate: string;
  periodLabel: string;
  startDate: string;
  endDate: string;
  daysCount: number;
  compare: boolean;
  compareMode: SCECompareMode;
  divisionId: string;
  departmentId: string;
  basis: SCEPriorPeriodBasis;
}

// ─── API Statement Response ───
export const SCEStatementResponseSchema = z.object({
  companyName: z.string(),
  asOfSubtitle: z.string(),
  isRestated: z.boolean(),
  isInterim: z.boolean(),
  coverageText: z.string(),
  lastUpdated: z.string(),
  ledgerPostedThrough: z.string(),
  summaryCards: SCESummaryCardsSchema,
  equationCheck: SCEEquationCheckSchema,
  statementRows: z.array(SCEStatementRowSchema),
  accounts: z.array(SCEAccountBreakdownItemSchema),
  trend: z.array(SCETrendPointSchema),
  totalAccountsCount: z.number(),
  hasComparison: z.boolean().optional(),
  comparisonLabel: z.string().optional(),
});

export type SCEStatementResponse = z.infer<typeof SCEStatementResponseSchema>;

