"use client";

import { useState } from "react";

import { LoanPaymentsWorkspace } from "./LoanPaymentsWorkspace";
import { PaymentsDirectory } from "./PaymentsDirectory";

/**
 * Two levels, one module: the loan directory, and the workspace of the loan you opened.
 *
 * The desk picks a loan first because every figure here belongs to a loan: what is due, which
 * installment is next, and what has already been received against it.
 */
export function PaymentsModule({ initialLoanId = null }: { initialLoanId?: number | null }) {
  const [openLoanId, setOpenLoanId] = useState<number | null>(initialLoanId);

  if (openLoanId === null) return <PaymentsDirectory onOpenLoan={setOpenLoanId} />;

  return <LoanPaymentsWorkspace key={openLoanId} loanId={openLoanId} onBack={() => setOpenLoanId(null)} />;
}
