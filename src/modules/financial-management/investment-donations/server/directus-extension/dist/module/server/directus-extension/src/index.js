import { prepareLedgerCommand, executePreparedCommand, CommandValidationError, InvalidCommand } from "../../command-dispatch.js";
import { MasterDataError } from "../../master-data.mjs";
import { registerLedgerEndpoint } from "../endpoint.mjs";
import { readLedgerBackup } from "../../read-ledger-backup.mjs";
export default function register(router, context) {
    registerLedgerEndpoint(router, context, {
        prepare: prepareLedgerCommand,
        execute: executePreparedCommand,
        readBackup: readLedgerBackup,
        isDomainError: (error) => error instanceof CommandValidationError || error instanceof InvalidCommand || error instanceof MasterDataError,
    });
}
