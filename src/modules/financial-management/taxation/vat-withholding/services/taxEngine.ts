import "server-only";

import type { EntityProfile, QuarterFigures, TaxRates, VatComputation } from "../types";
import {
  CORPORATE_RATE,
  MCIT_RATE,
  MCIT_START_YEAR,
  OSD_RATE,
  PERCENTAGE_TAX_RATE,
  SMALL_CORPORATION_ASSET_CEILING,
  SMALL_CORPORATION_NTI_CEILING,
  SMALL_CORPORATION_RATE,
  VAT_RATE,
} from "../constants";

/**
 * The VAT arithmetic for 2550Q/2551Q, and nothing else.
 *
 * The 1702Q arithmetic — the cumulative year-to-date lines, the MCIT/RCIT arbitrage, the
 * cost-of-sales bases — lives in the entity worksheet's engine, which owns it for the desk.
 * This file reads that code instead of keeping a second copy: a copy drifts, and the three
 * copies that already existed had to be brought back into line by hand.
 */

const round = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

const FALLBACK_RATES: TaxRates = {
  vat: VAT_RATE,
  percentage: PERCENTAGE_TAX_RATE,
  corporate: CORPORATE_RATE,
  smallCorporate: SMALL_CORPORATION_RATE,
  mcit: MCIT_RATE,
  osd: OSD_RATE,
  scit: 0.05,
  withholding: 0.01,
  smallCorporateNtiCeiling: SMALL_CORPORATION_NTI_CEILING,
  smallCorporateAssetCeiling: SMALL_CORPORATION_ASSET_CEILING,
  mcitStartYear: MCIT_START_YEAR,
  source: "DEFAULTS",
  missing: [],
};

export { NO_CARRYOVERS, buildLines, computeTax, percentageTaxDue } from "../../entity-worksheet/services/taxEngine";

export function computeVat(
  figures: QuarterFigures[],
  profile: EntityProfile,
  rates: TaxRates = FALLBACK_RATES,
): VatComputation {
  const outputVat = figures.map((quarter) => round(quarter.salesVat));
  const inputVat = figures.map((quarter) => round(quarter.purchasesVat));

  if (!profile.vatRegistered) {
    const percentage = figures.map((quarter) => round((quarter.sales + quarter.icSales) * rates.percentage));
    return {
      outputVat: figures.map(() => 0),
      inputVat: figures.map(() => 0),
      netVat: figures.map(() => 0),
      payable: percentage,
      carriedIn: figures.map(() => 0),
    };
  }

  const netVat = outputVat.map((output, index) => round(output - inputVat[index]));
  const carriedIn: number[] = [];
  const payable: number[] = [];
  let carry = 0;

  netVat.forEach((net) => {
    carriedIn.push(round(carry));
    const settled = round(net - carry);
    payable.push(Math.max(0, settled));
    carry = settled < 0 ? round(-settled) : 0;
  });

  return { outputVat, inputVat, netVat, payable, carriedIn };
}

export const RATES = { VAT_RATE, CORPORATE_RATE, MCIT_RATE, OSD_RATE };
