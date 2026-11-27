import { SCEEquationCheck } from "../types";

export interface EquationVerificationInput {
  glEndingEquity: number;
  restatedBeginningEquity: number;
  netIncome: number;
  oci: number;
  capitalContributions: number;
  cashDividends: number; // positive figure representing declared dividends deduction
  netTreasuryPurchases: number; // buybacks minus reissues
  statementEndingEquity: number;
  appropriationTransferSum: number;
  stockDividendSum: number;
  unmappedCount?: number;
}

/**
 * Verifies the Roll-Forward Equity Equation:
 * Variance = E_GL - (B_restated + NI + OCI + C - D_cash - T_net)
 */
export function verifyEquityEquation(input: EquationVerificationInput): SCEEquationCheck {
  const {
    glEndingEquity,
    restatedBeginningEquity,
    netIncome,
    oci,
    capitalContributions,
    cashDividends,
    netTreasuryPurchases,
    statementEndingEquity,
    appropriationTransferSum,
    stockDividendSum,
    unmappedCount = 0,
  } = input;

  const expectedEnding =
    restatedBeginningEquity +
    netIncome +
    oci +
    capitalContributions -
    cashDividends -
    netTreasuryPurchases;

  const variance = Math.round((glEndingEquity - expectedEnding) * 100) / 100;
  const isBalanced = Math.abs(variance) < 0.01 && unmappedCount === 0;

  return {
    glEndingEquity,
    restatedBeginningEquity,
    netIncome,
    oci,
    capitalContributions,
    cashDividends,
    netTreasuryPurchases,
    variance,
    isBalanced,
    appropriationTransferNet: Math.round(appropriationTransferSum * 100) / 100,
    stockDividendNet: Math.round(stockDividendSum * 100) / 100,
    statementEndingEquity,
    unmappedCount,
  };
}
