/** Errors the loan services raise on purpose, so routes can answer with a sentence and a field. */
export class LoanValidationError extends Error {
  fieldErrors: Record<string, string[]>;

  constructor(message: string, fieldErrors: Record<string, string[]> = {}) {
    super(message);
    this.name = "LoanValidationError";
    this.fieldErrors = fieldErrors;
  }
}

export class LoanConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LoanConflictError";
  }
}

export class LoanNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LoanNotFoundError";
  }
}
