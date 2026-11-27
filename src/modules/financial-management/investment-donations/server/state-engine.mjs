/*
 * Pure, in-memory ledger state reducer.
 *
 * This module deliberately has no application, database, or environment imports.  A
 * caller may use it for previews, tests, imports, and an atomic server transition.
 * Every accepted command creates a new frozen state; a rejected command cannot
 * expose a partially changed register or journal.
 */

const DEBIT_NORMAL = new Set(["1000", "1010", "1020", "1100", "1110", "1120", "1130", "1140", "1200", "1210", "1220", "3020"]);
const CREDIT_NORMAL = new Set(["2000", "2100", "2110", "2200", "2300", "2310", "3000", "3010", "3100", "3150"]);
const CASH = new Set(["1000", "1010", "1020"]);
const ACCOUNTS = new Set(["1000", "1010", "1020", "1100", "1110", "1120", "1130", "1140", "1200", "1210", "1220", "2000", "2100", "2110", "2200", "2300", "2310", "3000", "3010", "3020", "3100", "3150", "3800", "3900", "4000", "4010", "4100", "4110", "5000", "5100", "5200", "5300", "5310", "5320", "5330"]);
import { postDividend, transferShares } from "./capital-register.mjs";
import { loanInterest, assertPriorLoanAccruals, buildLoanEntry } from "../loans.ts";
import { reconciliationLines, reconciliationApprovalError } from "../reconciliation.ts";
import { buildTrade } from "../trades.ts";
import { buildCashDonation, pooledBalance, vetDonee } from "../donations.ts";
import { reverseFinancialEntry } from "./financial-reversal.mjs";
import { applyMasterCommand, applyPrices } from "./master-data.mjs";
import { annualEvidenceFingerprint } from "./annual-evidence.mjs";
import { buildCashEntry } from "../cash-commands.ts";
const clone = value => structuredClone(value);
const isObject = value => value !== null && typeof value === "object" && !Array.isArray(value);
const fail = message => { throw new StateEngineError(message); };
const dateOK = value => typeof value === "string" && /^[1-9]\d{3}-(0[1-9]|1[0-2])-([0-2]\d|3[01])$/.test(value) &&
  Number.isFinite(+new Date(`${value}T00:00:00Z`)) && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
const monthOK = value => typeof value === "string" && /^[1-9]\d{3}-(0[1-9]|1[0-2])$/.test(value);
const cents = value => {
  if (typeof value !== "number" || !Number.isFinite(value) || !Number.isSafeInteger(Math.round(value * 100))) fail("Amounts must be finite whole-cent values.");
  return Math.round(value * 100);
};
const amount = value => cents(value) / 100;
const key = value => typeof value === "string" && value.trim().length > 0 && value.length <= 200;

export class StateEngineError extends Error {
  constructor(message, code = "invalid-command") { super(message); this.name = "StateEngineError"; this.code = code; }
}

function freeze(value, seen = new WeakSet()) {
  if (!value || typeof value !== "object" || seen.has(value)) return value;
  seen.add(value);
  for (const child of Object.values(value)) freeze(child, seen);
  return Object.freeze(value);
}

function arrays(value) { return Array.isArray(value) ? value : []; }

function normalizePeriods(value) {
  const normalize = (row, month) => { row ??= {}; return { ...row, month_start: row.month_start ?? row.monthStart ?? (row.month ? `${row.month}-01` : month), closed_at: row.closed_at ?? row.closedAt ?? null }; };
  if (Array.isArray(value)) return value.map(row => normalize(row));
  if (!isObject(value)) return [];
  return Object.entries(value).map(([month, row]) => normalize(row ?? {}, `${month}-01`));
}

function normalizeRecons(value) {
  if (Array.isArray(value)) return value;
  if (!isObject(value)) return [];
  return Object.entries(value).map(([month, row]) => ({ ...(row ?? {}), month_start: row?.month_start ?? `${month}-01` }));
}

function normalizeEvents(snapshot) {
  const events = isObject(snapshot.events) ? snapshot.events : {};
  const pick = name => arrays(snapshot[name] ?? events[name]);
  return {
    annualReviewEvents: pick("annualReviewEvents"), reconciliationEvents: pick("reconciliationEvents"),
    periodEvents: pick("periodEvents"), auditEvents: pick("auditEvents"), masterEvents: pick("masterEvents"),
  };
}

function validateEntry(entry, ids, numbers) {
  if (!isObject(entry) || !key(entry.id) || !Number.isSafeInteger(entry.no) || entry.no < 1 || !dateOK(entry.date) ||
      typeof entry.type !== "string" || !entry.type || !Array.isArray(entry.lines) || !isObject(entry.data ?? {})) fail("Invalid journal entry.");
  if (ids.has(entry.id) || numbers.has(entry.no)) fail("Journal entry identifiers must be unique.");
  ids.add(entry.id); numbers.add(entry.no);
  if (!entry.lines.length) fail("Journal entries require balanced lines.");
  let total = 0;
  for (const line of entry.lines) {
    if (!isObject(line) || typeof line.acct !== "string" || !ACCOUNTS.has(line.acct) || !Number.isFinite(line.dr) || !Number.isFinite(line.cr) ||
        line.dr < 0 || line.cr < 0 || (line.dr > 0 && line.cr > 0) || cents(line.dr) / 100 !== line.dr || cents(line.cr) / 100 !== line.cr) {
      fail("Each journal line must have one valid debit or credit.");
    }
    total += cents(line.dr) - cents(line.cr);
  }
  if (total !== 0) fail("Debits and credits must balance to the centavo.");
}

function validateJournal(journal) {
  const ids = new Set(), numbers = new Set();
  for (const entry of [...journal].sort((a, b) => a.no - b.no)) validateEntry(entry, ids, numbers);
  for (const entry of journal) if (entry.type === "reversal") {
    const original = journal.find(row => row.id === entry.data?.reverses);
    if (!original || original.type === "reversal" || !entry.data?.reverses) fail("Invalid reversal reference.");
    const total = lines => lines.reduce((map, line) => {
      const k = `${line.acct}|${line.tag ?? ""}`; map[k] = (map[k] ?? 0) + cents(line.dr) - cents(line.cr); return map;
    }, {});
    // A settled donation/sale tax is reversed into a refund receivable, not a debit payable.
    const comparable = entry.lines.map(line => {
      if (line.acct !== "1220" || !["sell", "donation"].includes(original.type) || !line.dr || line.cr) return line;
      const tax = original.lines.filter(row => row.acct === "2200" && row.tag === line.tag).reduce((sum, row) => sum + cents(row.cr), 0);
      const outstanding = Math.max(0, -balance(journal.filter(row => row.no < entry.no), "2200", line.tag, entry.date));
      if (cents(line.dr) !== Math.max(0, tax - Math.min(tax, outstanding))) fail("Tax refund must equal the settled source tax.");
      return { ...line, acct: "2200" };
    });
    const a = total(original.lines), b = total(comparable);
    if ([...new Set([...Object.keys(a), ...Object.keys(b)])].some(k => (a[k] ?? 0) !== -(b[k] ?? 0))) fail("Reversal lines must exactly offset the source.");
  }
}

export function createLedgerState(source = {}) {
  if (!isObject(source)) fail("A ledger snapshot is required.");
  const events = normalizeEvents(source);
  const state = {
    registers: clone(isObject(source.registers) ? source.registers : {}),
    journal: clone(arrays(source.journal)),
    periods: clone(normalizePeriods(source.periods ?? source.registers?.periods)),
    recons: clone(normalizeRecons(source.recons ?? source.reconciliations ?? source.registers?.recons)),
    ...Object.fromEntries(Object.entries(events).map(([name, value]) => [name, clone(value)])),
  };
  validateJournal(state.journal);
  for (const period of state.periods) if (!monthOK(String(period.month_start).slice(0, 7))) fail("Invalid period month.");
  return freeze(state);
}

