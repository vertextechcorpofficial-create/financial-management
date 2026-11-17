import "server-only";

import { BALANCE_TOLERANCE } from "../constants";
import type { JournalQuery } from "../schemas";
import type {
  AccountOption,
  AccountSummaryRow,
  AccountSummaryTotals,
  EntriesPayload,
  EntryRow,
  EntryStatus,
  EntryTotals,
  EntryType,
  JournalLine,
  JournalOptions,
  LoanOption,
  RawAccountRow,
  RawEntryRow,
  RawLineRow,
  RawLoanRow,
  SummaryPayload,
} from "../types";
import { asNumber, asString, listItems, roundMoney } from "./directus";

/**
 * The loan journal is a read-only ledger: every route here is a GET, and nothing in this
 * service writes. The entry header repeats its own totals, so the desk checks both the header
 * (debit against credit) and the lines (their sum against the header) rather than trusting one.
 */

const ENTRY_FIELDS = [
  "id",
  "loan_id",
  "entry_no",
  "entry_date",
  "entry_type",
  "description",
  "period_key",
  "status",
  "reverses_entry_no",
  "total_debit",
  "total_credit",
];

const LINE_FIELDS = ["id", "entry_id", "line_no", "coa_id", "memo", "debit", "credit"];
const LOAN_FIELDS = ["id", "loan_no", "lender_name"];
const ACCOUNT_FIELDS = ["coa_id", "gl_code", "account_title"];

/** Directus caps a URL's `_in` list well before a thousand ids. */
const IN_CHUNK = 80;

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let index = 0; index < items.length; index += size) out.push(items.slice(index, index + size));
  return out;
}

function uniqueNumbers(values: Array<number | null | undefined>): number[] {
  const seen = new Set<number>();
  for (const value of values) {
    if (typeof value === "number" && Number.isFinite(value)) seen.add(value);
  }
  return [...seen];
}

function compareEntries(a: RawEntryRow, b: RawEntryRow): number {
  if (a.entry_date !== b.entry_date) return a.entry_date < b.entry_date ? -1 : 1;
  return a.entry_no < b.entry_no ? -1 : a.entry_no > b.entry_no ? 1 : 0;
}

async function readEntries(): Promise<RawEntryRow[]> {
  const { rows } = await listItems<RawEntryRow>("loan_journal_entry", {
    fields: ENTRY_FIELDS,
    sort: "entry_date,entry_no",
    limit: -1,
  });
  return rows;
}

async function readLinesFor(entryIds: number[]): Promise<RawLineRow[]> {
  if (entryIds.length === 0) return [];
  const batches = chunk(entryIds, IN_CHUNK);
  const results = await Promise.all(
    batches.map((ids) =>
      listItems<RawLineRow>("loan_journal_line", {
        fields: LINE_FIELDS,
        filter: { entry_id: { _in: ids } },
        sort: "entry_id,line_no",
        limit: -1,
      }),
    ),
  );
  return results.flatMap((result) => result.rows);
}

async function readAccounts(coaIds: number[]): Promise<Map<number, RawAccountRow>> {
  const map = new Map<number, RawAccountRow>();
  if (coaIds.length === 0) return map;
  const batches = chunk(coaIds, IN_CHUNK);
  const results = await Promise.all(
    batches.map((ids) =>
      listItems<RawAccountRow>("chart_of_accounts", {
        fields: ACCOUNT_FIELDS,
        filter: { coa_id: { _in: ids } },
        limit: -1,
      }),
    ),
  );
  for (const row of results.flatMap((result) => result.rows)) map.set(row.coa_id, row);
  return map;
}

async function readLoans(loanIds: number[]): Promise<Map<number, RawLoanRow>> {
  const map = new Map<number, RawLoanRow>();
  if (loanIds.length === 0) return map;
  const batches = chunk(loanIds, IN_CHUNK);
  const results = await Promise.all(
    batches.map((ids) =>
      listItems<RawLoanRow>("loan", { fields: LOAN_FIELDS, filter: { id: { _in: ids } }, limit: -1 }),
    ),
  );
  for (const row of results.flatMap((result) => result.rows)) map.set(row.id, row);
  return map;
}

function lineOf(raw: RawLineRow, accounts: Map<number, RawAccountRow>): JournalLine {
  const account = raw.coa_id == null ? undefined : accounts.get(raw.coa_id);
  return {
    id: raw.id,
    lineNo: raw.line_no,
    coaId: raw.coa_id,
    code: asString(account?.gl_code) || "—",
    title: asString(account?.account_title) || "Account title missing",
    memo: asString(raw.memo),
    debit: asNumber(raw.debit),
    credit: asNumber(raw.credit),
  };
}

