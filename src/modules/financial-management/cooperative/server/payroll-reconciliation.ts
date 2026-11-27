import "server-only";

import { z } from "zod";
import { manilaUtcRange } from "../console/reports/report-dates";
import type { ReportSection } from "../console/reports/types";
import type { StatementPeriod } from "../members/types";
import { readDirectusByIds, readDirectusPages } from "./directus";
import { postedDecimal } from "./ledger-report";
import { signedCentsToAmount } from "./member-read";
import { reportTotals } from "./report-data";

const id = z.coerce.number().int().positive();
const posted = "PAYROLL_REMITTANCE";
const reversed = "PAYROLL_REMITTANCE_REVERSED";
const journal = z.object({
  id, journal_no: z.string(), source_type: z.string(), source_id: z.string(), command_type: z.string(),
  business_date: z.iso.date(), posted_at: z.string().nullable(), reverses_journal_id: id.nullable(),
});
const batch = z.object({
  id, state: z.string(), bank_reference: z.string(), cutoff_date: z.iso.date(), bank_date: z.iso.date(),
  bank_amount: postedDecimal, posted_amount: postedDecimal,
  clearing_journal_id: id.nullable(), reversal_journal_id: id.nullable(), posted_at: z.string().nullable(),
});
const line = z.object({ journal_id: id, account_id: id, debit: postedDecimal, credit: postedDecimal });
type Batch = z.output<typeof batch>;
type Journal = z.output<typeof journal>;

const journalFields = Object.keys(journal.shape).join(",");
const batchFields = Object.keys(batch.shape).join(",");
const columns: ReportSection["columns"] = [
  { label: "Bank reference" }, { label: "Payroll cutoff", kind: "date" }, { label: "Receipt date", kind: "date" },
  { label: "Posting date", kind: "date" }, { label: "Clearing journal" }, { label: "Status" },
  { label: "Verified clearing", kind: "money" }, { label: "Book clearing", kind: "money" }, { label: "Clearing difference", kind: "money" },
  { label: "Bank receipt amount", kind: "money" },
];
const amount = (value: bigint | null) => value === null ? null : signedCentsToAmount(value);

function isClearing(row: Journal | undefined, source: Batch, reversal: boolean) {
  if (!row?.posted_at || row.source_type !== "PAYROLL_REMITTANCE" || row.source_id !== String(source.id)) return false;
  if (reversal) return row.id === source.reversal_journal_id && row.command_type === reversed &&
    row.reverses_journal_id === source.clearing_journal_id;
  return row.id === source.clearing_journal_id && row.command_type === posted && row.reverses_journal_id === null;
}

function hasVerifiedReceipt(row: Batch) {
  return ["POSTED", "REVERSED"].includes(row.state) && Boolean(row.posted_at && row.bank_reference.trim()) &&
    row.posted_amount > 0n && row.posted_amount === row.bank_amount && row.cutoff_date <= row.bank_date;
}

