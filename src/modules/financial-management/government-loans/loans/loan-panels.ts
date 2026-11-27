export const loanPanels = ["overview", "statements", "changes", "instructions"] as const;
export type LoanPanel = typeof loanPanels[number];
