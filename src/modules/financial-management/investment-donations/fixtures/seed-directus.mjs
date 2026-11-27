import { readFileSync } from "node:fs";
import { isDeepStrictEqual } from "node:util";
import { ledgerClient, ledgerRows } from "../server/directus-ledger.mjs";

const request = ledgerClient();
const source = JSON.parse(readFileSync(new URL("./malaya.json", import.meta.url), "utf8"));
const existing = await Promise.all([
  ledgerRows(request, "cgl_journal_entries", "entry_number"),
  ledgerRows(request, "cgl_journal_lines", "id"),
  ledgerRows(request, "cgl_periods", "month_start"),
  ledgerRows(request, "cgl_audit_events", "id"),
  ledgerRows(request, "cgl_registers", "name"),
]);
const [headers, lines, periods, audit, registers] = existing;
const keys = ["corp", "policy", "classes", "securities", "priceHist", "lots", "debts", "holders", "subs", "certs",
  "transfers", "dividends", "charities", "grants", "periods", "recons", "review"];
const json = value => typeof value === "string" ? JSON.parse(value) : value;
const sample = [...source.txns].sort((a, b) => a.no - b.no);
const byId = new Map(sample.map(row => [row.id, row]));
const postedAt = "2026-11-20 00:00:00.000";
const fail = () => { throw new Error("Directus contains records that do not match this seed. No records will be replaced."); };
for (const header of headers) {
  const row = byId.get(header.id);
  if (!row || Number(header.entry_number) !== row.no || header.entry_date !== row.date || header.entry_type !== row.type ||
      header.memo !== row.memo || Number(header.actor) !== 0 || !isDeepStrictEqual(json(header.entry_data), row.data)) fail();
}
const expectedLines = row => row.lines.filter(line => line.dr || line.cr).map((line, index) => ({
  entry_id: row.id, line_no: index + 1, account: line.acct, debit: Math.round(line.dr * 100), credit: Math.round(line.cr * 100), tag: line.tag,
}));
for (const line of lines) {
  const row = byId.get(line.entry_id);
  const expected = row && expectedLines(row)[Number(line.line_no) - 1];
  if (!expected || expected.account !== line.account || expected.tag !== line.tag ||
      expected.debit !== Number(line.debit) || expected.credit !== Number(line.credit)) fail();
}
if (periods.some(row => row.closed_at != null && !source.periods[row.month_start.slice(0, 7)]?.closedAt) ||
    audit.some(row => !byId.has(row.entry_id) || row.action !== "seeded" || Number(row.actor) !== 0) ||
    registers.some(row => !keys.includes(row.name) || !isDeepStrictEqual(json(row.payload), source[row.name]))) fail();
if (!process.argv.includes("--apply")) {
  console.log(`Preflight passed: ${sample.length} entries, ${keys.length} registers. Add --apply to seed.`);
  process.exit(0);
}
const post = (table, body) => request(table, { method: "POST", body });
const patch = (table, ids, data) => request(table, { method: "PATCH", body: { keys: ids, data } });
const existingIds = new Set(headers.map(row => row.id));
const missing = sample.filter(row => !existingIds.has(row.id));
if (missing.length) await post("cgl_journal_entries", missing.map(row => ({
  id: row.id, entry_number: row.no, entry_date: row.date, entry_type: row.type, memo: row.memo,
  entry_data: row.data, actor: 0, created_at: postedAt,
})));
const positions = new Set(lines.map(row => `${row.entry_id}:${row.line_no}`));
const newLines = sample.flatMap(expectedLines).filter(row => !positions.has(`${row.entry_id}:${row.line_no}`));
for (let i = 0; i < newLines.length; i += 80) await post("cgl_journal_lines", newLines.slice(i, i + 80));
const sealed = new Set(headers.filter(row => Number(row.sealed) === 1).map(row => row.id));
const sealIds = sample.filter(row => !sealed.has(row.id)).map(row => row.id);
if (sealIds.length) await patch("cgl_journal_entries", sealIds, { sealed: 1 });
const audited = new Set(audit.map(row => row.entry_id));
const newAudit = sample.filter(row => !audited.has(row.id)).map(row => ({
  entry_id: row.id, actor: 0, occurred_at: postedAt, action: "seeded", after_state: row,
}));
if (newAudit.length) await post("cgl_audit_events", newAudit);
const months = new Map((await ledgerRows(request, "cgl_periods", "month_start")).map(row => [row.month_start, row.closed_at]));
for (const [month, row] of Object.entries(source.periods)) {
  if (!row.closedAt) continue;
  const key = `${month}-01`;
  const closed = row.closedAt.replace("T", " ").replace("Z", "");
  if (!months.has(key)) await post("cgl_periods", { month_start: key, closed_at: closed });
  else if (!months.get(key)) await patch("cgl_periods", [key], { closed_at: closed });
}
const registered = new Set(registers.map(row => row.name));
const additions = keys.filter(key => !registered.has(key)).map(name => ({ name, payload: source[name] }));
if (additions.length) await post("cgl_registers", additions);
const [finalHeaders, finalLines, finalAudit, finalRegisters, finalPeriods] = await Promise.all([
  ledgerRows(request, "cgl_journal_entries", "entry_number"), ledgerRows(request, "cgl_journal_lines", "id"),
  ledgerRows(request, "cgl_audit_events", "id"), ledgerRows(request, "cgl_registers", "name"), ledgerRows(request, "cgl_periods", "month_start"),
]);
if (finalHeaders.length !== sample.length || finalHeaders.some(row => Number(row.sealed) !== 1) ||
    finalLines.length !== sample.flatMap(expectedLines).length || finalAudit.length !== sample.length ||
    finalRegisters.length !== keys.length || finalPeriods.filter(row => row.closed_at).length !== Object.values(source.periods).filter(row => row.closedAt).length) {
  throw new Error("Directus row counts or posting status did not match the sample.");
}
console.log(`Verified ${finalHeaders.length} posted entries, ${finalLines.length} lines, ${finalAudit.length} audit events and ${finalRegisters.length} registers.`);
