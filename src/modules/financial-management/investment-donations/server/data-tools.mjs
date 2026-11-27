import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import { accounts, validateLines } from "../ledger.ts";
import { calendarDate, MasterDataError, investmentAccounts, validateImportedMasterData } from "./master-data.mjs";
import { assertStorageReady, json, readStoredJournal, readStoredRegisters } from "./storage.mjs";

const fail = message => { throw new MasterDataError(message); };
export function dataToolsEnabled(env = process.env) {
  return env.NODE_ENV !== "production" && env.CGL_ENABLE_DATA_TOOLS === "true";
}
const digest = data => createHash("sha256").update(JSON.stringify(data)).digest("hex");
export function createBackup(data, createdAt = new Date().toISOString()) {
  return { format: "cgl-backup", version: 1, createdAt, checksum: digest(data), data };
}
const key = z.string().min(1).max(64).regex(/^[A-Za-z0-9_.-]+$/);
const timestamp = z.string().min(10).max(35);
const integer = z.coerce.number().int().positive().max(Number.MAX_SAFE_INTEGER);
const line = z.object({ acct: z.string().refine(value => Object.hasOwn(accounts, value)), dr: z.number().finite().nonnegative(),
  cr: z.number().finite().nonnegative(), tag: z.string().max(255) }).strict();
const entry = z.object({ id: key, no: integer, date: calendarDate, type: z.string().min(1).max(40),
  memo: z.string().max(512), data: z.record(z.string(), z.unknown()), lines: z.array(line).min(2).max(1000), reversedBy: key.optional() }).strict();
const eventBase = { id: integer.optional(), actor: integer, occurred_at: timestamp };
const auditSchema = z.object({ ...eventBase, entry_id: key, action: z.string().min(1).max(40), after_state: z.unknown() }).strict();
const periodSchema = z.object({ month_start: calendarDate, closed_at: timestamp.nullable() }).strict();
const reconSchema = z.object({ month_start: calendarDate, revision: integer, prepared_by: integer,
  approved_by: integer.nullable(), signed_at: timestamp.nullable(), payload: z.unknown() }).strict();
const reconEventSchema = z.object({ ...eventBase, month_start: calendarDate, revision: integer,
  action: z.enum(["draft", "sign", "reopen"]), before_state: z.unknown().nullable(), after_state: z.unknown() }).strict();
const reviewSchema = z.object({ ...eventBase, fiscal_start: calendarDate, revision: integer, prepared_by: integer,
  action: z.enum(["draft", "sign", "reopen"]), checks: z.unknown(), reason: z.string().max(500).nullable() }).strict();
const periodEventSchema = z.object({ ...eventBase, month_start: calendarDate, action: z.enum(["accrue", "close", "reopen"]),
  entry_id: key.nullable(), reason: z.string().max(500).nullable() }).strict();
const masterEventSchema = z.object({ ...eventBase, entity: z.string().min(1).max(64), entity_id: key,
  action: z.string().min(1).max(40), revision: z.coerce.number().int().nonnegative(), before_state: z.unknown().nullable(), after_state: z.unknown().nullable() }).strict();
const backupData = z.object({ registers: z.record(z.string(), z.unknown()), journal: z.array(entry).max(100000),
  periods: z.array(periodSchema).max(2400), auditEvents: z.array(auditSchema).max(200000),
  reconciliations: z.array(reconSchema).max(2400), reconciliationEvents: z.array(reconEventSchema).max(100000),
  annualReviewEvents: z.array(reviewSchema).max(10000), periodEvents: z.array(periodEventSchema).max(100000),
  masterEvents: z.array(masterEventSchema).max(100000) }).strict();
