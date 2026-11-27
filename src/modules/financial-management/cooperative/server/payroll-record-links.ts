import "server-only";

import { createHash } from "node:crypto";
import { z } from "zod";
import { postedCooperativeItems, readPostedCooperativeItems, type PostedPayrollItem } from "../loans/loan-assessment";
import { cooperativeDirectus, readDirectusItems, usesCooperativeQaDatabase } from "./directus";

const id = z.coerce.number().int().positive().safe();
const money = z.union([z.string(), z.number()]).transform(String).pipe(z.string().regex(/^\d+(?:\.\d{1,2})?$/));
const digest = (data: unknown) => createHash("sha256").update(JSON.stringify(data)).digest("hex");
const collection = "cooperative_payroll_record_links";
const linkSchema = z.object({ id: z.string(), user_id: id, target_id: id, source_fingerprint: z.string(),
  evidence: z.string(), verified_by: id, verified_at: z.string(), payroll_run_id: id });
export type PayrollRecordLink = z.output<typeof linkSchema>;
const savings = z.object({ id, user_id: id, membership_id: z.string(), monthly_amount: money, start_date: z.iso.date() });
const loans = z.object({ loan_id: id, user_id: id, loan_type: z.literal("COOP"), loan_amount: money,
  net_amount_released: money, interest_amount: money, monthly_payment: money, months_to_pay: id, start_date: z.iso.date() });
export type PayrollMaster = { kind: "savings"; data: z.output<typeof savings> } | { kind: "loan"; data: z.output<typeof loans> };

export function payrollSourceKey(item: Pick<PostedPayrollItem, "table" | "id">) {
  return digest([item.table, item.id]);
}

export function payrollCutoffKey(cutoff: string, userId: number, item: Pick<PostedPayrollItem, "table" | "id">) {
  return digest([cutoff, userId, item.table, item.id]);
}

async function readGroups<T extends z.ZodObject>(table: Parameters<typeof readDirectusItems>[0], schema: T,
  field: string, keys: (number | string)[], extra: object = {}) {
  const data: z.output<T>[] = [];
  for (let start = 0; start < keys.length; start += 40) {
    const group = keys.slice(start, start + 40);
    const query = new URLSearchParams({ fields: Object.keys(schema.shape).join(","),
      limit: String(group.length), filter: JSON.stringify({ [field]: { _in: group }, ...extra }) });
    data.push(...z.object({ data: schema.array() }).parse(await readDirectusItems(table, query)).data);
  }
  return data;
}

export async function readPayrollMasters(items: PostedPayrollItem[]) {
  const ids = (table: string) => [...new Set(items.filter(item => item.table === table).map(item => item.id))];
  const [memberships, employeeLoans] = await Promise.all([
    readGroups("coop_savings_membership", savings, "id", ids("coop_savings_membership")),
    readGroups("employee_loan", loans, "loan_id", ids("employee_loan"), { loan_type: { _eq: "COOP" } }),
  ]);
  const masters = new Map<string, PayrollMaster>();
  for (const data of memberships) masters.set(payrollSourceKey({ table: "coop_savings_membership", id: data.id }), { kind: "savings", data });
  for (const data of employeeLoans) masters.set(payrollSourceKey({ table: "employee_loan", id: data.loan_id }), { kind: "loan", data });
  return masters;
}

export async function readPayrollRecordLinks(items: PostedPayrollItem[]) {
  const keys = [...new Set(items.filter(item => item.table === "employee_loan" || item.table === "coop_savings_membership").map(payrollSourceKey))];
  if (!usesCooperativeQaDatabase()) return new Map<string, PayrollRecordLink>();
  const links = await readGroups(collection, linkSchema, "id", keys);
  return new Map(links.map(link => [link.id, link]));
}

export function verifiedPayrollLink(link: PayrollRecordLink | undefined, master: PayrollMaster | undefined, userId: number) {
  if (!link || master?.data.user_id !== userId || link.user_id !== userId) return undefined;
  if (link.source_fingerprint === digest(master)) return link;
  if (master.kind === "loan") {
    const { interest_amount, ...previous } = master.data;
    if (Number(interest_amount) === 0 && link.source_fingerprint === digest({ kind: "loan", data: previous })) return link;
  }
  return undefined;
}

export async function savePayrollRecordLink(item: PostedPayrollItem, master: PayrollMaster, targetId: number,
  runId: number, actorId: number, evidence: string) {
  const key = payrollSourceKey(item);
  const fields = {
    id: key, target_key: digest([master.kind, targetId]), user_id: master.data.user_id, target_id: targetId,
    source_fingerprint: digest(master), verified_by: actorId, verified_at: new Date().toISOString().slice(0, 19),
    evidence, payroll_run_id: runId,
  };
  try {
    await cooperativeDirectus("/items/" + collection + "?fields=id", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(fields),
    });
  } catch (cause) {
    const existing = verifiedPayrollLink((await readPayrollRecordLinks([item])).get(key), master, master.data.user_id);
    if (existing?.target_id !== targetId) throw cause;
  }
}

export async function remapPostedPayrollItems(posted: Parameters<typeof postedCooperativeItems>[0], userId: number) {
  const direct = postedCooperativeItems(posted);
  if (!direct || !usesCooperativeQaDatabase()) return direct;
  const external = readPostedCooperativeItems(posted)!.filter(item => item.table === "coop_savings_membership" || item.table === "employee_loan");
  if (!external.length) return direct;
  const links = await readPayrollRecordLinks(external);
  const mapped = external.filter(item => links.has(payrollSourceKey(item)));
  const masters = await readPayrollMasters(mapped);
  for (const item of mapped) {
    const key = payrollSourceKey(item);
    const link = verifiedPayrollLink(links.get(key), masters.get(key), userId);
    if (!link) return null;
    const table = item.table === "coop_savings_membership" ? "cooperative_memberships" : "cooperative_loans";
    if (direct.some(row => row.table === table && row.id === link.target_id)) return null;
    direct.push({ ...item, table, id: link.target_id });
  }
  return direct;
}
