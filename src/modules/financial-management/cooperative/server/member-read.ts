import "server-only";

import { z } from "zod";
import { readDirectusItems } from "./directus";
import { getPolicies } from "./policies";
import type { Product } from "../policies/policy-types";
import { MemberError } from "./member-errors";
import {
  type CurrentMembership,
  type DocumentRequirement,
  type MemberDocument,
  type MemberPolicy,
  type PayrollReference,
  type SavingsEntry,
} from "../members/types";

const int = z.coerce.number().int().positive();
const policyRevision = z.coerce.number().int().nonnegative();
const decimal = z.union([z.string(), z.number()]).transform(value => {
  const text = String(value);
  return /^-?\d+(?:\.\d{1,2})?$/.test(text) ? text : String(Number(text).toFixed(2));
});
const optionalText = z.string().nullable().optional();

function isFlag(value: unknown, desired = true) {
  if (value === true || value === 1 || value === "1") return desired;
  if (value === false || value === 0 || value === "0" || value === null || value === undefined) return !desired;
  if (typeof value === "object" && value && "data" in value) {
    const data = (value as { data?: unknown[] }).data;
    return (data?.[0] === 1) === desired;
  }
  return !desired;
}

const employeeSchema = z.object({
  user_id: int,
  user_fname: optionalText,
  user_lname: optionalText,
  user_department: z.union([z.number(), z.string(), z.null()]),
  is_deleted: z.unknown(),
  is_blocked: z.unknown(),
  is_employee: z.unknown(),
  separation_date: optionalText,
});
const departmentSchema = z.object({
  department_id: int,
  department_name: z.string().nullable(),
  is_delete: z.unknown(),
});
const membershipSchema = z.object({
  id: int,
  user_id: int,
  employee_name: z.string(),
  department_name: z.string().nullable(),
  status: z.enum(["ACTIVE", "SEPARATED"]),
  joined_at: z.string(),
  savings_per_cutoff: decimal,
  opening_deposit: decimal,
  membership_fee: decimal,
  fee_channel: z.enum(["COUNTER", "PAYROLL"]),
  beneficiary: z.string().nullable(),
  savings_balance: decimal,
  journal_id: int.nullable(),
  policy_revision: policyRevision,
  created_at: z.string(),
});
const agreementSchema = z.object({
  id: int,
  membership_id: int,
  agreement_no: z.string(),
  signed_at: z.string(),
  policy_revision: policyRevision,
  terms_snapshot: z.record(z.string(), z.unknown()),
  created_at: z.string(),
});
const documentSchema = z.object({
  id: z.string(),
  owner_id: int,
  document_type_id: int,
  file_name: z.string(),
  mime_type: z.string(),
  size_bytes: z.coerce.number().int().positive(),
  uploaded_at: z.string(),
  removed_at: z.string().nullable(),
});
const savingsSchema = z.object({
  id: int,
  membership_id: int,
  entry_date: z.string(),
  kind: z.enum(["OPENING", "DEPOSIT", "WITHDRAWAL", "DIVIDEND", "OFFSET"]),
  amount: decimal,
  balance_after: decimal,
  journal_id: int,
  reference: z.string(),
  posted_at: z.string(),
});
const payrollResultSchema = z.object({
  id: int,
  user_id: int,
  payroll_run_id: int.nullable(),
  cutoff_end: z.iso.date().nullable(),
  on_hold: z.unknown(),
  gross_pay: z.unknown(),
  total_deductions: z.unknown(),
  net_pay: z.unknown(),
});
const postedRunSchema = z.object({ payroll_run_id: int, cutoff_end: z.iso.date() });
type PayrollResult = z.output<typeof payrollResultSchema>;

type EmployeeRow = z.output<typeof employeeSchema>;
type MembershipRow = z.output<typeof membershipSchema>;
type AgreementRow = z.output<typeof agreementSchema>;
type DocumentRow = z.output<typeof documentSchema>;

export type EmployeeRecord = {
  userId: number;
  name: string;
  firstName: string;
  lastName: string;
  departmentId: number | null;
  departmentName: string | null;
  isEmployee: boolean;
  active: boolean;
  employeeNumber: string;
};

