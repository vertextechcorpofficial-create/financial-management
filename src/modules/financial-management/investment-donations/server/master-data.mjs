import { randomUUID } from "node:crypto";
import { z } from "zod";
import { accounts } from "../ledger.ts";

export class MasterDataError extends Error {}
const invalid = message => { throw new MasterDataError(message); };
const text = (max = 200) => z.string().trim().min(1).max(max);
const optionalText = (max = 500) => z.string().trim().max(max).optional();
const id = text(64).regex(/^[A-Za-z0-9_.-]+$/);
export const calendarDate = z.string().regex(/^[1-9]\d{3}-\d{2}-\d{2}$/).refine(value => {
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(+date) && date.toISOString().slice(0, 10) === value;
}, "Enter a real calendar date.");
const emptyDate = z.union([calendarDate, z.literal(""), z.null()]).optional();
const money = z.number().finite().nonnegative().max(1e12);
const percent = z.number().finite().min(0).max(100);
const active = { active: z.boolean().optional(), inactive: z.boolean().optional() };
export const investmentAccounts = { dom: "1100", intl: "1110", fi: "1120", cash: "1130", alt: "1140" };
const account = z.enum(["1100", "1110", "1120", "1130", "1140"]);
const schemas = {
  classes: z.object({ id, name: text(120), target: percent, band: percent,
    vehicles: optionalText(), account: account.optional(), ...active }).strict(),
  securities: z.object({ sym: id, name: text(160), cls: id,
    taxClass: z.enum(["listed", "fund", "govsec", "unlisted"]), price: money.optional(),
    priceDate: emptyDate, ...active }).strict(),
  charities: z.object({ id: id.optional(), name: text(160), reg: text(), jurisdiction: text(100),
    focus: text(), isDAF: z.boolean(), donee: z.enum(["accredited", "nonaccredited", "government"]),
    accredUntil: emptyDate, expenseRatio: percent, notes: optionalText(2000),
    checks: z.object({ reg: emptyDate, gov: emptyDate, pay: emptyDate }).strict(), ...active }).strict(),
  holders: z.object({ id: id.optional(), name: text(160), type: z.enum(["individual", "domestic", "nonresident", "nrfc", "nra"]),
    tin: z.string().trim().regex(/^\d{3}-?\d{3}-?\d{3}(?:-?\d{3})?$/), nationality: text(100), address: text(500), ...active }).strict(),
  calls: z.object({ id: id.optional(), subId: id, date: calendarDate, dueDate: calendarDate, boardRef: text() }).strict(),
  debts: z.object({ id, scheduled: z.boolean() }).strict(),
  capitalIncreases: z.object({ id: id.optional(), date: calendarDate, to: z.number().int().positive().max(1e12),
    secRef: text(), secApprovedDate: calendarDate.optional() }).strict(),
  accountMappings: z.object({ id, account: z.string().refine(value => Object.hasOwn(accounts, value)),
    coaCode: optionalText(100), description: optionalText(200) }).strict(),
};
const policyShape = {
  docVersion: text(40), effectiveDate: calendarDate, owner: text(120), cadence: z.enum(["Monthly", "Quarterly", "Semi-Annual", "Annual"]),
  currency: z.literal("PHP"), reserveMonths: z.number().int().min(0).max(120), monthlyExpenses: money,
  debtThreshold: percent, liquidityMonths: z.number().int().min(0).max(120), liquidityNeed: money,
  lumpThreshold: money, tranches: z.number().int().min(1).max(120), giveMode: z.enum(["income", "gains", "fixed"]),
  givePct: percent, netIncome: money, gainsPct: percent, giveFixed: money, focusAreas: text(2000), savingsTarget: money,
  reviewMonth: z.number().int().min(0).max(11), costMethod: z.enum(["specific", "fifo"]),
  donorExempt: money, itemizes: z.enum(["yes", "no"]), taxableIncome: money, brokerMin: money,
  dayCount: z.union([z.literal(360), z.literal(365)]), fyStart: z.number().int().min(1).max(12),
};
for (const key of ["sttRate", "sttRateOld", "divFwt", "intFwt", "cgtUnlisted", "donorRate", "deductCap", "marginalRate",
  "dstIssue", "dstIssueOld", "divWhtInd", "divWhtNr", "dstTransfer", "brokerRate", "vatRate", "pseFee", "sccpFee"]) policyShape[key] = percent;
