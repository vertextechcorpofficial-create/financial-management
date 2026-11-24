import "server-only";

import { transactionEntries, type TransactionComponent } from "../transactions/entries";
import { usesCooperativeQaDatabase } from "./directus";

export const transactionIndexEnabled = usesCooperativeQaDatabase;

export function nestedTransactionEntries(journal: { id: number; date: string; postedAt: string }, parts: readonly TransactionComponent[]) {
  return transactionIndexEnabled() && parts.length ? { transaction_entries: { create: transactionEntries(journal, parts) } } : {};
}