function snapshotOf(state, result) {
  return {
    registers: clone(state.registers), journal: clone(state.journal), periods: clone(state.periods), recons: clone(state.recons),
    annualReviewEvents: clone(state.annualReviewEvents), reconciliationEvents: clone(state.reconciliationEvents),
    periodEvents: clone(state.periodEvents), auditEvents: clone(state.auditEvents), masterEvents: clone(state.masterEvents),
    result: clone(result),
  };
}

function closedMonths(state) { return new Set(state.periods.filter(row => row.closed_at ?? row.closedAt).map(row => String(row.month_start).slice(0, 7))); }

function assertPostingDate(state, date) {
  if (!dateOK(date)) fail("Enter a valid posting date.");
  const month = date.slice(0, 7), closed = closedMonths(state);
  if (closed.has(month)) fail("This month is closed.");
  if ([...closed].some(value => value > month)) fail("Reopen later closed periods before backdating an earlier open month.");
}

function balance(entries, acct, tag, through = "9999-12-31") {
  return entries.reduce((total, entry) => entry.date > through ? total : total + entry.lines.reduce((sum, line) =>
    line.acct === acct && (tag === undefined || (line.tag ?? "") === tag) ? sum + cents(line.dr) - cents(line.cr) : sum, 0), 0);
}

function assertFutureBalances(entries, entry) {
  const checks = new Map();
  for (const line of entry.lines) if (DEBIT_NORMAL.has(line.acct) || CREDIT_NORMAL.has(line.acct)) {
    const tag = ["1000", "1010", "1020", "3100", "3150", "2310"].includes(line.acct) ? undefined : (line.tag ?? "");
    checks.set(`${line.acct}|${tag ?? ""}`, { acct: line.acct, tag });
  }
  const dates = [...new Set([entry.date, ...entries.filter(row => row.date >= entry.date).map(row => row.date)])].sort();
  for (const { acct, tag } of checks.values()) for (const day of dates) {
    const value = balance([...entries, entry], acct, tag, day);
    if (DEBIT_NORMAL.has(acct) ? value < 0 : value > 0) fail(`Payment exceeds the available balance for account ${acct} on ${day}.`);
  }
}

function nextEntry(state, input, type, lines, data = {}, memo = type) {
  const id = typeof input.commandId === "string" && input.commandId ? `${input.commandId}:entry` : `entry-${Date.now()}-${state.journal.length + 1}`;
  return { id, no: Math.max(0, ...state.journal.map(row => row.no)) + 1, date: input.date, type, memo: String(input.memo ?? memo).trim() || memo,
    lines: lines.filter(line => line.dr || line.cr).map(line => ({ ...line, tag: line.tag ?? "" })), data: { ...data, commandId: input.commandId } };
}

function addLine(lines, acct, dr, cr, tag = "") { if (dr || cr) lines.push({ acct, dr: amount(dr), cr: amount(cr), tag }); }

function cashEntry(state, input) {
  const { type, account, target, amount: raw } = input;
  if (!CASH.has(account) || typeof raw !== "number" || raw <= 0) fail("Select a cash account and positive amount.");
  const value = amount(raw), lines = [], data = { cashCommand: type };
  switch (type) {
    case "transfer": if (!CASH.has(target) || target === account) fail("Choose a different destination cash account."); addLine(lines, target, value, 0); addLine(lines, account, 0, value); break;
    case "fee": addLine(lines, "5100", value, 0); addLine(lines, account, 0, value); break;
    case "interest": case "dividend": {
      const policy = register(state, "policy", {});
      const rate = input.fwtRate ?? (type === "interest" ? Number(policy.intFwt ?? policy.interestFwt ?? 20) : Number(policy.divFwt ?? 0)); if (!Number.isFinite(rate) || rate < 0 || rate > 100) fail("Invalid withholding rate.");
      const tax = amount(value * rate / 100); Object.assign(data, { gross: value, fwt: tax, net: value - tax, rate });
      addLine(lines, account, value - tax, 0); addLine(lines, "5300", tax, 0, input.sym ?? ""); addLine(lines, type === "interest" ? "4010" : "4000", 0, value, input.sym ?? ""); break;
    }
    case "taxpay":
      if (!key(input.paymentChannel) || !key(input.transactionReference) || !input.paymentEvidence?.id || input.paymentEvidence.id !== input.evidenceFileId) fail("Record BIR Tax Payment requires a channel, reference and server-verified payment evidence.");
      if (!target || cents(value) > -balance(state.journal, "2200", target, input.date)) fail("Payment exceeds the outstanding BIR item.");
      addLine(lines, "2200", value, 0, target); addLine(lines, account, 0, value);
      Object.assign(data, { taxId: target, paymentChannel: input.paymentChannel, transactionReference: input.transactionReference, paymentEvidence: clone(input.paymentEvidence) }); break;
    case "expaccrue": addLine(lines, "5100", value, 0); addLine(lines, "2110", 0, value, input.commandId ?? ""); data.payId = input.commandId ?? ""; break;
    case "exppay": if (!target || cents(value) > -balance(state.journal, "2110", target, input.date)) fail("Payment exceeds the outstanding fee."); addLine(lines, "2110", value, 0, target); addLine(lines, account, 0, value); break;
    case "accrueDividend": case "accrueInterest": addLine(lines, type === "accrueDividend" ? "1200" : "1210", value, 0, input.commandId ?? ""); addLine(lines, type === "accrueDividend" ? "4000" : "4010", 0, value, input.sym ?? ""); data.payDate = input.payDate ?? null; break;
    case "collectIncome": {
      const policy = register(state, "policy", {});
      const entry = buildCashEntry(state.journal, [...closedMonths(state)], { ...input, memo: input.memo ?? "" }, `${input.commandId}:entry`, Number(policy.intFwt ?? policy.interestFwt ?? 20), Number(policy.divFwt ?? 0));
      entry.data.commandId = input.commandId;
      return entry;
    }
    case "subcollect": if (!target || cents(value) > balance(state.journal, "3020", target, input.date)) fail("Payment exceeds the unpaid subscription balance."); addLine(lines, account, value, 0); addLine(lines, "3020", 0, value, target); data.subId = target; break;
    case "borrow": addLine(lines, account, value, 0); addLine(lines, "2000", 0, value, target ?? input.commandId ?? ""); break;
    case "repay": if (!target || value > -balance(state.journal, "2000", target, input.date)) fail("Payment exceeds the outstanding debt."); addLine(lines, "2000", value, 0, target); addLine(lines, account, 0, value); break;
    case "contribution": {
      const source = ({ deposit: "Deposit for future stock subscription", advance: "Advance from stockholder", opening: "Opening balance" })[input.source] ?? input.source;
      const contra = ({ "Deposit for future stock subscription": "3150", "Advance from stockholder": "2310", "Opening balance": "3900" })[source];
      if (!contra) fail("Choose a deposit, stockholder advance, or opening balance."); data.source = source; addLine(lines, account, value, 0); addLine(lines, contra, 0, value);
      break;
    }
    case "cashDonation": {
      const entry = buildCashDonation(state.journal, [...closedMonths(state)], { ...input, memo: input.memo ?? "" }, input.commandId,
        register(state, "charities", []).find(row => row.id === target), register(state, "policy", {})).entry;
      entry.id = `${input.commandId}:entry`;
      entry.data.commandId = input.commandId;
      return entry;
    }
    default: fail("Unsupported cash operation.", "unsupported-operation");
  }
  const entry = nextEntry(state, input, ["interest", "dividend"].includes(type) ? "receive" : ["accrueDividend", "accrueInterest"].includes(type) ? "accrue" : type === "cashDonation" ? "donation" : type, lines, data, type === "taxpay" ? "Record BIR Tax Payment" : type);
  assertFutureBalances(state.journal, entry); return entry;
}

function register(state, name, fallback) { return clone(state.registers[name] ?? fallback); }