export type MemberDataset = {
  employees: EmployeeRecord[];
  byUserId: Map<number, EmployeeRecord>;
  memberships: MembershipRow[];
  currentByUser: Map<number, MembershipRow>;
  agreements: AgreementRow[];
  agreementByMembership: Map<number, AgreementRow>;
  policy: MemberPolicy;
  salaryProduct: Product | null;
  policyRevision: number;
  documentsByMembership: Map<number, DocumentRow[]>;
  latestTruncated?: boolean;
};

type Query = { filter?: object; sort?: string; limit?: number; offset?: number };

async function rows<T extends z.ZodType>(collection: Parameters<typeof readDirectusItems>[0], fields: string, schema: T, query: Query = {}) {
  const params = new URLSearchParams({ fields, limit: String(query.limit ?? -1) });
  if (query.filter) params.set("filter", JSON.stringify(query.filter));
  if (query.sort) params.set("sort", query.sort);
  if (query.offset) params.set("offset", String(query.offset));
  return z.object({ data: z.array(schema) }).parse(await readDirectusItems(collection, params)).data;
}

export async function readPolicySnapshot() {
  let state;
  try {
    state = await getPolicies();
  } catch {
    throw new MemberError(503, "Policies are unavailable. Configure the Cooperative Policies first.");
  }
  if (!state.settings) throw new MemberError(503, "Configure the Cooperative membership settings before enrolling members.");
  const documentTypes = new Map(state.documentTypes.filter(type => type.isActive).map(type => [type.id, type.name]));
  const requiredDocuments: DocumentRequirement[] = state.documentRules
    .filter(rule => rule.scope === "MEMBERSHIP" && rule.isActive && documentTypes.has(rule.documentTypeId))
    .map(rule => ({ documentTypeId: rule.documentTypeId, name: documentTypes.get(rule.documentTypeId)!, enforcement: rule.enforcement }));
  return {
    revision: state.revision,
    salaryProduct: state.products.find(product => product.code === "SL") ?? null,
    policy: {
      revision: state.revision,
      membershipFee: state.settings.membershipFee,
      minimumSavings: state.settings.minimumSavings,
      maintainingBalance: state.settings.maintainingBalance,
      floorMode: state.settings.floorMode,
      floorFixedAmount: state.settings.floorFixedAmount,
      floorPercent: state.settings.floorPercent,
      requiredDocuments,
    } satisfies MemberPolicy,
  };
}

