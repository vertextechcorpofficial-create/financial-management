import type { Knex } from "knex";
import type { LedgerAccess } from "./permissions";
import type { LedgerCommandStatus } from "../client-idempotency";
import { runCommand, commandStatus } from "./directus-extension/command-runner.mjs";
import { prepareLedgerCommand, executePreparedCommand, CommandValidationError, InvalidCommand } from "./command-dispatch";
import { MasterDataError } from "./master-data.mjs";

const engine = { prepare: prepareLedgerCommand, execute: executePreparedCommand,
  isDomainError: (error: unknown) => error instanceof InvalidCommand || error instanceof CommandValidationError || error instanceof MasterDataError };

/** The runner binds every engine callback to the receipt's outer transaction. */
export async function executeLocalLedgerCommand(database: Knex, command: { commandId: string; operation: string; input: unknown }, access: LedgerAccess) {
  return runCommand(database, command, access, engine);
}

export async function checkLocalLedgerCommandStatus(database: Knex, commandId: string, access: LedgerAccess): Promise<LedgerCommandStatus> {
  return commandStatus(database, commandId, access, prepareLedgerCommand) as Promise<LedgerCommandStatus>;
}
