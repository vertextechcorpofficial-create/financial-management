/** PH taxation desk — shared vocabulary for one company's tax year. */

export type PeriodKey = "Q1" | "Q2" | "Q3" | "Q4" | "ANNUAL";

export type TaxRegime = "REGULAR" | "ENHANCED_DEDUCTIONS" | "SCIT" | "INCOME_TAX_HOLIDAY";

export type DeductionMethod = "ITEMIZED" | "OSD";

export type WithholdingIncomeType = "RENT" | "FEE" | "SERVICES" | "CONSTRUCTION" | "GOODS" | "OTHER";

/** One row of `company_list`, resolved to a usable Directus client. */
export interface RegistryCompany {
  companyId: number;
  code: string;
  name: string;
  tin: string | null;
  baseUrl: string;
  token: string;
  /** Spring endpoint, when the registry row carries one. Sales come from its itemized view. */
  springUrl: string | null;
  springToken: string | null;
  reachable: boolean;
  unreachableReason: string | null;
}

/** Raw money for one quarter, straight from the company's own tables. */
export interface QuarterFigures {
  sales: number;
  salesVat: number;
  /** Header discounts; the itemized view nets them out of its product totals. */
  discounts: number;
  returns: number;
  returnsVat: number;
  purchases: number;
  purchasesVat: number;
  /** Σ(line quantity × product standard cost), allocated across the quarter by line amount. */
  cogsProductCost: number;
  /** The ledger basis is not loaded here, so the engine never sees one. */
  cogsLedger: number;
  expenses: number;
  cwt: number;
  icSales: number;
  icPurchases: number;
  icSalesByCompany: Record<string, number>;
  icPurchasesByCompany: Record<string, number>;
}

export interface EntityProfile {
  companyId: number;
  taxYear: number;
  assetsExcludingLand: number;
  taxableYearOfOperations: number;
  regime: TaxRegime;
  registeredShare: number;
  deductionMethod: DeductionMethod;
  withholdingAgent: boolean;
  hasTopWithholdingStatus: boolean;
  vatRegistered: boolean;
  efpsGroup: "A" | "B" | "C" | "D" | "E" | "NONE";
  ownsRealProperty: boolean;
  taxAgentFeeRate: number;
  priorYearExcessCredit: number;
  notes: string | null;
}

/** Rates read from the company's own `tax_rates` row, falling back to the built-in defaults. */
export interface TaxRates {
  vat: number;
  percentage: number;
  corporate: number;
  smallCorporate: number;
  mcit: number;
  osd: number;
  scit: number;
  withholding: number;
  /** Money ceilings for the 20% corporation rate, in pesos. */
  smallCorporateNtiCeiling: number;
  smallCorporateAssetCeiling: number;
  /** Taxable year of operations from which MCIT applies. */
  mcitStartYear: number;
  source: "DATABASE" | "DEFAULTS";
  /** Which columns the row did not carry, e.g. ["CorporateRate"]. */
  missing: string[];
}

/** Two defensible readings of "cost of sales", both shown rather than one chosen. */
export type CostBasis = "PRODUCT_COST" | "PURCHASES" | "LEDGER";

/** One carryover lot the desk can still use, with the year it came from. */
export interface CarryoverLot {
  originYear: number;
  amount: number;
}

/**
 * What the arithmetic needs beyond the figures: the lots Part I-B carries in and the
 * 1702Q payments already recorded. The document's formula subtracts both, so leaving
 * them at zero silently overstates the tax.
 */
export interface CarryoverInput {
  /** NOLCO still unused, oldest year first. */
  nolco: CarryoverLot[];
  /** Excess MCIT still unused, oldest year first. */
  mcit: CarryoverLot[];
  /** Amount actually paid on each 1702Q, Q1..Q4; null when nothing is recorded. */
  actualPaid: (number | null)[];
}

export type TaxArbitrage = "REGULAR" | "MCIT";

