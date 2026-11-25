import { z } from "zod";
import { allows, canManageMaster, masterWorkspaces, workspaceRole } from "./permissions.js";
import { calendarDate, masterCommand, MasterDataError, parsePriceCsv } from "./master-data.mjs";
import { changePeriod, InvalidCommand, reconcile, recordDonationDocument, transact, updateAnnualReview } from "./transactions.mjs";
import { assertStorageReady, saveMasterData } from "./storage.mjs";
export { InvalidCommand };
export class CommandValidationError extends Error {
}
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const annualReview = z.object({ fiscalStart: z.string(), revision: z.number().int().nonnegative(),
    checks: z.array(z.boolean()).length(5).optional(), reason: z.string().trim().max(500).optional(),
    type: z.enum(["draft", "sign", "reopen"]) });
const donationDocument = z.object({ id: z.string().min(1).max(64), reference: z.string().trim().min(1).max(200),
    status: z.enum(["reference-only", "filed-manually"]).optional(), filedOn: date.optional(),
    receiptReference: z.string().trim().min(1).max(200).optional(), evidenceReference: z.string().trim().min(1).max(200).optional(),
    evidenceFileId: z.string().uuid().optional(),
    documents: z.object({ cert: z.boolean().optional(), f1800: z.boolean().optional(), deed: z.boolean().optional() }).strict().optional() }).refine(value => value.status !== "filed-manually" || Boolean(value.evidenceFileId), "Upload supporting evidence before marking filed.");
const period = z.object({ month: z.string().regex(/^[1-9]\d{3}-(0[1-9]|1[0-2])$/),
    type: z.enum(["accrue", "close", "reopen"]), reason: z.string().trim().max(500).optional() });
const statement = z.object({ cash: z.record(z.string().max(100), z.number().finite().nullable()),
    units: z.record(z.string().max(100), z.number().finite().nullable()), notes: z.record(z.string().max(100), z.string().max(500)) });
const reconciliation = z.object({ month: z.string().regex(/^[1-9]\d{3}-(0[1-9]|1[0-2])$/), revision: z.number().int().nonnegative(),
    type: z.enum(["draft", "sign", "reopen"]), statement: statement.optional(), reason: z.string().trim().min(1).max(500).optional() });
const trade = z.object({ type: z.enum(["buy", "sell"]), date, sym: z.string().min(1).max(64),
    acctType: z.enum(["Taxable", "PERA"]), account: z.enum(["1000", "1010", "1020"]),
    qty: z.number().positive().max(1e9), price: z.number().positive().max(1e12), fees: z.number().min(0).max(1e12), memo: z.string().max(250),
    picks: z.array(z.object({ lotId: z.string().min(1).max(64), qty: z.number().positive().max(1e9) })).max(100).optional(),
    method: z.enum(["fifo", "specific"]).optional(), source: z.string().trim().max(200).optional(),
    feeBreakdown: z.object({ comm: z.number().nonnegative().max(1e12), vat: z.number().nonnegative().max(1e12),
        pse: z.number().nonnegative().max(1e12), sccp: z.number().nonnegative().max(1e12) }).strict().optional() });
const gift = trade.omit({ type: true, acctType: true, fees: true, account: true }).extend({
    type: z.literal("gift"), target: z.string().min(1).max(64), valuation: z.string().trim().min(1).max(200)
});
const giving = z.discriminatedUnion("type", [gift, z.object({ type: z.literal("grant"), date, fund: z.string().min(1).max(64),
        recipient: z.string().min(1).max(64), amount: z.number().positive().max(1e12) })]);
const certificate = z.object({ date, target: z.string().min(1).max(64), certNo: z.string().trim().regex(/^[A-Za-z0-9-]{1,40}$/) });
const subscription = z.object({ date, holderId: z.string().min(1).max(64), shares: z.number().int().positive(),
    price: z.number().positive(), paid: z.number().nonnegative(), account: z.enum(["1000", "1010", "1020"]),
    kind: z.enum(["unissued", "incorporation", "increase"]).optional(), incId: z.string().max(64).optional(),
    fromDeposits: z.number().nonnegative().max(1e12).optional(), fromDffs: z.number().nonnegative().max(1e12).optional(),
    callDue: date.optional(), callDate: date.optional(), callRef: z.string().trim().min(1).max(200).optional() });
