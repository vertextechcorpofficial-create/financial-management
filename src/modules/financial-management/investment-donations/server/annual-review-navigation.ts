import { INVESTMENT_DONATIONS_WORKSPACES } from "../workspaces";
import { workspaceRole, type LedgerAccess } from "./permissions";

export function annualReviewDestination(access: LedgerAccess | null) {
  return INVESTMENT_DONATIONS_WORKSPACES.find(row =>
    row.key.startsWith("annual-review-") && workspaceRole(access, row.key) !== "none");
}
