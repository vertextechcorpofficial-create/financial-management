import type { Entry } from "../ledger";
import { validateLines } from "../ledger";
import { ledgerClient, ledgerRows } from "./directus-ledger.mjs";
import { registerKeys, type LedgerRegisters } from "./registers";
import { ledgerDatabase } from "./database";
import { assertStorageReady, readStoredJournal, readStoredRegisters, withPeriodEvents } from "./storage.mjs";

const json = (value: unknown) => typeof value === "string" ? JSON.parse(value) : value;

export async function readDirectusLedger() {
  if (process.env.CGL_MYSQL_URL) {
    // One MVCC snapshot avoids mixed headers/registers when a posting commits mid-read.
    return ledgerDatabase().transaction(async trx => {
      await assertStorageReady(trx);
      const [journal, registers, periods, events] = await Promise.all([
        readStoredJournal(trx), readStoredRegisters((table: string) => trx(table).select("*")),
        trx("cgl_periods").select("*"), trx("cgl_period_events").select("*"),
      ]);
      for (const entry of journal) validateLines(entry.lines);
      return { journal: journal as Entry[], registers: withPeriodEvents(registers, periods, events) as LedgerRegisters };
    }, { isolationLevel: "repeatable read", readOnly: true });
  }
  // Directus is the existing read authority for this subsystem. Once the
  // normalized collections are exposed read-only, use them automatically;
  // this path must not require an additional environment variable.
  const request = ledgerClient();
  const version = await ledgerRows(request, "cgl_storage_state", "id");
  if (Number(version[0]?.schema_version) !== 1) throw new Error("Normalized ledger migration is required.");
  const [headers, lines, stored, periods, events] = await Promise.all([
    ledgerRows(request, "cgl_journal_entries", "entry_number", { sealed: { _eq: 1 } }),
    ledgerRows(request, "cgl_journal_lines", "id"),
    readStoredRegisters((table: string) => ledgerRows(request, table, table === "cgl_registers" ? "name" : "id")),
    ledgerRows(request, "cgl_periods", "month_start"),
    ledgerRows(request, "cgl_period_events", "id"),
  ]);
  const registers = withPeriodEvents(stored, periods, events) as LedgerRegisters;
  if (registerKeys.some(key => registers[key] == null)) throw new Error("Directus ledger has not been fully seeded.");
  const grouped = new Map<string, typeof lines>();
  for (const line of lines) {
    const group = grouped.get(line.entry_id) ?? [];
    group.push(line);
    grouped.set(line.entry_id, group);
  }
  const reversals = new Map(headers.filter(row => row.reverses_id).map(row => [row.reverses_id, row.id]));
  const journal: Entry[] = headers.map(row => {
    const entryLines = (grouped.get(row.id) ?? []).sort((a, b) => a.line_no - b.line_no).map(line => ({
      acct: line.account, dr: Number(line.debit) / 100, cr: Number(line.credit) / 100, tag: line.tag,
    }));
    validateLines(entryLines);
    return {
      id: row.id, no: Number(row.entry_number), date: String(row.entry_date).slice(0, 10),
      memo: row.memo, type: row.entry_type, data: json(row.entry_data), lines: entryLines,
      reversedBy: reversals.get(row.id),
    };
  });
  return { journal, registers };
}
