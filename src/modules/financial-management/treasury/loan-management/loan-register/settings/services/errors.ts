/**
 * The loan routes' `handleRouteError` identifies business refusals with `instanceof` against the
 * loan-register error classes, so this module re-exports those exact constructors. A local copy
 * would compile and then turn every refusal into a 500.
 */
export {
  LoanConflictError,
  LoanNotFoundError,
  LoanValidationError,
} from "@/modules/financial-management/treasury/loan-management/loan-register/services/errors";
