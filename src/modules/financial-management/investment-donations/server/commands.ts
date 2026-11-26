"use server";

import { z } from "zod";
import sample from "../fixtures/malaya.json";
import { INVESTMENT_DONATIONS_WORKSPACES, type WorkspaceKey } from "../workspaces";
import { journalCsv } from "../ledger";
import { financialStatementExport } from "../reporting";
import { ledgerAccess } from "./access";
import { ledgerDatabase } from "./database";
import { allows, canExportFullLedger, canManageMaster, canUseDataTools, workspaceRole } from "./permissions";
import { MasterDataError, masterCommand } from "./master-data.mjs";
import { saveMasterData } from "./storage.mjs";
import { projectLedger } from "./projections.mjs";
import { readDirectusLedger } from "./read-directus-ledger";
import { backupLedger, dataToolsEnabled, restoreLedger, sampleBackup } from "./data-tools.mjs";
import * as actions from "./actions";
import { combineCsvWorkpapers } from "./export-workpapers.mjs";
import { checkRemoteLedgerCommandStatus, remoteLedgerBackup } from "./remote-client";
import { ledgerClient } from "./directus-ledger.mjs";
import { createPosting, getPosting, postingHash } from "./directus-postings.mjs";
import { prepareLedgerCommand, CommandValidationError } from "./command-dispatch";
import { applyLedgerCommand, createLedgerState, StateEngineError } from "./state-engine.mjs";
import { executeLocalLedgerCommand, checkLocalLedgerCommandStatus } from "./local-command-client";
import type { LedgerCommandStatus } from "../client-idempotency";

type CommandResult = { ok: false; message: string; state?: "unknown" | "failed" } | { ok: true; number?: number | null; revision?: number; id?: string };
const failure = (message: string): { ok: false; message: string } => ({ ok: false, message });
const operation = z.object({ operation: z.enum(["cash", "reverse", "reconciliation", "period", "donation-document", "trade", "annual-review", "issue-certificate", "giving", "cgt-reconcile", "cgt-filing", "subscribe", "capital", "master", "prices"]), input: z.unknown(), commandId: z.string().uuid().optional(), expectedActor: z.number().int().positive().optional() }).strict();

