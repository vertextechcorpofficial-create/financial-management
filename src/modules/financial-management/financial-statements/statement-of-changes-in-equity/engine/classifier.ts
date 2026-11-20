import { SCEMovementTag } from "../types";

export interface ClassifierInput {
  glCode: string;
  accountTitle?: string;
  debit: number;
  credit: number;
  description?: string;
  memo?: string;
  sourceModule?: string;
}

/**
 * Deterministically classifies a posted GL line into an SCE movement tag
 */
export function classifyJournalLine(input: ClassifierInput): SCEMovementTag {
  const { glCode, debit, description = "", memo = "" } = input;
  const text = `${description} ${memo}`.toLowerCase();

  // 1. Year-end closing entry (closing GL 3900 / 3510 into 3210)
  if (text.includes("closing entry") || text.includes("year-end closing")) {
    return "close";
  }

  // 2. Net Income (GL 3900)
  if (glCode === "3900") {
    return "net_income";
  }

  // 3. Treasury Shares (GL 3410)
  if (glCode === "3410") {
    // debit increases treasury shares (cost) -> acquisition; credit -> reissuance
    if (debit > 0) return "treasury_acquisition";
    return "treasury_reissuance";
  }

  // 4. APIC Treasury Share Transactions (GL 3130)
  if (glCode === "3130") {
    return "treasury_reissuance";
  }

  // 5. Dividends (GL 3510)
  if (glCode === "3510" || text.includes("dividend declared") || text.includes("cash dividend")) {
    return "dividends_cash";
  }
  if (text.includes("stock dividend")) {
    return "dividends_stock";
  }

  // 6. Share Capital Activity (GL 3010, 3020, 3110, 3120)
  if (glCode === "3010" || glCode === "3020" || glCode === "3110" || glCode === "3120") {
    return "share_issuance";
  }

  // 7. Retained Earnings Appropriations (GL 3220, 3230, 3240)
  if (glCode === "3220" || glCode === "3230" || glCode === "3240") {
    return "appropriation_transfer";
  }

  // 8. Transfers inside 3210 for appropriation
  if (glCode === "3210" && (text.includes("appropriation") || text.includes("restricted"))) {
    return "appropriation_transfer";
  }

  // 9. Other Comprehensive Income (GL 3310, 3320, 3330)
  if (glCode === "3310" || text.includes("revaluation surplus")) {
    return "oci_revaluation";
  }
  if (glCode === "3320" || text.includes("translation adjustment") || text.includes("fx translation")) {
    return "oci_translation";
  }
  if (glCode === "3330" || text.includes("fvoci")) {
    return "oci_fvoci";
  }

  // 10. Prior Period Adjustments (PPA)
  if (text.includes("prior period") || text.includes("ppa") || text.includes("depreciation correction")) {
    return "prior_period_adjustment";
  }

  return "unmapped";
}