export async function reconcileEmployerRemittances(period: StatementPeriod, accountId: number, bankAccountId?: number) {
  const inPeriod = (date: string) => date >= period.from && date <= period.to;
  const businessDate = { _gte: period.from, _lte: period.to };
  const [journalRows, receipts] = await Promise.all([
    readDirectusPages("cooperative_journals", journal, {
      fields: journalFields, sort: "business_date,id",
      filter: JSON.stringify({
        source_type: { _eq: "PAYROLL_REMITTANCE" }, command_type: { _in: [posted, reversed] },
        business_date: businessDate, posted_at: { _nnull: true },
      }),
    }),
    readDirectusPages("cooperative_payroll_remittance_batches", batch, {
      fields: batchFields,
      filter: JSON.stringify({
        state: { _in: ["POSTED", "REVERSED"] }, _or: [
          { bank_date: businessDate },
          { bank_date: { _lt: period.from }, posted_at: { _gte: manilaUtcRange(period.from, period.to)._gte } },
        ],
      }),
    }),
  ]);
  const batches = new Map(receipts.map(row => [row.id, row]));
  const batchIds = journalRows.flatMap(row => {
    const parsed = id.safeParse(row.source_id);
    return parsed.success && !batches.has(parsed.data) ? [parsed.data] : [];
  });
  for (const row of await readDirectusByIds("cooperative_payroll_remittance_batches", batch, batchFields, "id", batchIds)) {
    batches.set(row.id, row);
  }
  const journals = new Map(journalRows.map(row => [row.id, row]));
  const linkedIds = [...batches.values()].flatMap(row =>
    [row.clearing_journal_id, row.reversal_journal_id].flatMap(id => id !== null && !journals.has(id) ? [id] : []));
  const [links, gl] = await Promise.all([
    readDirectusByIds("cooperative_journals", journal, journalFields, "id", linkedIds),
    readDirectusByIds("cooperative_gl_lines", line, Object.keys(line.shape).join(","), "journal_id", journalRows.map(row => row.id)),
  ]);
  for (const row of links) journals.set(row.id, row);
  const clearing = new Map<number, Array<z.output<typeof line>>>();
  for (const row of gl) {
    const current = clearing.get(row.journal_id) ?? [];
    current.push(row);
    clearing.set(row.journal_id, current);
  }

  const rows: ReportSection["rows"] = [];
  let bookClearing = 0n;
  let verifiedClearing = 0n;
  let incomplete = false;
  let timing = false;
  let difference = false;
  for (const row of journalRows) {
    const source = batches.get(Number(row.source_id));
    const reversing = row.command_type === reversed;
    const original = source?.clearing_journal_id ? journals.get(source.clearing_journal_id) : undefined;
    const sourceValid = source && hasVerifiedReceipt(source) && source.bank_date <= row.business_date &&
      isClearing(row, source, reversing) && isClearing(original, source, false) &&
      (!reversing || source.state === "REVERSED" && original!.business_date <= row.business_date);
    const verified = sourceValid ? source.posted_amount * (reversing ? -1n : 1n) : null;
    const book = clearing.get(row.id);
    const actual = book?.reduce((sum, line) => line.account_id === accountId ? sum + line.credit - line.debit : sum, 0n) ?? null;
    const bank = book?.find(line => line.account_id !== accountId);
    const hasPair = book?.length === 2 && bank && (bankAccountId === undefined || bank.account_id === bankAccountId) &&
      actual !== null && actual === bank.debit - bank.credit && (reversing ? actual < 0n : actual > 0n);
    bookClearing += actual ?? 0n;
    const delta = verified !== null && actual !== null ? actual - verified : null;
    const dateMismatch = Boolean(sourceValid && !reversing && !inPeriod(source.bank_date));
    const unresolved = verified === null || !hasPair;
    if (verified !== null) verifiedClearing += verified;
    incomplete ||= unresolved;
    difference ||= delta !== null && delta !== 0n;
    timing ||= dateMismatch;
    rows.push({ id: row.id, cells: [
      source?.bank_reference ?? null, source?.cutoff_date ?? null, source?.bank_date ?? null,
      row.business_date, row.journal_no,
      unresolved ? "Needs review" : delta !== 0n ? "Difference" : dateMismatch ? "Timing difference" : reversing ? "Reversal matched" : "Matched",
      amount(verified), amount(actual), amount(delta), source && hasVerifiedReceipt(source) ? amount(source.bank_amount) : null,
    ] });
  }
  const selectedIds = new Set(journalRows.map(row => row.id));
  for (const source of receipts) {
    if (source.clearing_journal_id && selectedIds.has(source.clearing_journal_id)) continue;
    const original = source.clearing_journal_id ? journals.get(source.clearing_journal_id) : undefined;
    if (isClearing(original, source, false) && original!.business_date < period.from && source.bank_date <= original!.business_date) continue;
    const postedLater = hasVerifiedReceipt(source) && isClearing(original, source, false) && original!.business_date > period.to;
    timing ||= postedLater;
    incomplete ||= !postedLater;
    rows.push({ id: "receipt-" + source.id, cells: [
      source.bank_reference, source.cutoff_date, source.bank_date, original?.business_date ?? null,
      original?.journal_no ?? null, postedLater ? "Receipt posted after month end" : "Clearing journal unavailable",
      null, null, null, hasVerifiedReceipt(source) ? amount(source.bank_amount) : null,
    ] });
  }
  const totals = reportTotals(columns, rows);
  totals[9] = null;
  if (incomplete) {
    totals[6] = null;
    totals[8] = null;
  }
  return {
    bookClearing, verifiedClearing, incomplete, timing, difference,
    section: { key: "remittances", label: "Payroll remittance references", columns, rows, totals } satisfies ReportSection,
  };
}
