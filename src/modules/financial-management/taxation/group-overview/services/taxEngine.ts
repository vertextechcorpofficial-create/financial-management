import "server-only";

/**
 * The 1702Q arithmetic, read from the entity worksheet's engine rather than copied.
 *
 * A group row is the same 1702Q arithmetic as the worksheet, so it reads the worksheet's engine
 * instead of keeping a second copy. The copy this file used to hold had to be patched by hand
 * whenever the worksheet changed, and it disagreed with it on any quarter with a taxable loss.
 */
export {
  NO_CARRYOVERS,
  RATES,
  buildLines,
  computeTax,
  computeVat,
  percentageTaxDue,
} from "../../entity-worksheet/services/taxEngine";
