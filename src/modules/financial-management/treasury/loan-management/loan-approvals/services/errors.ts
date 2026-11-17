/**
 * The loan tree's error vocabulary, re-exported from the register copy.
 *
 * `loan-management/_lib/http.ts` decides the status code with `instanceof` against the register's
 * classes, so a look-alike set defined here would never match and every business refusal would
 * surface as a 500. One class set, imported, not copied.
 */
export {
  LoanConflictError,
  LoanNotFoundError,
  LoanValidationError,
} from "@/modules/financial-management/treasury/loan-management/loan-register/services/errors";