const policyPatch = z.object(policyShape).partial().strict();
const corpPatch = z.object({ name: text(160), secReg: text(120), secRegDate: calendarDate,
  par: z.number().positive().max(1e9), authorized: z.number().int().positive().max(1e12) }).partial().strict();

export const masterCommand = z.object({ type: z.literal("master").optional(),
  entity: z.enum(["classes", "securities", "charities", "holders", "calls", "capitalIncreases", "policy", "corp", "accountMappings", "debts"]),
  operation: z.enum(["upsert", "delete"]), id: id.optional(), revision: z.number().int().nonnegative(), value: z.unknown().optional() }).strict();
const parse = (schema, value) => {
  const result = schema.safeParse(value);
  if (!result.success) invalid(result.error.issues.map(issue => `${issue.path.join(".") || "value"}: ${issue.message}`).join("; ").slice(0, 700));
  return result.data;
};
const isActive = row => row.active !== false && row.inactive !== true;
const setActive = row => ({ ...row, active: isActive(row), inactive: !isActive(row) });
const currentDate = () => new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Manila", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());

export function settingsLocks(registers, journal) {
  const yearEnd = String((Number(registers.policy.fyStart) + 10) % 12 + 1).padStart(2, "0");
  return { par: Boolean(registers.subs?.length), fyStart: journal.some(entry => entry.type === "closing") ||
    Object.entries(registers.periods ?? {}).some(([month, period]) => month.slice(5, 7) === yearEnd && period.closedAt) ||
    (registers.periodEvents ?? []).some(event => event.action === "close" && event.month.slice(5, 7) === yearEnd) };
}