const id = z.string().min(1).max(64);
const cert = z.string().trim().regex(/^[A-Za-z0-9-]{1,40}$/);
const capital = z.discriminatedUnion("type", [
    z.object({ type: z.literal("shareTransfer"), date, target: id.optional(), targets: z.array(id).min(1).max(100).optional(), toId: id,
        shares: z.number().int().positive(), price: z.number().min(0).max(1e12).nullable().optional(), carRef: z.string().trim().min(1).max(120),
        deedRef: z.string().trim().max(200).optional(), buyerNo: cert, balanceNo: cert.optional() }),
    z.object({ type: z.literal("voidTransfer"), date, target: id, reason: z.string().trim().min(1).max(500),
        evidenceRef: z.string().trim().min(1).max(200).optional(), confirmHistorical: z.boolean().optional() }),
    z.object({ type: z.literal("declareDividend"), date, perShare: z.number().positive().max(1e6), confirmUnrestricted: z.literal(true),
        payDate: date, recordDate: date.optional(), boardRef: z.string().trim().min(1).max(200).optional() }),
    z.object({ type: z.literal("payDividend"), date, target: id, account: z.enum(["1000", "1010", "1020"]) }),
]);
const cash = z.object({ type: z.enum(["transfer", "fee", "interest", "dividend", "taxpay", "expaccrue", "exppay", "accrueDividend", "accrueInterest", "collectIncome", "cashDonation", "subcollect", "borrow", "repay", "contribution"]), date,
    amount: z.number().positive().max(1e12), account: z.enum(["1000", "1010", "1020"]), target: z.string().max(100).optional(), memo: z.string().max(250), payDate: date.optional(),
    name: z.string().trim().max(120).optional(), rate: z.number().min(0).max(100).optional(),
    source: z.enum(["deposit", "advance", "opening", "Deposit for future stock subscription", "Advance from stockholder", "Opening balance"]).optional(),
    secCriteriaMet: z.boolean().optional(), confirmCriteria: z.boolean().optional(), secApplicationRef: z.string().trim().max(200).optional(),
    requestedShares: z.number().int().positive().max(1e12).optional(), proceeds: z.enum(["existing", "cash"]).optional(), scheduled: z.boolean().optional(),
    fwtRate: z.number().min(0).max(100).optional(), sym: z.string().max(64).optional(),
    principal: z.number().nonnegative().max(1e12).optional(), interest: z.number().nonnegative().max(1e12).optional() });
const reversal = z.object({ id: z.string().uuid(), date, reason: z.string().trim().min(1).max(200) });
const cashPermissions = {
    transfer: "inflows-investing", interest: "inflows-investing", fee: "portfolio-rebalancing", taxpay: "tax-compliance",
    expaccrue: "portfolio-rebalancing", exppay: "portfolio-rebalancing", accrueDividend: "inflows-investing", accrueInterest: "inflows-investing",
    collectIncome: "inflows-investing", cashDonation: "charitable-giving", subcollect: "inflows-investing", borrow: "inflows-investing",
    repay: "inflows-investing", contribution: "capital-stock", dividend: "inflows-investing",
};
const price = z.object({ sym: z.string().trim().min(1).max(64).regex(/^[A-Za-z0-9_.-]+$/),
    price: z.number().finite().positive().max(1e12), date: calendarDate, source: z.string().trim().min(1).max(200) }).strict();
const prices = z.object({ type: z.literal("prices").optional(), revision: z.number().int().nonnegative(),
    csv: z.string().max(1_000_000).optional(), prices: z.array(price).min(1).max(5000).optional() }).strict();
