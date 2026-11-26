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
const INVESTMENTS = { dom: "1100", intl: "1110", fi: "1120", cash: "1130", alt: "1140" };
const ACCOUNTS = new Set(["1000", "1010", "1020", "1100", "1110", "1120", "1130", "1140", "1200", "1210", "1220", "2000", "2100", "2110", "2200", "2300", "2310", "3000", "3010", "3020", "3100", "3150", "3800", "3900", "4000", "4010", "4100", "4110", "5000", "5100", "5200", "5300", "5310", "5320", "5330"]);
import { postDividend, transferShares } from "./capital-register.mjs";
const MASTER_ENTITIES = new Set(["classes", "securities", "charities", "holders", "corp", "policy", "subs", "lots", "debts", "certs", "transfers", "dividends", "grants", "calls", "capitalIncreases", "accountMappings"]);
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
    const a = total(original.lines), b = total(entry.lines);
    if ([...new Set([...Object.keys(a), ...Object.keys(b)])].some(k => (a[k] ?? 0) !== -(b[k] ?? 0))) fail("Reversal lines must exactly offset the source.");
  }
}

export function createLedgerState(source = {}) {
  if (!isObject(source)) fail("A ledger snapshot is required.");
  const events = normalizeEvents(source);
  const state = {
    registers: clone(isObject(source.registers) ? source.registers : {}),
    journal: clone(arrays(source.journal)),
    periods: clone(normalizePeriods(source.periods)),
    recons: clone(normalizeRecons(source.recons ?? source.reconciliations)),
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
    case "taxpay": if (!target || value > -balance(state.journal, "2200", target, input.date)) fail("Payment exceeds the outstanding BIR item."); addLine(lines, "2200", value, 0, target); addLine(lines, account, 0, value); data.taxId = target; break;
    case "expaccrue": addLine(lines, "5100", value, 0); addLine(lines, "2110", 0, value, input.commandId ?? ""); data.payId = input.commandId ?? ""; break;
    case "exppay": if (!target || value > -balance(state.journal, "2110", target, input.date)) fail("Payment exceeds the outstanding fee."); addLine(lines, "2110", value, 0, target); addLine(lines, account, 0, value); break;
    case "accrueDividend": case "accrueInterest": addLine(lines, type === "accrueDividend" ? "1200" : "1210", value, 0, input.commandId ?? ""); addLine(lines, type === "accrueDividend" ? "4000" : "4010", 0, value, input.sym ?? ""); data.payDate = input.payDate ?? null; break;
    case "collectIncome": {
      if (!target) fail("Select an income receivable."); const acct = state.journal.find(row => row.type === "accrue" && row.lines.some(line => line.tag === target && ["1200", "1210"].includes(line.acct)))?.lines.find(line => line.tag === target && ["1200", "1210"].includes(line.acct))?.acct;
      if (!acct || value > balance(state.journal, acct, target, input.date)) fail("Payment exceeds the outstanding income receivable."); addLine(lines, account, value, 0); addLine(lines, acct, 0, value, target); break;
    }
    case "subcollect": if (!target || value > balance(state.journal, "3020", target, input.date)) fail("Payment exceeds the unpaid subscription balance."); addLine(lines, account, value, 0); addLine(lines, "3020", 0, value, target); data.subId = target; break;
    case "borrow": addLine(lines, account, value, 0); addLine(lines, "2000", 0, value, target ?? input.commandId ?? ""); break;
    case "repay": if (!target || value > -balance(state.journal, "2000", target, input.date)) fail("Payment exceeds the outstanding debt."); addLine(lines, "2000", value, 0, target); addLine(lines, account, 0, value); break;
    case "contribution": {
      const source = ({ deposit: "Deposit for future stock subscription", advance: "Advance from stockholder", opening: "Opening balance" })[input.source] ?? input.source;
      const contra = ({ "Deposit for future stock subscription": "3150", "Advance from stockholder": "2310", "Opening balance": "3900" })[source];
      if (!contra) fail("Choose a deposit, stockholder advance, or opening balance."); data.source = source; addLine(lines, account, value, 0); addLine(lines, contra, 0, value);
      break;
    }
    case "cashDonation": {
      const charity = register(state, "charities", []).find(row => row.id === target);
      if (!charity || charity.active === false || charity.inactive || !["government", "accredited", "nonaccredited"].includes(charity.donee)) fail("Select an active registered organization.");
      if (charity.donee === "accredited" && (!dateOK(charity.accredUntil) || charity.accredUntil < input.date)) fail("The organization's accreditation has expired or is missing.");
      const checks = charity.checks ?? {};
      if (![checks.reg, checks.gov, checks.pay].every(day => dateOK(day) && day <= input.date)) fail("Complete all three vetting checks before the gift date.");
      if (value > balance(state.journal, account, undefined, input.date)) fail("Payment exceeds the cash account balance.");
      const policy = register(state, "policy", {}), exempt = charity.donee === "government" || (charity.donee === "accredited" && Number(charity.expenseRatio) <= 30);
       const year = input.date.slice(0, 4);
       const priorGifts = state.journal.filter(row => row.type === "donation" && !row.reversedBy && row.date.slice(0, 4) === year && !row.data?.exempt);
       const priorAmount = priorGifts.reduce((sum, row) => sum + Number(row.data?.amount ?? 0), 0);
       const priorBooked = priorGifts.reduce((sum, row) => sum + Number(row.data?.donorTax ?? 0), 0);
       const cumulative = priorAmount + (exempt ? 0 : value);
       const totalDue = exempt ? 0 : amount(Math.max(0, cumulative - Number(policy.donorExempt ?? 0)) * Number(policy.donorRate ?? 0) / 100);
       const tax = exempt ? 0 : Math.max(0, amount(totalDue - priorBooked));
      addLine(lines, "5000", value, 0, charity.id); addLine(lines, account, 0, value); if (tax) { addLine(lines, "5330", tax, 0, input.commandId); addLine(lines, "2200", 0, tax, input.commandId); }
       Object.assign(data, { charityId: charity.id, amount: value, deductBasis: value, exempt, donorTax: tax, taxYear: input.date.slice(0, 4), vehicle: charity.isDAF ? "DAF" : "Cash", taxForm: exempt ? null : "1800" });
      break;
    }
    default: fail("Unsupported cash operation.", "unsupported-operation");
  }
  const entry = nextEntry(state, input, ["interest", "dividend"].includes(type) ? "receive" : ["accrueDividend", "accrueInterest"].includes(type) ? "accrue" : type === "cashDonation" ? "donation" : type, lines, data);
  assertFutureBalances(state.journal, entry); return entry;
}

