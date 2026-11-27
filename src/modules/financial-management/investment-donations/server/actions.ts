import "server-only";

import { ledgerAccess } from "./access";
import { ledgerDatabase } from "./database";
import { CommandValidationError, executePreparedCommand, InvalidCommand, prepareLedgerCommand } from "./command-dispatch";

async function submit(operation: string, input: unknown, fallback = "Posting could not be confirmed. Refresh Transactions before retrying.") {
  try {
    const access = await ledgerAccess();
    if (!access) return { ok: false as const, message: "You do not have permission for this ledger action." };
    const prepared = prepareLedgerCommand(operation, input, access);
    return await executePreparedCommand(ledgerDatabase(), prepared);
  } catch (error) {
    return { ok: false as const, message: error instanceof InvalidCommand || error instanceof CommandValidationError ? error.message : fallback };
  }
}

export async function saveAnnualReview(input: unknown) {
  return submit("annual-review", input, "Review update could not be confirmed. Refresh before retrying.");
}
export async function saveDonationDocument(input: unknown, cgt = false) {
  return submit(cgt ? "cgt-filing" : "donation-document", input, "Document save could not be confirmed. Refresh before retrying.");
}
export async function submitPeriod(input: unknown) {
  return submit("period", input, "Period update could not be confirmed. Refresh before retrying.");
}
export async function saveReconciliation(input: unknown) {
  return submit("reconciliation", input, "The reconciliation could not be confirmed. Refresh before retrying.");
}
export async function reconcileCgt(input: unknown) { return submit("cgt-reconcile", input); }
export async function recordTrade(input: unknown) { return submit("trade", input); }
export async function recordGiving(input: unknown) { return submit("giving", input); }
export async function issueCertificate(input: unknown) { return submit("issue-certificate", input); }
export async function createSubscription(input: unknown) { return submit("subscribe", input); }
export async function recordCapitalAction(input: unknown) { return submit("capital", input); }
export async function recordCashEntry(input: unknown) { return submit("cash", input); }
export async function reverseEntry(input: unknown) { return submit("reverse", input); }
