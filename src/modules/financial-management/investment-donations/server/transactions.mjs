import { randomUUID } from "node:crypto";
import { accounts, balance, centavos, fiscalDates, validateLines } from "../ledger.ts";
import { buildCashEntry } from "../cash-commands.ts";
import { reconciliationLines } from "../reconciliation.ts";
import { buildCashDonation, donorTaxBalance, pooledBalance, vetDonee } from "../donations.ts";
import { buildTrade, cgtBalance } from "../trades.ts";
import { assertPriorLoanAccruals, buildLoanEntry, loanInterest } from "../loans.ts";
import { postDividend, transferShares } from "./capital-register.mjs";
import { reviewItems } from "../annual-review.ts";
import { dependencyEntries, assertFutureBalances, validPostingDate } from "../financial-engine.mjs";
import { reverseFinancialEntry } from "./financial-reversal.mjs";

export class InvalidCommand extends Error {}
const json = value => typeof value === "string" ? JSON.parse(value) : value;
const dateOnly = value => value instanceof Date ? value.toISOString().slice(0, 10) : String(value).slice(0, 10);
const invalid = message => { throw new InvalidCommand(message); };

export async function updateAnnualReview(database, input) {
  const { actor, fiscalStart, revision, type, checks, reason } = input;
  if (!Number.isSafeInteger(actor) || actor < 1 || !Number.isSafeInteger(revision) || revision < 0 ||
      !/^[1-9]\d{3}-(0[1-9]|1[0-2])-01$/.test(fiscalStart) ||
      !["draft", "sign", "reopen"].includes(type)) invalid("Invalid annual review request.");
  return database.transaction(async trx => {
    const policy = await trx("cgl_registers").where({ name: "policy" }).forUpdate().first();
    if (!policy) throw new Error("Ledger policy is missing.");
    const fyStart = json(policy.payload).fyStart;
    const today = new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Manila", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
    if (!Number.isInteger(fyStart) || fyStart < 1 || fyStart > 12 || fiscalDates(fiscalStart, fyStart).from !== fiscalStart ||
        fiscalStart > today) invalid("Select a valid financial year.");
    const history = await trx("cgl_annual_review_events").where({ fiscal_start: fiscalStart }).select("*");
    const latest = history.sort((a, b) => Number(b.revision) - Number(a.revision))[0];
    if (Number(latest?.revision ?? 0) !== revision) invalid("The review changed. Refresh before continuing.");
    const validChecks = list => Array.isArray(list) && list.length === reviewItems.length && list.every(item => typeof item === "boolean");
    if (type === "draft" && (!validChecks(checks) || latest?.action === "sign")) invalid("Reopen the signed review before editing its checklist.");
    if (type === "sign" && (!latest || latest.action === "sign" || Number(latest.prepared_by) === actor ||
        !validChecks(json(latest.checks)) || !json(latest.checks).every(Boolean))) invalid("Complete the saved checklist and have a different approver sign it.");
    if (type === "reopen" && (latest?.action !== "sign" || typeof reason !== "string" || !reason.trim() || reason.trim().length > 500)) {
      invalid("Select a signed review and enter a reason.");
    }
    await trx("cgl_annual_review_events").insert({
      fiscal_start: fiscalStart, revision: revision + 1, actor, prepared_by: type === "sign" ? latest.prepared_by : actor,
      action: type, checks: JSON.stringify(type === "draft" ? checks : json(latest.checks)),
      reason: type === "reopen" ? reason.trim() : null,
      occurred_at: new Date().toISOString().replace("T", " ").replace("Z", ""),
    });
  });
}

/**
 * @param {any} database
 * @param {{actor:number,id:string,reference:string,cgt?:boolean,status?:string,filedOn?:string,receiptReference?:string,evidenceReference?:string,evidenceFileId?:string,documents?:{cert?:boolean,f1800?:boolean,deed?:boolean}}} command
 */
export async function recordDonationDocument(database, { actor, id, reference, cgt = false, status = "reference-only", filedOn, receiptReference, evidenceReference, evidenceFileId, documents }) {
  const { proofUuid, validateStoredProof } = await import("./proof-validator.mjs");
  if (!Number.isSafeInteger(actor) || actor < 1 || typeof id !== "string" || !id || id.length > 64 ||
      typeof reference !== "string" || !reference.trim() || reference.trim().length > 200) invalid("Enter a document reference.");
  if (!["reference-only", "filed-manually"].includes(status) ||
      (filedOn !== undefined && !validPostingDate(filedOn)) ||
      [receiptReference, evidenceReference].some(value => value !== undefined && (typeof value !== "string" || !value.trim() || value.trim().length > 200)) ||
      (evidenceFileId !== undefined && !proofUuid(evidenceFileId)) ||
      (status === "filed-manually" && (!validPostingDate(filedOn) || !receiptReference?.trim() || !proofUuid(evidenceFileId)))) {
    invalid("A manual filing requires a valid filing date, receipt reference and evidence file upload.");
  }
  if (documents !== undefined && (!documents || typeof documents !== "object" || Array.isArray(documents) ||
      Object.entries(documents).some(([key, value]) => !["cert", "f1800", "deed"].includes(key) || typeof value !== "boolean"))) {
    invalid("Enter valid certificate, donor return and deed document checks.");
  }
  return database.transaction(async trx => {
    const entry = await trx("cgl_journal_entries").where({ id, sealed: 1 }).forUpdate().first();
    if (!entry) invalid("Journal entry not found.");
    const reversal = await trx("cgl_journal_entries").where({ reverses_id: id }).first();
    if (reversal) invalid("This donation has been reversed.");
    const data = json(entry.entry_data);
    if (cgt ? !data.taxForm : entry.entry_type !== "donation" || typeof data.exempt !== "boolean") {
      invalid("This entry does not have the required tax treatment.");
    }
    if (status === "filed-manually" && filedOn < dateOnly(entry.entry_date)) invalid("The filing date cannot precede the transaction.");
    let evidenceFile = null;
    if (status === "filed-manually") {
      const settings = await trx("cgl_endpoint_settings").where({ id: 1 }).forUpdate().first();
      const file = await trx("directus_files").where({ id: evidenceFileId }).forUpdate().first();
      try { evidenceFile = validateStoredProof(file, actor, settings?.service_user); }
      catch (error) { invalid(error.message); }
    }
    const form = cgt ? data.taxForm : data.exempt ? "2322" : "1800";
    const action = cgt ? "cgt_filing" : "gift_document";
    const previous = await trx("cgl_audit_events").where({ entry_id: id, action }).orderBy("id", "desc").first();
    const previousState = previous ? json(previous.after_state) : null;
    const before = previousState?.reference ?? null;
    const checks = cgt ? documents : { cert: Boolean(data.receipt?.cert), f1800: Boolean(data.receipt?.f1800), deed: Boolean(data.receipt?.deed),
      ...(previousState?.documents ?? {}), ...(documents ?? {}) };
    await trx("cgl_audit_events").insert({
      entry_id: id, actor, occurred_at: new Date().toISOString().replace("T", " ").replace("Z", ""),
      action, after_state: JSON.stringify({ form, reference: reference.trim(), previousReference: before, status,
        filedOn: status === "filed-manually" ? filedOn : null, receiptReference: receiptReference?.trim() ?? null,
        evidenceReference: evidenceReference?.trim() ?? null, evidenceFileId: evidenceFile?.id ?? null, evidenceFile, documents: checks }),
    });
  });
}