function tradeEntry(state, input) {
  assertPostingDate(state, input.date);
  const id = `${input.commandId}:entry`, policy = register(state, "policy", {});
  const change = buildTrade(state.journal, [...closedMonths(state)], register(state, "securities", {}), register(state, "lots", []),
    { ...input, memo: input.memo ?? "" }, id, policy);
  if (change.gift) {
    const charity = register(state, "charities", []).find(row => row.id === input.target);
    change.entry = buildCashDonation(state.journal, [...closedMonths(state)], { ...input, amount: change.gift.fairValue, memo: input.memo ?? "" }, id,
      charity, policy, { cost: change.gift.cost, lines: change.entry.lines, data: change.entry.data, valuation: input.valuation ?? "Trade-date fair value" }).entry;
  }
  change.entry.data.commandId = input.commandId;
  return change;
}

function simpleEntry(state, input, type, lines, data = {}) { assertPostingDate(state, input.date); const entry = nextEntry(state, input, type, lines, data); assertFutureBalances(state.journal, entry); return entry; }

function applyPeriod(state, input, actor) {
  const month = input.month ?? input.month_start; if (!monthOK(month) || !["accrue", "close", "reopen"].includes(input.type)) fail("Invalid period command.");
  const currentMonth = new Date().toISOString().slice(0, 7);
  if (input.type !== "reopen" && month >= currentMonth) fail("The month has not ended.");
  const index = state.periods.findIndex(row => String(row.month_start).slice(0, 7) === month), current = clone(state.periods[index] ?? { month_start: `${month}-01`, closed_at: null });
  const periods = clone(state.periods), event = { id: state.periodEvents.length + 1, month, actor, commandId: input.commandId ?? null, action: input.type, entryId: null, reason: input.reason?.trim() ?? null, occurredAt: new Date().toISOString() };
  let next = state;
  if (input.type !== "reopen") {
    if (current.closed_at ?? current.closedAt) fail("This month is closed.");
    const end = new Date(`${month}-01T00:00:00Z`); end.setUTCMonth(end.getUTCMonth() + 1, 0);
    const date = end.toISOString().slice(0, 10), debts = register(state, "debts", []), policy = register(state, "policy", {});
    assertPostingDate(state, date);
    const signed = state.recons.find(row => String(row.month_start ?? row.month).slice(0, 7) === month);
    const statement = signed?.signed_at || signed?.signedAt ? signed.payload : signed?.at ? signed : state.registers.recons?.[month]?.at ? state.registers.recons[month] : null;
    if (!statement && input.requireReconciliation !== false) fail("Sign off reconciliation first.");
    if (statement && reconciliationLines(month, state.journal, state.registers.lots ?? [], statement).some(row => row.changed)) fail("Ledger changed after sign-off. Reconcile again.");
    if (!Array.isArray(debts) || ![360, 365].includes(policy.dayCount)) fail("Loan accrual settings are missing.");
    if (state.journal.some(row => row.date <= date && row.lines.some(line => line.acct === "2000" && !debts.some(debt => debt.id === line.tag)))) fail("A loan is missing from the debt register.");
    const lines = [];
    try {
      assertPriorLoanAccruals(state.journal, debts, date, policy.dayCount);
      for (const debt of debts.filter(row => !row.cancelled)) {
        const due = loanInterest(state.journal, debt, date, policy.dayCount);
        if (due < 0 && -balance(state.journal, "2100", debt.id, date) < cents(-due)) fail("Reverse dependent loan payments before reducing an over-accrual.");
        addLine(lines, "5200", Math.max(0, due), Math.max(0, -due), debt.id);
        addLine(lines, "2100", Math.max(0, -due), Math.max(0, due), debt.id);
      }
    } catch (error) { fail(error.message); }
    if (input.type === "accrue") {
      if (lines.length) {
        const entry = nextEntry(state, { ...input, date }, "accrual", lines, { month });
        next = appendEntry(state, entry, actor, "period"); event.entryId = entry.id;
      }
      current.accrued_at = current.accruedAt = event.occurredAt;
    } else {
      if (lines.length) fail("Post outstanding loan interest accruals first.");
      const previous = new Date(`${month}-01T00:00:00Z`); previous.setUTCMonth(previous.getUTCMonth() - 1);
      const first = state.journal.map(row => row.date.slice(0, 7)).sort()[0];
      if (first && month !== first && !closedMonths(state).has(previous.toISOString().slice(0, 7))) fail("Close the previous month first.");
      if (!Number.isInteger(policy.fyStart) || policy.fyStart < 1 || policy.fyStart > 12) fail("Invalid fiscal year settings.");
      if (Number(month.slice(5)) === (policy.fyStart === 1 ? 12 : policy.fyStart - 1)) {
        const startYear = Number(month.slice(0, 4)) - (Number(month.slice(5)) < policy.fyStart ? 1 : 0);
        const from = `${startYear}-${String(policy.fyStart).padStart(2, "0")}-01`;
        const activity = state.journal.filter(row => row.date >= from);
        const closing = [];
        for (const acct of ACCOUNTS) if (/^[45]/.test(acct)) {
          const value = balance(activity, acct, undefined, date) / 100;
          addLine(closing, acct, Math.max(0, -value), Math.max(0, value));
        }
        const net = closing.reduce((sum, line) => sum + cents(line.dr) - cents(line.cr), 0) / 100;
        addLine(closing, "3800", Math.max(0, -net), Math.max(0, net));
        if (closing.length) {
          const entry = nextEntry(state, { ...input, date }, "closing", closing, { periodClose: month });
          next = appendEntry(state, entry, actor, "period"); current.closingId = event.entryId = entry.id;
        }
      }
      current.closed_at = current.closedAt = event.occurredAt;
    }
  }
  if (input.type === "reopen") {
    if (!(current.closed_at ?? current.closedAt)) fail("This month is not closed.");
    if (!input.reason?.trim()) fail("Enter a reason to reopen.");
    if ([...closedMonths(state)].some(value => value > month)) fail("Reopen later closed periods first.");
    if (current.closingId) {
      const original = state.journal.find(row => row.id === current.closingId);
      if (!original) fail("Closing entry missing.");
      const entry = nextEntry(state, { ...input, date: original.date }, "reversal", original.lines.map(line => ({ ...line, dr: line.cr, cr: line.dr })), { reverses: original.id, periodClose: month });
      next = appendEntry(state, entry, actor, "period"); event.entryId = entry.id;
    }
    current.closed_at = current.closedAt = null; current.closingId = null;
  }
  if (index < 0) periods.push(current); else periods[index] = current;
  const registers = { ...next.registers, periods: { ...next.registers.periods, [month]: clone(current) }, periodEvents: [...(next.registers.periodEvents ?? []), clone(event)] };
  return { state: { ...next, registers, periods, periodEvents: [...state.periodEvents, event] }, result: { ok: true, month, action: input.type } };
}

