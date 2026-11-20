import type { Entry } from "../ledger";
import { validateLines } from "../ledger";
import { ledgerClient, ledgerRows } from "./directus-ledger.mjs";
import { registerKeys, type LedgerRegisters } from "./registers";

const json = (value: unknown) => typeof value === "string" ? JSON.parse(value) : value;

export async function readDirectusLedger() {
  const request = ledgerClient();
  const [headers, lines, rows, periods] = await Promise.all([
    ledgerRows(request, "cgl_journal_entries", "entry_number", { sealed: { _eq: 1 } }),
    ledgerRows(request, "cgl_journal_lines", "id"),
    ledgerRows(request, "cgl_registers", "name"),
    ledgerRows(request, "cgl_periods", "month_start"),
  ]);
  const registers = Object.fromEntries(rows.map(row => [row.name, json(row.payload)])) as LedgerRegisters;
  if (registerKeys.some(key => registers[key] == null)) throw new Error("Directus ledger has not been fully seeded.");
  for (const period of periods) {
    const month = String(period.month_start).slice(0, 7);
    const snapshot = registers.periods[month];
    registers.periods[month] = { ...snapshot, closedAt: period.closed_at };
  }
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