/** Next Server Actions enforce same-origin transport; actor/permissions are resolved per call. */
export async function executeLedgerCommand(input: unknown): Promise<CommandResult> {
  const request = operation.safeParse(input);
  const direct = input && typeof input === "object" ? input as Record<string, unknown> : null;
  const kind = request.success ? request.data.operation : direct?.type;
  const payload = request.success ? request.data.input : input;
  try {
    if (direct && Object.hasOwn(direct, "commandId") && !request.success) return { ok: false, state: "unknown", message: "Invalid ledger command envelope. No command was sent." };
    if (process.env.CGL_MYSQL_URL && request.success && request.data.commandId) {
      const access = await ledgerAccess();
      if (!access) return { ok: false, state: "unknown", message: "Sign in to check or retry the pending ledger command." };
      if (request.data.expectedActor !== undefined && access.id !== request.data.expectedActor) return { ok: false, state: "unknown", message: "The signed-in user changed. The pending command has been retained for its original user." };
      return await executeLocalLedgerCommand(ledgerDatabase(), { commandId: request.data.commandId,
        operation: request.data.operation, input: request.data.input }, access);
    }
    if (!process.env.CGL_MYSQL_URL) {
      if (!request.success || !request.data.commandId) return failure("Use the ledger client with a valid command ID before saving.");
      const access = await ledgerAccess();
      if (!access) return { ok: false, state: "unknown", message: "Sign in before saving ledger entries. The pending command ID has been retained." };
      if (request.data.expectedActor !== undefined && access.id !== request.data.expectedActor) return { ok: false, state: "unknown", message: "The signed-in user changed. The pending command has been retained for its original user." };
      if (request.data.input && typeof request.data.input === "object" && Object.hasOwn(request.data.input, "actor")) {
        return failure("Ledger actors are resolved from the verified session.");
      }
      const prepared = prepareLedgerCommand(request.data.operation, request.data.input, access);
      const current = await readDirectusLedger();
      const currentWithPosting = current as typeof current & { posting?: { stateRevision?: number }; auditEvents?: unknown[]; masterEvents?: unknown[]; periodEvents?: unknown[]; reconciliationEvents?: unknown[]; annualReviewEvents?: unknown[] };
      const currentRevision = Number(currentWithPosting.posting?.stateRevision ?? Math.max(0, ...current.journal.map((row: { no: number }) => row.no)));
      const existing = await getPosting(request.data.commandId);
      if (existing) {
        if (Number(existing.actor) !== access.id || existing.payload_hash !== postingHash(request.data.operation, request.data.input)) {
          return failure("This command ID was already used for different input or another user.");
        }
        return { ok: true, id: String(existing.id), revision: Number(existing.state_revision), replayed: true } as CommandResult & { replayed: boolean };
      }
      const registerSnapshot = current.registers as typeof current.registers & { periods?: unknown; recons?: unknown };
      const transition = applyLedgerCommand(createLedgerState({ journal: current.journal, registers: registerSnapshot,
        periods: registerSnapshot.periods, recons: registerSnapshot.recons, auditEvents: currentWithPosting.auditEvents,
        masterEvents: currentWithPosting.masterEvents, periodEvents: currentWithPosting.periodEvents, reconciliationEvents: currentWithPosting.reconciliationEvents,
        annualReviewEvents: currentWithPosting.annualReviewEvents }),
        { operation: request.data.operation, input: prepared.payload, actor: access.id, commandId: request.data.commandId });
      const saved = await createPosting({ commandId: request.data.commandId, stateRevision: currentRevision + 1, actor: access.id,
        operation: request.data.operation, postingDate: String((request.data.input as { date?: string; month?: string })?.date ?? `${(request.data.input as { month?: string })?.month ?? new Date().toISOString().slice(0, 7)}-01`),
        input: request.data.input, snapshot: transition.snapshot });
      const transitionResult = transition.result as { number?: number; journalNumber?: number };
      return { ok: true, id: String(saved.id ?? request.data.commandId), revision: Number(saved.state_revision ?? currentRevision + 1),
        number: transitionResult.number ?? transitionResult.journalNumber ?? null };
    }
    if (kind === "master" || kind === "prices") {
      const parsed = kind === "master" ? masterCommand.safeParse(payload) : null;
      if (kind === "master" && !parsed?.success) return failure("Invalid master-data command.");
      const access = await ledgerAccess();
      const entity = kind === "prices" ? "prices" : parsed!.data!.entity;
      if (!canManageMaster(access, entity)) return failure("You do not have permission to maintain this register.");
      const value = kind === "prices" ? { ...(payload as object), type: "prices" } : parsed!.data!;
      const result = await saveMasterData(ledgerDatabase(), value, access!.id);
      return { ok: true, revision: result.revision, id: result.id };
    }
    switch (kind) {
      case "cash": return actions.recordCashEntry(payload);
      case "reverse": return actions.reverseEntry(payload);
      case "reconciliation": return actions.saveReconciliation(payload);
      case "period": return actions.submitPeriod(payload);
      case "donation-document": return actions.saveDonationDocument(payload);
      case "trade": return actions.recordTrade(payload);
      case "annual-review": return actions.saveAnnualReview(payload);
      case "issue-certificate": return actions.issueCertificate(payload);
      case "giving": return actions.recordGiving(payload);
      case "cgt-reconcile": return actions.reconcileCgt(payload);
      case "cgt-filing": return actions.saveDonationDocument(payload, true);
      case "subscribe": return actions.createSubscription(payload);
      case "capital": return actions.recordCapitalAction(payload);
      default: return failure("Unknown ledger command.");
    }
  } catch (error) {
    const validation = error instanceof MasterDataError || error instanceof CommandValidationError || error instanceof StateEngineError;
    const message = validation ? error.message : "The command could not be confirmed. Retry the same command after checking your connection.";
    return { ok: false, message, ...(validation ? { state: "failed" as const } : (!process.env.CGL_MYSQL_URL || (request.success && request.data.commandId) ? { state: "unknown" as const } : {})) };
  }
}

export async function getLedgerCommandIdentity() {
  try {
    const access = await ledgerAccess();
    return access ? { ok: true as const, id: access.id } : failure("Sign in to access pending ledger commands.");
  } catch { return failure("The current ledger identity could not be verified."); }
}