function applyRecon(state, input, actor) {
  const month = input.month ?? String(input.month_start ?? "").slice(0, 7); if (!monthOK(month) || !["draft", "sign", "reopen"].includes(input.type)) fail("Invalid reconciliation request.");
  if (state.periods.some(row => String(row.month_start).slice(0, 7) === month && (row.closed_at || row.closedAt))) fail("This month is closed.");
  if (state.registers.recons?.[month]?.at) fail("This month already has a historical signed snapshot.");
  const recons = clone(state.recons), index = recons.findIndex(row => String(row.month_start ?? row.month).slice(0, 7) === month), old = index < 0 ? null : recons[index];
  if (old?.at) fail("This month already has a historical signed snapshot.");
  if (Number(old?.revision ?? 0) !== Number(input.revision ?? 0)) fail("The reconciliation changed. Refresh before continuing.");
  if (input.type === "draft" && old?.signed_at) fail("Reopen the signed reconciliation before editing.");
  if (input.type === "reopen" && (!old?.signed_at || !input.reason?.trim())) fail("Select a signed reconciliation and enter a reason.");
  if (input.type === "sign" && (!old || old.signed_at || !Number.isSafeInteger(Number(old.prepared_by)) || Number(old.prepared_by) < 1)) fail("A saved draft must be prepared before approval.");
  if (input.type === "sign") {
    if (Number(old.prepared_by) === actor) fail("A different authenticated actor must approve this reconciliation.");
    const error = reconciliationApprovalError(month, state.journal, state.registers.lots ?? [], old.payload);
    if (error) fail(error);
  }
  const next = { ...(old ?? {}), month_start: `${month}-01`, revision: Number(input.revision ?? 0) + 1, prepared_by: input.type === "draft" ? actor : old.prepared_by, approved_by: input.type === "sign" ? actor : null, signed_at: input.type === "sign" ? new Date().toISOString() : null, payload: input.type === "draft" ? input.statement ?? null : old?.payload ?? null };
  if (input.type === "reopen") Object.assign(next, { prepared_by: actor, approved_by: null, signed_at: null, reason: input.reason.trim() });
  if (index < 0) recons.push(next); else recons[index] = next;
  const event = { id: state.reconciliationEvents.length + 1, month_start: `${month}-01`, actor, commandId: input.commandId ?? null, revision: next.revision, action: input.type, before_state: old, after_state: next };
  return { state: { ...state, recons, reconciliationEvents: [...state.reconciliationEvents, event] }, result: { ok: true, revision: next.revision } };
}

function applyAnnual(state, input, actor) {
  const fiscalStart = input.fiscalStart; if (!dateOK(fiscalStart) || !fiscalStart.endsWith("-01") || !["draft", "sign", "reopen"].includes(input.type)) fail("Invalid annual review request.");
  const fyStart = state.registers.policy?.fyStart;
  const today = new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Manila", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  if (!Number.isInteger(fyStart) || fyStart < 1 || fyStart > 12 || Number(fiscalStart.slice(5, 7)) !== fyStart || fiscalStart > today) fail("Select a valid financial year.");
  const history = state.annualReviewEvents.filter(row => row.fiscal_start === fiscalStart), latest = history.at(-1); const revision = Number(input.revision ?? 0);
  if (!Number.isSafeInteger(revision) || revision < 0) fail("Invalid annual review request.");
  if (Number(latest?.revision ?? 0) !== revision) fail("The review changed. Refresh before continuing.");
  if (input.type === "draft" && (!Array.isArray(input.checks) || input.checks.length !== 5 || !input.checks.every(value => typeof value === "boolean") || latest?.action === "sign")) fail("Reopen the signed review before editing its checklist.");
  if (input.type === "sign" && (!latest || latest.action === "sign" || !Array.isArray(latest.checks) || latest.checks.length !== 5 || !latest.checks.every(value => value === true))) fail("Complete the saved checklist before approval.");
  if (input.type === "sign") {
    if (Number(latest.prepared_by) === actor) fail("A different authenticated actor must approve this annual review.");
    const end = new Date(`${fiscalStart}T00:00:00Z`);
    end.setUTCFullYear(end.getUTCFullYear() + 1);
    if (today < end.toISOString().slice(0, 10)) fail("The financial year has not ended.");
    if (latest.evidenceFingerprint !== annualEvidenceFingerprint(state)) fail("Annual review evidence changed. Save a fresh checklist before signing.");
  }
  if (input.type === "reopen" && (latest?.action !== "sign" || typeof input.reason !== "string" || !input.reason.trim() || input.reason.trim().length > 500)) fail("Select a signed review and enter a reason.");
  const event = { id: state.annualReviewEvents.length + 1, fiscal_start: fiscalStart, revision: revision + 1, actor, commandId: input.commandId ?? null, prepared_by: input.type === "sign" ? latest.prepared_by : actor, action: input.type, checks: input.type === "draft" ? input.checks : latest.checks, evidenceFingerprint: annualEvidenceFingerprint(state), reason: input.type === "reopen" ? input.reason.trim() : null, occurred_at: new Date().toISOString() };
  return { state: { ...state, annualReviewEvents: [...state.annualReviewEvents, event] }, result: { ok: true, revision: event.revision } };
}

function applyMaster(state, input, actor) {
  // Transport metadata is audited here, not part of the domain command schema.
  const { commandId, ...command } = input;
  const source = { ...state.registers, periods: { ...state.registers.periods, ...Object.fromEntries(state.periods.map(row => [row.month_start.slice(0, 7), { closedAt: row.closed_at ?? row.closedAt }])) },
    periodEvents: state.periodEvents.map(row => ({ ...row, month: row.month ?? row.month_start?.slice(0, 7) })) };
  const change = command.type === "prices" ? applyPrices(source, command) : applyMasterCommand(source, command, state.journal);
  const { entity, id, revision: nextRevision, before, after } = change;
  const registers = { ...change.registers };
  delete registers.periodEvents;
  if (state.registers.periods === undefined) delete registers.periods;
  else registers.periods = clone(state.registers.periods);
  const event = { id: state.masterEvents.length + 1, actor, commandId: commandId ?? null, entity, entity_id: String(id), action: command.operation ?? "prices", revision: nextRevision, before_state: before, after_state: after, occurred_at: new Date().toISOString() };
  return { state: { ...state, registers, masterEvents: [...state.masterEvents, event] }, result: { ok: true, revision: nextRevision, id } };
}

function appendEntry(state, entry, actor, operation) {
  validateEntry(entry, new Set(state.journal.map(row => row.id)), new Set(state.journal.map(row => row.no))); assertFutureBalances(state.journal, entry);
  const audit = { id: state.auditEvents.length + 1, entry_id: entry.id, actor, commandId: entry.data?.commandId ?? null, action: operation, after_state: clone(entry), occurred_at: new Date().toISOString() };
  return { ...state, journal: [...state.journal, entry], auditEvents: [...state.auditEvents, audit] };
}

function applyDocument(state, input, actor, cgt) {
  const target = state.journal.find(row => input.journalNo != null && row.no === input.journalNo) ?? state.journal.find(row => row.id === input.id);
  if (!target || (cgt ? !target.data?.taxForm : target.type !== "donation")) fail("Journal entry does not have the required tax treatment.");
  if (target.reversedBy || state.journal.some(row => row.data?.reverses === target.id)) fail("This entry has been reversed.");
  if (input.status !== undefined && !["reference-only", "filed-manually"].includes(input.status)) fail("Invalid filing status.");
  if (!key(input.reference) || (input.status === "filed-manually" && (!dateOK(input.filedOn) || !key(input.receiptReference) || !key(input.evidenceFileId)))) fail("A manual filing requires a valid filing date, receipt reference and evidence file upload.");
  if (input.status === "filed-manually" && input.filedOn < target.date) fail("The filing date cannot precede the transaction.");
  if (input.status === "filed-manually" && input.evidenceFile?.id !== input.evidenceFileId) fail("Upload server-verified filing evidence before marking filed.");
  const audit = { id: state.auditEvents.length + 1, entry_id: target.id, actor, commandId: input.commandId, action: cgt ? "cgt_filing" : "gift_document", after_state: { form: target.data?.taxForm ?? "Donation documents", journalNo: target.no, reference: input.reference.trim(), status: input.status ?? "reference-only", filedOn: input.filedOn ?? null, receiptReference: input.receiptReference ?? null, evidenceReference: input.evidenceReference ?? null, evidenceFileId: input.evidenceFileId ?? null, documents: input.documents ?? {} }, occurred_at: new Date().toISOString() };
  if (input.evidenceFile) audit.after_state.evidenceFile = clone(input.evidenceFile);
  return { state: { ...state, auditEvents: [...state.auditEvents, audit] }, result: { ok: true, id: target.id } };
}

function activeCertificateAt(cert, date) {
  if (!cert || (cert.voidedAt && cert.voidedAt <= date) || (cert.cancelledAt && cert.cancelledAt <= date)) return false;
  const history = arrays(cert.history).filter(event => event.date <= date).sort((a, b) => a.date.localeCompare(b.date));
  return !["surrender", "void"].includes(history.at(-1)?.action);
}

