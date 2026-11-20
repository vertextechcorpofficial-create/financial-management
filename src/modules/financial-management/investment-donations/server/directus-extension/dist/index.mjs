import { randomUUID } from "node:crypto";
import { balance, centavos, validateLines } from "./ledger.mjs";
import { buildCashEntry } from "./cash-commands.mjs";

class InvalidCommand extends Error {}
const json = value => typeof value === "string" ? JSON.parse(value) : value;
const dateOnly = value => value instanceof Date ? value.toISOString().slice(0, 10) : String(value).slice(0, 10);
const invalid = message => { throw new InvalidCommand(message); };

export async function transact(database, input) {
  const { actor, date, type } = input ?? {};
  const model = new Date(`${date}T00:00:00Z`);
  if (!Number.isSafeInteger(actor) || actor < 1 || typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
      !Number.isFinite(+model) || dateOnly(model) !== date) invalid("Enter a valid actor and posting date.");
  if (type === "reverse") {
    if (typeof input.id !== "string" || input.id.length > 64 || typeof input.reason !== "string" ||
        !input.reason.trim() || input.reason.length > 200) invalid("Enter an entry and reversal reason.");
  } else if (!["transfer", "fee", "interest", "taxpay"].includes(type) ||
      !Number.isFinite(input.amount) || input.amount <= 0 || input.amount > 1e12 ||
      typeof input.account !== "string" || typeof input.memo !== "string" || input.memo.length > 250 ||
      (input.target !== undefined && (typeof input.target !== "string" || input.target.length > 100))) {
    invalid("Enter a valid transaction type, account and amount.");
  }
  return database.transaction(async trx => {
    // Serialize all commands before reading balances, tax items or the next journal number.
    const policyRow = await trx("cgl_registers").where({ name: "policy" }).forUpdate().first();
    if (!policyRow) throw new Error("Ledger policy is missing.");
    const periods = await trx("cgl_periods").whereNotNull("closed_at").select("month_start");
    const closed = periods.map(row => dateOnly(row.month_start).slice(0, 7));
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
    if (type === "reverse") {
      const original = entries.find(row => row.id === input.id);
      const header = headers.find(row => row.id === input.id);
      if (!original?.data?.cashCommand || headers.some(row => row.reverses_id === input.id)) invalid("This entry is not eligible for reversal.");
      if (Number(header.actor) === actor) invalid("A different administrator must reverse this entry.");
      if (closed.includes(date.slice(0, 7))) invalid("This month is closed.");
      if (entries.some(row => row.date > date)) invalid("Use a date on or after the latest journal entry.");
      reverses = original.id;
      entry = {
        id, no: entries.reduce((number, row) => Math.max(number, row.no), 0) + 1, date, type: "reversal",
        memo: `Reversal of JE-${original.no}: ${input.reason.trim()}`, data: { reverses },
        lines: original.lines.map(line => ({ ...line, dr: line.cr, cr: line.dr })),
      };
      if (["1000", "1010", "1020"].some(code => balance([entry], code) < 0 && balance([...entries, entry], code) < 0)) {
        invalid("Reversal would overdraw a cash account.");
      }
    } else {
      const rate = json(policyRow.payload)?.intFwt;
      if (!Number.isFinite(rate) || rate < 0 || rate > 100) throw new Error("Invalid withholding policy.");
      try {
        entry = buildCashEntry(entries, closed, input, id, rate);
      } catch (error) {
        if (/^(Enter |Select |Choose |Payment exceeds|This month is closed|Use a date)/.test(error.message)) invalid(error.message);
        throw error;
      }
    }
    validateLines(entry.lines);
    const timestamp = new Date().toISOString().replace("T", " ").replace("Z", "");
    await trx("cgl_journal_entries").insert({
      id, entry_number: entry.no, entry_date: date, entry_type: entry.type, memo: entry.memo,
      entry_data: JSON.stringify(entry.data), actor, created_at: timestamp, reverses_id: reverses, sealed: 0,
    });
    await trx("cgl_journal_lines").insert(entry.lines.map((line, index) => ({
      entry_id: id, line_no: index + 1, account: line.acct, debit: centavos(line.dr), credit: centavos(line.cr), tag: line.tag,
    })));
    await trx("cgl_journal_entries").where({ id, sealed: 0 }).update({ sealed: 1 });
    await trx("cgl_audit_events").insert({
      entry_id: id, actor, occurred_at: timestamp, action: reverses ? "reversed" : "posted", after_state: JSON.stringify(entry),
    });
    return { number: entry.no };
  });
}

const endpoint = { id: "capital-giving-ledger", handler(router, { database, logger }) {
  router.use((req, res, next) => {
    if (req.accountability?.admin !== true || !req.accountability.user) return res.status(403).json({ message: "Administrator service credentials required." });
    next();
  });
  router.get("/health", (_req, res) => res.json({ ready: true }));
  router.post("/commands", async (req, res) => {
    try {
      res.status(201).json(await transact(database, req.body));
    } catch (error) {
      if (error instanceof InvalidCommand) return res.status(400).json({ message: error.message });
      logger.error({ code: error?.code }, "Capital & Giving Ledger transaction failed");
      res.status(500).json({ message: "The ledger transaction could not be committed." });
    }
  });
} };
export default endpoint;