export async function checkLedgerCommandStatus(commandId: string, expectedActor?: number): Promise<LedgerCommandStatus> {
  const unknown = (message: string): LedgerCommandStatus => ({ ok: false, state: "unknown", commandId, message });
  if (!z.string().uuid().safeParse(commandId).success) return unknown("Enter a valid ledger command ID.");
  try {
    const access = await ledgerAccess();
    if (!access) return unknown("Sign in to check the pending ledger command.");
    if (expectedActor !== undefined && access.id !== expectedActor) return unknown("The signed-in user changed. The pending command has been retained for its original user.");
    if (process.env.CGL_MYSQL_URL) return await checkLocalLedgerCommandStatus(ledgerDatabase(), commandId, access);
    if (!process.env.CGL_MYSQL_URL) {
      const posting = await getPosting(commandId);
      if (!posting) return { ok: false, state: "not-found", commandId, message: "No committed posting exists for this command ID." };
      if (Number(posting.actor) !== access.id) return unknown("This posting belongs to a different signed-in user.");
      const result = typeof posting.snapshot === "string" ? JSON.parse(posting.snapshot)?.result ?? {} : posting.snapshot?.result ?? {};
      return { ok: true, state: "completed", commandId, number: result.number ?? result.journalNumber ?? null, id: String(posting.id) };
    }
    return await checkRemoteLedgerCommandStatus(access.userToken ?? "", commandId);
  } catch {
    return unknown("The command status is unavailable or permission could not be verified. Its pending ID has been retained.");
  }
}

export async function readLedgerWorkspace(input: unknown) {
  const definition = INVESTMENT_DONATIONS_WORKSPACES.find(item => item.key === input);
  if (!definition) return failure("Unknown ledger workspace.");
  try {
    const access = await ledgerAccess();
    if (!allows(workspaceRole(access, definition.key), "view")) return failure("You do not have permission to view this workspace.");
    const { journal, registers } = await readDirectusLedger();
    return { ok: true as const, workspace: definition.key, role: workspaceRole(access, definition.key),
      ...projectLedger(definition.key, journal, registers) };
  } catch {
    return failure("Ledger data is unavailable.");
  }
}

/** Export uses the identical projection as the browser, never the complete registers. */
export async function exportLedgerWorkspace(workspace: WorkspaceKey, format: "json" | "csv" = "json") {
  if (format !== "json" && format !== "csv") return failure("Unsupported export format.");
  const result = await readLedgerWorkspace(workspace);
  if (!result.ok) return result;
  return { ok: true as const, filename: `capital-giving-${workspace}.${format}`,
    content: format === "csv" ? journalCsv(result.journal) : JSON.stringify({ workspace, journal: result.journal, registers: result.registers }, null, 2) };
}

export async function exportLedgerBackup() {
  try {
    const access = await ledgerAccess();
    if (!canExportFullLedger(access)) return failure("Permission to view every ledger workspace is required for a full backup.");
    if (process.env.CGL_MYSQL_URL) return { ok: true as const, backup: await backupLedger(ledgerDatabase()) };
    if (!access?.userToken) return failure("A verified session is required for a full backup.");
    return { ok: true as const, backup: await remoteLedgerBackup(access.userToken) };
  } catch {
    return failure("The backup could not be exported.");
  }
}

export async function exportFullJournal() {
  try {
    if (!canExportFullLedger(await ledgerAccess())) return failure("Permission to view every ledger workspace is required for a full export.");
    const { journal } = await readDirectusLedger();
    return { ok: true as const, filename: "capital-giving-full-journal.csv", content: journalCsv(journal) };
  } catch {
    return failure("The journal export is unavailable.");
  }
}

export async function exportFinancialStatements(input: unknown = {}) {
  try {
    if (!canExportFullLedger(await ledgerAccess())) return failure("Permission to view every ledger workspace is required for a full financial-statement export.");
    const result = await exportLedgerStatements(input);
    if (!result.ok) return result;
    return { ok: true as const, filename: `capital-giving-financial-statements-through-${result.lastEntry}.csv`,
      content: combineCsvWorkpapers({ journal: result.journal, trialBalance: result.trialBalance, marketMemo: result.marketMemo ?? "" }), lastEntry: result.lastEntry };
  } catch {
    return failure("The financial statement export is unavailable.");
  }
}