function register(state, name, fallback) { return clone(state.registers[name] ?? fallback); }

function tradeEntry(state, input) {
  assertPostingDate(state, input.date);
  if (!key(input.sym) || !["buy", "sell", "gift"].includes(input.type) || !CASH.has(input.account) || !["Taxable", "PERA"].includes(input.acctType) || input.qty <= 0 || Math.round(input.qty * 1e6) / 1e6 !== input.qty || input.price <= 0 || cents(input.price) / 100 !== input.price) fail("Enter valid trade details.");
  const securities = register(state, "securities", {}), security = securities[input.sym];
  if (!security || security.active === false || security.inactive) fail("Select an active security.");
  const acct = security.account ?? INVESTMENTS[security.cls]; if (!acct) fail("Security account mapping is missing.");
  const gross = amount(input.qty * input.price), fees = amount(input.fees ?? 0), lines = [], data = { sym: input.sym, acctType: input.acctType, qty: input.qty, price: input.price, gross, fees, taxClass: security.taxClass };
  const lots = register(state, "lots", []);
  if (input.type === "buy") { if (gross + fees > balance(state.journal, input.account, undefined, input.date)) fail("Payment exceeds the cash account balance."); addLine(lines, acct, gross + fees, 0, input.sym); addLine(lines, input.account, 0, gross + fees); data.lotId = `${input.commandId}:entry`; lots.push({ id: `${input.commandId}:entry`, sym: input.sym, acctType: input.acctType, date: input.date, qty: input.qty, openQty: input.qty, cost: gross + fees, openCost: gross + fees, seq: state.journal.length + 1, txnId: `${input.commandId}:entry` });
  } else {
    let left = input.qty, cost = 0; const consumed = [];
    for (const lot of lots.filter(row => row.sym === input.sym && row.acctType === input.acctType && row.date <= input.date && row.openQty > 0).sort((a, b) => a.date.localeCompare(b.date) || a.seq - b.seq)) {
      if (!left) break; const use = Math.min(left, lot.openQty), lotCost = amount((lot.openCost ?? lot.cost) * use / lot.openQty); lot.openQty = amount(lot.openQty - use); lot.openCost = amount((lot.openCost ?? lot.cost) - lotCost); left = amount(left - use); cost = amount(cost + lotCost); consumed.push({ lotId: lot.id, qty: use, cost: lotCost });
    }
    if (left > 0.000001) fail("Selected lots must cover exactly the number of units sold."); data.consumed = consumed; addLine(lines, acct, 0, cost, input.sym);
    if (input.type === "gift") {
      const charity = register(state, "charities", []).find(row => row.id === input.target);
      if (!charity || charity.active === false || charity.inactive) fail("Select an active registered organization.");
      addLine(lines, "5000", gross, 0, charity.id); addLine(lines, "4110", Math.max(0, cost - gross), Math.max(0, gross - cost), input.sym);
      data.charityId = charity.id; data.amount = gross; data.deductBasis = cost; data.vehicle = "Securities";
    } else { addLine(lines, input.account, gross - fees, 0); addLine(lines, "4100", Math.max(0, cost - gross + fees), Math.max(0, gross - fees - cost), input.sym); }
  }
  const entry = nextEntry(state, input, input.type === "gift" ? "donation" : input.type, lines, data); assertFutureBalances(state.journal, entry); return { entry, lots };
}

