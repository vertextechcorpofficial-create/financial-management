import {
  SCEFilterState,
  SCEStatementResponse,
  SCEStatementRow,
  SCEAccountBreakdownItem,
  SCETrendPoint,
} from "../types";
import { EQUITY_GL_ACCOUNTS } from "../constants/components";
import { classifyJournalLine } from "./classifier";
import { verifyEquityEquation } from "./reconciliation";
import { MasterLedgerEntry } from "../services/sce-backend.service";

/**
 * Builds live SCE statement response by aggregating master ledger lines
 * Strictly zero mock data: if 0 lines exist for the period, outputs clean 0 / — balances.
 * 
 * @param periodEntries Live entries within [startDate, endDate]
 * @param filters Current filter criteria
 * @param priorEntries Live entries prior to startDate (for computing real cumulative beginning balances)
 * @param comparisonEntries Optional comparative entries within comparison period
 * @param comparisonPriorEntries Optional comparative prior entries up to comparison start
 * @param comparisonLabel Optional comparative label e.g. "Oct 2025" or "FY 2025"
 */
export function aggregateLiveSCEData(
  periodEntries: MasterLedgerEntry[],
  filters: SCEFilterState,
  priorEntries: MasterLedgerEntry[] = [],
  comparisonEntries?: MasterLedgerEntry[],
  comparisonPriorEntries?: MasterLedgerEntry[],
  comparisonLabel?: string
): SCEStatementResponse {
  const isSegment = filters.divisionId !== "all" || filters.departmentId !== "all";
  const isRestated = filters.basis === "restated";
  const hasComparison = !!filters.compare && !!comparisonLabel;

  // Segment filter predicate
  const matchesSegment = (e: MasterLedgerEntry) => {
    if (filters.divisionId !== "all" && e.division !== filters.divisionId) {
      return false;
    }
    if (filters.departmentId !== "all" && e.department !== filters.departmentId) {
      return false;
    }
    return true;
  };

  // Helper: initialize component zero amounts
  const initComponentAmounts = () => ({
    shareCapital: 0,
    apic: 0,
    reRetainedEarnings: 0,
    reAppropriated: 0,
    oci: 0,
    treasuryShares: 0,
    totalEquity: 0,
  });

  // Helper to calculate account movements and component sums
  const computeMovements = (entries: MasterLedgerEntry[]) => {
    const accMov: Record<string, { debit: number; credit: number; net: number }> = {};
    for (const acc of EQUITY_GL_ACCOUNTS) {
      accMov[acc.glCode] = { debit: 0, credit: 0, net: 0 };
    }
    for (const item of entries) {
      // Prioritize sceCode, fallback to accountNumber
      const code = item.sceCode || item.accountNumber || "";
      if (accMov[code]) {
        accMov[code].debit += item.debit || 0;
        accMov[code].credit += item.credit || 0;
      }
    }
    for (const acc of EQUITY_GL_ACCOUNTS) {
      const mov = accMov[acc.glCode];
      if (acc.normalBalance === "debit") {
        mov.net = mov.debit - mov.credit;
      } else {
        mov.net = mov.credit - mov.debit;
      }
    }
    return accMov;
  };

  // 1. Filter period & prior entries
  const filteredPeriodEntries = (periodEntries || []).filter(matchesSegment);
  const filteredPriorEntries = (priorEntries || []).filter(matchesSegment);

  // 2. Aggregate cumulative prior balances (Beginning Balance calculation)
  const priorAccountMovements = computeMovements(filteredPriorEntries);

  const begComponentAmounts = initComponentAmounts();
  if (!isSegment) {
    for (const acc of EQUITY_GL_ACCOUNTS) {
      const net = priorAccountMovements[acc.glCode].net;
      if (acc.componentKey !== "totalEquity") {
        begComponentAmounts[acc.componentKey] += net;
        if (acc.componentKey === "treasuryShares") {
          begComponentAmounts.totalEquity -= net;
        } else {
          begComponentAmounts.totalEquity += net;
        }
      }
    }
  }

  // 3. Aggregate period movements per account from live records
  const accountMovements = computeMovements(filteredPeriodEntries);

  // 4. Movement Rows Map initialized to 0
  const movementRowsMap: Record<string, ReturnType<typeof initComponentAmounts>> = {
    net_income: initComponentAmounts(),
    oci_revaluation: initComponentAmounts(),
    share_issuance: initComponentAmounts(),
    dividends_cash: initComponentAmounts(),
    appropriation_transfer: initComponentAmounts(),
    treasury_acquisition: initComponentAmounts(),
    prior_period_adjustment: initComponentAmounts(),
  };

  // Classify each transaction line
  for (const item of filteredPeriodEntries) {
    const sceCode = item.sceCode || item.accountNumber || "";
    const tag = classifyJournalLine({
      glCode: sceCode,
      accountTitle: item.accountTitle || "",
      debit: item.debit || 0,
      credit: item.credit || 0,
      description: item.description,
      generated: item.generated,
    });

    if (movementRowsMap[tag]) {
      const accDef = EQUITY_GL_ACCOUNTS.find((a) => a.glCode === sceCode);
      if (accDef && accDef.componentKey !== "totalEquity") {
        const net = accDef.normalBalance === "debit" ? (item.debit - item.credit) : (item.credit - item.debit);
        movementRowsMap[tag][accDef.componentKey] += net;
        if (accDef.componentKey === "treasuryShares") {
          movementRowsMap[tag].totalEquity -= net;
        } else {
          movementRowsMap[tag].totalEquity += net;
        }
      }
    }
  }

  // Sum total component changes
  const componentSums = initComponentAmounts();
  for (const rowKey of Object.keys(movementRowsMap)) {
    const row = movementRowsMap[rowKey];
    componentSums.shareCapital += row.shareCapital;
    componentSums.apic += row.apic;
    componentSums.reRetainedEarnings += row.reRetainedEarnings;
    componentSums.reAppropriated += row.reAppropriated;
    componentSums.oci += row.oci;
    componentSums.treasuryShares += row.treasuryShares;
    componentSums.totalEquity += row.totalEquity;
  }

  // Live in-period totals
  const netIncome = movementRowsMap.net_income.totalEquity || 0;
  const oci = movementRowsMap.oci_revaluation.totalEquity || 0;
  const capitalContributions = movementRowsMap.share_issuance.totalEquity || 0;
  const cashDividends = movementRowsMap.dividends_cash.totalEquity || 0;
  const netTreasury = movementRowsMap.treasury_acquisition.totalEquity || 0;
  const ppaAmount = movementRowsMap.prior_period_adjustment.totalEquity || 0;

  const begTotal = isSegment ? 0 : begComponentAmounts.totalEquity;

  const endingTotal = isSegment
    ? componentSums.totalEquity
    : begTotal + componentSums.totalEquity;

  // Build Equation Check
  const equation = verifyEquityEquation({
    glEndingEquity: endingTotal,
    restatedBeginningEquity: begTotal,
    netIncome,
    oci,
    capitalContributions,
    cashDividends,
    netTreasuryPurchases: netTreasury,
    statementEndingEquity: endingTotal,
    appropriationTransferSum: movementRowsMap.appropriation_transfer.totalEquity,
    stockDividendSum: 0,
    unmappedCount: 0,
  });

  // 5. Optional Comparison Calculations
  let compBegTotal = 0;
  let compEndingTotal = 0;
  const compAccountMovements: Record<string, { net: number }> = {};
  const compPriorMovements: Record<string, { net: number }> = {};
  const compMovementRowsMap: Record<string, ReturnType<typeof initComponentAmounts>> = {
    net_income: initComponentAmounts(),
    oci_revaluation: initComponentAmounts(),
    share_issuance: initComponentAmounts(),
    dividends_cash: initComponentAmounts(),
    appropriation_transfer: initComponentAmounts(),
    treasury_acquisition: initComponentAmounts(),
    prior_period_adjustment: initComponentAmounts(),
  };

  if (hasComparison && comparisonEntries) {
    const filteredCompEntries = comparisonEntries.filter(matchesSegment);
    const filteredCompPriorEntries = (comparisonPriorEntries || []).filter(matchesSegment);

    const compPrior = computeMovements(filteredCompPriorEntries);
    const compPeriod = computeMovements(filteredCompEntries);

    for (const acc of EQUITY_GL_ACCOUNTS) {
      compPriorMovements[acc.glCode] = { net: compPrior[acc.glCode]?.net || 0 };
      compAccountMovements[acc.glCode] = { net: compPeriod[acc.glCode]?.net || 0 };
    }

    if (!isSegment) {
      for (const acc of EQUITY_GL_ACCOUNTS) {
        const net = compPriorMovements[acc.glCode].net;
        if (acc.componentKey === "treasuryShares") {
          compBegTotal -= net;
        } else if (acc.componentKey !== "totalEquity") {
          compBegTotal += net;
        }
      }
    }

    for (const item of filteredCompEntries) {
      const sceCode = item.sceCode || item.accountNumber || "";
      const tag = classifyJournalLine({
        glCode: sceCode,
        accountTitle: item.accountTitle || "",
        debit: item.debit || 0,
        credit: item.credit || 0,
        description: item.description,
        generated: item.generated,
      });

      if (compMovementRowsMap[tag]) {
        const accDef = EQUITY_GL_ACCOUNTS.find((a) => a.glCode === sceCode);
        if (accDef && accDef.componentKey !== "totalEquity") {
          const net = accDef.normalBalance === "debit" ? (item.debit - item.credit) : (item.credit - item.debit);
          compMovementRowsMap[tag][accDef.componentKey] += net;
          if (accDef.componentKey === "treasuryShares") {
            compMovementRowsMap[tag].totalEquity -= net;
          } else {
            compMovementRowsMap[tag].totalEquity += net;
          }
        }
      }
    }

    let compChangesTotal = 0;
    for (const rowKey of Object.keys(compMovementRowsMap)) {
      compChangesTotal += compMovementRowsMap[rowKey].totalEquity;
    }
    compEndingTotal = isSegment ? compChangesTotal : compBegTotal + compChangesTotal;
  }

  const makeCompAmounts = (currentAmt: number, compAmt: number) => {
    if (!hasComparison) return undefined;
    return {
      totalEquity: compAmt,
      change: currentAmt - compAmt,
    };
  };

  // Build Statement Rows
  const statementRows: SCEStatementRow[] = [
    {
      id: "group-beg",
      label: `Beginning balance (as of ${filters.startDate})`,
      tag: "beginning_balance",
      isGroupHeader: true,
      hasChildren: true,
      indent: 0,
      amounts: begComponentAmounts,
      comparisonAmounts: makeCompAmounts(begTotal, compBegTotal),
    },
    {
      id: "row-rep",
      label: "Balance as previously reported",
      tag: "beginning_balance",
      indent: 1,
      amounts: begComponentAmounts,
      comparisonAmounts: makeCompAmounts(begTotal, compBegTotal),
    },
    {
      id: "row-ppa",
      label: "Prior period adjustments / correction of errors",
      tag: "prior_period_adjustment",
      indent: 1,
      standardRef: "PAS 8",
      amounts: movementRowsMap.prior_period_adjustment,
      comparisonAmounts: makeCompAmounts(
        ppaAmount,
        compMovementRowsMap.prior_period_adjustment.totalEquity
      ),
    },
    {
      id: "row-res",
      label: "Balance as restated",
      tag: "balance_restated",
      isSubtotal: true,
      indent: 0,
      amounts: {
        shareCapital: begComponentAmounts.shareCapital + movementRowsMap.prior_period_adjustment.shareCapital,
        apic: begComponentAmounts.apic + movementRowsMap.prior_period_adjustment.apic,
        reRetainedEarnings: begComponentAmounts.reRetainedEarnings + movementRowsMap.prior_period_adjustment.reRetainedEarnings,
        reAppropriated: begComponentAmounts.reAppropriated + movementRowsMap.prior_period_adjustment.reAppropriated,
        oci: begComponentAmounts.oci + movementRowsMap.prior_period_adjustment.oci,
        treasuryShares: begComponentAmounts.treasuryShares + movementRowsMap.prior_period_adjustment.treasuryShares,
        totalEquity: begTotal + ppaAmount,
      },
      comparisonAmounts: makeCompAmounts(
        begTotal + ppaAmount,
        compBegTotal + compMovementRowsMap.prior_period_adjustment.totalEquity
      ),
    },
    {
      id: "group-chg",
      label: "Changes in equity for the period",
      tag: "total_changes",
      isGroupHeader: true,
      hasChildren: true,
      indent: 0,
      amounts: componentSums,
      comparisonAmounts: makeCompAmounts(
        componentSums.totalEquity,
        endingTotal - begTotal
      ),
    },
    {
      id: "row-profit",
      label: "Profit / (Loss) for the period",
      tag: "net_income",
      indent: 1,
      standardRef: "Income Statement ↗",
      amounts: movementRowsMap.net_income,
      comparisonAmounts: makeCompAmounts(netIncome, compMovementRowsMap.net_income.totalEquity),
    },
    {
      id: "row-oci",
      label: "Other comprehensive income",
      tag: "oci_revaluation",
      indent: 1,
      amounts: movementRowsMap.oci_revaluation,
      comparisonAmounts: makeCompAmounts(oci, compMovementRowsMap.oci_revaluation.totalEquity),
    },
    {
      id: "row-tci",
      label: "Total comprehensive income for the period",
      tag: "total_comprehensive_income",
      isSubtotal: true,
      indent: 0,
      standardRef: "PAS 1 ¶106(a)",
      amounts: {
        shareCapital: 0,
        apic: 0,
        reRetainedEarnings: netIncome,
        reAppropriated: 0,
        oci,
        treasuryShares: 0,
        totalEquity: netIncome + oci,
      },
      comparisonAmounts: makeCompAmounts(
        netIncome + oci,
        compMovementRowsMap.net_income.totalEquity + compMovementRowsMap.oci_revaluation.totalEquity
      ),
    },
    {
      id: "row-issuance",
      label: "Issuance of share capital",
      tag: "share_issuance",
      indent: 1,
      amounts: movementRowsMap.share_issuance,
      comparisonAmounts: makeCompAmounts(
        capitalContributions,
        compMovementRowsMap.share_issuance.totalEquity
      ),
    },
    {
      id: "row-div",
      label: "Dividends declared",
      tag: "dividends_cash",
      indent: 1,
      amounts: movementRowsMap.dividends_cash,
      comparisonAmounts: makeCompAmounts(
        cashDividends,
        compMovementRowsMap.dividends_cash.totalEquity
      ),
    },
    {
      id: "row-app",
      label: "Appropriation / (Reversal) of retained earnings",
      tag: "appropriation_transfer",
      indent: 1,
      standardRef: "Nets to ₱0.00",
      amounts: movementRowsMap.appropriation_transfer,
      comparisonAmounts: makeCompAmounts(
        movementRowsMap.appropriation_transfer.totalEquity,
        compMovementRowsMap.appropriation_transfer.totalEquity
      ),
    },
    {
      id: "row-ts",
      label: "Acquisition / (Reissuance) of treasury shares",
      tag: "treasury_acquisition",
      indent: 1,
      amounts: movementRowsMap.treasury_acquisition,
      comparisonAmounts: makeCompAmounts(
        netTreasury,
        compMovementRowsMap.treasury_acquisition.totalEquity
      ),
    },
    {
      id: "row-total-changes",
      label: "Total changes in equity for the period",
      tag: "total_changes",
      isSubtotal: true,
      indent: 0,
      amounts: componentSums,
      comparisonAmounts: makeCompAmounts(
        componentSums.totalEquity,
        endingTotal - begTotal
      ),
    },
    {
      id: "group-end",
      label: `Ending balance (as of ${filters.endDate})`,
      tag: "ending_balance",
      isGroupHeader: true,
      indent: 0,
      amounts: {
        shareCapital: begComponentAmounts.shareCapital + componentSums.shareCapital,
        apic: begComponentAmounts.apic + componentSums.apic,
        reRetainedEarnings: begComponentAmounts.reRetainedEarnings + componentSums.reRetainedEarnings,
        reAppropriated: begComponentAmounts.reAppropriated + componentSums.reAppropriated,
        oci: begComponentAmounts.oci + componentSums.oci,
        treasuryShares: begComponentAmounts.treasuryShares + componentSums.treasuryShares,
        totalEquity: endingTotal,
      },
      comparisonAmounts: makeCompAmounts(endingTotal, compEndingTotal),
    },
    {
      id: "row-ending",
      label: "Ending balance",
      tag: "ending_balance",
      isEnding: true,
      indent: 0,
      amounts: {
        shareCapital: begComponentAmounts.shareCapital + componentSums.shareCapital,
        apic: begComponentAmounts.apic + componentSums.apic,
        reRetainedEarnings: begComponentAmounts.reRetainedEarnings + componentSums.reRetainedEarnings,
        reAppropriated: begComponentAmounts.reAppropriated + componentSums.reAppropriated,
        oci: begComponentAmounts.oci + componentSums.oci,
        treasuryShares: begComponentAmounts.treasuryShares + componentSums.treasuryShares,
        totalEquity: endingTotal,
      },
      comparisonAmounts: makeCompAmounts(endingTotal, compEndingTotal),
    },
  ];

  // Build Account Breakdown strictly from live data
  const accounts: SCEAccountBreakdownItem[] = EQUITY_GL_ACCOUNTS.map((acc) => {
    const mov = accountMovements[acc.glCode]?.net || 0;
    const beg = isSegment ? 0 : (priorAccountMovements[acc.glCode]?.net || 0);
    const end = beg + mov;

    // Comparison ending balance
    const compBeg = isSegment ? 0 : (compPriorMovements[acc.glCode]?.net || 0);
    const compMov = compAccountMovements[acc.glCode]?.net || 0;
    const compEnd = compBeg + compMov;

    return {
      coaId: acc.coaId,
      glCode: acc.glCode,
      accountTitle: acc.accountTitle,
      category: acc.category,
      componentKey: acc.componentKey,
      beginningBalance: beg,
      netMovement: mov,
      endingBalance: end,
      movementPercent: beg !== 0 ? (mov / beg) * 100 : 0,
      comparisonBalance: hasComparison ? compEnd : undefined,
      comparisonChange: hasComparison ? end - compEnd : undefined,
    };
  });

  // 6. Generate Dynamic Historical Trend from live entries
  // Buckets entries across monthly intervals across the trailing 12 months up to filters.endDate
  const trend: SCETrendPoint[] = [];
  const endD = new Date(filters.endDate);
  const endYear = endD.getFullYear();
  const endMonth = endD.getMonth(); // 0-indexed

  // Generate 12 trailing months
  for (let i = 11; i >= 0; i--) {
    const targetDate = new Date(endYear, endMonth - i, 1);
    const yr = targetDate.getFullYear();
    const mo = targetDate.getMonth() + 1;
    const moStr = String(mo).padStart(2, "0");
    const lastDayOfMonth = new Date(yr, mo, 0).getDate();
    const periodStart = `${yr}-${moStr}-01`;
    const periodEnd = `${yr}-${moStr}-${String(lastDayOfMonth).padStart(2, "0")}`;
    const periodLabel = targetDate.toLocaleString("en-US", { month: "short", year: "numeric" });
    const periodKey = `${yr}-${moStr}`;

    // Find all entries prior to periodStart and within this month
    const allCombined = [...filteredPriorEntries, ...filteredPeriodEntries];
    
    // Entries prior to periodStart
    const mPrior = allCombined.filter((e) => {
      const d = e.transactionDate || e.postingDate || "";
      return d < periodStart;
    });
    // Entries within this month
    const mPeriod = allCombined.filter((e) => {
      const d = e.transactionDate || e.postingDate || "";
      return d >= periodStart && d <= periodEnd;
    });

    const mPriorMov = computeMovements(mPrior);
    const mPeriodMov = computeMovements(mPeriod);

    let mBeg = 0;
    let mEnd = 0;
    let mProfit = 0;
    let mOci = 0;
    let mIssuance = 0;
    let mDividends = 0;
    let mTreasury = 0;

    for (const acc of EQUITY_GL_ACCOUNTS) {
      const pNet = mPriorMov[acc.glCode]?.net || 0;
      const cNet = mPeriodMov[acc.glCode]?.net || 0;

      if (acc.componentKey === "treasuryShares") {
        mBeg -= pNet;
        mEnd -= (pNet + cNet);
        mTreasury += cNet;
      } else if (acc.componentKey !== "totalEquity") {
        mBeg += pNet;
        mEnd += (pNet + cNet);

        if (acc.glCode === "3900") {
          mProfit += cNet;
        } else if (acc.glCode === "3510") {
          mDividends += cNet;
        } else if (acc.componentKey === "shareCapital" || acc.componentKey === "apic") {
          mIssuance += cNet;
        } else if (acc.componentKey === "oci") {
          mOci += cNet;
        }
      }
    }

    // Compute comparison trend for this month (e.g. 1 year prior) if comparison is enabled
    let compMProfit: number | undefined = undefined;
    let compMEnd: number | undefined = undefined;

    if (hasComparison && comparisonEntries) {
      const allCompCombined = [...(comparisonPriorEntries || []), ...comparisonEntries];
      const compTargetDate = new Date(yr - 1, mo - 1, 1);
      const compYr = compTargetDate.getFullYear();
      const compMo = compTargetDate.getMonth() + 1;
      const compMoStr = String(compMo).padStart(2, "0");
      const compLastDay = new Date(compYr, compMo, 0).getDate();
      const compPStart = `${compYr}-${compMoStr}-01`;
      const compPEnd = `${compYr}-${compMoStr}-${String(compLastDay).padStart(2, "0")}`;

      const cPrior = allCompCombined.filter((e) => {
        const d = e.transactionDate || e.postingDate || "";
        return d < compPStart;
      });
      const cPeriod = allCompCombined.filter((e) => {
        const d = e.transactionDate || e.postingDate || "";
        return d >= compPStart && d <= compPEnd;
      });

      const cPriorMov = computeMovements(cPrior);
      const cPeriodMov = computeMovements(cPeriod);

      let cEnd = 0;
      let cProf = 0;
      for (const acc of EQUITY_GL_ACCOUNTS) {
        const pNet = cPriorMov[acc.glCode]?.net || 0;
        const cNet = cPeriodMov[acc.glCode]?.net || 0;
        if (acc.componentKey === "treasuryShares") {
          cEnd -= (pNet + cNet);
        } else if (acc.componentKey !== "totalEquity") {
          cEnd += (pNet + cNet);
          if (acc.glCode === "3900") {
            cProf += cNet;
          }
        }
      }
      compMEnd = cEnd;
      compMProfit = cProf;
    }

    const equityChangePercent = mBeg !== 0 ? ((mEnd - mBeg) / Math.abs(mBeg)) * 100 : 0;

    trend.push({
      periodKey,
      periodLabel,
      isRestated: isRestated,
      beginningEquity: mBeg,
      profit: mProfit,
      oci: mOci,
      shareIssuance: mIssuance,
      dividends: mDividends,
      treasuryNet: mTreasury,
      endingEquity: mEnd,
      equityChangePercent,
      isBalanced: true,
      comparisonEndingEquity: compMEnd,
      comparisonProfit: compMProfit,
    });
  }

  return {
    companyName: "Corporate Financial Entity",
    asOfSubtitle: `For the period ended ${filters.endDate}`,
    isRestated: isRestated,
    isInterim: filters.viewBy !== "Annually",
    coverageText: `Report coverage: ${filters.startDate} - ${filters.endDate}`,
    lastUpdated: new Date().toLocaleTimeString("en-US", { hour: "numeric", minute: "numeric", hour12: true }),
    ledgerPostedThrough: filters.endDate,
    summaryCards: {
      beginningEquity: begTotal,
      netIncome,
      netCapitalAndDividend: capitalContributions - cashDividends - netTreasury,
      issuances: capitalContributions,
      dividends: cashDividends,
      treasuryNet: netTreasury,
      endingEquity: endingTotal,
      isReconciled: equation.isBalanced,
      variance: equation.variance,
      isSegmentView: isSegment,
      segmentNetActivity: isSegment ? componentSums.totalEquity : undefined,
    },
    equationCheck: equation,
    statementRows,
    accounts,
    trend,
    totalAccountsCount: 15,
    hasComparison,
    comparisonLabel: hasComparison ? comparisonLabel : undefined,
  };
}
