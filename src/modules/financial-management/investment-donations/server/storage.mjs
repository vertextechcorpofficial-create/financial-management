import { applyMasterCommand, applyPrices, MasterDataError } from "./master-data.mjs";

export const entityTables = {
  classes: "cgl_classes", securities: "cgl_securities", charities: "cgl_organizations", holders: "cgl_holders",
  subs: "cgl_subscriptions", lots: "cgl_lots", debts: "cgl_debts", certs: "cgl_certificates",
  transfers: "cgl_transfers", dividends: "cgl_dividends", grants: "cgl_grants", calls: "cgl_subscription_calls",
  capitalIncreases: "cgl_capital_increases", accountMappings: "cgl_account_mappings",
};
export const json = value => typeof value === "string" ? JSON.parse(value) : value;
export const dateOnly = value => value instanceof Date ? value.toISOString().slice(0, 10) : String(value).slice(0, 10);

export async function assertStorageReady(trx) {
  const version = await trx("cgl_storage_state").where({ id: 1 }).first();
  if (Number(version?.schema_version) !== 1) throw new Error("Apply and verify the normalized storage migration before using the ledger.");
}

/** Normalized entities are consumed on every read, not merely populated for export. */
export async function readStoredRegisters(readRows) {
  const read = async table => {
    try {
      const rows = await readRows(table);
      if (!Array.isArray(rows)) throw new Error("Expected an array of ledger rows.");
      return rows;
    } catch (cause) {
      throw new Error(`Normalized ledger table ${table} is unavailable. Verify the migration and database SELECT permissions; HTTP reads also require Directus collection exposure.`, { cause });
    }
  };
  const [legacy, ...entities] = await Promise.all([
    read("cgl_registers"), ...Object.values(entityTables).map(table => read(table)),
    read("cgl_policy_settings"), read("cgl_corporation"), read("cgl_price_history"),
  ]);
  const registers = Object.fromEntries(legacy.map(row => [row.name, json(row.payload)]));
  Object.keys(entityTables).forEach((key, index) => {
    const rows = entities[index].map(row => json(row.payload));
    registers[key] = key === "securities" ? Object.fromEntries(rows.map(row => [row.sym, row])) : rows;
  });
  const offset = Object.keys(entityTables).length;
  registers.policy = Object.fromEntries(entities[offset].map(row => [row.id, json(row.payload).value]));
  registers.corp = json(entities[offset + 1].find(row => row.id === "corporation")?.payload);
  registers.priceHist = {};
  for (const row of entities[offset + 2]) (registers.priceHist[row.security_id] ??= []).push(json(row.payload));
  for (const history of Object.values(registers.priceHist)) history.sort((a, b) => a.date.localeCompare(b.date));
  registers.masterRevisions ??= {};
  for (const cls of registers.classes) cls.account ??= registers.accountMappings.find(row => row.id === cls.id)?.account;
  for (const security of Object.values(registers.securities)) security.account ??= registers.accountMappings.find(row => row.id === security.cls)?.account;
  if (!registers.corp || !registers.policy.fyStart || !registers.classes.length ||
      ["periods", "recons", "review"].some(key => !registers[key] || typeof registers[key] !== "object")) throw new Error("Normalized ledger setup is incomplete.");
  return registers;
}

export async function readStoredJournal(trx) {
  const [headers, rows] = await Promise.all([
    trx("cgl_journal_entries").where({ sealed: 1 }).orderBy("entry_number").select("*"), trx("cgl_journal_lines").orderBy("id").select("*"),
  ]);
  const grouped = new Map();
  for (const row of rows) {
    const lines = grouped.get(row.entry_id) ?? [];
    lines.push({ acct: row.account, dr: Number(row.debit) / 100, cr: Number(row.credit) / 100, tag: row.tag });
    grouped.set(row.entry_id, lines);
  }
  const reversed = new Map(headers.filter(row => row.reverses_id).map(row => [row.reverses_id, row.id]));
  return headers.map(row => ({ id: row.id, no: Number(row.entry_number), date: dateOnly(row.entry_date),
    type: row.entry_type, memo: row.memo, data: json(row.entry_data), lines: grouped.get(row.id) ?? [], reversedBy: reversed.get(row.id) }));
}

export function withPeriodEvents(registers, periods, history) {
  const next = structuredClone(registers);
  next.periods ??= {};
  for (const period of periods) {
    const month = dateOnly(period.month_start).slice(0, 7);
    next.periods[month] = { ...next.periods[month], closedAt: period.closed_at ?? null };
  }
  next.periodEvents = history.sort((a, b) => Number(a.id) - Number(b.id)).map(row => ({
    id: Number(row.id), month: dateOnly(row.month_start).slice(0, 7), actor: Number(row.actor),
    action: row.action, entryId: row.entry_id, reason: row.reason, occurredAt: row.occurred_at,
  }));
  for (const event of next.periodEvents) {
    const period = next.periods[event.month] ??= { closedAt: null };
    if (event.action === "accrue") { period.accruedAt = event.occurredAt; period.accruedBy = String(event.actor); }
    if (event.action === "close") { period.closedAt = event.occurredAt; period.closedBy = String(event.actor); }
    if (event.action === "reopen") { period.closedAt = null; period.reopenedAt = event.occurredAt; period.reopenReason = event.reason; }
  }
  return next;
}

/** Policy is always locked first, exactly as in transactions.mjs. No journal writes. */
export async function saveMasterData(database, input, actor) {
  if (!Number.isSafeInteger(actor) || actor < 1) throw new MasterDataError("An authenticated actor is required.");
  return database.transaction(async trx => {
    const lock = await trx("cgl_registers").where({ name: "policy" }).forUpdate().first();
    if (!lock) throw new Error("Ledger policy is missing.");
    await assertStorageReady(trx);
    let registers = await readStoredRegisters(table => trx(table).select("*"));
    const journal = await readStoredJournal(trx);
    const [periods, events] = await Promise.all([trx("cgl_periods").select("*"), trx("cgl_period_events").select("*")]);
    registers = withPeriodEvents(registers, periods, events);
    const result = input?.type === "prices" ? applyPrices(registers, input) : applyMasterCommand(registers, input, journal);
    // Reference-order updates let FK constraints validate the same atomic transition.
    const order = ["classes", "holders", "charities", "corp", "policy", "securities", "subs", "lots", "debts", "certs",
      "transfers", "dividends", "grants", "calls", "capitalIncreases", "accountMappings", "priceHist", "masterRevisions"];
    for (const name of order) {
      if (JSON.stringify(registers[name]) !== JSON.stringify(result.registers[name])) {
        await trx("cgl_registers").insert({ name, payload: JSON.stringify(result.registers[name]) })
          .onConflict("name").merge(["payload"]);
      }
    }
    await trx("cgl_master_events").insert({ actor, entity: result.entity, entity_id: result.id,
      action: input?.type === "prices" ? "prices" : input.operation, revision: result.revision,
      before_state: result.before === null ? null : JSON.stringify(result.before),
      after_state: result.after === null ? null : JSON.stringify(result.after) });
    return { revision: result.revision, id: result.id };
  });
}
