export type CFSViewBy = "Monthly" | "Quarterly" | "Annually";

export type CFSCompareOption = "previous_year" | "previous_period" | "custom";

export type CFSEntityCode = "GRP" | "STC" | "LPM" | "VCS" | "MRG" | "BDL" | "CPH";

export interface CFSEntity {
  code: CFSEntityCode;
  name: string;
  isConsolidated?: boolean;
}

export interface CFSFilterState {
  viewBy: CFSViewBy;
  periodDate: string; // e.g. "2026-10-31"
  periodLabel: string; // e.g. "FY 2026 YTD"
  dateRangeLabel: string; // e.g. "Jan 1 – Oct 31, 2026 304 days · to date"
  startDate: string;
  endDate: string;
  compare: boolean;
  compareOption: CFSCompareOption;
  comparePeriodLabel: string; // e.g. "Previous year (FY 2025 YTD)"
  entity: CFSEntityCode;
  showChangeColumns: boolean;
  simulateUnmapped: boolean;
}

export type CFSRowType =
  | "section_header"
  | "subsection_header"
  | "line_item"
  | "subtotal"
  | "total"
  | "reconciliation_item";

export interface CFSStatementLine {
  id: string;
  label: string;
  type: CFSRowType;
  indent?: number; // 0, 1, 2
  sectionKey?: "operating" | "investing" | "financing" | "summary" | "non_cash" | "components_of_cash";
  currentAmount?: number | null;
  comparisonAmount?: number | null;
  changeAmount?: number | null;
  changePercent?: number | null;
  isBold?: boolean;
  isNegativeInFormat?: boolean; // display in parentheses when negative or by nature
  hasAuditTrail?: boolean;
  needsReview?: boolean;
}

export interface CFSReviewCheck {
  id: string;
  name: string;
  description: string;
  status: "pass" | "warning" | "fail";
  message?: string;
  isBlocking?: boolean;
}

export interface CFSRatioCard {
  id: string;
  title: string;
  formula: string;
  value: string;
  numericValue: number;
  comparisonValue: string;
  changeText: string;
  status: "strong" | "watch" | "weak";
  meaning: string;
  trend: number[];
}

export interface CFSFinancingLiabilityRow {
  liabilityName: string;
  openingBalance: number;
  financingCashFlows: number;
  newLeases?: number;
  ppeAcquiredNotes?: number;
  debtConvertedEquity?: number;
  foreignExchange?: number;
  dividendsDeclared?: number;
  interestAccrued?: number;
  otherChanges?: number;
  closingBalance: number;
  reconciles: boolean;
}

export interface CFSSupplierFinanceItem {
  arrangementDescription: string;
  carryingAmountOpening: number;
  carryingAmountClosing: number;
  portionSuppliersPaidByProvider: number;
  paymentDueRangeAgainstComparable: string;
  nonCashChanges: number;
}

export interface CFSUnmappedAccount {
  accountNumber: string;
  accountTitle: string;
  accountType: "Asset" | "Liability" | "Equity" | "Revenue" | "Expense";
  openingBalance: number;
  closingBalance: number;
  movement: number;
  suggestedLineId: string;
  suggestedLineLabel: string;
}

export interface CFSConsolidationRow {
  lineLabel: string;
  stc: number;
  lpm: number;
  mrg: number;
  eliminations: number;
  consolidated: number;
}

export interface CFSEliminationEntry {
  ref: string;
  description: string;
  linesAffected: string;
}

export interface CFSAuditTrailLevel {
  level: number;
  title: string;
  statusText?: string;
  isPassed: boolean;
  difference?: number;
  items: Array<{
    label: string;
    value: string | number;
    subtext?: string;
  }>;
}

export interface CFSData {
  entity: CFSEntity;
  lastUpdated: string;
  ledgerPostedThrough: string;
  status: "Draft" | "Final";
  basis: string;
  summaryMetrics: {
    operating: { amount: number; description: string; compareAmount?: number; changePct?: number };
    investing: { amount: number; description: string; compareAmount?: number; changePct?: number };
    financing: { amount: number; description: string; compareAmount?: number; changePct?: number };
    endingCash: { amount: number; description: string; compareAmount?: number; changePct?: number; isReconciled: boolean };
  };
  statementLines: CFSStatementLine[];
  nonCashLines: CFSStatementLine[];
  componentsOfCashLines: CFSStatementLine[];
  reviewChecks: CFSReviewCheck[];
  ratios: CFSRatioCard[];
  financingLiabilities: CFSFinancingLiabilityRow[];
  supplierFinance: CFSSupplierFinanceItem[];
  unmappedAccounts: CFSUnmappedAccount[];
  consolidationWorksheet: CFSConsolidationRow[];
  eliminationEntries: CFSEliminationEntry[];
  policyNote: string;
}
