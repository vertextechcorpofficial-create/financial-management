import "server-only";

/**
 * The 1702Q arithmetic, read from the entity worksheet's engine rather than copied.
 *
 * The cumulative year-to-date lines, the MCIT/RCIT arbitrage and the cost-of-sales bases exist
 * in one file for the whole desk (`entity-worksheet/services/taxEngine.ts`). A second copy drifts:
 * the three that did exist had to be brought back into line by hand, and one of them still
 * disagreed with the worksheet on any quarter with a taxable loss.
 */
export {
  NO_CARRYOVERS,
  RATES,
  buildLines,
  computeTax,
  computeVat,
  percentageTaxDue,
} from "../../entity-worksheet/services/taxEngine";
