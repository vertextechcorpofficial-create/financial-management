import type { OperationsExpense } from "../operationsTypes";

export function receiptReferences(value: string | null): string[] {
  if (!value?.trim()) return [];
  let values: unknown[];
  try {
    const parsed: unknown = JSON.parse(value);
    values = Array.isArray(parsed) ? parsed : [parsed];
  } catch { values = value.split(/\r?\n/); }
  return [...new Set(values.filter((item): item is string => typeof item === "string").map(item => item.trim()).filter(Boolean))];
}

export function financeChecks(expense: OperationsExpense) {
  return [
    { name: "Receipt reference", state: receiptReferences(expense.receipt_url).length ? "RECORDED" : "MISSING", detail: "A reference is not proof of authenticity or complete category-specific evidence." },
    { name: "Business purpose", state: expense.remarks?.trim() ? "RECORDED" : "MISSING", detail: "Finance must independently confirm business relevance." },
    { name: "Category / COA", state: expense.coa_id || expense.categoryName ? "UNVERIFIED" : "MISSING", detail: "An approved, unambiguous category mapping is required." },
    { name: "Available funds", state: "UNVERIFIED", detail: "An authoritative budget reservation and funds check is required." },
    { name: "Legal company owner", state: "UNVERIFIED", detail: "The employee’s current company is not the expense’s verified legal owner." },
    { name: "Workflow storage", state: expense.source === "INDEPENDENT" ? "RECORDED" : "UNVERIFIED", detail: expense.source === "INDEPENDENT" ? "This request exists only in the workflow ledger, not in Expense Creation V2 or the legacy approval tables. Decision authority still requires independent verification." : "A shared backend guard must prevent legacy and this workflow from deciding the same expense." },
  ];
}

export const requesterName = (expense: OperationsExpense) => [expense.created_by?.user_fname, expense.created_by?.user_lname].filter(Boolean).join(" ") || "Requester unavailable";