function certNumber(value) { return typeof value === "string" && /^[A-Za-z0-9-]{1,40}$/.test(value); }

function capitalAudit(state, actor, input, action, afterState, entryId = null) {
  return [...state.auditEvents, { id: state.auditEvents.length + 1, entry_id: entryId, actor, commandId: input.commandId,
    action, after_state: clone(afterState), occurred_at: new Date().toISOString() }];
}

function capitalIssueCertificate(state, input, actor, operation) {
  assertPostingDate(state, input.date);
  const subs = register(state, "subs", []), certs = register(state, "certs", []), corp = register(state, "corp", {});
  const sub = subs.find(row => row.id === input.target && !row.cancelled && !row.issuedAt);
  if (!sub || !certNumber(input.certNo) || certs.some(row => String(row.no).toUpperCase() === String(input.certNo).toUpperCase())) {
    fail("Select an active, unissued subscription with a unique certificate number.");
  }
  if (balance(state.journal, "3020", sub.id, input.date) !== 0) fail("Only fully paid subscriptions qualify for a certificate.");
  if (!Number.isFinite(Number(corp.par)) || Number(corp.par) <= 0) fail("Invalid capital settings.");
  const value = amount(sub.shares * Number(corp.par)), lines = [];
  addLine(lines, "3010", value, 0, sub.id); addLine(lines, "3000", 0, value, sub.id);
  const entry = simpleEntry(state, input, "issue", lines, { subId: sub.id, certNo: input.certNo });
  const nextSubs = subs.map(row => row.id === sub.id ? { ...row, issuedAt: input.date, certNo: input.certNo } : row);
  const nextCerts = [...certs, { id: input.commandId, no: input.certNo, holderId: sub.holderId, shares: sub.shares,
    date: input.date, source: "subscription", subId: sub.id, txnId: entry.id }];
  const next = appendEntry({ ...state, registers: { ...state.registers, subs: nextSubs, certs: nextCerts } }, entry, actor, operation);
  return { nextState: next, result: { ok: true, number: entry.no, id: entry.id } };
}

function capitalSubscribe(state, input, actor, operation) {
  assertPostingDate(state, input.date);
  if (!key(input.holderId) || !Number.isSafeInteger(input.shares) || input.shares < 1 || !Number.isFinite(input.price) ||
      input.price <= 0 || cents(input.price) / 100 !== input.price || !CASH.has(input.account)) fail("Enter valid subscription details.");
  const holders = register(state, "holders", []);
  if (holders.length && !holders.some(row => row.id === input.holderId && row.active !== false && !row.inactive)) fail("Select an active stockholder.");
  const total = amount(input.shares * input.price), paid = amount(input.paid ?? 0);
  if (paid > total) fail("Initial payment cannot exceed the subscription value.");
  const lines = [];
  addLine(lines, "3020", total, 0, input.commandId); addLine(lines, "3010", 0, total, input.commandId);
  addLine(lines, input.account, paid, 0); addLine(lines, "3020", 0, paid, input.commandId);
  const entry = simpleEntry(state, input, "subscribe", lines, { subId: input.commandId, holderId: input.holderId, shares: input.shares, price: input.price, paid });
  const subs = register(state, "subs", []);
  const next = appendEntry({ ...state, registers: { ...state.registers, subs: [...subs, { id: input.commandId, date: input.date,
    holderId: input.holderId, shares: input.shares, price: input.price, txnId: entry.id, issuedAt: null, cancelled: false }] } }, entry, actor, operation);
  return { nextState: next, result: { ok: true, number: entry.no, id: entry.id } };
}

function capitalTransfer(state, input, actor) {
  assertPostingDate(state, input.date);
  const certs = register(state, "certs", []), transfers = register(state, "transfers", []), holders = register(state, "holders", []);
  const dividends = register(state, "dividends", []);
  if (input.type === "voidTransfer") {
    const transfer = transfers.find(row => row.id === input.target && !row.voidedAt);
    if (!transfer || input.date < transfer.date || typeof input.reason !== "string" || !input.reason.trim() || input.reason.length > 500) {
      fail("Select an active transfer and enter a reason of up to 500 characters.");
    }
    if (dividends.some(row => !row.cancelled && row.date >= transfer.date)) fail("This transfer affected a recorded dividend entitlement.");
    const imported = !transfer.sourceCertId && !transfer.sourceCertIds;
    if (imported && (!key(input.evidenceRef) || input.confirmHistorical !== true)) fail("Historical corrections require evidence and confirmation of imported certificate history.");
    const sourceIds = transfer.sourceCertIds ?? (transfer.sourceCertId ? [transfer.sourceCertId] : []);
    const sources = sourceIds.length ? sourceIds.map(id => certs.find(cert => cert.id === id)) : arrays(transfer.surrendered).map(no => {
      const matches = certs.filter(cert => cert.no === no && cert.cancelledBy === transfer.id); return matches.length === 1 ? matches[0] : null;
    });
    const issued = certs.filter(cert => cert.transferId === transfer.id);
    const newCertNos = arrays(transfer.newCerts);
    const sourceTotal = sources.reduce((sum, cert) => sum + (cert?.shares ?? 0), 0);
    if (!sources.length || sources.some(cert => !cert || cert.holderId !== transfer.fromId || cert.cancelledBy !== transfer.id || activeCertificateAt(cert, input.date)) ||
        issued.length !== newCertNos.length || issued.some(cert => !newCertNos.includes(cert.no) || !activeCertificateAt(cert, input.date)) ||
        issued.reduce((sum, cert) => sum + cert.shares, 0) !== sourceTotal || issued.some(cert => ![transfer.fromId, transfer.toId].includes(cert.holderId))) {
      fail("A subsequent transaction or inconsistent certificate history prevents this correction.");
    }
    const after = { ...transfer, sourceCertIds: sources.map(cert => cert.id), voidedAt: input.date, voidReason: input.reason.trim() };
    const nextCerts = certs.map(cert => sources.some(source => source.id === cert.id) ? { ...cert, cancelledAt: null, cancelledBy: null,
      history: [...arrays(cert.history), { date: input.date, action: "restore", transferId: transfer.id }] } : cert.transferId === transfer.id ?
      { ...cert, voidedAt: input.date, history: [...arrays(cert.history), { date: input.date, action: "void", transferId: transfer.id }] } : cert);
    const nextTransfers = transfers.map(row => row.id === transfer.id ? after : row);
    return { nextState: { ...state, registers: { ...state.registers, certs: nextCerts, transfers: nextTransfers },
      auditEvents: capitalAudit(state, actor, input, "transfer_void", { before: transfer, after }) }, result: { ok: true, id: transfer.id } };
  }
  const ids = input.targets ?? [input.target];
  if (!Array.isArray(ids) || !ids.length || ids.length > 100 || new Set(ids).size !== ids.length) fail("Select distinct surrendered certificates.");
  if (dividends.some(row => !row.cancelled && row.date >= input.date)) fail("Transfer corrections cannot change a recorded dividend entitlement.");
  const sources = ids.map(id => certs.find(cert => cert.id === id)), owner = sources[0]?.holderId;
  if (sources.some(cert => !cert || cert.holderId !== owner || !activeCertificateAt(cert, input.date) || arrays(cert.history).some(event => event.date > input.date)) ||
      !holders.some(holder => holder.id === input.toId && holder.active !== false && !holder.inactive) || input.toId === owner) {
    fail("Select active certificates belonging to one seller and a different receiving stockholder.");
  }
  const total = sources.reduce((sum, cert) => sum + cert.shares, 0);
  if (!Number.isSafeInteger(input.shares) || input.shares < 1 || input.shares > total) fail("Transfer exceeds the surrendered certificates' shares.");
  if (!key(input.carRef) || (input.deedRef !== undefined && (typeof input.deedRef !== "string" || input.deedRef.length > 200)) ||
      (input.price != null && (!Number.isFinite(input.price) || input.price < 0 || input.price * input.shares > 1e12))) fail("Enter valid consideration, eCAR and deed references.");
  const remaining = total - input.shares, newCerts = remaining ? [input.buyerNo, input.balanceNo] : [input.buyerNo];
  const used = new Set(certs.map(cert => String(cert.no).toUpperCase()));
  if (newCerts.some(no => !certNumber(no) || used.has(String(no).toUpperCase())) || new Set(newCerts.map(no => String(no).toUpperCase())).size !== newCerts.length) {
    fail("Enter unique certificate numbers for the buyer and any remaining shares.");
  }
  const corp = register(state, "corp", {}), policy = register(state, "policy", {});
  if (!Number.isFinite(Number(corp.par)) || !Number.isFinite(Number(policy.dstTransfer)) || policy.dstTransfer < 0 || policy.dstTransfer > 100) fail("Invalid transfer tax settings.");
  const id = input.commandId, after = { id, date: input.date, fromId: owner, toId: input.toId, shares: input.shares, price: input.price ?? null,
    carRef: input.carRef.trim(), deedRef: input.deedRef?.trim() ?? "", sourceCertId: sources[0].id, sourceCertIds: ids, surrendered: sources.map(cert => cert.no),
    newCerts, dstSeller: amount(input.shares * Number(corp.par) * Number(policy.dstTransfer) / 100), recordedAt: new Date().toISOString() };
  const created = [{ id, no: input.buyerNo, holderId: input.toId, shares: input.shares, date: input.date, source: "transfer", transferId: id }];
  if (remaining) created.push({ id: `${id}-balance`, no: input.balanceNo, holderId: owner, shares: remaining, date: input.date, source: "transfer", transferId: id });
  const nextCerts = [...certs.map(cert => ids.includes(cert.id) ? { ...cert, cancelledAt: input.date, cancelledBy: id,
    history: [...arrays(cert.history), { date: input.date, action: "surrender", transferId: id }] } : cert), ...created];
  const nextTransfers = [...transfers, after];
  return { nextState: { ...state, registers: { ...state.registers, certs: nextCerts, transfers: nextTransfers },
    auditEvents: capitalAudit(state, actor, input, "share_transfer", { before: null, after }) }, result: { ok: true, id } };
}

