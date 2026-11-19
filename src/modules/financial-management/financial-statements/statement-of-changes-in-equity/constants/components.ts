import { EquityComponentKey } from "../types";

export interface EquityColumnDefinition {
  key: EquityComponentKey;
  header: string;
  subHeader: string;
  glCodes: string[];
}

export const EQUITY_COLUMNS: EquityColumnDefinition[] = [
  {
    key: "shareCapital",
    header: "SHARE CAPITAL",
    subHeader: "Common & Preferred, par/stated value",
    glCodes: ["3010", "3020"],
  },
  {
    key: "apic",
    header: "ADDITIONAL PAID-IN CAPITAL (APIC)",
    subHeader: "Share premium",
    glCodes: ["3110", "3120", "3130"],
  },
  {
    key: "reRetainedEarnings",
    header: "RETAINED EARNINGS (UNAPPROPRIATED)",
    subHeader: "Available for distribution",
    glCodes: ["3210", "3510", "3900"],
  },
  {
    key: "reAppropriated",
    header: "RETAINED EARNINGS (APPROPRIATED)",
    subHeader: "Restricted / earmarked",
    glCodes: ["3220", "3230", "3240"],
  },
  {
    key: "oci",
    header: "OTHER COMPREHENSIVE INCOME (OCI)",
    subHeader: "Revaluation, FX, FVOCI",
    glCodes: ["3310", "3320", "3330"],
  },
  {
    key: "treasuryShares",
    header: "TREASURY SHARES",
    subHeader: "Contra-equity, at cost",
    glCodes: ["3410"],
  },
  {
    key: "totalEquity",
    header: "TOTAL EQUITY",
    subHeader: "",
    glCodes: [],
  },
];

export interface GLAccountMapping {
  coaId: number;
  glCode: string;
  accountTitle: string;
  category: string;
  componentKey: EquityComponentKey;
  normalBalance: "credit" | "debit"; // treasury shares & dividends are debit normal
}

export const EQUITY_GL_ACCOUNTS: GLAccountMapping[] = [
  {
    coaId: 3010,
    glCode: "3010",
    accountTitle: "Common Stock - ₱10 par value",
    category: "EQUITY · SHARE CAPITAL",
    componentKey: "shareCapital",
    normalBalance: "credit",
  },
  {
    coaId: 3020,
    glCode: "3020",
    accountTitle: "Preferred Stock - ₱100 par value, 8% cumulative",
    category: "EQUITY · SHARE CAPITAL",
    componentKey: "shareCapital",
    normalBalance: "credit",
  },
  {
    coaId: 3110,
    glCode: "3110",
    accountTitle: "Additional Paid-In Capital - Common",
    category: "EQUITY · ADDITIONAL PAID-IN CAPITAL",
    componentKey: "apic",
    normalBalance: "credit",
  },
  {
    coaId: 3120,
    glCode: "3120",
    accountTitle: "Additional Paid-In Capital - Preferred",
    category: "EQUITY · ADDITIONAL PAID-IN CAPITAL",
    componentKey: "apic",
    normalBalance: "credit",
  },
  {
    coaId: 3130,
    glCode: "3130",
    accountTitle: "APIC - Treasury Share Transactions",
    category: "EQUITY · ADDITIONAL PAID-IN CAPITAL",
    componentKey: "apic",
    normalBalance: "credit",
  },
  {
    coaId: 3210,
    glCode: "3210",
    accountTitle: "Retained Earnings - Unappropriated",
    category: "EQUITY · RETAINED EARNINGS",
    componentKey: "reRetainedEarnings",
    normalBalance: "credit",
  },
  {
    coaId: 3510,
    glCode: "3510",
    accountTitle: "Cash Dividends Declared",
    category: "EQUITY · RETAINED EARNINGS",
    componentKey: "reRetainedEarnings",
    normalBalance: "debit",
  },
  {
    coaId: 3900,
    glCode: "3900",
    accountTitle: "Current Net Income",
    category: "EQUITY · CURRENT NET INCOME",
    componentKey: "reRetainedEarnings",
    normalBalance: "credit",
  },
  {
    coaId: 3220,
    glCode: "3220",
    accountTitle: "Retained Earnings - Appropriated for Plant Expansion",
    category: "EQUITY · RETAINED EARNINGS (APPROPRIATED)",
    componentKey: "reAppropriated",
    normalBalance: "credit",
  },
  {
    coaId: 3230,
    glCode: "3230",
    accountTitle: "Retained Earnings - Appropriated for Contingencies",
    category: "EQUITY · RETAINED EARNINGS (APPROPRIATED)",
    componentKey: "reAppropriated",
    normalBalance: "credit",
  },
  {
    coaId: 3240,
    glCode: "3240",
    accountTitle: "Retained Earnings - Restricted for Treasury Shares",
    category: "EQUITY · RETAINED EARNINGS (APPROPRIATED)",
    componentKey: "reAppropriated",
    normalBalance: "credit",
  },
  {
    coaId: 3310,
    glCode: "3310",
    accountTitle: "Revaluation Surplus - Land and Building",
    category: "EQUITY · OTHER COMPREHENSIVE INCOME",
    componentKey: "oci",
    normalBalance: "credit",
  },
  {
    coaId: 3320,
    glCode: "3320",
    accountTitle: "Cumulative Translation Adjustment",
    category: "EQUITY · OTHER COMPREHENSIVE INCOME",
    componentKey: "oci",
    normalBalance: "credit",
  },
  {
    coaId: 3330,
    glCode: "3330",
    accountTitle: "Financial Assets at FVOCI Reserve",
    category: "EQUITY · OTHER COMPREHENSIVE INCOME",
    componentKey: "oci",
    normalBalance: "credit",
  },
  {
    coaId: 3410,
    glCode: "3410",
    accountTitle: "Treasury Shares, at cost",
    category: "EQUITY · TREASURY SHARES",
    componentKey: "treasuryShares",
    normalBalance: "debit",
  },
];

export function getComponentKeyForGL(glCode: string): EquityComponentKey | null {
  const match = EQUITY_GL_ACCOUNTS.find((a) => a.glCode === glCode);
  return match ? match.componentKey : null;
}
