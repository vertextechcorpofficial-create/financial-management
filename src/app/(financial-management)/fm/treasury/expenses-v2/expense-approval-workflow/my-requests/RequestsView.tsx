"use client";

import { IndependentExpenseFiling } from "@/modules/financial-management/treasury/expenses-v2/expense-approval-workflow/workspaces/IndependentExpenseFiling";
import { AuthorityView } from "../_components/AuthorityView";

export function RequestsView() {
  return <AuthorityView view="my-requests">{() => <IndependentExpenseFiling showForm={false} embedded />}</AuthorityView>;
}
