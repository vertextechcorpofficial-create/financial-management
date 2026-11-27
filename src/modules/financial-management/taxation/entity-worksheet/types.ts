/** PH taxation desk − shared vocabulary for one company's tax year. */

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
  /** Both tests have to pass for the 20% rate; a past year must use that year's ceilings. */
  smallCorporateNtiCeiling: number;
  smallCorporateAssetCeiling: number;
  /** The 2% minimum applies from this taxable year of operation onwards. */
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

/**
 * One carryover lot as Part I-B shows it (P70): what it was worth, how much is used,
 * what is left and the last tax year it may still be applied to.
 */
/** The stored vocabulary, not the label: `tax_carryover_lot.kind` is an ENUM whose MCIT member
 * is spelled `EXCESS_MCIT`, and the column rejects `MCIT` with a message about the amount field.
 * The panel still shows it as MCIT. */
export type CarryoverKind = "NOLCO" | "EXCESS_MCIT";

export interface CarryoverLotDetail {
  id: number;
  kind: CarryoverKind;
  originYear: number;
  amount: number;
  used: number;
  left: number;
  expiresAfterYear: number;
  /** `originYear + expiresAfterYear`: the last year the lot may be applied. */
  lastUsableYear: number;
  status: "OPEN" | "EXPIRED" | "USED";
}

/**
 * A lot whose opening this year does not match what last year closed with: the previous
 * year's figures changed after this one was started (P71).
 */
export interface CarryoverStaleLot {
  lotId: number;
  kind: CarryoverKind;
  originYear: number;
  /** What this year currently records as the lot's amount. */
  recorded: number;
  /** What last year closed the lot at, i.e. what this year should open with. */
  closing: number;
}

/** What Part I-B needs: this year's lots, what rolls into next year, and what expires. */
export interface CarryoverPanel {
  taxYear: number;
  lots: CarryoverLotDetail[];
  carriedForward: CarryoverLotDetail[];
  /** Earliest `lastUsableYear` among the lots that roll forward. */
  earliestExpiry: number | null;
  /** Lots whose window ends with this tax year while money is still left on them. */
  expiringUnused: CarryoverLotDetail[];
  /** Openings that disagree with last year's closing balance. */
  stale: CarryoverStaleLot[];
  /** True when this company-year is locked, so openings cannot be rewritten. */
  locked: boolean;
  notice: string | null;
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
  /** Cost accounts (types 7 and 8) posted in the quarter; the ledger basis for line 3. */
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
  /** Which quarters the figure came from a manual override on; absent when none did. */
  manual?: boolean[];
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

/** Which line of the return an account type reaches, if any. */
export type ExpenseBucket =
  | "COST_OF_SALES"
  | "DEDUCTIONS"
  | "INCOME_ADJUSTMENT"
  | "UNCLASSIFIED"
  | "BALANCE_SHEET";

export interface ExpenseTypeRow {
  type: string;
  label: string;
  amount: number;
  bucket: ExpenseBucket;
}

export interface ExpenseAccountRow {
  title: string;
  type: string;
  amount: number;
}

export interface ExpenseBreakdown {
  /** Everything the disbursement ledger carried for the year. */
  total: number;
  /** The part of it that reaches the return as a deduction. */
  deductible: number;
  /** The part of it that is cost of sales and so reaches line 3. */
  costOfSales: number;
  rows: ExpenseTypeRow[];
  accounts: ExpenseAccountRow[];
  /** Which ledger the rows came from: the itemized view or the account balances. */
  source: "SPRING" | "LEDGER";
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
  /** False when the sales register could not be read: the worksheet is unknown, not zero. */
  figuresAvailable: boolean;
  /** Human-readable names of the sources that failed, e.g. "sales invoices". */
  failedSources: string[];
  /** Where the sales figure came from this year: the itemized Spring view or the invoice headers. */
  salesSource: "STT_VIEW" | "INVOICE_LINES" | "INVOICE_HEADERS";
  /** Account-type breakdown behind the deduction line; null when the view could not be read. */
  expenseBreakdown: ExpenseBreakdown | null;
  /** Part I-B: the carryover lots, what rolls into next year and what expires unused (P70). */
  carryovers: CarryoverPanel;
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