export async function changePeriod(database, { month, actor, type, reason = "" }) {
  if (!/^[1-9]\d{3}-(0[1-9]|1[0-2])$/.test(month) || !Number.isSafeInteger(actor) || actor < 1 ||
      !["accrue", "close", "reopen"].includes(type)) invalid("Invalid period command.");
  const start = `${month}-01`;
  const end = new Date(`${start}T00:00:00Z`);
  end.setUTCMonth(end.getUTCMonth() + 1, 0);
  const last = dateOnly(end);
  const previous = new Date(`${start}T00:00:00Z`);
  previous.setUTCDate(0);
  const now = new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Manila", year: "numeric", month: "2-digit" }).format(new Date());
  if (month >= now) invalid("The month has not ended.");
  return database.transaction(async trx => {
    const config = await trx("cgl_registers").where({ name: "policy" }).forUpdate().first();
    if (!config) throw new Error("Ledger policy is missing.");
    const policy = json(config.payload);
    const periods = await trx("cgl_periods").select("*");
    const period = await trx("cgl_periods").where({ month_start: start }).forUpdate().first();
    const headers = await trx("cgl_journal_entries").where({ sealed: 1 }).select("*");
    const grouped = new Map();
    for (const row of await trx("cgl_journal_lines").select("*")) {
      const lines = grouped.get(row.entry_id) ?? [];
      lines.push({ acct: row.account, dr: Number(row.debit) / 100, cr: Number(row.credit) / 100, tag: row.tag });
      grouped.set(row.entry_id, lines);
    }
    const entries = headers.map(row => ({ id: row.id, no: Number(row.entry_number), date: dateOnly(row.entry_date),
      type: row.entry_type, data: json(row.entry_data), lines: grouped.get(row.id) ?? [] }));
    const preparerCounts = new Map();
    for (const header of headers.filter(row => dateOnly(row.entry_date).slice(0, 7) === month && row.entry_type !== "closing" && !json(row.entry_data).periodClose)) {
      preparerCounts.set(Number(header.actor), (preparerCounts.get(Number(header.actor)) ?? 0) + 1);
    }
    const mainPreparer = preparerCounts.has(actor) && preparerCounts.get(actor) === Math.max(...preparerCounts.values());
    const earliest = [...entries.map(entry => entry.date.slice(0, 7)), ...periods.map(row => dateOnly(row.month_start).slice(0, 7))].sort()[0];
    if (!earliest || month < earliest) invalid("This month precedes the ledger.");
    const timestamp = new Date().toISOString().replace("T", " ").replace("Z", "");
    const post = async (entryType, lines, data, reverses = null) => {
      if (!lines.length) return null;
      const entry = { id: randomUUID(), no: entries.reduce((max, row) => Math.max(max, row.no), 0) + 1,
        date: last, type: entryType, memo: `${entryType} · ${month}`, lines, data };
      try { assertFutureBalances(entries, entry); }
      catch (error) { invalid(error.message); }
      await persistEntry(trx, entry, actor, reverses);
      entries.push(entry);
      return entry.id;
    };
    const history = await trx("cgl_period_events").where({ month_start: start }).select("*");
    const latest = action => history.filter(row => row.action === action).sort((a, b) => Number(b.id) - Number(a.id))[0];
    let entryId = null;
    if (type === "reopen") {
      if (!period?.closed_at || periods.some(row => row.closed_at && dateOnly(row.month_start) > start)) invalid("Only the latest closed month can be reopened.");
      if (typeof reason !== "string" || !reason.trim() || reason.length > 500) invalid("Enter a reason to reopen.");
      const close = latest("close");
      if (!close) invalid("Historical imported closes cannot be reopened here.");
      const signed = await trx("cgl_reconciliations").where({ month_start: start }).forUpdate().first();
      if (Number(signed?.prepared_by) === actor || mainPreparer) invalid("A different administrator must reopen this preparer's month.");
      await trx("cgl_periods").where({ month_start: start }).update({ closed_at: null });
      if (close.entry_id) {
        const original = entries.find(row => row.id === close.entry_id);
        if (!original) throw new Error("Closing entry missing.");
        entryId = await post("reversal", original.lines.map(line => ({ ...line, dr: line.cr, cr: line.dr })),
          { reverses: original.id, periodClose: month }, original.id);
      }
    } else {
      if (period?.closed_at) invalid("This month is closed.");
      const signed = await trx("cgl_reconciliations").where({ month_start: start }).forUpdate().first();
      if (!signed?.signed_at) invalid("Sign off reconciliation first.");
      const lots = await trx("cgl_registers").where({ name: "lots" }).first();
      if (reconciliationLines(month, entries, json(lots.payload), json(signed.payload)).some(line => line.changed)) {
        invalid("Ledger changed after sign-off. Reconcile again.");
      }
      const debtRegister = await trx("cgl_registers").where({ name: "debts" }).first();
      if (!debtRegister || ![360, 365].includes(policy.dayCount)) throw new Error("Loan accrual settings are missing.");
      const lines = [];
      const debts = json(debtRegister.payload);
      const knownDebts = new Set(debts.map(debt => debt.id));
      if (entries.some(entry => entry.date <= last && entry.lines.some(line => line.acct === "2000" && !knownDebts.has(line.tag)))) {
        invalid("A loan is missing from the debt register.");
      }
      try { assertPriorLoanAccruals(entries, debts, last, policy.dayCount); }
      catch (error) { invalid(error.message); }
      for (const debt of debts.filter(row => !row.cancelled)) {
        if (!Number.isFinite(debt.rate) || debt.rate < 0) throw new Error("Invalid loan rate.");
        const amount = loanInterest(entries, debt, last, policy.dayCount);
        if (amount > 0) lines.push({ acct: "5200", dr: amount, cr: 0, tag: debt.id }, { acct: "2100", dr: 0, cr: amount, tag: debt.id });
        if (amount < 0) {
          if (centavos(-balance(entries, "2100", debt.id, last)) < centavos(-amount)) invalid("Reverse dependent loan payments before reducing an over-accrual.");
          lines.push({ acct: "2100", dr: -amount, cr: 0, tag: debt.id }, { acct: "5200", dr: 0, cr: -amount, tag: debt.id });
        }
      }
      if (type === "accrue") {
        if (!lines.length && latest("accrue")) invalid("No additional loan interest is due.");
        entryId = await post("accrual", lines, { month });
      } else {
        if (month !== earliest && !periods.some(row => dateOnly(row.month_start).slice(0, 7) === dateOnly(previous).slice(0, 7) && row.closed_at)) {
          invalid("Close the previous month first.");
        }
        if (lines.length) invalid("Post outstanding loan interest accruals first.");
        if (Number(signed.prepared_by) === actor || mainPreparer) invalid("A different administrator must close this preparer's month.");
        if (!Number.isInteger(policy.fyStart) || policy.fyStart < 1 || policy.fyStart > 12) throw new Error("Invalid fiscal year settings.");
        const fy = fiscalDates(last, policy.fyStart);
        if (last === fy.to) {
          const activity = entries.filter(entry => entry.date >= fy.from);
          const closing = Object.keys(accounts).filter(code => /^[45]/.test(code)).flatMap(acct => {
            const amount = balance(activity, acct, undefined, last);
            return amount ? [{ acct, dr: Math.max(0, -amount), cr: Math.max(0, amount), tag: "" }] : [];
          });
          const net = closing.reduce((sum, line) => sum + centavos(line.dr) - centavos(line.cr), 0) / 100;
          if (net) closing.push({ acct: "3800", dr: Math.max(0, -net), cr: Math.max(0, net), tag: "" });
          entryId = await post("closing", closing, { periodClose: month });
        }
        if (period) await trx("cgl_periods").where({ month_start: start }).update({ closed_at: timestamp });
        else await trx("cgl_periods").insert({ month_start: start, closed_at: timestamp });
      }
    }
    await trx("cgl_period_events").insert({ month_start: start, actor, action: type, entry_id: entryId,
      reason: type === "reopen" ? reason.trim() : null, occurred_at: timestamp });
    return { entryId };
  });
}