function simpleEntry(state, input, type, lines, data = {}) { assertPostingDate(state, input.date); const entry = nextEntry(state, input, type, lines, data); assertFutureBalances(state.journal, entry); return entry; }

function applyPeriod(state, input, actor) {
  const month = input.month ?? input.month_start; if (!monthOK(month) || !["accrue", "close", "reopen"].includes(input.type)) fail("Invalid period command.");
  const currentMonth = new Date().toISOString().slice(0, 7);
  if (input.type !== "reopen" && month >= currentMonth) fail("The month has not ended.");
  const index = state.periods.findIndex(row => String(row.month_start).slice(0, 7) === month), current = state.periods[index] ?? { month_start: `${month}-01`, closed_at: null };
  const periods = clone(state.periods), event = { id: state.periodEvents.length + 1, month, actor, commandId: input.commandId ?? null, action: input.type, entryId: null, reason: input.reason?.trim() ?? null, occurredAt: new Date().toISOString() };
  if (input.type === "close") { if (current.closed_at ?? current.closedAt) fail("This month is closed."); if (state.recons.find(row => String(row.month_start ?? row.month).slice(0, 7) === month && (row.signed_at || row.signedAt))) { /* signed reconciliation is sufficient */ } else if (input.requireReconciliation !== false) fail("Sign off reconciliation first."); current.closed_at = new Date().toISOString(); }
  if (input.type === "reopen") { if (!(current.closed_at ?? current.closedAt)) fail("This month is not closed."); if (!input.reason?.trim()) fail("Enter a reason to reopen."); current.closed_at = null; }
  if (input.type === "accrue") current.accrued_at = new Date().toISOString();
  if (index < 0) periods.push(current); else periods[index] = current;
  return { state: { ...state, periods, periodEvents: [...state.periodEvents, event] }, result: { ok: true, month, action: input.type } };
}