/**
 * The verdict for one entry.
 *
 * Three figures can disagree: the header's debit total, the header's credit total, and the sum of
 * the lines. The first figure that is out by more than a cent is the one reported, so the badge
 * names the difference the reader can go and find.
 */
function balanceVerdict(headerDebit: number, headerCredit: number, lineDebit: number, lineCredit: number) {
  const header = roundMoney(headerDebit - headerCredit);
  if (Math.abs(header) > BALANCE_TOLERANCE) {
    return { difference: header, note: "its debit and credit totals differ" };
  }
  const lines = roundMoney(lineDebit - lineCredit);
  if (Math.abs(lines) > BALANCE_TOLERANCE) {
    return { difference: lines, note: "its lines differ" };
  }
  const againstDebit = roundMoney(headerDebit - lineDebit);
  if (Math.abs(againstDebit) > BALANCE_TOLERANCE) {
    return { difference: againstDebit, note: "its lines do not add up to its header" };
  }
  return { difference: null, note: null };
}

function buildEntryRow(
  raw: RawEntryRow,
  lines: JournalLine[],
  loans: Map<number, RawLoanRow>,
  reversingByNo: Map<string, string>,
): EntryRow {
  const loan = raw.loan_id == null ? undefined : loans.get(raw.loan_id);
  const totalDebit = asNumber(raw.total_debit);
  const totalCredit = asNumber(raw.total_credit);
  const lineDebit = roundMoney(lines.reduce((sum, line) => sum + line.debit, 0));
  const lineCredit = roundMoney(lines.reduce((sum, line) => sum + line.credit, 0));
  const verdict = balanceVerdict(totalDebit, totalCredit, lineDebit, lineCredit);

  return {
    id: raw.id,
    entryNo: asString(raw.entry_no),
    entryDate: asString(raw.entry_date),
    entryType: raw.entry_type as EntryType,
    description: asString(raw.description),
    periodKey: asString(raw.period_key),
    status: raw.status as EntryStatus,
    reversesEntryNo: raw.reverses_entry_no ? asString(raw.reverses_entry_no) : null,
    reversedByNo: reversingByNo.get(asString(raw.entry_no)) ?? null,
    loanId: raw.loan_id,
    loanNo: loan ? asString(loan.loan_no) : null,
    lenderName: loan ? asString(loan.lender_name) : null,
    totalDebit,
    totalCredit,
    lineDebit,
    lineCredit,
    lineCount: lines.length,
    difference: verdict.difference,
    differenceNote: verdict.note,
    lines,
  };
}

interface Loaded {
  entries: EntryRow[];
  options: JournalOptions;
}

async function loadFilteredEntries(): Promise<Loaded> {
  // One read of the whole ledger, then the filters are applied in code. The journal is a
  // read-only register whose totals, unbalanced count and per-account roll-up must agree with
  // the same filter set, so all three views are derived from one pass instead of three.
  const allEntries = (await readEntries()).sort(compareEntries);
  const allLines = await readLinesFor(allEntries.map((entry) => entry.id));

  const accounts = await readAccounts(uniqueNumbers(allLines.map((line) => line.coa_id)));
  const loans = await readLoans(uniqueNumbers(allEntries.map((entry) => entry.loan_id)));

  const linesByEntry = new Map<number, JournalLine[]>();
  for (const raw of allLines) {
    const bucket = linesByEntry.get(raw.entry_id);
    const line = lineOf(raw, accounts);
    if (bucket) bucket.push(line);
    else linesByEntry.set(raw.entry_id, [line]);
  }

  // A reversed entry is pointed at by the entry that reverses it, which stores this entry's number.
  const reversingByNo = new Map<string, string>();
  for (const entry of allEntries) {
    const reversedNo = entry.reverses_entry_no ? asString(entry.reverses_entry_no) : "";
    if (reversedNo) reversingByNo.set(reversedNo, asString(entry.entry_no));
  }

  const entries = allEntries.map((raw) =>
    buildEntryRow(raw, linesByEntry.get(raw.id) ?? [], loans, reversingByNo),
  );

  const loanOptions: LoanOption[] = uniqueNumbers(allEntries.map((entry) => entry.loan_id))
    .map((id) => loans.get(id))
    .filter((loan): loan is RawLoanRow => Boolean(loan))
    .map((loan) => {
      const label = `${asString(loan.loan_no)} · ${asString(loan.lender_name)}`;
      return { id: loan.id, label, searchText: label };
    })
    .sort((a, b) => a.label.localeCompare(b.label));

  const usedAccountIds = uniqueNumbers(allLines.map((line) => line.coa_id));
  const accountOptions: AccountOption[] = usedAccountIds
    .map((id) => accounts.get(id))
    .filter((account): account is RawAccountRow => Boolean(account))
    .map((account) => {
      const code = asString(account.gl_code) || "—";
      const title = asString(account.account_title) || "Account title missing";
      return { id: account.coa_id, label: `${code} · ${title}`, searchText: `${code} ${title}` };
    })
    .sort((a, b) => a.label.localeCompare(b.label));

  return {
    entries,
    options: { loans: loanOptions, accounts: accountOptions },
  };
}