export interface TaxScenario {
  basis: CostBasis;
  label: string;
  grossIncome: number[];
  deductions: number[];
  /** NOLCO applied in each quarter; the running total is what line 8 prints. */
  nolcoUsed: number[];
  /** Running taxable income at each quarter, the same basis line 10 is computed on. */
  netTaxableIncome: number[];
  taxDue: number[];
  payable: number[];
  /** Cumulative regular income tax per quarter. */
  regular: number[];
  /** Cumulative minimum corporate income tax per quarter; zero when the 2% does not apply. */
  mcit: number[];
  /** The higher of the two each quarter, i.e. what line 10 printed. */
  arbitrage: TaxArbitrage[];
  annual: {
    grossIncome: number;
    deductions: number;
    netTaxableIncome: number;
    regular: number;
    mcit: number;
    taxDue: number;
    netPosition: number;
  };
  mcitApplied: boolean;
  /** False while the company is still inside its first three years of operations. */
  mcitApplicable: boolean;
  /** 2% of year-to-date gross income, shown even when the MCIT is dormant so the gap is visible. */
  mcitOnGross: number;
  smallCorporation: boolean;
  rate: number;
}

/** A line of the 1702Q worksheet: what it is, where it came from, and the four quarters. */
export interface WorksheetLine {
  key: string;
  lineNo: string;
  label: string;
  hint?: string;
  section: "INCOME" | "DEDUCTIONS" | "TAX";
  source: "DERIVED" | "COMPUTED";
  values: number[];
  yearValue: number;
  emphasis?: boolean;
}

export interface TaxComputation {
  grossIncome: number[];
  deductions: number[];
  osdAmount: number[];
  nolcoUsed: number[];
  netTaxableIncome: number[];
  taxDue: number[];
  taxCredits: number[];
  payable: number[];
  annual: {
    grossIncome: number;
    deductions: number;
    netTaxableIncome: number;
    taxDue: number;
    taxCredits: number;
    netPosition: number;
  };
  regimeApplied: TaxRegime;
  rateApplied: number;
  smallCorporation: boolean;
  mcitApplied: boolean;
  notices: string[];
  /** Headline scenario (product standard cost) first, then the purchase-order reading. */
  scenarios: TaxScenario[];
  rates: TaxRates;
}

export interface VatComputation {
  outputVat: number[];
  inputVat: number[];
  netVat: number[];
  payable: number[];
  carriedIn: number[];
}

export interface EntitySnapshot {
  company: RegistryCompany;
  profile: EntityProfile;
  figures: QuarterFigures[];
  computation: TaxComputation;
  vat: VatComputation;
  lines: WorksheetLine[];
  matches: IntercompanyMatch[];
  notices: string[];
}

export interface IntercompanyMatch {
  counterpartyCode: string;
  counterpartyName: string;
  direction: "SOLD_TO" | "BOUGHT_FROM" | "BOTH";
  amount: number;
  months: number[];
  counterpartyMirrors: "MATCHED" | "NOT_FOUND" | "DIFFERENT_AMOUNT" | "UNKNOWN";
  counterpartyAmount: number | null;
}

export interface ArfAttention {
  key: string;
  severity: "CRITICAL" | "HIGH" | "MEDIUM";
  module: string;
  title: string;
  detail: string;
  companyCode: string;
  reference: string | null;
}

export interface Paginated<T> {
  rows: T[];
  page: number;
  pageSize: number;
  total: number;
}

/**
 * `UNVERIFIED` means the company's own registers refused to answer: the obligation is listed,
 * but nothing was read, so lateness cannot be judged and it is not called overdue.
 */
export type CalendarStatus = "PAID" | "DUE" | "OVERDUE" | "UNKNOWN" | "UNVERIFIED";

export type CalendarCategory = "INCOME" | "VAT" | "WITHHOLDING" | "OTHER";

/** One filing on the group calendar. */
export interface CalendarObligation {
  key: string;
  companyId: number;
  companyCode: string;
  companyName: string;
  formCode: string;
  periodKey: string;
  periodLabel: string;
  category: CalendarCategory;
  dueDate: string;
  estimated: number | null;
  status: CalendarStatus;
  /** What the form itself is, not why its date moved. */
  note: string | null;
  /** Why the filing's due date left the statutory date; null when it did not move. */
  moveReason: string | null;
  /** The statutory date the filing moved from; null when it did not move. */
  movedFrom: string | null;
}

/** One deadline as a month-grid cell draws it: no company id, no internal key. */
export interface CalendarDayItem {
  /** `YYYY-MM-DD`, already moved to the working day by the calendar service. */
  date: string;
  formCode: string;
  companyName: string;
  period: string;
  amount: number | null;
  status: CalendarStatus;
  /** Set only when a source carries the original date; today's payload does not. */
  movedFrom?: string;
}

export interface CalendarFilter {
  companyId: number | null;
  category: string;
  status: string;
  from: string;
  to: string;
  /** Free text over form code, company and period. */
  q: string;
}