function capitalDividend(state, input, actor) {
  assertPostingDate(state, input.date);
  const holders = register(state, "holders", []), subs = register(state, "subs", []), certs = register(state, "certs", []), dividends = register(state, "dividends", []);
  const policy = register(state, "policy", {}), lines = [], add = (acct, dr, cr, tag = "") => addLine(lines, acct, dr, cr, tag);
  let record, data, memo;
  if (input.type === "declareDividend") {
    if (!Number.isFinite(input.perShare) || input.perShare <= 0 || input.perShare > 1e6 || input.confirmUnrestricted !== true || !dateOK(input.payDate) || input.payDate < input.date) fail("Enter a payment date and confirm unrestricted earnings.");
    const recordDate = input.recordDate ?? input.date;
    if (!dateOK(recordDate) || recordDate < input.date || recordDate > input.payDate || (input.boardRef !== undefined && !key(input.boardRef))) fail("Enter a record date between declaration and payment, and a valid board reference.");
    const shares = new Map();
    for (const cert of certs.filter(cert => activeCertificateAt(cert, input.date))) shares.set(cert.holderId, (shares.get(cert.holderId) ?? 0) + cert.shares);
    for (const sub of subs.filter(sub => sub.date <= input.date && balance(state.journal, "3020", sub.id, input.date) > 0 && !sub.cancelled)) shares.set(sub.holderId, (shares.get(sub.holderId) ?? 0) + sub.shares);
    const allocations = [...shares].map(([holderId, units]) => {
      if (!holders.some(holder => holder.id === holderId && holder.active !== false && !holder.inactive) || !Number.isSafeInteger(units) || units < 1) fail("The stockholder register is inconsistent.");
      return { holderId, shares: units, gross: amount(units * input.perShare) };
    }).filter(row => row.gross > 0);
    const total = allocations.reduce((sum, row) => sum + cents(row.gross), 0);
    if (!Number.isSafeInteger(total) || total < 1 || total > 1e14 || total > -balance(state.journal, "3800", undefined, input.date)) fail("Dividend exceeds recorded retained earnings.");
    add("3800", total / 100, 0); add("2300", 0, total / 100, input.commandId);
    record = { id: input.commandId, txnId: input.commandId, date: input.date, recordDate, payDate: input.payDate, perShare: input.perShare, gross: total / 100, allocations };
    data = { dividendId: input.commandId, gross: total / 100, perShare: input.perShare, recordDate, payDate: input.payDate, boardRef: input.boardRef?.trim() ?? "", allocations, confirmUnrestricted: true };
    memo = "Cash dividend declaration";
  } else {
    record = dividends.find(row => row.id === input.target && !row.paidAt && !row.cancelled);
    if (!record || !Array.isArray(record.allocations) || input.date < record.payDate || !CASH.has(input.account)) fail("Select an unpaid dividend on or after its payment date.");
    const total = cents(record.gross); if (-balance(state.journal, "2300", record.id, input.date) !== total) fail("Dividend payable does not match the declaration.");
    let cash = 0, tax = 0;
    const payments = record.allocations.map(allocation => {
      const holder = holders.find(row => row.id === allocation.holderId); if (!holder) fail("A stockholder is missing from the register.");
      const rate = holder.type === "domestic" ? 0 : holder.type === "individual" ? Number(policy.divWhtInd) : ["nonresident", "nrfc", "nra"].includes(holder.type) ? Number(policy.divWhtNr) : NaN;
      if (!Number.isFinite(rate) || rate < 0 || rate > 100) fail("A stockholder has no supported withholding classification.");
      const gross = cents(allocation.gross), withheld = Math.round(gross * rate / 100); let remainder = gross - withheld, offsets = [];
      for (const sub of subs.filter(row => row.holderId === holder.id && !row.cancelled && row.callDue && row.callDue <= input.date).sort((a, b) => a.id.localeCompare(b.id))) {
        const delinquency = new Date(`${sub.callDue}T00:00:00Z`); delinquency.setUTCDate(delinquency.getUTCDate() + 30);
        if (delinquency.toISOString().slice(0, 10) >= input.date) continue;
        const offset = Math.min(remainder, Math.max(0, balance(state.journal, "3020", sub.id, input.date)));
        if (offset) { add("3020", 0, offset / 100, sub.id); offsets.push({ subscription: sub.id, amount: offset / 100 }); remainder -= offset; }
      }
      cash += remainder; tax += withheld; return { ...allocation, type: holder.type, rate, withheld: withheld / 100, cash: remainder / 100, offsets };
    });
    if (cash > balance(state.journal, input.account, undefined, input.date)) fail("Payment exceeds the cash account balance.");
    add("2300", total / 100, 0, record.id); add(input.account, 0, cash / 100); add("2200", 0, tax / 100, input.commandId);
    data = { dividendId: record.id, payments, gross: total / 100, withheld: tax / 100, net: cash / 100, taxForm: tax ? "dividend" : null };
    record = { ...record, paidAt: input.date, paymentId: input.commandId }; memo = "Cash dividend payment";
  }
  const entry = nextEntry(state, input, input.type === "declareDividend" ? "divdeclare" : "divpay", lines, data, memo);
  assertFutureBalances(state.journal, entry);
  const nextDividends = input.type === "declareDividend" ? [...dividends, record] : dividends.map(row => row.id === record.id ? record : row);
  const next = appendEntry({ ...state, registers: { ...state.registers, dividends: nextDividends } }, entry, actor, input.type);
  return { nextState: next, result: { ok: true, number: entry.no, id: entry.id } };
}

