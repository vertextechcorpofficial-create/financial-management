import { prepareLedgerCommand, executePreparedCommand, CommandValidationError, InvalidCommand } from "../../command-dispatch";
import { MasterDataError } from "../../master-data.mjs";
import { registerLedgerEndpoint } from "../endpoint.mjs";
import { readLedgerBackup } from "../../read-ledger-backup.mjs";

export default function register(router: Parameters<typeof registerLedgerEndpoint>[0], context: Parameters<typeof registerLedgerEndpoint>[1]) {
  registerLedgerEndpoint(router, context, {
    prepare: prepareLedgerCommand,
    execute: executePreparedCommand,
    readBackup: readLedgerBackup,
    isDomainError: (error: unknown) => error instanceof CommandValidationError || error instanceof InvalidCommand || error instanceof MasterDataError,
  });
}