/** Pure, deterministic validation; callers hold the same policy-row lock as posting. */
export function applyMasterCommand(registers, raw, journal = [], today = currentDate()) {
  const command = parse(masterCommand, raw);
  const { entity, operation, revision } = command;
  if (revision !== Number(registers.masterRevisions?.[entity] ?? 0)) invalid("This register changed. Refresh before saving.");
  const next = structuredClone(registers);
  const history = settingsLocks(registers, journal).fyStart;
  const subs = next.subs ?? [];
  let before = null;
  let after = null;
  let key = command.id;
  if (entity === "policy" || entity === "corp") {
    if (operation !== "upsert") invalid("Settings cannot be deleted.");
    const patch = parse(entity === "policy" ? policyPatch : corpPatch, command.value);
    if (!Object.keys(patch).length) invalid("Enter at least one setting.");
    before = next[entity];
    after = { ...before, ...patch };
    if (entity === "policy" && history && after.fyStart !== before.fyStart) invalid("Fiscal year start is locked after the first year close, including reversed closes.");
    if (entity === "corp") {
      if (subs.length && after.par !== before.par) invalid("Par value is locked after the first subscription.");
      if (before.authorized && after.authorized !== before.authorized) invalid("Record an SEC-approved capital increase to change authorized shares.");
      if (after.authorized < subs.reduce((sum, row) => sum + row.shares, 0)) invalid("Authorized shares cannot be below subscriptions.");
    }
    next[entity] = after;
    key = entity;
  } else if (entity === "classes") {
    before = next.classes;
    let rows;
    if (Array.isArray(command.value)) {
      if (operation !== "upsert") invalid("Use upsert for an allocation replacement.");
      rows = parse(z.array(schemas.classes).min(1).max(100), command.value).map(setActive);
    } else {
      const value = operation === "upsert" ? setActive(parse(schemas.classes, command.value)) : null;
      key = key ?? value?.id;
      if (!key || (value && value.id !== key)) invalid("Class identifier does not match.");
      rows = next.classes.filter(row => row.id !== key);
      if (value) rows.push(value);
    }
    if (new Set(rows.map(row => row.id)).size !== rows.length) invalid("Class identifiers must be unique.");
    if (Math.abs(rows.filter(isActive).reduce((sum, row) => sum + row.target, 0) - 100) > 1e-8) invalid("Active allocation targets must total 100%.");
    for (const old of before) {
      const replacement = rows.find(row => row.id === old.id);
      const securities = Object.values(next.securities).filter(row => row.cls === old.id);
      if (!replacement && securities.length) invalid("A class used by securities cannot be deleted.");
      if (replacement && !isActive(replacement) && securities.some(security => (next.lots ?? []).some(lot => lot.sym === security.sym && lot.openQty > 0))) invalid("A class with held securities cannot be inactive.");
    }
    next.classes = rows.map(row => ({ ...row, account: row.account ?? investmentAccounts[row.id] ?? next.accountMappings?.find(mapping => mapping.id === row.id)?.account }));
    if (next.classes.some(row => !row.account)) invalid("Every class requires an investment account mapping.");
    next.accountMappings = [...(next.accountMappings ?? []).filter(row => /^\d{4}$/.test(row.id)), ...next.classes.map(row => ({ id: row.id, account: row.account }))];
    for (const security of Object.values(next.securities)) {
      const mapping = next.classes.find(row => row.id === security.cls);
      if (security.account && security.account !== mapping.account && (next.lots ?? []).some(lot => lot.sym === security.sym)) invalid("Account mappings used by historical lots are locked.");
      security.account = mapping.account;
    }
    after = next.classes;
    key = key ?? "allocation";
  } else {
    const dict = entity === "securities";
    const original = dict ? Object.values(next.securities) : next[entity] ?? [];
    const value = operation === "upsert" ? parse(schemas[entity], command.value) : null;
    key = key ?? (dict ? value?.sym : value?.id) ?? (value ? randomUUID() : undefined);
    if (!key) invalid("Select a record.");
    if (value && ((dict && value.sym !== key) || (value.id && value.id !== key))) invalid("The record identifier does not match.");
    before = original.find(row => (dict ? row.sym : row.id) === key) ?? null;
    if (operation === "delete" && !before) invalid("Record not found.");
    after = value ? { ...before, ...value, ...("active" in value || "inactive" in value ? { active: value.active ?? !value.inactive, inactive: value.inactive ?? !value.active } : {}), ...(dict ? {} : { id: key }) } : null;
    if (entity === "securities") {
      const lots = (next.lots ?? []).filter(lot => lot.sym === key);
      if (!after && (lots.length || (next.priceHist?.[key]?.length ?? 0))) invalid("Historical securities cannot be deleted; deactivate after all holdings are disposed.");
      if (after) {
        after = setActive(after);
        const cls = next.classes.find(row => row.id === after.cls);
        if (!cls || !isActive(cls)) invalid("Select an active class.");
        if (before && before.cls !== after.cls && lots.length) invalid("The security class is locked after the first lot.");
        if (!isActive(after) && lots.some(lot => lot.openQty > 0)) invalid("A held security cannot be inactive.");
        if (before && (value.price !== undefined && value.price !== before.price || value.priceDate !== undefined && value.priceDate !== before.priceDate)) invalid("Use the price command to preserve price source and history.");
        after.account = cls.account ?? investmentAccounts[cls.id];
        if (!after.account) invalid("Configure the class account mapping first.");
        after.price ??= 0;
        after.priceDate ??= "";
        if (!before && after.price > 0) {
          if (!after.priceDate || after.priceDate > today) invalid("An initial price requires a valid, non-future price date.");
          next.priceHist[key] = [{ date: after.priceDate, price: after.price, src: "Security setup" }];
          after.priceSource = "Security setup";
        }
      }
    }
    if (entity === "holders") {
      const used = subs.some(row => row.holderId === key) || (next.certs ?? []).some(row => row.holderId === key) ||
        (next.transfers ?? []).some(row => row.fromId === key || row.toId === key);
      if (!after && used) invalid("A holder with capital history cannot be deleted.");
      if (after) {
        after = setActive(after);
        if (original.some(row => row.id !== key && row.tin.replace(/-/g, "") === after.tin.replace(/-/g, ""))) invalid("A holder with this TIN already exists.");
        if (!isActive(after) && (next.certs ?? []).some(row => row.holderId === key && !row.cancelledAt && !row.voidedAt && row.shares > 0)) invalid("A holder with active certificates cannot be inactive.");
      }
    }
    if (entity === "charities") {
      const used = (next.grants ?? []).some(row => row.dafId === key || row.toId === key) || journal.some(entry =>
        entry.data?.charityId === key || entry.data?.orgId === key || entry.data?.target === key || entry.data?.dafId === key);
      if (!after && used) invalid("An organization with giving history cannot be deleted.");
      if (after) {
        after = setActive(after);
        if (after.donee === "accredited" && !after.accredUntil) invalid("Accredited organizations require an accreditation expiry date.");
        for (const date of Object.values(after.checks)) if (date && date > today) invalid("Vetting checks cannot be future-dated.");
        if (before && before.isDAF !== after.isDAF && used) invalid("Pooled-fund status is locked after giving activity.");
      }
    }
    if (entity === "calls") {
      if (!after) invalid("Calls are historical records and cannot be deleted.");
      const sub = subs.find(row => row.id === after.subId);
      if (!sub || sub.issuedAt) invalid("Select an unissued subscription.");
      if (before && before.subId !== after.subId) invalid("A call cannot move to a different subscription.");
      if (after.date < sub.date || after.dueDate <= after.date || after.date > today) invalid("Call date must follow subscription and precede its due date.");
      if (next.periods?.[after.date.slice(0, 7)]?.closedAt) invalid("The call date is in a closed period.");
      if (before && next.periods?.[before.date.slice(0, 7)]?.closedAt) invalid("A historical call in a closed period cannot be changed.");
      const earliest = before && before.date < after.date ? before.date : after.date;
      if (journal.some(entry => entry.type === "divpay" && !entry.reversedBy && entry.date >= earliest &&
          entry.data?.payments?.some(payment => payment.holderId === sub.holderId))) invalid("Reverse dependent dividend payments before changing the subscription call.");
      if (!before && sub.callDate && after.date <= sub.callDate) invalid("A replacement call must be dated after the prior call.");
      Object.assign(sub, { callDate: after.date, callDue: after.dueDate, callRef: after.boardRef });
    }
    if (entity === "debts" && (!before || !after)) invalid("Only the payoff schedule of an existing loan can be maintained here.");
    if (entity === "capitalIncreases") {
      if (!after || before) invalid("SEC-approved increases are append-only; record a new increase.");
      if (after.to <= next.corp.authorized || after.date > today || after.date < next.corp.secRegDate || (after.secApprovedDate && after.secApprovedDate > after.date)) invalid("Enter an approved increase above current authorized shares with valid SEC dates.");
      if (original.some(row => row.secRef === after.secRef)) invalid("This SEC reference is already recorded.");
      if (next.periods?.[after.date.slice(0, 7)]?.closedAt) invalid("The capital increase date is in a closed period.");
      after.from = next.corp.authorized;
      next.corp.authorized = after.to;
      next.corp.increases = [...(next.corp.increases ?? []), after];
    }
    if (entity === "accountMappings") {
      if (!after) invalid("Account mappings cannot be deleted.");
      if (/^\d{4}$/.test(key)) {
        if (!Object.hasOwn(accounts, key) || after.account !== key || !after.coaCode) invalid("A financial statement mapping requires a known ledger account and main COA code.");
      } else {
        const cls = next.classes.find(row => row.id === key);
        if (!cls || !account.safeParse(after.account).success) invalid("Select an existing class and investment account.");
        if ((next.lots ?? []).some(lot => next.securities[lot.sym]?.cls === key) &&
            (before?.account ?? cls.account ?? investmentAccounts[key]) !== after.account) invalid("Account mappings used by historical lots are locked.");
        cls.account = after.account;
        for (const security of Object.values(next.securities)) if (security.cls === key) security.account = after.account;
      }
    }
    const changed = original.filter(row => (dict ? row.sym : row.id) !== key);
    if (after) changed.push(after);
    next[entity] = dict ? Object.fromEntries(changed.map(row => [row.sym, row])) : changed;
  }
  next.masterRevisions = { ...next.masterRevisions, [entity]: revision + 1 };
  return { registers: next, entity, id: key, before, after, revision: revision + 1 };
}