function applyRecon(state, input, actor) {
  const month = input.month ?? String(input.month_start ?? "").slice(0, 7); if (!monthOK(month) || !["draft", "sign", "reopen"].includes(input.type)) fail("Invalid reconciliation request.");
  const recons = clone(state.recons), index = recons.findIndex(row => String(row.month_start ?? row.month).slice(0, 7) === month), old = index < 0 ? null : recons[index];
  if (Number(old?.revision ?? 0) !== Number(input.revision ?? 0)) fail("The reconciliation changed. Refresh before continuing.");
  if (input.type === "reopen" && (!old?.signed_at || !input.reason?.trim())) fail("Select a signed reconciliation and enter a reason.");
  if (input.type === "sign" && (!old || old.signed_at || old.prepared_by === actor)) fail("A different approver must sign this draft.");
  const next = { ...(old ?? {}), month_start: `${month}-01`, revision: Number(input.revision ?? 0) + 1, prepared_by: input.type === "draft" ? actor : old.prepared_by, approved_by: input.type === "sign" ? actor : null, signed_at: input.type === "sign" ? new Date().toISOString() : null, payload: input.statement ?? old?.payload ?? null };
  if (input.type === "reopen") Object.assign(next, { prepared_by: actor, approved_by: null, signed_at: null, reason: input.reason.trim() });
  if (index < 0) recons.push(next); else recons[index] = next;
  const event = { id: state.reconciliationEvents.length + 1, month_start: `${month}-01`, actor, commandId: input.commandId ?? null, revision: next.revision, action: input.type, before_state: old, after_state: next };
  return { state: { ...state, recons, reconciliationEvents: [...state.reconciliationEvents, event] }, result: { ok: true, revision: next.revision } };
}

function applyAnnual(state, input, actor) {
  const fiscalStart = input.fiscalStart; if (!dateOK(fiscalStart) || !fiscalStart.endsWith("-01") || !["draft", "sign", "reopen"].includes(input.type)) fail("Invalid annual review request.");
  const history = state.annualReviewEvents.filter(row => row.fiscal_start === fiscalStart), latest = history.at(-1); const revision = Number(input.revision ?? 0);
  if (Number(latest?.revision ?? 0) !== revision) fail("The review changed. Refresh before continuing.");
  if (input.type === "draft" && (!Array.isArray(input.checks) || input.checks.length !== 5 || !input.checks.every(value => typeof value === "boolean"))) fail("Complete the review checklist.");
  if (input.type === "sign" && (!latest || latest.action === "sign" || latest.prepared_by === actor || !Array.isArray(latest.checks) || !latest.checks.every(Boolean))) fail("Complete and independently approve the review.");
  if (input.type === "reopen" && (latest?.action !== "sign" || !input.reason?.trim())) fail("Select a signed review and enter a reason.");
  const event = { id: state.annualReviewEvents.length + 1, fiscal_start: fiscalStart, revision: revision + 1, actor, commandId: input.commandId ?? null, prepared_by: input.type === "sign" ? latest.prepared_by : actor, action: input.type, checks: input.type === "draft" ? input.checks : latest.checks, reason: input.type === "reopen" ? input.reason.trim() : null, occurred_at: new Date().toISOString() };
  return { state: { ...state, annualReviewEvents: [...state.annualReviewEvents, event] }, result: { ok: true, revision: event.revision } };
}

