import "server-only";

import { createHash } from "node:crypto";
import { z } from "zod";
import { readDirectusItems } from "./directus";
import { MemberError } from "./member-errors";
import { createMembershipActivation } from "./member-posting";
import {
  amountToCents,
  centsToAmount,
  compareCents,
  currentMembershipToView,
  documentsToView,
  latestPayrollReference,
  loadMemberDataset,
  percentOfCents,
  readPostedPayroll,
  readSavingsEntries,
  signedCentsToAmount,
  todayManila,
  type MemberDataset,
} from "./member-read";
import { privateCooperativeFolder } from "./document-storage";
import type {
  EnrollmentCheck,
  FeeChannel,
  MemberCandidate,
  MemberDetail,
  MemberDocument,
  MemberPolicy,
  MemberRegisterStatus,
  RegisterItem,
  RegisterResponse,
} from "../members/types";
import { MEMBERSHIP_TERMS_VERSION } from "../members/types";

const id = z.union([z.number(), z.string().regex(/^[1-9]\d*$/)]).transform(Number)
  .pipe(z.number().int().positive().max(Number.MAX_SAFE_INTEGER));
const pageSize = 50;
const dateText = /^\d{4}-\d{2}-\d{2}$/;
const amountText = /^\d{1,10}(?:\.\d{1,2})?$/;

