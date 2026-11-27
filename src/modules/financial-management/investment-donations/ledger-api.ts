import { executeLedgerCommand as sendLedgerCommand, checkLedgerCommandStatus as readCommandStatus, getLedgerCommandIdentity } from "./server/commands";
import { createLedgerCommandClient, type LedgerCommandResult } from "./client-idempotency";

export const executeLedgerCommand = createLedgerCommandClient(sendLedgerCommand, undefined, readCommandStatus, getLedgerCommandIdentity);
export const listPendingLedgerCommands = executeLedgerCommand.listPendingLedgerCommands;
export const subscribePendingLedgerCommands = executeLedgerCommand.subscribePendingLedgerCommands;
export const checkLedgerCommandStatus = executeLedgerCommand.checkLedgerCommandStatus;
export type { PendingLedgerCommand, LedgerCommandStatus } from "./client-idempotency";

export async function submitLedger(operation: "cash" | "reverse" | "reconciliation" | "period" | "donation-document" | "trade" | "annual-review" | "issue-certificate" | "giving" | "cgt-reconcile" | "cgt-filing" | "subscribe" | "capital" | "master" | "prices", input: unknown): Promise<LedgerCommandResult> {
  return executeLedgerCommand({ operation, input });
}
