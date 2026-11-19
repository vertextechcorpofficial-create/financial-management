import type { ReactNode } from "react";
import { ExpenseApprovalHeader } from "./ExpenseApprovalHeader";

/** Keep the module's standard account header inside its own route boundary. */
export default function ExpenseApprovalWorkflowLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
      <ExpenseApprovalHeader />
      <main className="min-h-0 min-w-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-y-contain">
        {children}
      </main>
    </div>
  );
}
