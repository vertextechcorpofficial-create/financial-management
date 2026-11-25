import { canExportFullLedger } from "./permissions.js";
import { assertStorageReady, readStoredRegisters, readStoredJournal } from "./storage.mjs";
import { createBackup } from "./data-tools.mjs";
import { EndpointError } from "./directus-extension/command-runner.mjs";
const auxiliary = { periods: "cgl_periods", auditEvents: "cgl_audit_events", reconciliations: "cgl_reconciliations",
    reconciliationEvents: "cgl_reconciliation_events", annualReviewEvents: "cgl_annual_review_events",
    periodEvents: "cgl_period_events", masterEvents: "cgl_master_events" };
export async function consistentLedgerSnapshot(database) {
    return database.transaction(async (trx) => {
        await assertStorageReady(trx);
        const [registers, journal, ...rows] = await Promise.all([
            readStoredRegisters(table => trx(table).select("*")), readStoredJournal(trx),
            ...Object.values(auxiliary).map(table => trx(table).select("*")),
        ]);
        return { registers, journal, ...Object.fromEntries(Object.keys(auxiliary).map((key, index) => [key, rows[index]])) };
    }, { isolationLevel: "repeatable read", readOnly: true });
}
/** Called only after service and Spring identity verification by the endpoint handler. */
export async function readLedgerBackup(database, access) {
    if (access?.rolesAuthoritative !== true || !canExportFullLedger(access)) {
        throw new EndpointError(403, "Permission to view every ledger workspace is required for a full backup.");
    }
    return createBackup(await consistentLedgerSnapshot(database));
}