function capitalMetadata(state, input, actor, type) {
  assertPostingDate(state, input.date);
  const registers = clone(state.registers);
  if (type === "callSubscription") {
    const subs = arrays(registers.subs), sub = subs.find(row => row.id === input.target && !row.cancelled);
    if (!sub || !dateOK(input.dueDate) || input.dueDate <= input.date || (input.boardRef !== undefined && !key(input.boardRef))) fail("Select an active subscription and valid call details.");
    if (sub.callDue) fail("This subscription already has a call.");
    const call = { id: input.commandId, subId: sub.id, date: input.date, dueDate: input.dueDate, boardRef: input.boardRef?.trim() ?? "" };
    registers.subs = subs.map(row => row.id === sub.id ? { ...row, callDate: input.date, callDue: input.dueDate, callRef: call.boardRef } : row);
    registers.calls = [...arrays(registers.calls), call];
    return { nextState: { ...state, registers, auditEvents: capitalAudit(state, actor, input, "subscription_call", call) }, result: { ok: true, id: call.id } };
  }
  const corp = registers.corp ?? {}, to = input.to;
  if (!Number.isSafeInteger(to) || to <= Number(corp.authorized ?? 0) || !key(input.secRef)) fail("Enter a capital increase above authorized shares with an SEC reference.");
  if (arrays(registers.capitalIncreases).some(row => row.secRef === input.secRef)) fail("This SEC reference is already recorded.");
  const increase = { id: input.commandId, from: Number(corp.authorized), to, date: input.date, secRef: input.secRef.trim() };
  registers.capitalIncreases = [...arrays(registers.capitalIncreases), increase]; registers.corp = { ...corp, authorized: to };
  return { nextState: { ...state, registers, auditEvents: capitalAudit(state, actor, input, "capital_increase", increase) }, result: { ok: true, id: increase.id } };
}

function applyCgtReconcile(state, input, actor) {
  assertPostingDate(state, input.date);
  const policy = register(state, "policy", {}), rawStart = String(input.fiscalStart ?? "");
  const fyStart = dateOK(rawStart) && rawStart.endsWith("-01") ? rawStart : monthOK(rawStart) ? `${rawStart}-01` : null;
  if (!fyStart || !Number.isFinite(Number(policy.cgtUnlisted)) || Number(policy.cgtUnlisted) < 0 || Number(policy.cgtUnlisted) > 100) fail("Enter a fiscal year start and valid unlisted CGT rate.");
  const startMonth = Number(fyStart.slice(5, 7)), startYear = Number(fyStart.slice(0, 4));
  const end = new Date(Date.UTC(startYear + 1, startMonth - 1, 0)).toISOString().slice(0, 10);
  if (input.date <= end) fail("Post the adjustment after the selected fiscal year ends.");
  if (state.journal.some(row => row.data?.cgtFiscalStart === fyStart && row.date > input.date)) fail("Post after later capital gains transactions for this fiscal year.");
  const reversed = new Set(state.journal.filter(row => row.data?.reverses && row.date <= input.date).map(row => row.data.reverses));
  const gains = state.journal.filter(row => !reversed.has(row.id) && row.type === "sell" && row.data?.taxClass === "unlisted" && row.data?.acctType === "Taxable" && row.date >= fyStart && row.date <= end && row.date <= input.date)
    .reduce((sum, row) => sum + cents(Number(row.data.gain ?? 0)), 0);
  const booked = balance(state.journal.filter(row => row.data?.cgtFiscalStart === fyStart && row.type !== "closing" && !row.data?.periodClose), "5320", undefined, input.date);
  const due = cents(Math.max(0, gains / 100) * Number(policy.cgtUnlisted) / 100), delta = due - booked;
  if (!delta) fail("No capital gains tax adjustment is due.");
  const value = Math.abs(delta) / 100, dueDate = new Date(`${end}T00:00:00Z`); dueDate.setUTCMonth(dueDate.getUTCMonth() + 4, 15);
  const data = { cgtFiscalStart: fyStart, cgtFiscalEnd: end, taxForm: "1707-A", taxDue: dueDate.toISOString().slice(0, 10), gain: gains / 100, booked: booked / 100, assessment: due / 100, delta: delta / 100, cgtReconcile: true };
  const lines = delta > 0 ? [{ acct: "5320", dr: value, cr: 0, tag: input.commandId }, { acct: "2200", dr: 0, cr: value, tag: input.commandId }] :
    [{ acct: "1220", dr: value, cr: 0, tag: input.commandId }, { acct: "5320", dr: 0, cr: value, tag: input.commandId }];
  const entry = simpleEntry(state, input, "taxtrueup", lines, data);
  const next = appendEntry(state, entry, actor, "cgt-reconcile");
  return { nextState: next, result: { ok: true, number: entry.no, id: entry.id, fiscalStart: fyStart, gain: gains / 100, booked: booked / 100, due: due / 100, delta: delta / 100 } };
}