export async function reconcile(trx, input) {
  const { month, actor, revision, type } = input ?? {};
  if (!/^[1-9]\d{3}-(0[1-9]|1[0-2])$/.test(month) ||
      !Number.isSafeInteger(actor) || actor < 1 || !Number.isSafeInteger(revision) || revision < 0 ||
      !["draft", "sign", "reopen"].includes(type)) invalid("Invalid reconciliation request.");
  const month_start = `${month}-01`;
  const currentMonth = new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Manila", year: "numeric", month: "2-digit" }).format(new Date());
  if (month > currentMonth || (type === "sign" && month === currentMonth)) invalid("Sign-off requires a completed month; future drafts are not allowed.");
  const policy = await trx("cgl_registers").where({ name: "policy" }).forUpdate().first();
  if (!policy) throw new Error("Ledger policy is missing.");
  const period = await trx("cgl_periods").where({ month_start }).forUpdate().first();
  if (period?.closed_at) invalid("This month is closed.");
  const old = await trx("cgl_reconciliations").where({ month_start }).forUpdate().first();
  const legacy = await trx("cgl_registers").where({ name: "recons" }).first();
  if (legacy && json(legacy.payload)?.[month]?.at) invalid("This month already has a historical signed snapshot.");
  if (Number(old?.revision ?? 0) !== revision) invalid("The reconciliation changed. Refresh before continuing.");
  if (type === "reopen") {
    const reason = typeof input.reason === "string" ? input.reason.trim() : "";
    if (!old?.signed_at || !reason || reason.length > 500) invalid("Select a signed reconciliation and enter a reason.");
    const next = { revision: revision + 1, prepared_by: actor, approved_by: null, signed_at: null };
    const before = JSON.stringify(old);
    await trx("cgl_reconciliations").where({ month_start }).update(next);
    await trx("cgl_reconciliation_events").insert({ month_start, actor, revision: next.revision, action: type,
      before_state: before, after_state: JSON.stringify({ ...old, ...next, reason }) });
    return { revision: next.revision };
  }
  if (old?.signed_at) invalid("This reconciliation is already signed.");
  if (type === "sign" && !old) invalid("A saved draft must be prepared before approval.");
  const lots = await trx("cgl_registers").where({ name: "lots" }).first();
  const headers = await trx("cgl_journal_entries").where({ sealed: 1 }).select("*");
  const grouped = new Map();
  for (const line of await trx("cgl_journal_lines").select("*")) {
    if (!grouped.has(line.entry_id)) grouped.set(line.entry_id, []);
    grouped.get(line.entry_id).push({ acct: line.account, dr: Number(line.debit) / 100, cr: Number(line.credit) / 100 });
  }
  const entries = headers.map(row => ({ id: row.id, date: dateOnly(row.entry_date), type: row.entry_type,
    data: json(row.entry_data), lines: grouped.get(row.id) ?? [] }));
  const previous = old ? json(old.payload) : null;
  const source = type === "sign" ? previous : input.statement;
  const baseline = reconciliationLines(month, entries, json(lots.payload));
  const keys = new Set([...baseline.map(row => row.key), ...Object.keys(source?.units ?? {})]);
  const payload = { cash: Object.create(null), units: Object.create(null), notes: Object.create(null), snap: Object.create(null) };
  if (keys.size > 2000) invalid("Too many statement lines.");
  for (const key of keys) {
    const row = baseline.find(line => line.key === key);
    if (!row && !Object.hasOwn(previous?.units ?? {}, key)) invalid("Unknown security in statement.");
    const bucket = row?.isCash ? "cash" : "units";
    const current = row?.current ?? 0;
    const value = source?.[bucket]?.[key];
    const note = source?.notes?.[key];
    const digits = row?.isCash ? 2 : 6;
    if (value != null && (typeof value !== "number" || !Number.isFinite(value) ||
        Math.abs(value) > 1e12 || Number(value.toFixed(digits)) !== value)) invalid("Invalid statement amount or precision.");
    if (note != null && (typeof note !== "string" || note.length > 500)) invalid("Explanations must be at most 500 characters.");
    if (type === "sign") {
      if (previous.snap[key] !== current) invalid("Ledger figures changed. Save a fresh draft before signing.");
      if (value == null || (Number((value - current).toFixed(digits)) !== 0 && !note?.trim())) {
        invalid("Complete all statement figures and explain every difference before signing.");
      }
    }
    payload.snap[key] = current;
    payload[bucket][key] = value ?? null;
    if (note?.trim()) payload.notes[key] = note.trim();
  }
  const next = { month_start, revision: revision + 1, prepared_by: type === "draft" ? actor : old.prepared_by,
    approved_by: type === "sign" ? actor : null,
    signed_at: type === "sign" ? new Date().toISOString().replace("T", " ").replace("Z", "") : null,
    payload: JSON.stringify(payload) };
  const before = old ? JSON.stringify(old) : null;
  if (old) await trx("cgl_reconciliations").where({ month_start }).update(next);
  else await trx("cgl_reconciliations").insert(next);
  await trx("cgl_reconciliation_events").insert({ month_start, actor, revision: next.revision, action: type,
    before_state: before, after_state: JSON.stringify(next) });
  return { revision: next.revision };
}

