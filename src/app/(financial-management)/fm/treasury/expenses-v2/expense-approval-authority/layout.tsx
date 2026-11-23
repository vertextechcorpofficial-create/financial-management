import type { ReactNode } from "react";
import { ExpenseApprovalHeader } from "../expense-approval-workflow/ExpenseApprovalHeader";

/** Preserve the account header on the deployed Expense Approval Authority route. */
export default function ExpenseApprovalAuthorityLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
      <ExpenseApprovalHeader />
      <main className="min-h-0 min-w-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-y-contain">
        {children}
      </main>
    </div>
  );
}
