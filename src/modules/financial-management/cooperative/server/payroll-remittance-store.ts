import "server-only";

import { z } from "zod";
import { money } from "../policies/policy-types";
import { cooperativeDirectus, readDirectusItems, usesCooperativeQaDatabase } from "./directus";
import { LoanError } from "./loans";
import { todayManila } from "./member-read";
import { remittanceRowLimit } from "./payroll-remittance-file";
import { withdrawalId as id } from "./withdrawal-store";

export const batchCollection = "cooperative_payroll_remittance_batches";
const lineCollection = "cooperative_payroll_remittance_lines";
export const remittanceDecimal = z.union([z.string(), z.number()]).transform(String).pipe(money);
export const remittanceState = z.enum(["READY", "INVALID", "UNMATCHED", "AMBIGUOUS", "DUPLICATE", "SHORT", "POSTED", "REVERSED"]);

const batch = z.object({
  id, origin: z.enum(["FILE", "INDIVIDUAL"]), state: z.enum(["REVIEW", "POSTED", "REVERSED"]),
  file_name: z.string(), file_hash: z.string(), payroll_run_id: id, cutoff_date: z.iso.date(),
  bank_date: z.iso.date(), bank_reference: z.string(), bank_amount: remittanceDecimal, posted_amount: remittanceDecimal,
  created_at: z.string(), created_by: id, created_name: z.string(),
  posted_at: z.string().nullable(), posted_by: id.nullable(), posted_name: z.string().nullable(),
  clearing_journal_id: id.nullable(), clearing_journal_no: z.string().nullable(),
  reversed_at: z.string().nullable(), reversed_by: id.nullable(), reversed_name: z.string().nullable(),
  reversal_reason: z.string().nullable(), reversal_journal_id: id.nullable(), reversal_journal_no: z.string().nullable(),
});
const line = z.object({
  id, batch_id: id, row_number: z.number().int().positive(),
  employee_number: z.string(), deduction_code: z.string(), amount_input: z.string(), reference: z.string(),
  input_error: z.string().nullable(), state: remittanceState, message: z.string().nullable(),
  member_name: z.string().nullable(), loan_no: z.string().nullable(), membership_id: id.nullable(), loan_id: id.nullable(),
  deduction_key: z.string().nullable(), journal_id: id.nullable(), journal_no: z.string().nullable(),
  payment_id: id.nullable(), reversal_journal_id: id.nullable(), reversal_journal_no: z.string().nullable(),
});
export type RemittanceBatch = z.output<typeof batch>;
export type StoredRemittanceLine = z.output<typeof line>;
export type RemittanceRowState = z.output<typeof remittanceState>;

export function requireRemittanceRollout() {
  if (!usesCooperativeQaDatabase()) throw new LoanError(409, "Payroll remittances are pending rollout.", "PENDING_ROLLOUT");
}

type Collection = Parameters<typeof readDirectusItems>[0];
export async function remittanceRows<T extends z.ZodType>(collection: Collection, schema: T,
  fields: string, filter: object, limit: number, extras: Record<string, string> = {}) {
  const query = new URLSearchParams({ fields, filter: JSON.stringify(filter), limit: String(limit), ...extras });
  return z.object({ data: schema.array() }).parse(await readDirectusItems(collection, query)).data;
}

function batchRows(filter: object, limit: number, extras?: Record<string, string>) {
  return remittanceRows(batchCollection, batch, Object.keys(batch.shape).join(","), filter, limit, extras);
}

export async function readRemittanceBatch(batchId: number) {
  if (!id.safeParse(batchId).success) throw new LoanError(400, "Choose a valid remittance batch.");
  const [row] = await batchRows({ id: { _eq: batchId } }, 1);
  if (!row) throw new LoanError(404, "The remittance batch is unavailable.");
  return row;
}

export async function readRemittanceLines(batchId: number) {
  const lines = await remittanceRows(lineCollection, line, Object.keys(line.shape).join(","),
    { batch_id: { _eq: batchId } }, remittanceRowLimit + 1, { sort: "row_number,id" });
  if (!lines.length || lines.length > remittanceRowLimit) throw new LoanError(503, "The batch rows could not be verified.");
  return lines;
}