export async function loadMemberDataset(): Promise<MemberDataset> {
  const [employees, departments, memberships, agreements, policyState] = await Promise.all([
    rows("user", "user_id,user_fname,user_lname,user_department,is_deleted,is_blocked,is_employee,separation_date", employeeSchema, { sort: "user_lname,user_fname" }),
    rows("department", "department_id,department_name,is_delete", departmentSchema, { sort: "department_name" }),
    rows("cooperative_memberships", "id,user_id,employee_name,department_name,status,joined_at,savings_per_cutoff,opening_deposit,membership_fee,fee_channel,beneficiary,savings_balance,journal_id,policy_revision,created_at", membershipSchema, { sort: "employee_name" }),
    rows("cooperative_membership_agreements", "id,membership_id,agreement_no,signed_at,policy_revision,terms_snapshot,created_at", agreementSchema, { sort: "agreement_no" }),
    readPolicySnapshot(),
  ]);
  const departmentNames = new Map(departments.filter(row => !isFlag(row.is_delete, true)).map(row => [row.department_id, row.department_name]));
  const employeeRecords: EmployeeRecord[] = [];
  const byUserId = new Map<number, EmployeeRecord>();
  for (const employee of employees as EmployeeRow[]) {
    const isEmployee = isFlag(employee.is_employee, true);
    const active = isEmployee && !isFlag(employee.is_deleted, true) &&
      !isFlag(employee.is_blocked, true) && !employee.separation_date;
    const first = employee.user_fname?.trim() ?? "";
    const last = employee.user_lname?.trim() ?? "";
    const record: EmployeeRecord = {
      userId: employee.user_id,
      firstName: first,
      lastName: last,
      name: [first, last].filter(Boolean).join(" ") || `VOS user ${employee.user_id}`,
      departmentId: employee.user_department ? Number(employee.user_department) : null,
      departmentName: employee.user_department ? departmentNames.get(Number(employee.user_department)) ?? null : null,
      isEmployee,
      active,
      employeeNumber: String(employee.user_id),
    };
    employeeRecords.push(record);
    byUserId.set(record.userId, record);
  }
  const currentByUser = new Map(memberships.map(row => [row.user_id, row]));
  const agreementByMembership = new Map(agreements.map(row => [row.membership_id, row]));
  const membershipIds = memberships.map(row => row.id);
  const documentRows = membershipIds.length
    ? await rows("cooperative_documents", "id,owner_id,document_type_id,file_name,mime_type,size_bytes,uploaded_at,removed_at", documentSchema, {
        filter: { _and: [{ owner_type: { _eq: "MEMBER" } }, { owner_id: { _in: membershipIds } }, { removed_at: { _null: true } }] },
        sort: "-uploaded_at",
      })
    : [];
  const documentsByMembership = new Map<number, DocumentRow[]>();
  for (const row of documentRows) {
    const list = documentsByMembership.get(row.owner_id) ?? [];
    list.push(row);
    documentsByMembership.set(row.owner_id, list);
  }
  return {
    employees: employeeRecords,
    byUserId,
    memberships,
    currentByUser,
    agreements,
    agreementByMembership,
    policy: policyState.policy,
    salaryProduct: policyState.salaryProduct,
    policyRevision: policyState.revision,
    documentsByMembership,
  };
}

export function currentMembershipToView(row: MembershipRow, posting?: { journalNo: string | null; orNo: string | null }): CurrentMembership {
  return {
    id: row.id,
    userId: row.user_id,
    employeeNumber: String(row.user_id),
    employeeName: row.employee_name,
    departmentName: row.department_name,
    status: row.status,
    joinedAt: row.joined_at,
    savingsPerCutoff: row.savings_per_cutoff,
    openingDeposit: row.opening_deposit,
    membershipFee: row.membership_fee,
    feeChannel: row.fee_channel,
    beneficiary: row.beneficiary,
    savingsBalance: row.savings_balance,
    journalId: row.journal_id,
    journalNo: posting?.journalNo ?? null,
    orNo: posting?.orNo ?? null,
    policyRevision: row.policy_revision,
    createdAt: row.created_at,
  };
}

export function documentsToView(dataset: MemberDataset, membershipId: number): MemberDocument[] {
  const names = new Map(dataset.policy.requiredDocuments.map(row => [row.documentTypeId, row.name]));
  return (dataset.documentsByMembership.get(membershipId) ?? []).map(row => ({
    id: row.id,
    documentTypeId: row.document_type_id,
    documentTypeName: names.get(row.document_type_id) ?? `Document type ${row.document_type_id}`,
    filename: row.file_name,
    mimeType: row.mime_type,
    size: row.size_bytes,
    uploadedAt: `${row.uploaded_at}${row.uploaded_at.endsWith("Z") ? "" : "Z"}`,
    removedAt: row.removed_at ? `${row.removed_at}Z` : null,
  }));
}

export async function readStatementMember(userId: number) {
  const [member] = await rows("cooperative_memberships", "id,employee_name,department_name,status", membershipSchema.pick({
    id: true, employee_name: true, department_name: true, status: true,
  }), { filter: { user_id: { _eq: userId } }, limit: 1 });
  return member;
}

export async function readAgreementNumber(membershipId: number) {
  const [agreement] = await rows("cooperative_membership_agreements", "agreement_no", agreementSchema.pick({ agreement_no: true }), {
    filter: { membership_id: { _eq: membershipId } }, limit: 1,
  });
  return agreement?.agreement_no ?? null;
}