const parse = (schema, input) => {
  const result = schema.safeParse(input);
  if (!result.success) fail(`Invalid backup: ${result.error.issues[0]?.path.join(".") ?? "structure"}.`);
  return result.data;
};
export function validateBackup(input) {
  if (JSON.stringify(input).length > 20_000_000) fail("Backup exceeds the 20 MB import limit.");
  const envelope = parse(z.object({ format: z.literal("cgl-backup"), version: z.literal(1), createdAt: timestamp,
    checksum: z.string().regex(/^[a-f0-9]{64}$/), data: z.unknown() }).strict(), input);
  if (digest(envelope.data) !== envelope.checksum) fail("Backup checksum does not match.");
  const data = parse(backupData, envelope.data);
  const r = data.registers;
  validateImportedMasterData(r);
  const allowed = new Set(["corp", "policy", "classes", "securities", "priceHist", "lots", "debts", "holders", "subs", "certs",
    "transfers", "dividends", "charities", "grants", "periods", "recons", "review", "calls", "capitalIncreases", "accountMappings", "masterRevisions"]);
  if (Object.keys(r).some(name => !allowed.has(name))) fail("Backup contains unknown registers.");
  if (!r.corp || !r.policy || !Number.isInteger(r.policy.fyStart) || r.policy.fyStart < 1 || r.policy.fyStart > 12 ||
      !Number.isFinite(r.corp.par) || r.corp.par <= 0 || !Number.isSafeInteger(r.corp.authorized) || r.corp.authorized <= 0) fail("Invalid corporation or policy settings.");
  const pct = ["sttRate", "sttRateOld", "divFwt", "intFwt", "cgtUnlisted", "donorRate", "deductCap", "marginalRate", "dstIssue", "dstTransfer", "divWhtInd", "divWhtNr", "brokerRate", "vatRate", "pseFee", "sccpFee"];
  if (pct.some(name => !Number.isFinite(r.policy[name]) || r.policy[name] < 0 || r.policy[name] > 100)) fail("Invalid policy tax ranges.");
  for (const name of ["classes", "lots", "debts", "holders", "subs", "certs", "transfers", "dividends", "charities", "grants"]) {
    if (!Array.isArray(r[name]) || r[name].length > 100000 || r[name].some(row => !row || !key.safeParse(row.id).success) ||
        new Set(r[name].map(row => row.id)).size !== r[name].length) fail(`Invalid or duplicate ${name} identifiers.`);
  }
  if (!r.securities || Array.isArray(r.securities) || typeof r.securities !== "object" || !r.priceHist || typeof r.priceHist !== "object") fail("Invalid security registers.");
  if (Math.abs(r.classes.filter(row => row.active !== false && !row.inactive).reduce((sum, row) => sum + row.target, 0) - 100) > 1e-8) fail("Allocation targets must total 100%.");
  const classes = new Set(r.classes.map(row => row.id));
  const holders = new Set(r.holders.map(row => row.id));
  const orgs = new Set(r.charities.map(row => row.id));
  parse(z.record(z.string(), z.number().int().nonnegative()), r.masterRevisions ?? {});
  for (const [sym, security] of Object.entries(r.securities)) if (security.sym !== sym || !classes.has(security.cls) || !["listed", "fund", "govsec", "unlisted"].includes(security.taxClass)) fail("Invalid security class or tax treatment.");
  for (const lot of r.lots) if (!r.securities[lot.sym] || !Number.isFinite(lot.qty) || lot.qty <= 0 || !Number.isFinite(lot.openQty) || lot.openQty < 0 || lot.openQty > lot.qty || !Number.isFinite(lot.cost) || lot.cost < 0) fail("Invalid lot or security reference.");
  for (const sub of r.subs) if (!holders.has(sub.holderId) || !Number.isSafeInteger(sub.shares) || sub.shares <= 0 || !calendarDate.safeParse(sub.date).success) fail("Invalid subscription or holder reference.");
  const subscriptions = new Set(r.subs.map(row => row.id));
  if (r.subs.reduce((sum, row) => sum + row.shares, 0) > r.corp.authorized) fail("Subscriptions exceed authorized shares.");
  for (const debt of r.debts) if (!Number.isFinite(debt.rate) || debt.rate < 0 || debt.rate > 100 || typeof debt.scheduled !== "boolean") fail("Invalid loan settings.");
  const certNumbers = new Set();
  for (const cert of r.certs) {
    if (!holders.has(cert.holderId) || !Number.isSafeInteger(cert.shares) || cert.shares <= 0 || !calendarDate.safeParse(cert.date).success ||
        !/^[A-Za-z0-9-]{1,40}$/.test(cert.no) || certNumbers.has(cert.no) || (cert.subId && !subscriptions.has(cert.subId))) fail("Invalid certificate or holder/subscription reference.");
    certNumbers.add(cert.no);
  }
  for (const transfer of r.transfers) if (!holders.has(transfer.fromId) || !holders.has(transfer.toId) || transfer.fromId === transfer.toId ||
      !Number.isSafeInteger(transfer.shares) || transfer.shares <= 0 || !calendarDate.safeParse(transfer.date).success) fail("Invalid share transfer.");
  for (const grant of r.grants) if (!orgs.has(grant.dafId) || !orgs.has(grant.toId) || !Number.isFinite(grant.amount) || grant.amount <= 0 || !calendarDate.safeParse(grant.date).success) fail("Invalid grant references.");
  for (const call of r.calls ?? []) if (!subscriptions.has(call.subId) || call.dueDate <= call.date) fail("Invalid subscription call.");
  for (const increase of r.capitalIncreases ?? []) if (!Number.isSafeInteger(increase.from) || increase.from < 0 || increase.to <= increase.from) fail("Invalid capital increase.");
  for (const mapping of r.accountMappings ?? []) {
    if (/^\d{4}$/.test(mapping.id)) {
      if (mapping.id !== mapping.account || !Object.hasOwn(accounts, mapping.id) || !mapping.coaCode) fail("Invalid financial-statement account mapping.");
    } else if (!classes.has(mapping.id) || !Object.values(investmentAccounts).includes(mapping.account)) fail("Invalid class account mapping.");
  }
  for (const [sym, history] of Object.entries(r.priceHist)) {
    if (!r.securities[sym] || !Array.isArray(history)) fail("Invalid price history reference.");
    const unique = new Set();
    for (const row of history) {
      parse(z.object({ date: calendarDate, price: z.number().finite().positive().max(1e12), src: z.string().trim().min(1).max(200), source: z.string().optional() }).strict(), row);
      const identity = `${row.date}|${row.src}`;
      if (unique.has(identity)) fail("Duplicate price date/source history.");
      unique.add(identity);
    }
  }
  for (const charity of r.charities) if (!Number.isFinite(charity.expenseRatio) || charity.expenseRatio < 0 || charity.expenseRatio > 100 ||
      Object.values(charity.checks ?? {}).some(date => date && !calendarDate.safeParse(date).success)) fail("Invalid organization vetting.");
  const ids = new Set(), numbers = new Set(), reversed = new Set();
  for (const row of [...data.journal].sort((a, b) => a.no - b.no)) {
    validateLines(row.lines);
    if (ids.has(row.id) || numbers.has(row.no)) fail("Duplicate journal ID or number.");
    if (row.type === "reversal") {
      const original = data.journal.find(item => item.id === row.data.reverses);
      if (!original || !ids.has(original.id) || reversed.has(original.id) || original.type === "reversal") fail("Invalid reversal reference.");
      const totals = lines => lines.reduce((map, item) => {
        const key = `${item.acct}|${item.tag}`;
        map[key] = (map[key] ?? 0) + Math.round(item.dr * 100) - Math.round(item.cr * 100);
        return map;
      }, {});
      const a = totals(original.lines), b = totals(row.lines);
      if ([...new Set([...Object.keys(a), ...Object.keys(b)])].some(key => (a[key] ?? 0) !== -(b[key] ?? 0))) fail("Reversal lines must exactly offset the source.");
      reversed.add(original.id);
    }
    ids.add(row.id); numbers.add(row.no);
  }
  for (const period of data.periods) if (!period.month_start.endsWith("-01")) fail("Period dates must be the first day of a month.");
  for (const event of [...data.auditEvents, ...data.periodEvents]) if (event.entry_id && !ids.has(event.entry_id)) fail("Audit event refers to an unknown journal entry.");
  for (const event of data.annualReviewEvents) if (!Array.isArray(json(event.checks)) || json(event.checks).length !== 5 || !json(event.checks).every(value => typeof value === "boolean")) fail("Invalid review checklist.");
  return { ...envelope, data };
}