function parse(schema, input, message) {
    const result = schema.safeParse(input);
    if (!result.success)
        throw new CommandValidationError(message);
    return result.data;
}
/** Validate and authorize on every request, before looking up an idempotent response. */
export function prepareLedgerCommand(operation, input, access) {
    const raw = input && typeof input === "object" && !Array.isArray(input)
        ? Object.fromEntries(Object.entries(input).filter(([key]) => key !== "actor")) : input;
    let payload;
    let requiredWorkspace;
    let requiredRole = "prepare";
    let permissionMessage = "You do not have permission for this ledger action.";
    switch (operation) {
        case "annual-review": {
            const value = parse(annualReview, raw, "Invalid annual review request.");
            permissionMessage = "You do not have permission for this review action.";
            payload = value;
            requiredWorkspace = "annual-review";
            requiredRole = value.type === "draft" ? "prepare" : "approve";
            break;
        }
        case "donation-document":
        case "cgt-filing":
            permissionMessage = "Approval permission is required.";
            payload = { ...parse(donationDocument, raw, "Enter a document reference."), cgt: operation === "cgt-filing" };
            requiredWorkspace = operation === "cgt-filing" ? "tax-compliance" : "charitable-giving";
            requiredRole = "approve";
            break;
        case "period": {
            const value = parse(period, raw, "Invalid period command.");
            permissionMessage = "Period approval permission is required.";
            payload = value;
            requiredWorkspace = "period-close";
            requiredRole = value.type === "accrue" ? "prepare" : "approve";
            break;
        }
        case "reconciliation": {
            const value = parse(reconciliation, raw, "Invalid reconciliation values.");
            permissionMessage = "You do not have permission for this reconciliation action.";
            payload = value;
            requiredWorkspace = "monthly-reconciliation";
            requiredRole = value.type === "draft" ? "prepare" : "approve";
            break;
        }
        case "cgt-reconcile":
            payload = { ...parse(z.object({ fiscalStart: date, date }), raw, "Enter the fiscal start and posting dates."), type: "cgtClose" };
            requiredWorkspace = "tax-compliance";
            requiredRole = "approve";
            break;
        case "trade":
            payload = parse(trade, raw, "Enter valid trade details and lot quantities.");
            requiredWorkspace = "portfolio-rebalancing";
            break;
        case "giving": {
            const value = parse(giving, raw, "Enter valid gift or grant details.");
            payload = value.type === "gift" ? { ...value, acctType: "Taxable", fees: 0, account: "1000" } : value;
            requiredWorkspace = "charitable-giving";
            break;
        }
        case "issue-certificate":
            payload = { ...parse(certificate, raw, "Enter a valid date and certificate number."), type: "issue" };
            requiredWorkspace = "capital-stock";
            requiredRole = "approve";
            break;
        case "subscribe":
            payload = { ...parse(subscription, raw, "Enter valid subscription details."), type: "subscribe" };
            requiredWorkspace = "capital-stock";
            break;
        case "capital": {
            const value = parse(capital, raw, "Enter valid capital stock details.");
            if (value.type === "declareDividend") {
                const day = new Date(`${value.payDate}T00:00:00Z`);
                if (!Number.isFinite(+day) || day.toISOString().slice(0, 10) !== value.payDate || value.payDate < value.date) {
                    throw new CommandValidationError("Payment date must be on or after the declaration.");
                }
            }
            payload = value;
            requiredWorkspace = "capital-stock";
            requiredRole = "approve";
            break;
        }
        case "cash": {
            const value = parse(cash, raw, "Enter a valid date, amount and cash account.");
            payload = value;
            requiredWorkspace = cashPermissions[value.type];
            // Subscription collections are offered in both Section 11 workspaces.
            // A capital preparer needs no unrelated inflows permission to use its row action.
            if (value.type === "subcollect" && access && !allows(workspaceRole(access, requiredWorkspace), "prepare") &&
                allows(workspaceRole(access, "capital-stock"), "prepare"))
                requiredWorkspace = "capital-stock";
            break;
        }
        case "reverse":
            payload = { ...parse(reversal, raw, "Enter a reversal date and reason."), type: "reverse" };
            requiredWorkspace = "transactions";
            requiredRole = "approve";
            break;
        case "master":
        case "prices": {
            let entity;
            if (operation === "master") {
                const value = parse(masterCommand, raw, "Invalid master-data command.");
                payload = { ...value, type: "master" };
                entity = value.entity;
            }
            else {
                const value = parse(prices, raw, "Invalid price command.");
                if ((value.csv === undefined) === (value.prices === undefined))
                    throw new CommandValidationError("Provide either CSV or manual prices.");
                let rows;
                try {
                    rows = value.prices ?? parsePriceCsv(value.csv);
                }
                catch {
                    throw new CommandValidationError("Invalid price CSV. Use sym,price,date,source columns.");
                }
                payload = { type: "prices", revision: value.revision, prices: parse(z.array(price).min(1).max(5000), rows, "Invalid price values.") };
                entity = "prices";
            }
            if (!canManageMaster(access, entity))
                throw new CommandValidationError("You do not have permission to maintain this register.");
            requiredWorkspace = masterWorkspaces[entity];
            requiredRole = entity === "prices" ? "prepare" : "approve";
            break;
        }
        default: throw new CommandValidationError("Unknown ledger command.");
    }
    if (!access || !Number.isSafeInteger(access.id) || access.id < 1 || !allows(workspaceRole(access, requiredWorkspace), requiredRole)) {
        throw new CommandValidationError(permissionMessage);
    }
    return { operation, payload: { ...payload, actor: access.id }, requiredWorkspace, requiredRole };
}
/** Execute only a server-prepared command; never accept this object from the client. */
export async function executePreparedCommand(database, prepared) {
    const { operation, payload } = prepared;
    try {
        switch (operation) {
            case "annual-review":
                await updateAnnualReview(database, payload);
                break;
            case "donation-document":
            case "cgt-filing":
                await recordDonationDocument(database, payload);
                break;
            case "period":
                await changePeriod(database, payload);
                break;
            case "reconciliation":
                await database.transaction(trx => reconcile(trx, payload));
                break;
            case "master":
            case "prices": {
                const { actor, ...command } = payload;
                const result = await saveMasterData(database, command, actor);
                return { ok: true, revision: result.revision, id: result.id };
            }
            case "cash":
            case "reverse":
            case "trade":
            case "giving":
            case "cgt-reconcile":
            case "issue-certificate":
            case "subscribe":
            case "capital":
                return database.transaction(async (trx) => {
                    await assertStorageReady(trx);
                    const result = await transact({ transaction: (callback) => callback(trx) }, payload);
                    return { ok: true, number: result.number };
                });
            default: throw new CommandValidationError("Unknown ledger command.");
        }
        return { ok: true };
    }
    catch (error) {
        if (error instanceof MasterDataError)
            throw new InvalidCommand(error.message);
        throw error;
    }
}
export async function dispatchLedgerCommand(database, operation, input, access) {
    return executePreparedCommand(database, prepareLedgerCommand(operation, input, access));
}