export function validateImportedMasterData(registers) {
  parse(z.object(policyShape).strict(), registers.policy);
  parse(corpPatch.required().passthrough(), registers.corp);
  for (const entity of ["classes", "securities", "holders", "charities"]) {
    const rows = entity === "securities" ? Object.values(registers.securities ?? {}) : registers[entity];
    parse(z.array(schemas[entity].passthrough()).max(100000), rows);
  }
  for (const entity of ["calls", "capitalIncreases", "accountMappings"]) parse(z.array(schemas[entity].passthrough()).max(100000), registers[entity] ?? []);
}

function csvFields(line) {
  const fields = [];
  let field = "", quoted = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (quoted && line[i + 1] === '"') { field += '"'; i++; }
      else if (!quoted && field) invalid("Invalid CSV quoting.");
      else quoted = !quoted;
    } else if (char === "," && !quoted) { fields.push(field.trim()); field = ""; }
    else field += char;
  }
  if (quoted) invalid("Unterminated CSV quote.");
  fields.push(field.trim());
  return fields;
}
export function parsePriceCsv(csv) {
  if (typeof csv !== "string" || csv.length > 1_000_000) invalid("CSV is missing or too large.");
  const lines = csv.replace(/^\uFEFF/, "").split(/\r?\n/).filter(line => line.trim());
  const header = csvFields(lines.shift() ?? "").map(value => value.toLowerCase());
  const symbol = header.indexOf("sym") >= 0 ? "sym" : "symbol";
  if (header.length !== 4 || new Set(header).size !== 4 || ![symbol, "price", "date", "source"].every(key => header.includes(key))) invalid("CSV headers must be sym,price,date,source.");
  return lines.map(line => {
    const values = csvFields(line);
    if (values.length !== 4) invalid("Each CSV row needs four fields.");
    const row = Object.fromEntries(header.map((key, index) => [key, values[index]]));
    if (!/^\d+(?:\.\d+)?$/.test(row.price)) invalid("Price must be a positive decimal number.");
    return { sym: row[symbol], price: Number(row.price), date: row.date, source: row.source };
  });
}
const priceSchema = z.object({ sym: id, price: z.number().finite().positive().max(1e12), date: calendarDate, source: text(200) }).strict();
export function applyPrices(registers, input, today = currentDate()) {
  const command = parse(z.object({ type: z.literal("prices").optional(), revision: z.number().int().nonnegative(),
    csv: z.string().optional(), prices: z.array(priceSchema).max(5000).optional() }).strict(), input);
  if ((command.csv === undefined) === (command.prices === undefined)) invalid("Provide either CSV or manual prices.");
  if (command.revision !== Number(registers.masterRevisions?.prices ?? 0)) invalid("Prices changed. Refresh before saving.");
  const prices = parse(z.array(priceSchema).min(1).max(5000), command.prices ?? parsePriceCsv(command.csv));
  const next = structuredClone(registers);
  for (const row of prices) {
    const security = next.securities[row.sym];
    if (!security || !isActive(security)) invalid(`Unknown or inactive security: ${row.sym}.`);
    if (row.date > today) invalid("Prices cannot be future-dated.");
    const history = next.priceHist[row.sym] ??= [];
    if (history.some(item => item.date === row.date && (item.src ?? item.source) === row.source)) invalid(`Duplicate price source/date for ${row.sym}; history is append-only.`);
    history.push({ date: row.date, price: row.price, src: row.source });
    history.sort((a, b) => a.date.localeCompare(b.date));
    if (!security.priceDate || row.date >= security.priceDate) Object.assign(security, { price: row.price, priceDate: row.date, priceSource: row.source });
  }
  next.masterRevisions = { ...next.masterRevisions, prices: command.revision + 1 };
  return { registers: next, entity: "prices", id: "prices", before: registers.priceHist, after: next.priceHist, revision: command.revision + 1 };
}