const auxiliary = { periods: "cgl_periods", auditEvents: "cgl_audit_events", reconciliations: "cgl_reconciliations",
  reconciliationEvents: "cgl_reconciliation_events", annualReviewEvents: "cgl_annual_review_events", periodEvents: "cgl_period_events", masterEvents: "cgl_master_events" };
const registerOrder = ["classes", "holders", "charities", "corp", "policy", "securities", "subs", "lots", "debts", "certs",
  "transfers", "dividends", "grants", "calls", "capitalIncreases", "accountMappings", "priceHist", "periods", "recons", "review", "masterRevisions"];

export async function backupLedger(database) {
  return database.transaction(async trx => {
    await assertStorageReady(trx);
    const [registers, journal, ...rows] = await Promise.all([readStoredRegisters(table => trx(table).select("*")), readStoredJournal(trx),
      ...Object.values(auxiliary).map(table => trx(table).select("*"))]);
    const data = { registers, journal, ...Object.fromEntries(Object.keys(auxiliary).map((key, index) => [key, rows[index]])) };
    return createBackup(data);
  }, { isolationLevel: "repeatable read", readOnly: true });
}

/** Never clears/replaces posted journals. Restore is only an isolated empty-ledger import. */
export async function restoreLedger(database, backup, actor, action = "restore") {
  if (!dataToolsEnabled()) fail("Data tools are disabled in this environment.");
  if (!Number.isSafeInteger(actor) || actor < 1) fail("Authenticated actor required.");
  const parsed = validateBackup(backup);
  return database.transaction(async trx => {
    const lock = await trx("cgl_registers").where({ name: "policy" }).forUpdate().first();
    if (!lock) throw new Error("Initialize the isolated ledger before importing.");
    await assertStorageReady(trx);
    for (const table of ["cgl_journal_entries", "cgl_periods", "cgl_audit_events", "cgl_reconciliations", "cgl_reconciliation_events",
      "cgl_annual_review_events", "cgl_period_events", "cgl_master_events", "cgl_lots", "cgl_subscriptions", "cgl_holders", "cgl_organizations", "cgl_securities", "cgl_price_history"]) {
      if (await trx(table).first()) fail("Import requires an isolated empty ledger. Existing records are never deleted or replaced.");
    }
    const data = parsed.data;
    for (const name of registerOrder) if (data.registers[name] !== undefined) {
      await trx("cgl_registers").insert({ name, payload: JSON.stringify(data.registers[name]) }).onConflict("name").merge(["payload"]);
    }
    for (const row of [...data.journal].sort((a, b) => a.no - b.no)) {
      await trx("cgl_journal_entries").insert({ id: row.id, entry_number: row.no, entry_date: row.date, entry_type: row.type,
        memo: row.memo, entry_data: JSON.stringify(row.data), actor, reverses_id: row.type === "reversal" ? row.data.reverses : null, sealed: 0 });
      await trx("cgl_journal_lines").insert(row.lines.map((line, index) => ({ entry_id: row.id, line_no: index + 1,
        account: line.acct, debit: Math.round(line.dr * 100), credit: Math.round(line.cr * 100), tag: line.tag })));
      await trx("cgl_journal_entries").where({ id: row.id }).update({ sealed: 1 });
      await trx("cgl_audit_events").insert({ entry_id: row.id, actor, occurred_at: trx.fn.now(3), action: "import",
        after_state: JSON.stringify({ checksum: parsed.checksum, importedSource: row.id, sourceCreatedAt: parsed.createdAt, action }) });
    }
    for (const period of data.periods) await trx("cgl_periods").insert(period).onConflict("month_start").merge(["closed_at"]);
    for (const [name, table] of Object.entries(auxiliary)) {
      if (name === "periods") continue;
      for (const source of data[name]) {
        const row = { ...source };
        delete row.id;
        for (const column of ["payload", "checks", "before_state", "after_state"]) if (row[column] != null) row[column] = JSON.stringify(json(row[column]));
        await trx(table).insert(row);
      }
    }
    const prior = Math.max(0, ...data.masterEvents.filter(row => row.entity === "dataTools").map(row => row.revision));
    await trx("cgl_master_events").insert({ actor, entity: "dataTools", entity_id: action, action, revision: prior + 1,
      before_state: null, after_state: JSON.stringify({ checksum: parsed.checksum, sourceCreatedAt: parsed.createdAt,
        importedEntries: data.journal.length, sourceAudit: "Imported events retain source actor/time; this event attributes the import." }) });
    return { imported: data.journal.length };
  });
}