export async function writeRemittanceBatch(body: object, batchId?: number) {
  const response = await cooperativeDirectus(`/items/${batchCollection}${batchId ? "/" + batchId : ""}?fields=id`, {
    method: batchId ? "PATCH" : "POST",
    headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  }, 60_000);
  return z.object({ data: z.object({ id }) }).parse(await response.json()).data.id;
}

const pageSize = 25;
function pageOf(params: URLSearchParams) {
  const page = Number(params.get("page") ?? 1);
  if (!Number.isInteger(page) || page < 1 || page > 10000) throw new LoanError(400, "Choose a valid page.");
  return page;
}

export async function listRemittanceBatches(params: URLSearchParams) {
  requireRemittanceRollout();
  const page = pageOf(params);
  const search = params.get("search")?.trim().slice(0, 80);
  const result = await batchRows(search ? { _or: [
    { bank_reference: { _icontains: search } }, { file_name: { _icontains: search } },
    { clearing_journal_no: { _icontains: search } },
  ] } : {}, pageSize + 1, { sort: "-created_at,-id", offset: String((page - 1) * pageSize) });
  return { rows: result.slice(0, pageSize), page, hasMore: result.length > pageSize };
}

export async function listRemittanceRuns(params: URLSearchParams) {
  requireRemittanceRollout();
  const page = pageOf(params);
  const search = params.get("search")?.trim() ?? "";
  const runId = id.safeParse(Number(search));
  const cutoff = z.iso.date().safeParse(search);
  if (search && !runId.success && !cutoff.success) throw new LoanError(422, "Search by payroll run ID or cutoff date (YYYY-MM-DD).");
  const schema = z.object({ payroll_run_id: id, cutoff_end: z.iso.date(), posted_at: z.string() });
  const runs = await remittanceRows("payroll_run", schema, Object.keys(schema.shape).join(","),
    { status: { _eq: "POSTED" }, posted_at: { _nnull: true }, cutoff_end: { _lte: todayManila(),
      ...(cutoff.success ? { _eq: cutoff.data } : {}) }, ...(runId.success ? { payroll_run_id: { _eq: runId.data } } : {}) },
    pageSize + 1, { sort: "-cutoff_end,-payroll_run_id", offset: String((page - 1) * pageSize) });
  return { rows: runs.slice(0, pageSize), page, hasMore: runs.length > pageSize };
}

export async function claimedRemittanceDeductions(keys: string[]) {
  const claimed = new Set<string>();
  for (let start = 0; start < keys.length; start += 40) {
    const filter = { deduction_key: { _in: keys.slice(start, start + 40) } };
    const rows = await remittanceRows(lineCollection, z.object({ deduction_key: z.string() }), "deduction_key", filter, 40);
    rows.forEach(row => claimed.add(row.deduction_key));
  }
  return claimed;
}

export async function claimedBankReceipt(key: string) {
  return (await remittanceRows(batchCollection, z.object({ id }), "id", { bank_key: { _eq: key } }, 1)).length > 0;
}

export async function remittanceLinks(column: "payment_id" | "journal_id", ids: number[]) {
  const batches = new Map<number, number>();
  const schema = z.object({ payment_id: id.optional(), journal_id: id.optional(), batch_id: id });
  for (let start = 0; start < ids.length; start += 50) {
    const rows = await remittanceRows(lineCollection, schema, `${column},batch_id`,
      { [column]: { _in: ids.slice(start, start + 50) } }, 50,
      { groupBy: `${column},batch_id`, "aggregate[count]": "*" });
    for (const row of rows) {
      const key = row[column];
      if (key) batches.set(key, row.batch_id);
    }
  }
  return batches;
}

export type RemittanceBatchList = Awaited<ReturnType<typeof listRemittanceBatches>>;
export type RemittanceRuns = Awaited<ReturnType<typeof listRemittanceRuns>>;