export async function exportLedgerStatements(input: unknown = {}) {
  const parsed = z.object({ afterEntry: z.number().int().nonnegative().optional(), includeClosing: z.boolean().optional() }).strict().safeParse(input);
  if (!parsed.success) return failure("Invalid statement export options.");
  try {
    const access = await ledgerAccess();
    if (!allows(workspaceRole(access, "transactions"), "view")) return failure("Transactions view permission is required to export financial statements.");
    const { journal, registers } = await readDirectusLedger();
    const mapping = Object.fromEntries((registers.accountMappings ?? []).filter((row: { id?: unknown; coaCode?: unknown }) =>
      typeof row.id === "string" && /^\d{4}$/.test(row.id) && typeof row.coaCode === "string" && row.coaCode)
      .map((row: { id?: unknown; coaCode?: unknown }) => [String(row.id), String(row.coaCode)]));
    const result = financialStatementExport(journal, registers, mapping, parsed.data.afterEntry ?? 0, parsed.data.includeClosing ?? true);
    return { ok: true as const, journal: result.journal, trialBalance: result.trialBalance, lastEntry: result.lastEntry,
      ...(allows(workspaceRole(access, "portfolio-rebalancing"), "view") ? { marketMemo: result.marketMemo } : {}) };
  } catch (error) {
    return failure(error instanceof Error && error.message.startsWith("Map ledger account ") ? error.message : "The financial statement export is unavailable.");
  }
}

export async function readLedgerActivity(limit = 100) {
  if (!Number.isInteger(limit) || limit < 1 || limit > 500) return failure("Select between 1 and 500 activity records.");
  try {
    if (!canExportFullLedger(await ledgerAccess())) return failure("Permission to view every workspace is required to inspect the full activity log.");
    const sources = ["cgl_audit_events", "cgl_master_events", "cgl_period_events", "cgl_reconciliation_events", "cgl_annual_review_events"];
    const parse = (value: unknown): unknown => typeof value === "string" ? JSON.parse(value) : value ?? null;
    const batches = process.env.CGL_MYSQL_URL
      ? await ledgerDatabase().transaction(async trx => Promise.all(sources.map(table => trx(table).orderBy("id", "desc").limit(limit).select("*"))),
        { isolationLevel: "repeatable read", readOnly: true })
      : await Promise.all(sources.map(table => ledgerClient()(table, { query: { sort: "-id", limit: String(limit) } })));
    if (batches.some(rows => !Array.isArray(rows))) throw new Error("Invalid activity response.");
    const events = batches.flatMap((rows, index) => rows.map((row: Record<string, unknown>) => ({
        id: `${sources[index]}:${String(row.id)}`,
        at: row.occurred_at instanceof Date ? row.occurred_at.toISOString() : String(row.occurred_at),
        actor: Number(row.actor), action: String(row.action),
        entity: String(row.entity ?? row.entry_id ?? row.month_start ?? row.fiscal_start ?? ""),
        before: parse(row.before_state), after: parse(row.after_state ?? row.payload ?? row.checks),
      }))).sort((a, b) => b.at.localeCompare(a.at) || b.id.localeCompare(a.id)).slice(0, limit);
    return { ok: true as const, events };
  } catch {
    return failure("The activity log is unavailable. No records were changed.");
  }
}

export async function restoreLedgerBackup(input: unknown) {
  try {
    if (!dataToolsEnabled()) return failure("Data tools are disabled in this environment.");
    const access = await ledgerAccess();
    if (!canUseDataTools(access)) return failure("Full-ledger administrative approval is required.");
    const parsed = z.object({ backup: z.unknown(), confirmation: z.literal("RESTORE EMPTY LEDGER") }).strict().safeParse(input);
    if (!parsed.success) return failure("Confirm RESTORE EMPTY LEDGER before importing.");
    const backup = typeof parsed.data.backup === "string" && parsed.data.backup.length <= 20_000_000 ? JSON.parse(parsed.data.backup) : parsed.data.backup;
    return { ok: true as const, ...await restoreLedger(ledgerDatabase(), backup, access!.id) };
  } catch (error) {
    return failure(error instanceof MasterDataError ? error.message : "Import failed; no changes were committed.");
  }
}

export async function loadLedgerSample(input: unknown) {
  try {
    if (!dataToolsEnabled()) return failure("Data tools are disabled in this environment.");
    const access = await ledgerAccess();
    if (!canUseDataTools(access)) return failure("Full-ledger administrative approval is required.");
    if (!z.object({ confirmation: z.literal("LOAD SAMPLE INTO EMPTY LEDGER") }).strict().safeParse(input).success) return failure("Confirm LOAD SAMPLE INTO EMPTY LEDGER before importing examples.");
    return { ok: true as const, ...await restoreLedger(ledgerDatabase(), sampleBackup(sample), access!.id, "sample") };
  } catch (error) {
    return failure(error instanceof MasterDataError ? error.message : "Sample import failed; no changes were committed.");
  }
}