function matchesQuery(entry: EntryRow, q: string): boolean {
  const needle = q.toLowerCase();
  return (
    entry.entryNo.toLowerCase().includes(needle) ||
    entry.description.toLowerCase().includes(needle) ||
    entry.lines.some((line) => line.memo.toLowerCase().includes(needle))
  );
}

function applyFilters(entries: EntryRow[], query: JournalQuery): EntryRow[] {
  const q = query.q?.trim() ?? "";
  return entries.filter((entry) => {
    if (query.loanId && entry.loanId !== query.loanId) return false;
    if (query.entryType && entry.entryType !== query.entryType) return false;
    if (query.coaId && !entry.lines.some((line) => line.coaId === query.coaId)) return false;
    if (query.from && entry.entryDate < query.from) return false;
    if (query.to && entry.entryDate > query.to) return false;
    if (q && !matchesQuery(entry, q)) return false;
    return true;
  });
}

function totalsOf(entries: EntryRow[]): EntryTotals {
  return entries.reduce<EntryTotals>(
    (totals, entry) => ({
      debit: roundMoney(totals.debit + entry.totalDebit),
      credit: roundMoney(totals.credit + entry.totalCredit),
      unbalanced: totals.unbalanced + (entry.difference == null ? 0 : 1),
      posted: totals.posted + (entry.status === "POSTED" ? 1 : 0),
      reversed: totals.reversed + (entry.status === "REVERSED" ? 1 : 0),
    }),
    { debit: 0, credit: 0, unbalanced: 0, posted: 0, reversed: 0 },
  );
}

function summariseByAccount(entries: EntryRow[]): AccountSummaryRow[] {
  const buckets = new Map<number, AccountSummaryRow>();
  for (const entry of entries) {
    for (const line of entry.lines) {
      if (line.coaId == null) continue;
      const current =
        buckets.get(line.coaId) ??
        { coaId: line.coaId, code: line.code, title: line.title, debit: 0, credit: 0, net: 0, lineCount: 0 };
      current.debit = roundMoney(current.debit + line.debit);
      current.credit = roundMoney(current.credit + line.credit);
      current.net = roundMoney(current.debit - current.credit);
      current.lineCount += 1;
      buckets.set(line.coaId, current);
    }
  }
  return [...buckets.values()].sort((a, b) => a.code.localeCompare(b.code));
}

export async function loadEntries(query: JournalQuery): Promise<EntriesPayload> {
  const { entries, options } = await loadFilteredEntries();
  const filtered = applyFilters(entries, query);

  const start = (query.page - 1) * query.pageSize;
  return {
    rows: filtered.slice(start, start + query.pageSize),
    total: filtered.length,
    totals: totalsOf(filtered),
    options,
  };
}

export async function loadSummary(query: JournalQuery): Promise<SummaryPayload> {
  const { entries, options } = await loadFilteredEntries();
  const filtered = applyFilters(entries, query);
  const rows = summariseByAccount(filtered);

  const totals = rows.reduce<AccountSummaryTotals>(
    (acc, row) => ({
      debit: roundMoney(acc.debit + row.debit),
      credit: roundMoney(acc.credit + row.credit),
      net: roundMoney(acc.net + row.net),
      lines: acc.lines + row.lineCount,
      accounts: acc.accounts + 1,
    }),
    { debit: 0, credit: 0, net: 0, lines: 0, accounts: 0 },
  );

  const start = (query.page - 1) * query.pageSize;
  return {
    rows: rows.slice(start, start + query.pageSize),
    total: rows.length,
    totals,
    options,
  };
}

export type { EntriesPayload, SummaryPayload };