export async function readSavingsEntries(membershipId: number, through?: string): Promise<SavingsEntry[]> {
  const entries = await rows("cooperative_savings_entries", "id,membership_id,entry_date,kind,amount,balance_after,journal_id,reference,posted_at", savingsSchema, {
    filter: { membership_id: { _eq: membershipId }, ...(through ? { entry_date: { _lte: through } } : {}) },
    sort: "entry_date,id",
  });
  return entries.map(row => ({
    id: row.id,
    membershipId: row.membership_id,
    entryDate: row.entry_date,
    kind: row.kind,
    amount: row.amount,
    balanceAfter: row.balance_after,
    journalId: row.journal_id,
    reference: row.reference,
    postedAt: `${row.posted_at}${row.posted_at.endsWith("Z") ? "" : "Z"}`,
  }));
}

export const amountToCents = (value: string) => {
  const negative = value.startsWith("-");
  const [whole, fraction = ""] = (negative ? value.slice(1) : value).split(".");
  const amount = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0"));
  return negative ? -amount : amount;
};
export const centsToAmount = (value: bigint) => `${value / 100n}.${String(value % 100n).padStart(2, "0")}`;
export const signedCentsToAmount = (value: bigint) => `${value < 0n ? "-" : ""}${centsToAmount(value < 0n ? -value : value)}`;

function payrollIdBatches(ids: readonly number[]) {
  const size = 100;
  return Array.from({ length: Math.ceil(ids.length / size) }, (_, index) => ids.slice(index * size, (index + 1) * size));
}

const payrollAmount = z.union([z.string(), z.number()])
  .transform(String)
  .pipe(z.string().regex(/^-?\d+(?:\.\d{1,2})?$/))
  .transform(amountToCents);

function payrollReference(cutoffDate: string, results: PayrollResult[]): PayrollReference {
  if (results.length !== 1) {
    return { state: "unavailable", message: `Multiple posted payroll results exist for cutoff ${cutoffDate}. Ask Payroll to resolve them.` };
  }
  const [result] = results;
  const amounts = z.tuple([payrollAmount, payrollAmount, payrollAmount])
    .safeParse([result.gross_pay, result.total_deductions, result.net_pay]);
  if (!amounts.success || result.cutoff_end !== cutoffDate || result.payroll_run_id === null) {
    return { state: "unavailable", message: `The posted payroll result for cutoff ${cutoffDate} is incomplete or inconsistent. Ask Payroll to review it.` };
  }
  const [gross, deductions, net] = amounts.data;
  if (gross < 0n || deductions < 0n || gross - deductions !== net) {
    return { state: "unavailable", message: `Gross pay less deductions does not reconcile to net pay for cutoff ${cutoffDate}. Ask Payroll to review it.` };
  }
  return {
    state: "verified",
    source: "VOS_PAYROLL",
    cutoffDate,
    runId: result.payroll_run_id,
    resultId: result.id,
    grossPay: centsToAmount(gross),
    totalDeductions: centsToAmount(deductions),
    netPay: signedCentsToAmount(net),
  };
}

export async function readPostedPayroll(userIds: readonly number[], assessmentDate: string): Promise<Map<number, PayrollReference>> {
  const results = (await Promise.all(payrollIdBatches(userIds).map(batch =>
    rows("payroll_run_employee", "id,user_id,payroll_run_id,cutoff_end,on_hold,gross_pay,total_deductions,net_pay", payrollResultSchema, {
      filter: { user_id: { _in: batch }, cutoff_end: { _lte: assessmentDate } },
    }),
  ))).flat().filter(result => !isFlag(result.on_hold));
  const runIds = [...new Set(results.flatMap(result => result.payroll_run_id === null ? [] : [result.payroll_run_id]))];
  const postedRuns = (await Promise.all(payrollIdBatches(runIds).map(batch =>
    rows("payroll_run", "payroll_run_id,cutoff_end", postedRunSchema, {
      filter: { payroll_run_id: { _in: batch }, cutoff_end: { _lte: assessmentDate }, status: { _eq: "POSTED" }, posted_at: { _nnull: true } },
    }),
  ))).flat();
  const cutoffByRun = new Map(postedRuns.map(run => [run.payroll_run_id, run.cutoff_end]));
  const latestByUser = new Map<number, { cutoffDate: string; results: PayrollResult[] }>();
  for (const result of results) {
    const cutoffDate = result.payroll_run_id === null ? undefined : cutoffByRun.get(result.payroll_run_id);
    if (!cutoffDate) continue;
    const current = latestByUser.get(result.user_id);
    if (!current || cutoffDate > current.cutoffDate) latestByUser.set(result.user_id, { cutoffDate, results: [result] });
    else if (cutoffDate === current.cutoffDate) current.results.push(result);
  }
  return new Map([...latestByUser].map(([userId, latest]) => [userId, payrollReference(latest.cutoffDate, latest.results)]));
}