function isRealDate(value: string) {
  if (!dateText.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value;
}

function normalizeAmount(value: string, wholePesos = false) {
  const text = value.trim();
  if (!amountText.test(text)) return null;
  const [whole, fraction = ""] = text.split(".");
  if (wholePesos && /[1-9]/.test(fraction)) return null;
  return `${whole}.${fraction.padEnd(2, "0")}`;
}

function floorCents(policy: MemberPolicy, grossPay: string) {
  if (policy.floorMode === "FIXED") return amountToCents(policy.floorFixedAmount ?? "0.00");
  return percentOfCents(grossPay, policy.floorPercent ?? "0.00");
}

function documentStatus(dataset: MemberDataset, membershipId: number) {
  const required = dataset.policy.requiredDocuments;
  const onFile = new Set((dataset.documentsByMembership.get(membershipId) ?? []).map(row => row.document_type_id));
  const missing = required.filter(row => !onFile.has(row.documentTypeId));
  return { required: required.length, onFile: required.length - missing.length, missing: missing.map(row => row.name) };
}

function itemForEmployee(dataset: MemberDataset, userId: number): RegisterItem {
  const employee = dataset.byUserId.get(userId);
  if (!employee) throw new MemberError(404, "The employee is unavailable.");
  const current = dataset.currentByUser.get(userId);
  const agreement = current ? dataset.agreementByMembership.get(current.id) : undefined;
  const hasCurrent = Boolean(current);
  const status: MemberRegisterStatus = current
    ? current.status === "ACTIVE" ? "MEMBER" : "SEPARATED"
    : employee.active ? "NON_MEMBER" : "SEPARATED";
  return {
    userId,
    employeeNumber: employee.employeeNumber,
    employeeName: current?.employee_name ?? employee.name,
    departmentName: current?.department_name ?? employee.departmentName,
    membershipStatus: status,
    membershipId: current?.id ?? null,
    agreementNo: agreement?.agreement_no ?? null,
    joinedAt: current?.joined_at ?? null,
    savingsBalance: current?.savings_balance ?? null,
    documents: current ? documentStatus(dataset, current.id) : null,
    hasCurrent,
    activeEmployee: employee.active,
    canEnroll: employee.active && !hasCurrent,
    loanBalance: null,
    pastDue: null,
    withdrawal: null,
  };
}

function countsFor(items: RegisterItem[]) {
  return {
    members: items.filter(item => item.membershipStatus === "MEMBER").length,
    nonMembers: items.filter(item => item.membershipStatus === "NON_MEMBER").length,
    separated: items.filter(item => item.membershipStatus === "SEPARATED").length,
    documentsMissing: items.filter(item => (item.documents?.missing.length ?? 0) > 0).length,
  };
}

export async function getMemberRegister(search: URLSearchParams): Promise<RegisterResponse> {
  const dataset = await loadMemberDataset();
  const all = dataset.employees.map(employee => itemForEmployee(dataset, employee.userId));
  const query = (search.get("q") ?? "").trim().toLowerCase();
  const department = (search.get("department") ?? "").trim();
  const membership = (search.get("membership") ?? "").trim();
  const account = (search.get("account") ?? "").trim();
  const filtered = all.filter(item => {
    if (department && item.departmentName !== department) return false;
    if (membership && item.membershipStatus !== membership) return false;
    if (account === "documents" && !(item.documents?.missing.length)) return false;
    if (!query) return true;
    return [item.employeeName, item.employeeNumber, item.departmentName, item.agreementNo]
      .some(value => value?.toLowerCase().includes(query));
  });
  filtered.sort((left, right) => left.employeeName.localeCompare(right.employeeName));
  const requested = Number(search.get("page") ?? "1");
  const page = Number.isSafeInteger(requested) && requested > 0 ? requested : 1;
  const start = (page - 1) * pageSize;
  return {
    items: filtered.slice(start, start + pageSize),
    total: filtered.length,
    page,
    pageSize,
    departments: [...new Set(all.map(item => item.departmentName).filter((name): name is string => Boolean(name)))].sort(),
    counts: countsFor(all),
  };
}

export async function getMemberCandidates(search: URLSearchParams): Promise<{ items: MemberCandidate[] }> {
  const dataset = await loadMemberDataset();
  const query = (search.get("q") ?? "").trim().toLowerCase();
  const items = dataset.employees.flatMap(employee => {
    const item = itemForEmployee(dataset, employee.userId);
    if (!item.canEnroll) return [];
    if (query && ![item.employeeName, item.employeeNumber, item.departmentName]
      .some(value => value?.toLowerCase().includes(query))) return [];
    return [{
      userId: item.userId,
      employeeNumber: item.employeeNumber,
      employeeName: item.employeeName,
      departmentName: item.departmentName,
    }];
  });
  const payroll = await readPostedPayroll(items.map(item => item.userId), todayManila());
  const candidates = items.map(item => ({
    ...item,
    hasPostedPayroll: payroll.get(item.userId)?.state === "verified",
  }));
  candidates.sort((left, right) =>
    Number(right.employeeNumber === query) - Number(left.employeeNumber === query) ||
    Number(right.hasPostedPayroll) - Number(left.hasPostedPayroll) ||
    left.employeeName.localeCompare(right.employeeName) ||
    left.userId - right.userId,
  );
  return { items: candidates.slice(0, pageSize) };
}

export type EnrollmentDraft = {
  userId: number;
  signedAt: string;
  savingsPerCutoff: string;
  openingDeposit: string;
  feeChannel: FeeChannel;
  beneficiary: string;
};

function draftFrom(search: URLSearchParams, dataset: MemberDataset): EnrollmentDraft {
  const employeeId = id.safeParse(search.get("userId"));
  if (!employeeId.success) throw new MemberError(422, "Choose an eligible employee.", "EMPLOYEE_REQUIRED", "employeeId");
  const rawChannel = (search.get("feeChannel") ?? "COUNTER").toUpperCase();
  const beneficiary = search.get("beneficiary") ?? "";
  return {
    userId: employeeId.data,
    signedAt: search.get("signedAt") ?? todayManila(),
    savingsPerCutoff: search.get("savingsPerCutoff") ?? dataset.policy.minimumSavings,
    openingDeposit: search.get("openingDeposit") ?? "0.00",
    feeChannel: rawChannel === "PAYROLL" ? "PAYROLL" : rawChannel === "COUNTER" ? "COUNTER" : rawChannel as FeeChannel,
    beneficiary,
  };
}

export async function buildEnrollmentCheck(draft: EnrollmentDraft, loadedDataset?: MemberDataset): Promise<EnrollmentCheck> {
  const dataset = loadedDataset ?? await loadMemberDataset();
  const employee = dataset.byUserId.get(draft.userId);
  if (!employee) throw new MemberError(404, "The employee is unavailable.");
  const current = dataset.currentByUser.get(draft.userId);
  const policy = dataset.policy;
  const fieldErrors: Record<string, string> = {};

  const signedAt = draft.signedAt.trim();
  if (!isRealDate(signedAt)) fieldErrors.signedAt = "Enter a valid signing date.";
  else if (signedAt > todayManila()) fieldErrors.signedAt = "The signing date cannot be in the future.";

  const savingsPerCutoff = normalizeAmount(draft.savingsPerCutoff, true);
  if (!savingsPerCutoff) fieldErrors.savingsPerCutoff = "Enter whole pesos for savings per cutoff.";
  else if (compareCents(savingsPerCutoff, policy.minimumSavings) < 0) {
    fieldErrors.savingsPerCutoff = `Savings per cutoff must be at least ${policy.minimumSavings}.`;
  }

  const openingDeposit = normalizeAmount(draft.openingDeposit);
  if (!openingDeposit) fieldErrors.openingDeposit = "Enter an opening deposit amount with up to two decimals.";

  if (!["COUNTER", "PAYROLL"].includes(draft.feeChannel)) fieldErrors.feeChannel = "Choose how the membership fee is paid.";

  const beneficiary = draft.beneficiary.trim();
  if (beneficiary.length > 255 || /[\u0000-\u001f\u007f]/.test(beneficiary)) {
    fieldErrors.beneficiary = "Keep the beneficiary to 255 characters.";
  }

  const payroll = fieldErrors.signedAt
    ? { state: "unavailable" as const, message: "Choose a valid signing date on or before today." }
    : await latestPayrollReference(draft.userId, signedAt);
  const netPay = payroll.state === "verified" ? payroll.netPay : null;
  const grossPay = payroll.state === "verified" ? payroll.grossPay : null;
  const feeAmount = policy.membershipFee;
  const payrollDeduction = savingsPerCutoff
    ? centsToAmount(amountToCents(savingsPerCutoff) + (draft.feeChannel === "PAYROLL" ? amountToCents(feeAmount) : 0n))
    : null;
  const floor = grossPay && netPay ? centsToAmount(floorCents(policy, grossPay)) : null;
  const headroom = netPay && floor && payrollDeduction
    ? signedCentsToAmount(amountToCents(netPay) - amountToCents(floor) - amountToCents(payrollDeduction))
    : null;
  if (headroom && amountToCents(headroom) < 0n) {
    fieldErrors.savingsPerCutoff = "Savings and the payroll membership fee would take pay below the take-home floor.";
  }

  const checks = [
    { key: "active", ok: employee.active, label: "Active employee", detail: employee.active ? "The employee is active in VOS." : "Only active employees can enroll." },
    { key: "current", ok: !current, label: "No current membership", detail: current ? `Membership ${current.id} already exists.` : "No Cooperative membership exists yet." },
    {
      key: "payroll", ok: payroll.state === "verified", label: "Posted VOS payroll",
      detail: payroll.state === "verified"
        ? `Cutoff ${payroll.cutoffDate} was used.`
        : payroll.message,
    },
    {
      key: "minimum", ok: Boolean(savingsPerCutoff) && compareCents(savingsPerCutoff!, policy.minimumSavings) >= 0,
      label: "Minimum savings", detail: `The policy minimum is ${policy.minimumSavings} per cutoff.`,
    },
    {
      key: "floor", ok: Boolean(headroom) && amountToCents(headroom!) >= 0n,
      label: "Take-home pay floor",
      detail: headroom
        ? `${headroom} remains after the ${floor} floor and payroll deductions.`
        : "Posted VOS payroll is required to check the floor.",
    },
  ];
  const fingerprint = createHash("sha256").update(JSON.stringify({
    terms: MEMBERSHIP_TERMS_VERSION,
    employeeId: employee.userId,
    employeeNumber: employee.employeeNumber,
    policyRevision: policy.revision,
    payroll: payroll.state === "verified" ? payroll : null,
    signedAt,
    savingsPerCutoff,
    openingDeposit,
    feeChannel: draft.feeChannel,
    beneficiary,
  })).digest("hex");

  return {
    employee: {
      userId: employee.userId,
      employeeNumber: employee.employeeNumber,
      employeeName: employee.name,
      departmentName: employee.departmentName,
      activeEmployee: employee.active,
      hasCurrent: Boolean(current),
      currentMembershipId: current?.id ?? null,
    },
    policy,
    payroll,
    inputs: {
      signedAt,
      savingsPerCutoff: savingsPerCutoff ?? draft.savingsPerCutoff,
      openingDeposit: openingDeposit ?? draft.openingDeposit,
      feeChannel: draft.feeChannel,
      beneficiary,
    },
    values: { feeAmount, netPay, floor, payrollDeduction, headroom },
    checks,
    fieldErrors,
    canEnroll: checks.every(check => check.ok) && Object.keys(fieldErrors).length === 0,
    fingerprint,
  };
}

export async function readEnrollmentCheck(search: URLSearchParams) {
  const dataset = await loadMemberDataset();
  return buildEnrollmentCheck(draftFrom(search, dataset), dataset);
}

const submitSchema = z.object({
  userId: z.number().int().positive(),
  signedAt: z.string(),
  savingsPerCutoff: z.string(),
  openingDeposit: z.string(),
  feeChannel: z.enum(["COUNTER", "PAYROLL"]),
  beneficiary: z.string().max(255).optional().default(""),
  termsAccepted: z.boolean().refine(value => value, "Confirm the signed membership agreement."),
  fingerprint: z.string().regex(/^[0-9a-f]{64}$/),
  requestKey: z.uuid(),
});

function submitFieldErrors(error: z.ZodError) {
  const fields: Record<string, string> = {};
  for (const issue of error.issues) {
    const field = typeof issue.path[0] === "string" ? issue.path[0] : "form";
    fields[field] ??= issue.message;
  }
  return fields;
}

export async function submitMembership(payload: unknown, actor: { actorId: number; actorName: string; actorRole: string | null }) {
  const parsed = submitSchema.safeParse(payload);
  if (!parsed.success) {
    throw new MemberError(422, "Check the enrollment form.", "VALIDATION", undefined, { fieldErrors: submitFieldErrors(parsed.error) });
  }
  const draft: EnrollmentDraft = {
    userId: parsed.data.userId,
    signedAt: parsed.data.signedAt,
    savingsPerCutoff: parsed.data.savingsPerCutoff,
    openingDeposit: parsed.data.openingDeposit,
    feeChannel: parsed.data.feeChannel,
    beneficiary: parsed.data.beneficiary,
  };
  const check = await buildEnrollmentCheck(draft);
  const result = await createMembershipActivation(check, parsed.data.requestKey, actor, parsed.data.fingerprint);
  return { ...result, check };
}

async function readPosting(journalId: number | null) {
  if (!journalId) return { journalNo: null, orNo: null };
  const journalQuery = new URLSearchParams({
    fields: "journal_no", limit: "1", filter: JSON.stringify({ id: { _eq: journalId } }),
  });
  const receiptQuery = new URLSearchParams({
    fields: "or_no", limit: "1", filter: JSON.stringify({ journal_id: { _eq: journalId } }),
  });
  const [journal, receipt] = await Promise.all([
    readDirectusItems("cooperative_journals", journalQuery),
    readDirectusItems("cooperative_official_receipts", receiptQuery),
  ]);
  const journals = z.object({ data: z.array(z.object({ journal_no: z.string() })) }).parse(journal).data;
  const receipts = z.object({ data: z.array(z.object({ or_no: z.string() })) }).parse(receipt).data;
  return { journalNo: journals[0]?.journal_no ?? null, orNo: receipts[0]?.or_no ?? null };
}

export async function getMemberDetail(userId: number): Promise<MemberDetail> {
  const dataset = await loadMemberDataset();
  const item = itemForEmployee(dataset, userId);
  const current = dataset.currentByUser.get(userId);
  const agreement = current ? dataset.agreementByMembership.get(current.id) : undefined;
  const documents: MemberDocument[] = current ? documentsToView(dataset, current.id) : [];
  const payroll = await latestPayrollReference(userId, todayManila());
  const savingsEntries = current ? await readSavingsEntries(current.id) : [];
  const posting = await readPosting(current?.journal_id ?? null);
  let documentStorageReady = false;
  try {
    await privateCooperativeFolder();
    documentStorageReady = true;
  } catch {
    documentStorageReady = false;
  }
  let takeHome: MemberDetail["takeHome"] = {
    floor: null,
    savingsPerCutoff: null,
    payrollDeduction: null,
    headroom: null,
    loansUnavailable: true,
    withdrawalsUnavailable: true,
  };
  if (current && payroll.state === "verified") {
    const net = amountToCents(payroll.netPay);
    const floor = floorCents(dataset.policy, payroll.grossPay);
    const savings = amountToCents(current.savings_per_cutoff);
    takeHome = {
      floor: centsToAmount(floor),
      savingsPerCutoff: current.savings_per_cutoff,
      payrollDeduction: current.savings_per_cutoff,
      headroom: signedCentsToAmount(net - floor - savings),
      loansUnavailable: true,
      withdrawalsUnavailable: true,
    };
  }
  return {
    item,
    current: current ? currentMembershipToView(current, posting) : null,
    agreement: agreement ? {
      id: agreement.id,
      membershipId: agreement.membership_id,
      agreementNo: agreement.agreement_no,
      signedAt: agreement.signed_at,
      policyRevision: agreement.policy_revision,
      termsSnapshot: agreement.terms_snapshot,
      createdAt: agreement.created_at,
    } : null,
    policy: dataset.policy,
    documents,
    documentStorageReady,
    requiredDocuments: dataset.policy.requiredDocuments,
    savingsEntries,
    payroll,
    takeHome,
    loans: null,
    withdrawals: null,
  };
}

export function memberDocumentScope(userId: number) {
  const membership = async () => {
    const query = new URLSearchParams({
      fields: "id,status", limit: "1", filter: JSON.stringify({ user_id: { _eq: id.parse(userId) } }),
    });
    const parsed = z.object({
      data: z.array(z.object({ id: z.number().int().positive(), status: z.enum(["ACTIVE", "SEPARATED"]) })),
    }).parse(await readDirectusItems("cooperative_memberships", query));
    return parsed.data[0];
  };
  return {
    workspace: "members" as const,
    loadOwner: async (_actorId: number, operation: "read" | "upload" | "remove") => {
      const row = await membership();
      if (!row) return null;
      if (operation !== "read" && row.status !== "ACTIVE") return null;
      return { type: "MEMBER" as const, id: row.id };
    },
  };
}