export async function transact(database, input) {
  const { actor, date, type } = input ?? {};
  const model = new Date(`${date}T00:00:00Z`);
  if (!Number.isSafeInteger(actor) || actor < 1 || typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
      !Number.isFinite(+model) || dateOnly(model) !== date) invalid("Enter a valid actor and posting date.");
  if (type === "reverse") {
    if (typeof input.id !== "string" || input.id.length > 64 || typeof input.reason !== "string" ||
        !input.reason.trim() || input.reason.length > 200) invalid("Enter an entry and reversal reason.");
  } else if (type === "issue") {
    if (typeof input.target !== "string" || !input.target || input.target.length > 64 ||
        typeof input.certNo !== "string" || !/^[A-Za-z0-9-]{1,40}$/.test(input.certNo)) invalid("Enter a subscription and a valid certificate number.");
  } else if (["shareTransfer", "voidTransfer", "declareDividend", "payDividend"].includes(type)) {
    if (type === "declareDividend" ? !Number.isFinite(input.perShare) || input.perShare <= 0 || input.perShare > 1e6 || input.confirmUnrestricted !== true :
        type === "shareTransfer" && Array.isArray(input.targets) ? !input.targets.length || input.targets.length > 100 || input.targets.some(target => typeof target !== "string" || !target || target.length > 64) :
        typeof input.target !== "string" || !input.target || input.target.length > 64) invalid("Enter valid capital stock details.");
    if (type === "payDividend" && !["1000", "1010", "1020"].includes(input.account)) invalid("Select a cash account.");
    if (type === "voidTransfer" && (typeof input.reason !== "string" || !input.reason.trim() || input.reason.length > 500)) invalid("Enter a reason.");
  } else if (type === "subscribe") {
    if (typeof input.holderId !== "string" || !input.holderId || !Number.isSafeInteger(input.shares) || input.shares <= 0 ||
        !Number.isFinite(input.price) || input.price <= 0 || !Number.isFinite(input.paid) || input.paid < 0 ||
        !["1000", "1010", "1020"].includes(input.account)) invalid("Enter valid subscription details.");
  } else if (type === "cgtClose") {
    if (!/^[1-9]\d{3}-(0[1-9]|1[0-2])-01$/.test(input.fiscalStart)) invalid("Enter a fiscal-year start date.");
  } else if (type === "grant") {
    if (![input.fund, input.recipient].every(value => typeof value === "string" && value.length > 0 && value.length <= 64) ||
        !Number.isFinite(input.amount) || input.amount <= 0 || input.amount > 1e12 ||
        centavos(input.amount) / 100 !== input.amount) invalid("Enter a valid pooled fund, recipient, and grant amount.");
  } else if (!["buy", "sell", "gift"].includes(type) && (!["transfer", "fee", "interest", "dividend", "contribution", "taxpay", "expaccrue", "exppay", "accrueDividend", "accrueInterest", "collectIncome", "cashDonation", "subcollect", "borrow", "repay"].includes(type) ||
      !Number.isFinite(input.amount) || input.amount <= 0 || input.amount > 1e12 ||
      typeof input.account !== "string" || typeof input.memo !== "string" || input.memo.length > 250 ||
      (input.target !== undefined && (typeof input.target !== "string" || input.target.length > 100)))) {
    invalid("Enter a valid transaction type, account and amount.");
  }
  return database.transaction(async trx => {
    // Serialize all commands before reading balances, tax items or the next journal number.
    const policyRow = await trx("cgl_registers").where({ name: "policy" }).forUpdate().first();
    if (!policyRow) throw new Error("Ledger policy is missing.");
    const periods = await trx("cgl_periods").whereNotNull("closed_at").select("month_start");
    const closed = periods.map(row => dateOnly(row.month_start).slice(0, 7));
    if (closed.includes(date.slice(0, 7))) invalid("This month is closed.");
    if (closed.some(month => month > date.slice(0, 7))) invalid("Reopen later closed periods before backdating an earlier open month.");
    const headers = await trx("cgl_journal_entries").where({ sealed: 1 }).select("*");
    const lines = await trx("cgl_journal_lines").orderBy("line_no").select("*");
    const grouped = new Map();
    for (const line of lines) {
      if (!grouped.has(line.entry_id)) grouped.set(line.entry_id, []);
      grouped.get(line.entry_id).push({ acct: line.account, dr: Number(line.debit) / 100, cr: Number(line.credit) / 100, tag: line.tag });
    }
    const entries = headers.map(row => ({
      id: row.id, no: Number(row.entry_number), date: dateOnly(row.entry_date), type: row.entry_type,
      data: json(row.entry_data), lines: grouped.get(row.id) ?? [],
    }));
    const id = randomUUID();
    let entry;
    let reverses = null;
    let adjustment = 0;
    let cgtAdjustment;
    let nextLots;
    let issuedRegisters;
    if (type === "grant") {
      if (closed.includes(date.slice(0, 7))) invalid("This month is closed.");
      const [charities, grantsRow] = await Promise.all(["charities", "grants"].map(name => trx("cgl_registers").where({ name }).first()));
      if (!charities || !grantsRow) throw new Error("Giving registers are missing.");
      const organizations = json(charities.payload);
      const fund = organizations.find(row => row.id === input.fund && row.isDAF);
      const recipient = organizations.find(row => row.id === input.recipient && !row.isDAF);
      try {
        vetDonee(fund, date);
        vetDonee(recipient, date);
      } catch (error) {
        invalid(error.message);
      }
      const grants = json(grantsRow.payload);
      if ([date, ...grants.filter(row => row.dafId === fund.id && row.date > date).map(row => row.date)].some(day =>
        input.amount > pooledBalance(entries, grants, fund.id, day))) invalid("Grant exceeds the available pooled-fund balance on this or a later grant date.");
      const reversed = new Set(headers.map(row => row.reverses_id));
      const funding = entries.find(row => row.type === "donation" && row.date <= date && !reversed.has(row.id) &&
        row.data.charityId === fund.id && row.data.vehicle === "DAF");
      if (!funding) invalid("The fund has no active contribution.");
      const grant = { id, date, dafId: fund.id, toId: recipient.id, amount: input.amount };
      await trx("cgl_registers").where({ name: "grants" }).update({ payload: JSON.stringify([...grants, grant]) });
      await trx("cgl_audit_events").insert({ entry_id: funding.id, actor, occurred_at: new Date().toISOString().replace("T", " ").replace("Z", ""),
        action: "pooled_grant", after_state: JSON.stringify(grant) });
      return { number: null };
    }
    if (type === "reverse") {
      const original = entries.find(row => row.id === input.id);
      const header = headers.find(row => row.id === input.id);
      if (Number(header?.actor) === actor) invalid("A different administrator must reverse this entry.");
      const names = ["lots", "subs", "certs", "dividends", "debts"];
      const rows = await Promise.all(names.map(name => trx("cgl_registers").where({ name }).first()));
      if (rows.some(row => !row)) throw new Error("Financial registers are missing.");
      try {
        const result = reverseFinancialEntry({ entries, original, input, id,
          registers: Object.fromEntries(rows.map(row => [row.name, json(row.payload)])) });
        entry = result.entry;
        issuedRegisters = result.registers;
        nextLots = result.lots;
      } catch (error) { invalid(error.message); }
      reverses = original.id;
      if (original.type === "donation") {
        const taxYear = original.data.taxYear || original.date.slice(0, 4);
        entry.data.taxYear = taxYear;
        if (original.data.vehicle === "DAF") {
          const grants = await trx("cgl_registers").where({ name: "grants" }).first();
          if (!grants) throw new Error("Grant register is missing.");
          const affected = [date, ...json(grants.payload).filter(row => row.dafId === original.data.charityId && row.date > date).map(row => row.date)];
          if (affected.some(day => pooledBalance([...entries, entry], json(grants.payload), original.data.charityId, day) < 0)) {
            invalid("Reverse or replace committed pooled funding before reversing this contribution.");
          }
        }
        if (!original.data.exempt) {
          const totals = donorTaxBalance([...entries, entry], taxYear, "9999-12-31", json(policyRow.payload));
          adjustment = (totals.due - totals.booked) / 100;
        }
      }
      if (original.type === "sell" && original.data.taxClass === "unlisted") {
        const policy = json(policyRow.payload);
        const fy = fiscalDates(original.date, policy.fyStart);
        entry.data.cgtFiscalStart = fy.from;
        const totals = cgtBalance([...entries, entry], fy.from, fy.to, policy.cgtUnlisted);
        cgtAdjustment = { fiscalStart: fy.from, fiscalEnd: fy.to, delta: totals.due - totals.booked };
      }
    } else if (["shareTransfer", "voidTransfer", "declareDividend", "payDividend"].includes(type)) {
      if (closed.includes(date.slice(0, 7))) invalid("This month is closed.");
      const names = ["corp", "holders", "subs", "certs", "transfers", "dividends"];
      const rows = await Promise.all(names.map(name => trx("cgl_registers").where({ name }).first()));
      if (rows.some(row => !row)) throw new Error("Capital stock registers are missing.");
      const registers = Object.fromEntries(rows.map(row => [row.name, json(row.payload)]));
      const params = { ...registers, entries, input, id, policy: json(policyRow.payload) };
      if (type === "shareTransfer" || type === "voidTransfer") {
        let change;
        try { change = transferShares(params); }
        catch (error) { invalid(error.message); }
        const anchor = entries.reduce((last, item) => !last || item.no > last.no ? item : last, null);
        if (!anchor) invalid("A posted ledger is required to audit transfers.");
        const transfers = change.before ? registers.transfers.map(row => row.id === change.after.id ? change.after : row) :
          [...registers.transfers, change.after];
        await trx("cgl_registers").where({ name: "certs" }).update({ payload: JSON.stringify(change.certs) });
        await trx("cgl_registers").where({ name: "transfers" }).update({ payload: JSON.stringify(transfers) });
        await trx("cgl_audit_events").insert({ entry_id: anchor.id, actor,
          occurred_at: new Date().toISOString().replace("T", " ").replace("Z", ""),
          action: type === "voidTransfer" ? "transfer_void" : "share_transfer",
          after_state: JSON.stringify({ before: change.before, after: change.after }) });
        return { number: null };
      }
      let change;
      try { change = postDividend(params); }
      catch (error) { invalid(error.message); }
      entry = change.entry;
      issuedRegisters = { dividends: type === "declareDividend" ? [...registers.dividends, change.record] :
        registers.dividends.map(row => row.id === change.record.id ? change.record : row) };
    } else if (type === "subscribe") {
      if (closed.includes(date.slice(0, 7))) invalid("This month is closed.");
      const rows = await Promise.all(["corp", "holders", "subs"].map(name => trx("cgl_registers").where({ name }).first()));
      if (rows.some(row => !row)) throw new Error("Capital stock registers are missing.");
      const [corp, holders, subs] = rows.map(row => json(row.payload));
      const holder = holders.find(row => row.id === input.holderId);
      if (!holder || holder.inactive || holder.active === false) invalid("Select an active stockholder.");
      const { shares, price, paid, account } = input;
      const kind = input.kind ?? "unissued";
      const fromDeposits = input.fromDeposits ?? input.fromDffs ?? 0;
      if (!["unissued", "incorporation", "increase"].includes(kind) || !Number.isFinite(fromDeposits) || fromDeposits < 0 || centavos(fromDeposits) / 100 !== fromDeposits ||
          (input.callDue && (!validPostingDate(input.callDue) || input.callDue < date)) ||
          (input.callDate && (!validPostingDate(input.callDate) || input.callDate < date || (input.callDue && input.callDate > input.callDue))) ||
          (input.callRef !== undefined && (typeof input.callRef !== "string" || input.callRef.length > 200))) invalid("Enter valid subscription kind, deposit payment and call details.");
      const increase = (corp.increases ?? []).find(row => row.id === input.incId && row.date <= date);
      if (kind === "increase" && !increase) invalid("Select an approved capital increase on or before the subscription date.");
      if (kind !== "increase" && input.incId) invalid("Only capital-increase subscriptions can link to an increase.");
      if (dependencyEntries(entries, date).some(row => row.type === "divdeclare" && row.date >= date)) invalid("Reverse dependent dividend declarations before adding shares on or before their declaration date.");
      const { par, authorized } = corp;
      if (!Number.isFinite(par) || par <= 0 || !Number.isSafeInteger(authorized) || authorized <= 0) throw new Error("Invalid capital settings.");
      if (price < par || shares * price > 1e12 || centavos(price) / 100 !== price || centavos(paid) / 100 !== paid) {
        invalid("Enter a subscription price at or above par and amounts in centavos.");
      }
      const dates = [...new Set([date, ...subs.flatMap(row => [row.date, row.cancelledAt]), ...(corp.increases ?? []).map(row => row.date)])]
        .filter(day => day && day >= date);
      const liveSubs = day => subs.filter(row => row.date <= day && (!row.cancelled || row.cancelledAt > day));
      const authorizedOn = day => (corp.increases ?? []).filter(row => row.date > day).sort((a, b) => a.date.localeCompare(b.date))[0]?.from ?? authorized;
      if (dates.some(day => shares + liveSubs(day).reduce((sum, row) => sum + row.shares, 0) > authorizedOn(day))) {
        invalid("Subscription exceeds authorized shares.");
      }
      if (kind === "increase" && dates.some(day => shares + liveSubs(day).filter(row => row.kind === "increase" && row.incId === increase.id)
        .reduce((sum, row) => sum + row.shares, 0) > increase.to - increase.from)) invalid("Subscription exceeds the shares approved in this capital increase.");
      const total = centavos(shares * price);
      const capital = centavos(shares * par);
      if (total < 1 || capital < 1 || centavos(paid) + centavos(fromDeposits) > total) invalid("Initial payment cannot exceed the subscription value.");
      if (centavos(fromDeposits) > Math.max(0, -centavos(balance(entries, "3150", undefined, date)))) invalid("Payment exceeds available deposits for future subscription.");
      const premium = total - capital;
      const policy = json(policyRow.payload);
      const rate = date < "2025-07-01" ? policy.dstIssueOld : policy.dstIssue;
      if (!Number.isFinite(rate) || rate < 0 || rate > 100) throw new Error("Invalid original issue DST rate.");
      const dst = centavos(capital / 100 * rate / 100);
      const apic = Math.min(dst, Math.max(0, premium - centavos(balance(entries, "3100", undefined, date))));
      if (kind === "incorporation" && !validPostingDate(corp.secRegDate)) invalid("Enter the corporation's SEC registration date for an incorporation subscription.");
      const dstDate = kind === "incorporation" ? corp.secRegDate : date;
      const taxDue = new Date(`${dstDate.slice(0, 7)}-01T00:00:00Z`);
      taxDue.setUTCMonth(taxDue.getUTCMonth() + 1, 5);
      const lines = [
        ["3020", total, 0, id], ["3010", 0, capital, id], ["3100", 0, premium, id],
        [account, centavos(paid), 0, ""], ["3020", 0, centavos(paid), id],
        ["3150", centavos(fromDeposits), 0, ""], ["3020", 0, centavos(fromDeposits), id],
        ["3100", apic, 0, id], ["3800", dst - apic, 0, id], ["2200", 0, dst, id],
      ].filter(([, dr, cr]) => dr || cr).map(([acct, dr, cr, tag]) => ({ acct, dr: dr / 100, cr: cr / 100, tag }));
      entry = { id, no: entries.reduce((max, row) => Math.max(max, row.no), 0) + 1, date, type,
        memo: `Share subscription · ${holder.name}`, lines,
        data: { subId: id, holderId: holder.id, shares, price, amount: total / 100, paid: (centavos(paid) + centavos(fromDeposits)) / 100,
          cashPaid: paid, fromDeposits, kind, incId: kind === "increase" ? input.incId : "", callDue: input.callDue ?? "",
          dst: dst / 100, dstRate: rate, taxForm: dst ? "2000" : null, taxDue: dst ? dateOnly(taxDue) : null } };
      issuedRegisters = { subs: [...subs, { id, date, holderId: holder.id, shares, price, kind,
        incId: kind === "increase" ? input.incId : "", issuedAt: null, certNo: "", callDue: input.callDue ?? "",
        callDate: input.callDate ?? (input.callDue ? date : ""), callRef: input.callRef ?? "", txnId: id }] };
    } else if (type === "cgtClose") {
      const policy = json(policyRow.payload);
      const fy = fiscalDates(input.fiscalStart, policy.fyStart);
      if (fy.from !== input.fiscalStart || date <= fy.to) invalid("Post the adjustment after the selected fiscal year ends.");
      if (closed.includes(date.slice(0, 7))) invalid("This month is closed.");
      if (entries.some(row => row.data.cgtFiscalStart === fy.from && row.date > date)) invalid("Post on or after later capital gains tax transactions and corrections for this fiscal year.");
      const totals = cgtBalance(entries, fy.from, fy.to, policy.cgtUnlisted, date);
      const delta = totals.due - totals.booked;
      if (!delta) invalid("No capital gains tax adjustment is due.");
      const amount = Math.abs(delta) / 100;
      const due = new Date(`${fy.to}T00:00:00Z`);
      due.setUTCMonth(due.getUTCMonth() + 4, 15);
      entry = { id, no: entries.reduce((max, row) => Math.max(max, row.no), 0) + 1, date,
        type: "taxtrueup", memo: `Capital gains tax adjustment · ${fy.from}`, data: {
          cgtFiscalStart: fy.from, taxForm: "1707-A", taxDue: dateOnly(due), assessment: totals.due / 100,
        }, lines: delta > 0 ? [{ acct: "5320", dr: amount, cr: 0, tag: id }, { acct: "2200", dr: 0, cr: amount, tag: id }] :
          [{ acct: "1220", dr: amount, cr: 0, tag: id }, { acct: "5320", dr: 0, cr: amount, tag: id }] };
    } else if (type === "borrow" || type === "repay") {
      const row = await trx("cgl_registers").where({ name: "debts" }).first();
      if (!row) throw new Error("Loan register is missing.");
      try {
        const result = buildLoanEntry(entries, closed, json(row.payload), input, id, json(policyRow.payload).dayCount);
        entry = result.entry;
        if (result.nextLoans) issuedRegisters = { debts: result.nextLoans };
      } catch (error) {
        if (/^(Enter |Select |Payment exceeds|This month is closed|Use a date|Post or correct)/.test(error.message)) invalid(error.message);
        throw error;
      }
    } else if (type === "issue") {
      if (closed.includes(date.slice(0, 7))) invalid("This month is closed.");
      const [subsRow, certsRow, corpRow] = await Promise.all(["subs", "certs", "corp"].map(name =>
        trx("cgl_registers").where({ name }).first()));
      if (!subsRow || !certsRow || !corpRow) throw new Error("Capital stock registers are missing.");
      const subs = json(subsRow.payload);
      const certs = json(certsRow.payload);
      const sub = subs.find(row => row.id === input.target);
      const original = sub && entries.find(row => row.id === sub.txnId && row.type === "subscribe" && row.date <= date);
      if (!original || headers.some(row => row.reverses_id === original.id) || sub.cancelled || sub.issuedAt || sub.date > date || certs.some(row => row.subId === sub.id && !row.voidedAt)) {
        invalid("Select an active, unissued subscription.");
      }
      if (balance(entries, "3020", sub.id, date) !== 0) invalid("Only fully paid subscriptions qualify for a certificate.");
      if (certs.some(row => String(row.no).toUpperCase() === input.certNo.toUpperCase())) invalid("Certificate number already exists.");
      const par = json(corpRow.payload).par;
      const amount = centavos(sub.shares * par) / 100;
      if (!Number.isSafeInteger(sub.shares) || sub.shares < 1 || !Number.isFinite(par) || par <= 0 ||
          amount <= 0 || -balance([original], "3010") !== amount || amount > -balance(entries, "3010", undefined, date)) {
        invalid("Subscribed par value does not match the ledger.");
      }
      entry = { id, no: entries.reduce((max, row) => Math.max(max, row.no), 0) + 1, date, type,
        memo: `Certificate ${input.certNo} issued`, data: { subId: sub.id, certNo: input.certNo },
        lines: [{ acct: "3010", dr: amount, cr: 0, tag: sub.id }, { acct: "3000", dr: 0, cr: amount, tag: sub.id }] };
      issuedRegisters = {
        subs: subs.map(row => row.id === sub.id ? { ...row, certNo: input.certNo, issuedAt: date } : row),
        certs: [...certs, { id, no: input.certNo, holderId: sub.holderId, shares: sub.shares, date,
          source: "subscription", subId: sub.id, txnId: id }],
      };
    } else if (["buy", "sell", "gift"].includes(type)) {
      const [securityRow, lotRow] = await Promise.all([
        trx("cgl_registers").where({ name: "securities" }).first(),
        trx("cgl_registers").where({ name: "lots" }).first(),
      ]);
      if (!securityRow || !lotRow) throw new Error("Security or lot register is missing.");
      try {
        const trade = buildTrade(entries, closed, json(securityRow.payload), json(lotRow.payload), input, id, json(policyRow.payload));
        ({ entry, lots: nextLots } = trade);
        if (type === "gift") {
          const valuation = typeof input.valuation === "string" ? input.valuation.trim() : "";
          if (!valuation || valuation.length > 200 || !trade.gift) invalid("Enter a documented valuation source.");
          const charities = await trx("cgl_registers").where({ name: "charities" }).first();
          if (!charities) throw new Error("Organization register is missing.");
          ({ entry, adjustment } = buildCashDonation(entries, closed, { ...input, amount: trade.gift.fairValue }, id,
            json(charities.payload).find(row => row.id === input.target), json(policyRow.payload),
            { cost: trade.gift.cost, lines: entry.lines, data: entry.data, valuation }));
        }
      } catch (error) {
        if (/^(Select |Choose |Enter |Payment exceeds|This month is closed|Use a date|Unlisted securities|Lot quantities|Selected lots|The selected lot|Trading costs|Complete |The organization's |Only taxable)/.test(error.message)) invalid(error.message);
        throw error;
      }
    } else if (type === "cashDonation") {
      const charities = await trx("cgl_registers").where({ name: "charities" }).first();
      if (!charities) throw new Error("Organization register is missing.");
      try {
        ({ entry, adjustment } = buildCashDonation(entries, closed, input, id,
          json(charities.payload).find(row => row.id === input.target), json(policyRow.payload)));
      } catch (error) {
        if (/^(Select |Complete |The organization's |Enter |Payment exceeds|This month is closed|Use a date)/.test(error.message)) invalid(error.message);
        throw error;
      }
    } else {
      const policy = json(policyRow.payload);
      const rate = policy?.intFwt;
      if (!Number.isFinite(rate) || rate < 0 || rate > 100) throw new Error("Invalid withholding policy.");
      if (type === "subcollect") {
        const register = await trx("cgl_registers").where({ name: "subs" }).first();
        const subscription = register && json(register.payload).find(row => row.id === input.target);
        if (!subscription || subscription.cancelled || subscription.issuedAt || subscription.date > date) {
          invalid("Select an active, unissued subscription on or before the receipt date.");
        }
      }
      if (type === "contribution") {
        const source = input.source;
        if (["deposit", "Deposit for future stock subscription"].includes(source)) {
          const rows = await Promise.all(["corp", "subs"].map(name => trx("cgl_registers").where({ name }).first()));
          if (rows.some(row => !row)) throw new Error("Capital stock registers are missing.");
          const [corp, subs] = rows.map(row => json(row.payload));
          const authorized = (corp.increases ?? []).filter(row => row.date > date).sort((a, b) => a.date.localeCompare(b.date))[0]?.from ?? corp.authorized;
          const available = authorized - subs.filter(row => row.date <= date && (!row.cancelled || row.cancelledAt > date)).reduce((sum, row) => sum + row.shares, 0);
          if ((input.secCriteriaMet ?? input.confirmCriteria) !== true || typeof input.secApplicationRef !== "string" || !input.secApplicationRef.trim() || input.secApplicationRef.length > 200 ||
              !Number.isSafeInteger(input.requestedShares) || input.requestedShares <= Math.max(0, available)) {
            invalid("Equity deposits require insufficient authorized unsubscribed shares and a filed or approved SEC increase application reference. Otherwise record a stockholder advance.");
          }
        }
      }
      try {
        entry = buildCashEntry(entries, closed, input, id, rate, policy.divFwt);
        if (type === "contribution" && ["deposit", "Deposit for future stock subscription"].includes(input.source)) {
          Object.assign(entry.data, { secCriteriaMet: true, secApplicationRef: input.secApplicationRef.trim(), requestedShares: input.requestedShares });
        }
      } catch (error) {
        if (/^(Enter |Select |Choose |Payment exceeds|This month is closed|Use a date)/.test(error.message)) invalid(error.message);
        throw error;
      }
    }
    if (type === "sell" && entry.data.taxClass === "unlisted" && entries.some(row => row.type === "taxtrueup" && row.data.cgtFiscalStart === entry.data.cgtFiscalStart)) {
      const policy = json(policyRow.payload);
      const fy = fiscalDates(date, policy.fyStart);
      const totals = cgtBalance([...entries, entry], fy.from, fy.to, policy.cgtUnlisted);
      cgtAdjustment = { fiscalStart: fy.from, fiscalEnd: fy.to, delta: totals.due - totals.booked };
    }
    try { assertFutureBalances(entries, entry); }
    catch (error) { invalid(error.message); }
    if (entry.type === "divdeclare" && [date, ...entries.filter(row => row.date > date).map(row => row.date)].some(day => balance([...entries, entry], "3800", undefined, day) > 0)) {
      invalid("Dividend would exceed retained earnings on this or a later posting date.");
    }
    await persistEntry(trx, entry, actor, reverses);
    if (issuedRegisters) {
      for (const [name, payload] of Object.entries(issuedRegisters)) {
        const before = await trx("cgl_registers").where({ name }).first();
        await trx("cgl_registers").where({ name }).update({ payload: JSON.stringify(payload) });
        await trx("cgl_audit_events").insert({ entry_id: entry.id, actor, occurred_at: new Date().toISOString().replace("T", " ").replace("Z", ""),
          action: "financial_register_changed", after_state: JSON.stringify({ name, before: json(before.payload), after: payload }) });
      }
    }
    if (nextLots) {
      const before = await trx("cgl_registers").where({ name: "lots" }).first();
      await trx("cgl_registers").where({ name: "lots" }).update({ payload: JSON.stringify(nextLots) });
      await trx("cgl_audit_events").insert({ entry_id: entry.id, actor, occurred_at: new Date().toISOString().replace("T", " ").replace("Z", ""),
        action: "financial_register_changed", after_state: JSON.stringify({ name: "lots", before: json(before.payload), after: nextLots }) });
    }
    if (adjustment) {
      const adjustmentId = randomUUID();
      const positive = adjustment > 0;
      const amount = Math.abs(adjustment);
      const adjustmentDate = entries.filter(row => (row.data.taxYear ?? row.date.slice(0, 4)) === entry.data.taxYear && row.date > date)
        .reduce((latest, row) => row.date > latest ? row.date : latest, date);
      const due = new Date(`${adjustmentDate}T00:00:00Z`);
      due.setUTCDate(due.getUTCDate() + 30);
      await persistEntry(trx, {
        id: adjustmentId, no: entry.no + 1, date: adjustmentDate, type: "taxtrueup", memo: "Donor's tax adjustment",
        data: { taxYear: entry.data.taxYear, taxForm: "1800 (amended)", taxDue: dateOnly(due), source: entry.id },
        lines: positive ? [{ acct: "5330", dr: amount, cr: 0, tag: adjustmentId }, { acct: "2200", dr: 0, cr: amount, tag: adjustmentId }] :
          [{ acct: "1220", dr: amount, cr: 0, tag: adjustmentId }, { acct: "5330", dr: 0, cr: amount, tag: adjustmentId }],
      }, actor, null);
    }
    if (cgtAdjustment?.delta) {
      const adjustmentId = randomUUID();
      const amount = Math.abs(cgtAdjustment.delta) / 100;
      const adjustmentDate = entries.filter(row => row.data.cgtFiscalStart === cgtAdjustment.fiscalStart && row.date > date)
        .reduce((latest, row) => row.date > latest ? row.date : latest, date);
      const due = new Date(`${cgtAdjustment.fiscalEnd}T00:00:00Z`);
      due.setUTCMonth(due.getUTCMonth() + 4, 15);
      await persistEntry(trx, { id: adjustmentId, no: entry.no + 1, date: adjustmentDate, type: "taxtrueup", memo: "Capital gains tax adjustment",
        data: { cgtFiscalStart: cgtAdjustment.fiscalStart, taxForm: "1707-A", taxDue: dateOnly(due), source: entry.id },
        lines: cgtAdjustment.delta > 0 ? [{ acct: "5320", dr: amount, cr: 0, tag: adjustmentId }, { acct: "2200", dr: 0, cr: amount, tag: adjustmentId }] :
          [{ acct: "1220", dr: amount, cr: 0, tag: adjustmentId }, { acct: "5320", dr: 0, cr: amount, tag: adjustmentId }] }, actor, null);
    }
    return { number: entry.no };
  });
}

async function persistEntry(trx, entry, actor, reverses) {
    if (!validPostingDate(entry.date)) invalid("Enter a valid posting date.");
    const period = await trx("cgl_periods").where({ month_start: `${entry.date.slice(0, 7)}-01` }).forUpdate().first();
    if (period?.closed_at) invalid("This month is closed.");
    entry.lines = entry.lines.filter(line => line.dr || line.cr).map(line => ({ ...line, tag: line.tag ?? "" }));
    try { validateLines(entry.lines); }
    catch (error) { invalid(error.message); }
    const timestamp = new Date().toISOString().replace("T", " ").replace("Z", "");
    await trx("cgl_journal_entries").insert({
      id: entry.id, entry_number: entry.no, entry_date: entry.date, entry_type: entry.type, memo: entry.memo,
      entry_data: JSON.stringify(entry.data), actor, created_at: timestamp, reverses_id: reverses, sealed: 0,
    });
    await trx("cgl_journal_lines").insert(entry.lines.map((line, index) => ({
      entry_id: entry.id, line_no: index + 1, account: line.acct, debit: centavos(line.dr), credit: centavos(line.cr), tag: line.tag,
    })));
    await trx("cgl_journal_entries").where({ id: entry.id, sealed: 0 }).update({ sealed: 1 });
    await trx("cgl_audit_events").insert({
      entry_id: entry.id, actor, occurred_at: timestamp, action: reverses ? "reversed" : "posted", after_state: JSON.stringify(entry),
    });
}