function applyMaster(state, input, actor) {
  const command = input.type === "master" || input.type === "prices" ? input : { ...input, type: "master" };
  const registers = clone(state.registers), entity = command.entity ?? (command.type === "prices" ? "prices" : undefined), revision = Number(command.revision ?? 0), revisions = registers.masterRevisions ?? {};
  if (command.type !== "prices" && !MASTER_ENTITIES.has(entity)) fail("Unsupported master register.", "unsupported-operation");
  if (command.operation !== undefined && !["upsert", "delete"].includes(command.operation)) fail("Unsupported master operation.", "unsupported-operation");
  if (command.operation === "delete" && ["policy", "corp"].includes(entity)) fail("Singleton master registers cannot be deleted.");
  if (!entity || Number(revisions[entity] ?? 0) !== revision) fail("The master register changed. Refresh before continuing.");
  let id = command.id ?? command.value?.id ?? entity;
  if (command.type === "prices" || entity === "prices") {
    const rows = command.prices ?? (typeof command.csv === "string" ? command.csv.trim().split(/\r?\n/).slice(1).map(row => { const [sym, price, date, source] = row.split(","); return { sym, price: Number(price), date, source }; }) : []);
    if (!rows.length) fail("Provide price rows."); const history = clone(registers.priceHist ?? {});
    for (const row of rows) { if (!key(row.sym) || !dateOK(row.date) || !Number.isFinite(row.price) || row.price <= 0 || !key(row.source)) fail("Invalid price values."); (history[row.sym] ??= []).push({ date: row.date, price: amount(row.price), src: row.source, source: row.source }); }
    registers.priceHist = history; id = "prices";
  } else if (command.operation === "delete") {
    if (Array.isArray(registers[entity])) registers[entity] = registers[entity].filter(row => row.id !== id); else if (isObject(registers[entity])) delete registers[entity][id];
  } else {
    const value = clone(command.value ?? command.after ?? {}); if (!isObject(value)) fail("Master value must be an object.");
    if (entity === "policy" || entity === "corp") registers[entity] = { ...(registers[entity] ?? {}), ...value };
    else if (entity === "securities") registers[entity] = { ...(registers[entity] ?? {}), [value.sym ?? id]: value };
    else if (Array.isArray(registers[entity])) { const i = registers[entity].findIndex(row => row.id === id); if (i < 0) registers[entity].push({ ...value, id }); else registers[entity][i] = { ...registers[entity][i], ...value, id }; }
    else registers[entity] = { ...(registers[entity] ?? {}), [id]: value };
  }
  const nextRevision = revision + 1; registers.masterRevisions = { ...revisions, [entity]: nextRevision };
  const event = { id: state.masterEvents.length + 1, actor, commandId: input.commandId ?? null, entity, entity_id: String(id), action: command.operation ?? "prices", revision: nextRevision, before_state: state.registers[entity] ?? null, after_state: registers[entity] ?? null, occurred_at: new Date().toISOString() };
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
  if (!key(input.reference) || (input.status === "filed-manually" && (!dateOK(input.filedOn) || !key(input.receiptReference) || !key(input.evidenceFileId)))) fail("A manual filing requires a valid filing date, receipt reference and evidence file upload.");
  const audit = { id: state.auditEvents.length + 1, entry_id: target.id, actor, commandId: input.commandId, action: cgt ? "cgt_filing" : "gift_document", after_state: { form: target.data?.taxForm ?? "Donation documents", journalNo: target.no, reference: input.reference.trim(), status: input.status ?? "reference-only", filedOn: input.filedOn ?? null, receiptReference: input.receiptReference ?? null, evidenceReference: input.evidenceReference ?? null, evidenceFileId: input.evidenceFileId ?? null, documents: input.documents ?? {} }, occurred_at: new Date().toISOString() };
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
  const entry = simpleEntry(state, input, "subscribe", lines, { holderId: input.holderId, shares: input.shares, price: input.price, paid });
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
  if (op === "cash") { assertPostingDate(state, input.date); transitioned = appendEntry(state, cashEntry(state, input), actor, op); result = { ok: true, number: transitioned.journal.at(-1).no }; }
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
    if (input.type === "grant" || op === "grant") { assertPostingDate(state, input.date); const entry = simpleEntry(state, input, "grant", [{ acct: "5000", dr: input.amount, cr: 0, tag: input.recipient }, { acct: "1000", dr: 0, cr: input.amount, tag: "" }], { fund: input.fund, recipient: input.recipient, amount: input.amount }); const grants = register(state, "grants", []); transitioned = appendEntry({ ...state, registers: { ...state.registers, grants: [...grants, { id: input.commandId, date: input.date, dafId: input.fund, toId: input.recipient, amount: input.amount }] } }, entry, actor, op); result = { ok: true, number: entry.no, id: entry.id }; }
    else if (input.type === "gift") { const change = tradeEntry(state, input); transitioned = appendEntry({ ...state, registers: { ...state.registers, lots: change.lots } }, change.entry, actor, op); result = { ok: true, number: change.entry.no, id: change.entry.id }; }
    else fail("Unsupported giving operation.", "unsupported-operation");
  }
  else if (op === "reverse") { assertPostingDate(state, input.date); const original = state.journal.find(row => row.id === input.id); if (!original || original.type === "reversal" || state.journal.some(row => row.data?.reverses === input.id)) fail("Entry is missing or already reversed."); const entry = nextEntry(state, input, "reversal", original.lines.map(line => ({ acct: line.acct, dr: line.cr, cr: line.dr, tag: line.tag })), { reverses: original.id, reason: input.reason }); transitioned = appendEntry(state, entry, actor, op); result = { ok: true, number: entry.no, id: entry.id }; }
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