export async function latestPayrollReference(userId: number, assessmentDate: string): Promise<PayrollReference> {
  const payroll = await readPostedPayroll([userId], assessmentDate);
  return payroll.get(userId) ?? {
    state: "unavailable",
    message: `No posted VOS payroll is available for employee ${userId} on or before ${assessmentDate}.`,
  };
}

export async function readCooperativePayrollDeductions(userId: number, reference: Extract<PayrollReference, { state: "verified" }>) {
  const [row] = await rows("payroll_run_employee", "coop_savings,coop_loan,breakdown_json", z.object({
    coop_savings: z.unknown(), coop_loan: z.unknown(), breakdown_json: z.unknown(),
  }), {
    filter: {
      id: { _eq: reference.resultId }, user_id: { _eq: userId },
      payroll_run_id: { _eq: reference.runId }, cutoff_end: { _eq: reference.cutoffDate },
    },
    limit: 1,
  });
  return row ?? null;
}

const payrollDeductionFields = payrollResultSchema.extend({
  coop_savings: z.unknown(), coop_loan: z.unknown(), breakdown_json: z.unknown(),
});

export async function readPostedPayrollRun(runId: number) {
  const [run] = await rows("payroll_run", "payroll_run_id,cutoff_end", postedRunSchema, {
    filter: { payroll_run_id: { _eq: runId }, cutoff_end: { _lte: todayManila() },
      status: { _eq: "POSTED" }, posted_at: { _nnull: true } }, limit: 1,
  });
  return run ?? null;
}

export async function readPayrollRunDeductions(run: NonNullable<Awaited<ReturnType<typeof readPostedPayrollRun>>>, ids: number[]) {
  const result = new Map<number, z.output<typeof payrollDeductionFields>>();
  for (const batch of payrollIdBatches(ids)) {
    const employees = await rows("payroll_run_employee", Object.keys(payrollDeductionFields.shape).join(","),
      payrollDeductionFields, { filter: { payroll_run_id: { _eq: run.payroll_run_id }, user_id: { _in: batch } } });
    const grouped = new Map<number, typeof employees>();
    for (const employee of employees) {
      const group = grouped.get(employee.user_id) ?? [];
      group.push(employee);
      grouped.set(employee.user_id, group);
    }
    for (const [id, group] of grouped) {
      if (group.length === 1 && !isFlag(group[0].on_hold) && payrollReference(run.cutoff_end, group).state === "verified") {
        result.set(id, group[0]);
      }
    }
  }
  return result;
}

export function moneyValue(value: string) {
  return Number(value);
}

export function addCents(left: string, right: string) {
  return centsToAmount(amountToCents(left) + amountToCents(right));
}

export function subtractCents(left: string, right: string) {
  const result = amountToCents(left) - amountToCents(right);
  return signedCentsToAmount(result);
}

export function compareCents(left: string, right: string) {
  const a = amountToCents(left);
  const b = amountToCents(right);
  return a < b ? -1 : a > b ? 1 : 0;
}

export function percentOfCents(amount: string, percent: string) {
  const [whole, fraction = ""] = percent.split(".");
  const rate = BigInt(whole) * 10_000n + BigInt(fraction.padEnd(4, "0"));
  return (amountToCents(amount) * rate + 500_000n) / 1_000_000n;
}

export function todayManila(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Manila", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(now);
}

export function normalizeMoney(value: string) {
  const parsed = decimal.safeParse(value);
  return parsed.success ? parsed.data : null;
}