export function applyLedgerCommand(state, command) {
  if (!state || !Object.isFrozen(state)) fail("Use createLedgerState before applying commands.");
  if (!isObject(command) || typeof command.operation !== "string" || !isObject(command.input ?? {})) fail("Invalid ledger command.");
  const actor = command.actor; if (!Number.isSafeInteger(actor) || actor < 1) fail("An authenticated actor is required.");
  const commandId = command.commandId; if (!key(commandId)) fail("A command identifier is required.");
  const input = { ...clone(command.input), commandId };
  const prior = [...state.auditEvents, ...state.masterEvents, ...state.periodEvents, ...state.reconciliationEvents, ...state.annualReviewEvents].find(row => row.commandId === commandId);
  if (prior) { const result = { ok: true, idempotent: true, id: prior.entry_id ?? prior.entity_id }; return { nextState: state, snapshot: snapshotOf(state, result), result }; }
  let transitioned = state, result;
  const op = command.operation;
  if (op === "cash") {
    assertPostingDate(state, input.date);
    if (["borrow", "repay"].includes(input.type)) {
      const change = buildLoanEntry(state.journal, [...closedMonths(state)], register(state, "debts", []), { ...input, memo: input.memo ?? "" }, commandId, state.registers.policy?.dayCount);
      change.entry.id = `${commandId}:entry`; change.entry.data.commandId = commandId;
      transitioned = appendEntry({ ...state, registers: { ...state.registers, debts: change.nextLoans ?? register(state, "debts", []) } }, change.entry, actor, op);
    } else transitioned = appendEntry(state, cashEntry(state, input), actor, op);
    result = { ok: true, number: transitioned.journal.at(-1).no };
  }
  else if (op === "trade") { const change = tradeEntry(state, input); transitioned = appendEntry({ ...state, registers: { ...state.registers, lots: change.lots } }, change.entry, actor, op); result = { ok: true, number: change.entry.no, id: change.entry.id }; }
  else if (op === "issue-certificate") {
    const change = capitalIssueCertificate(state, input, actor, op); transitioned = change.nextState; result = change.result;
  }
  else if (["subscribe", "subscription"].includes(op) || op === "capital") {
    const type = input.type ?? (op === "subscription" ? "subscribe" : "");
    if (type === "subscribe") { const change = capitalSubscribe(state, input, actor, op); transitioned = change.nextState; result = change.result; }
    else if (["issue", "issueCertificate", "issue-certificate"].includes(type)) { const change = capitalIssueCertificate(state, input, actor, op); transitioned = change.nextState; result = change.result; }
    else if (["subcollect", "contribution"].includes(type)) { assertPostingDate(state, input.date); transitioned = appendEntry(state, cashEntry(state, input), actor, op); result = { ok: true, number: transitioned.journal.at(-1).no, id: transitioned.journal.at(-1).id }; }
    else if (type === "callSubscription") { const change = capitalMetadata(state, input, actor, type); transitioned = change.nextState; result = change.result; }
    else if (type === "capitalIncrease") { const change = capitalMetadata(state, input, actor, type); transitioned = change.nextState; result = change.result; }
    else if (["shareTransfer", "voidTransfer"].includes(type)) { const change = capitalTransfer(state, input, actor); transitioned = change.nextState; result = change.result; }
    else if (["declareDividend", "payDividend"].includes(type)) { const change = capitalDividend(state, input, actor); transitioned = change.nextState; result = change.result; }
    else if (["declareDividend", "payDividend"].includes(type)) {
      const dividendResult = postDividend({ entries: state.journal, holders: register(state, "holders", []), subs: register(state, "subs", []),
        certs: register(state, "certs", []), dividends: register(state, "dividends", []), policy: register(state, "policy", {}),
        input: { ...input, type }, id: input.commandId });
      const dividends = register(state, "dividends", []), nextDividends = dividends.filter(row => row.id !== dividendResult.record.id).concat(dividendResult.record);
      transitioned = appendEntry({ ...state, registers: { ...state.registers, dividends: nextDividends } }, dividendResult.entry, actor, op);
      result = { ok: true, number: dividendResult.entry.no, id: dividendResult.entry.id };
    }
    else if (["shareTransfer", "voidTransfer"].includes(type)) {
      const registers = state.registers, transferResult = transferShares({ certs: register(state, "certs", []), transfers: register(state, "transfers", []),
        dividends: register(state, "dividends", []), holders: register(state, "holders", []), corp: register(state, "corp", {}),
        policy: register(state, "policy", {}), input: { ...input, type }, id: input.commandId });
      const transfers = register(state, "transfers", []);
      const nextTransfers = type === "voidTransfer" ? transfers.map(row => row.id === input.target ? transferResult.after : row) : [...transfers, transferResult.after];
      const nextState = { ...state, registers: { ...registers, certs: result.certs, transfers: nextTransfers },
        auditEvents: [...state.auditEvents, { id: state.auditEvents.length + 1, actor, commandId: input.commandId,
          action: type === "voidTransfer" ? "share_transfer_voided" : "share_transfer_created", entity_id: transferResult.after.id,
          before_state: transferResult.before, after_state: transferResult.after, occurred_at: new Date().toISOString() }] };
      transitioned = nextState; result = { ok: true, id: transferResult.after.id };
    }
    else if (type === "callSubscription") {
      const subs = register(state, "subs", []), target = subs.find(row => row.id === input.target);
      if (!target || !dateOK(input.callDue) || (input.callDate && !dateOK(input.callDate)) || (input.callDate && input.callDate < target.date) ||
          (input.callRef !== undefined && !key(input.callRef))) fail("Enter a valid subscription call.");
      const nextSubs = subs.map(row => row.id === target.id ? { ...row, callDue: input.callDue, callDate: input.callDate ?? null, callRef: input.callRef?.trim() ?? "" } : row);
      transitioned = { ...state, registers: { ...state.registers, subs: nextSubs }, auditEvents: [...state.auditEvents,
        { id: state.auditEvents.length + 1, actor, commandId: input.commandId, action: "subscription_call_changed", entity_id: target.id,
          before_state: target, after_state: nextSubs.find(row => row.id === target.id), occurred_at: new Date().toISOString() }] };
      result = { ok: true, id: target.id };
    }
    else if (type === "capitalIncrease") {
      const corp = register(state, "corp", {}), to = Number(input.to);
      if (!Number.isSafeInteger(to) || to <= Number(corp.authorized) || !key(input.secRef) || !dateOK(input.date)) fail("Enter a valid SEC-approved capital increase.");
      const increase = { id: input.commandId, date: input.date, from: Number(corp.authorized), to, secRef: input.secRef.trim() };
      transitioned = { ...state, registers: { ...state.registers, corp: { ...corp, authorized: to, increases: [...(corp.increases ?? []), increase] } },
        auditEvents: [...state.auditEvents, { id: state.auditEvents.length + 1, actor, commandId: input.commandId, action: "capital_increase_created",
          entity_id: increase.id, before_state: corp, after_state: increase, occurred_at: new Date().toISOString() }] };
      result = { ok: true, id: increase.id };
    }
    else fail("Unsupported capital operation.", "unsupported-operation");
  }
  else if (op === "giving" || op === "grant") {
    if (input.type === "grant" || op === "grant") {
      assertPostingDate(state, input.date);
      const charities = register(state, "charities", []), grants = register(state, "grants", []);
      const fund = vetDonee(charities.find(row => row.id === input.fund), input.date);
      const recipient = vetDonee(charities.find(row => row.id === input.recipient), input.date);
      if (!fund.isDAF || recipient.isDAF || fund.id === recipient.id || !(input.amount > 0) || cents(input.amount) / 100 !== input.amount) fail("Enter a valid pooled fund, recipient, and grant amount.");
      if ([input.date, ...grants.filter(row => row.dafId === fund.id && row.date > input.date).map(row => row.date)].some(day =>
        input.amount > pooledBalance(state.journal, grants, fund.id, day))) fail("Grant exceeds the available pooled-fund balance on this or a later grant date.");
      const grant = { id: commandId, date: input.date, dafId: fund.id, toId: recipient.id, amount: input.amount };
      transitioned = { ...state, registers: { ...state.registers, grants: [...grants, grant] }, auditEvents: capitalAudit(state, actor, input, "pooled_grant", grant) };
      result = { ok: true, id: commandId };
    }
    else if (input.type === "gift") { const change = tradeEntry(state, input); transitioned = appendEntry({ ...state, registers: { ...state.registers, lots: change.lots } }, change.entry, actor, op); result = { ok: true, number: change.entry.no, id: change.entry.id }; }
    else fail("Unsupported giving operation.", "unsupported-operation");
  }
  else if (op === "reverse") {
    assertPostingDate(state, input.date);
    const original = state.journal.find(row => row.id === input.id);
    if (!original || original.type === "reversal" || state.journal.some(row => row.data?.reverses === input.id)) fail("Entry is missing or already reversed.");
    if (!key(input.reason)) fail("Enter a reversal reason.");
    const registers = { lots: [], subs: [], certs: [], dividends: [], debts: [], ...state.registers };
    const change = reverseFinancialEntry({ entries: state.journal, original, input, id: `${commandId}:entry`, registers });
    change.entry.data.commandId = commandId;
    if (original.data.vehicle === "DAF" && [input.date, ...register(state, "grants", []).filter(row => row.dafId === original.data.charityId && row.date > input.date).map(row => row.date)]
      .some(day => pooledBalance([...state.journal, change.entry], register(state, "grants", []), original.data.charityId, day) < 0)) fail("Reverse dependent pooled grants first.");
    transitioned = appendEntry({ ...state, journal: state.journal.map(row => row.id === original.id ? { ...row, reversedBy: change.entry.id } : row),
      registers: { ...state.registers, ...change.registers, ...(change.lots ? { lots: change.lots } : {}) } }, change.entry, actor, op);
    result = { ok: true, number: change.entry.no, id: change.entry.id };
  }
  else if (op === "period") { const change = applyPeriod(state, input, actor); transitioned = change.state; result = change.result; }
  else if (["recon", "reconciliation"].includes(op)) { const change = applyRecon(state, input, actor); transitioned = change.state; result = change.result; }
  else if (op === "annual-review") { const change = applyAnnual(state, input, actor); transitioned = change.state; result = change.result; }
  else if (["document", "donation-document", "cgt-filing"].includes(op)) { const change = applyDocument(state, input, actor, op === "cgt-filing"); transitioned = change.state; result = change.result; }
  else if (op === "cgt-reconcile") { const change = applyCgtReconcile(state, input, actor); transitioned = change.nextState; result = change.result; }
  else if (["master", "prices"].includes(op)) { const change = applyMaster(state, { ...input, type: op }, actor); transitioned = change.state; result = change.result; }
  else fail("Unsupported ledger operation.", "unsupported-operation");
  const nextState = freeze(clone(transitioned));
  return { nextState, snapshot: snapshotOf(nextState, result), result };
}