export function sampleBackup(fixture) {
  const registers = Object.fromEntries(registerOrder.filter(name => fixture[name] !== undefined).map(name => [name, structuredClone(fixture[name])]));
  registers.calls = fixture.subs.filter(row => row.callDate && row.callDue && row.callRef).map(row => ({ id: randomUUID(), subId: row.id, date: row.callDate, dueDate: row.callDue, boardRef: row.callRef }));
  registers.capitalIncreases = structuredClone(fixture.corp.increases ?? []);
  registers.accountMappings = fixture.classes.map(row => ({ id: row.id, account: investmentAccounts[row.id] }));
  registers.masterRevisions = {};
  const periods = Object.entries(fixture.periods).map(([month, row]) => ({ month_start: `${month}-01`, closed_at: row.closedAt ? row.closedAt.replace("T", " ").replace("Z", "") : null }));
  return createBackup({ registers, journal: fixture.txns.map(row => ({ id: row.id, no: row.no, date: row.date, type: row.type,
    memo: row.memo, data: row.data ?? {}, lines: row.lines, ...(row.reversedBy ? { reversedBy: row.reversedBy } : {}) })), periods,
    auditEvents: [], reconciliations: [], reconciliationEvents: [], annualReviewEvents: [], periodEvents: [], masterEvents: [] });
}
