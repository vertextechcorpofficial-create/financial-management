import "server-only";

import { createHash } from "node:crypto";
import { z } from "zod";
import { readDirectusItems } from "./directus";
import { MemberError } from "./member-errors";
import { createMembershipActivation, previewAgreementNumber } from "./member-posting";
import { getLoanDetail, LoanError, readMemberLoans, type MemberLoanView } from "./loans";
import { memberLoanAccount, memberLoanBalances, memberPayrollAssessment, readMemberLoanStatement } from "./member-loans";
import { readWithdrawalBalances } from "./withdrawal-balances";
import {
  amountToCents,
  centsToAmount,
  compareCents,
  currentMembershipToView,
  documentsToView,
  latestPayrollReference,
  loadMemberDataset,
  memberRegisterStatus,
  membershipDocumentStatus,
  percentOfCents,
  readPostedPayroll,
  readSavingsEntries,
  readStatementMember,
  signedCentsToAmount,
  todayManila,
  type MemberDataset,
} from "./member-read";
import { readSavingsStatement, statementPeriod } from "./member-statement";
import { privateCooperativeFolder } from "./document-storage";
import type {
  EnrollmentCheck,
  EnrollmentPreview,
  FeeChannel,
  MemberCandidate,
  MemberCandidatePage,
  MemberDetail,
  MemberDocument,
  MemberPolicy,
  MemberStatement,
  PayrollReference,
  RegisterItem,
  RegisterResponse,
} from "../members/types";
import { memberWithdrawalAccountFilter, MEMBERSHIP_TERMS_VERSION } from "../members/types";
import { isCalendarDate } from "../members/format";

const id = z.union([z.number(), z.string().regex(/^[1-9]\d*$/)]).transform(Number)
  .pipe(z.number().int().positive().max(Number.MAX_SAFE_INTEGER));
const pageSize = 50;
const candidatePageSize = 10;
const amountText = /^\d{1,10}(?:\.\d{1,2})?$/;

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

function defaultSavingsPerCutoff(minimum: string) {
  const wholePesos = (amountToCents(minimum) + 99n) / 100n;
  return centsToAmount(wholePesos * 100n);
}

function enrollmentPay(
  policy: MemberPolicy, payroll: PayrollReference, savingsPerCutoff: string | null, feeChannel: FeeChannel,
): EnrollmentCheck["values"] {
  const feeAmount = policy.membershipFee;
  const payrollDeduction = savingsPerCutoff === null
    ? null
    : centsToAmount(amountToCents(savingsPerCutoff) + (feeChannel === "PAYROLL" ? amountToCents(feeAmount) : 0n));
  if (payroll.state !== "verified") return { feeAmount, netPay: null, floor: null, payrollDeduction, headroom: null };

  const floor = floorCents(policy, payroll.grossPay);
  return {
    feeAmount,
    netPay: payroll.netPay,
    floor: centsToAmount(floor),
    payrollDeduction,
    headroom: payrollDeduction === null ? null : signedCentsToAmount(amountToCents(payroll.netPay) - floor - amountToCents(payrollDeduction)),
  };
}

function documentStatus(dataset: MemberDataset, membershipId: number) {
  return membershipDocumentStatus(
    dataset.policy.requiredDocuments,
    (dataset.documentsByMembership.get(membershipId) ?? []).map(row => row.document_type_id),
  );
}

function itemForEmployee(dataset: MemberDataset, userId: number): RegisterItem {
  const employee = dataset.byUserId.get(userId);
  if (!employee) throw new MemberError(404, "The employee is unavailable.");
  const current = dataset.currentByUser.get(userId);
  const agreement = current ? dataset.agreementByMembership.get(current.id) : undefined;
  const hasCurrent = Boolean(current);
  const status = memberRegisterStatus(current?.status, employee.active);
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
    documentsMissing: items.filter(item => item.membershipStatus === "MEMBER" && (item.documents?.missing.length ?? 0) > 0).length,
  };
}

function membershipIds(items: RegisterItem[]) {
  return items.flatMap(item => item.membershipId === null ? [] : [item.membershipId]);
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
  const loanFilter = account === "with-loan-balance" || account === "no-loan-balance" || account === "past-due";
  const withdrawalFilter = account === memberWithdrawalAccountFilter;
  const withdrawalMatches = withdrawalFilter ? await readWithdrawalBalances(membershipIds(filtered)) : null;
  const withdrawalFilterUnavailable = withdrawalMatches !== null && withdrawalMatches.state !== "ready";
  let matches = filtered;
  if (withdrawalMatches) {
    matches = withdrawalMatches.state === "ready" ? filtered.filter(item =>
      item.membershipId !== null && (withdrawalMatches.data.get(item.membershipId)?.pendingCount ?? 0) > 0,
    ) : [];
  }
  const relevant = loanFilter ? matches : matches.slice(start, start + pageSize);
  const ids = membershipIds(relevant);
  const [loans, pageWithdrawals] = await Promise.all([
    readMemberLoans(ids, todayManila()),
    !loanFilter && !withdrawalFilter ? readWithdrawalBalances(ids) : null,
  ]);
  let items = relevant;
  if (loans.state === "ready") {
    const byMember = new Map<number, MemberLoanView[]>();
    for (const view of loans.data) {
      const { memberId } = view.loan;
      const list = byMember.get(memberId);
      if (list) list.push(view);
      else byMember.set(memberId, [view]);
    }
    items = relevant.map(item => {
      if (item.membershipId === null) return item;
      const { loanBalance, pastDue } = memberLoanBalances(byMember.get(item.membershipId) ?? []);
      return { ...item, loanBalance, pastDue };
    });
  }
  const loanFilterUnavailable = loanFilter && loans.state !== "ready";
  if (loanFilter) {
    items = loanFilterUnavailable ? [] : items.filter(item => {
      if (item.loanBalance === null || item.pastDue === null) return false;
      if (account === "no-loan-balance") return item.membershipStatus === "MEMBER" && amountToCents(item.loanBalance) === 0n;
      return amountToCents(account === "past-due" ? item.pastDue : item.loanBalance) > 0n;
    });
  }
  const pageItems = loanFilter ? items.slice(start, start + pageSize) : items;
  const withdrawals = withdrawalMatches ?? pageWithdrawals ?? await readWithdrawalBalances(membershipIds(pageItems));
  const memberDepartments = all
    .filter(item => item.membershipStatus === "MEMBER")
    .map(item => item.departmentName);
  return {
    items: withdrawals.state === "ready" ? pageItems.map(item => {
      if (item.membershipId === null) return item;
      const withdrawal = withdrawals.data.get(item.membershipId)!;
      return { ...item, savingsBalance: withdrawal.postedSavings, withdrawal };
    }) : pageItems,
    total: loanFilter ? items.length : matches.length,
    page,
    pageSize,
    departments: [...new Set(memberDepartments.filter((name): name is string => Boolean(name)))].sort(),
    counts: countsFor(all),
    loanSource: loans.state === "ready" ? { state: "ready", data: null } : loans,
    loanFilterUnavailable,
    withdrawalSource: withdrawals.state === "ready" ? { state: "ready", data: null } : withdrawals,
    withdrawalFilterUnavailable,
  };
}

function candidateEligibility(active: boolean, payroll: PayrollReference | null | undefined, policy: MemberPolicy, savings: string | null):
  Pick<MemberCandidate, "eligibility" | "reason"> {
  if (!active) return { eligibility: "inactive", reason: "Enrollment requires an active VOS employee." };
  if (savings === null) return { eligibility: "unavailable", reason: "Review the minimum savings configured in Policies." };
  if (payroll === null) return { eligibility: "unavailable", reason: "Payroll eligibility could not be checked. Try again." };
  if (!payroll) return { eligibility: "no_posted_payroll", reason: "A posted VOS payroll result is required for the signing date." };
  if (payroll.state !== "verified") return { eligibility: "payroll_review", reason: payroll.message };

  const { headroom } = enrollmentPay(policy, payroll, savings, "COUNTER");
  if (headroom?.startsWith("-")) {
    return { eligibility: "below_take_home_floor", reason: "Minimum savings would reduce take-home pay below the policy floor." };
  }
  return { eligibility: "eligible", reason: "Employment, posted payroll, and take-home pay checks passed." };
}

export async function getMemberCandidates(search: URLSearchParams): Promise<MemberCandidatePage> {
  const dataset = await loadMemberDataset();
  const query = (search.get("q") ?? "").trim().toLowerCase();
  const requestedPage = Number(search.get("page") ?? "1");
  const page = Number.isSafeInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1;
  const matches = (item: Pick<MemberCandidate, "employeeName" | "employeeNumber" | "departmentName">) =>
    !query || [item.employeeName, item.employeeNumber, item.departmentName].some(value => value?.toLowerCase().includes(query));
  const members = dataset.memberships.map<MemberCandidate>(member => {
    const closed = member.status === "SEPARATED";
    return {
      userId: member.user_id,
      employeeNumber: String(member.user_id),
      employeeName: member.employee_name,
      departmentName: member.department_name,
      eligibility: closed ? "membership_closed" : "already_member",
      reason: closed ? "This employee has a closed Cooperative membership." : "This employee has a Cooperative membership.",
    };
  }).filter(matches);
  const employees = dataset.employees
    .filter(employee => employee.isEmployee && !dataset.currentByUser.has(employee.userId))
    .map(employee => ({
      userId: employee.userId,
      employeeNumber: employee.employeeNumber,
      employeeName: employee.name,
      departmentName: employee.departmentName,
      active: employee.active,
    }))
    .filter(matches);
  const savings = normalizeAmount(defaultSavingsPerCutoff(dataset.policy.minimumSavings), true);
  const payrollIds = employees.filter(employee => employee.active).map(employee => employee.userId);
  const payroll = await readPostedPayroll(payrollIds, todayManila()).catch(() => null);
  const candidates = members.concat(employees.map(({ active, ...employee }) => ({
    ...employee,
    ...candidateEligibility(active, payroll === null ? null : payroll.get(employee.userId), dataset.policy, savings),
  })));
  candidates.sort((left, right) =>
    Number(right.employeeNumber === query) - Number(left.employeeNumber === query) ||
    Number(right.eligibility === "eligible") - Number(left.eligibility === "eligible") ||
    left.employeeName.localeCompare(right.employeeName) ||
    left.userId - right.userId,
  );
  const start = (page - 1) * candidatePageSize;
  return {
    items: candidates.slice(start, start + candidatePageSize),
    page,
    pageSize: candidatePageSize,
    total: candidates.length,
    hasMore: start + candidatePageSize < candidates.length,
    payrollUnavailable: payroll === null,
  };
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
    savingsPerCutoff: search.get("savingsPerCutoff") ?? defaultSavingsPerCutoff(dataset.policy.minimumSavings),
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
  if (!isCalendarDate(signedAt)) fieldErrors.signedAt = "Enter a valid signing date.";
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
  const values = enrollmentPay(policy, payroll, savingsPerCutoff, draft.feeChannel);
  const { floor, headroom } = values;
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
    values,
    checks,
    fieldErrors,
    canEnroll: checks.every(check => check.ok) && Object.keys(fieldErrors).length === 0,
    fingerprint,
  };
}

export async function readEnrollmentCheck(search: URLSearchParams): Promise<EnrollmentPreview> {
  const dataset = await loadMemberDataset();
  const check = await buildEnrollmentCheck(draftFrom(search, dataset), dataset);
  if (check.fieldErrors.signedAt) {
    return { ...check, agreementNumberPreview: { state: "invalid-date", message: "Enter a valid signing date to preview the number." } };
  }
  try {
    const number = await previewAgreementNumber(check.inputs.signedAt);
    return { ...check, agreementNumberPreview: { state: "available", number } };
  } catch (error) {
    const exhausted = error instanceof MemberError && error.code === "SERIES_EXHAUSTED";
    return { ...check, agreementNumberPreview: exhausted
      ? { state: "exhausted", message: "All agreement numbers have been used for this signing year." }
      : { state: "unavailable", message: "The agreement number preview is temporarily unavailable." },
    };
  }
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
  const asOf = todayManila();
  const [payroll, savingsEntries, posting, loanViews, withdrawalSource] = await Promise.all([
    latestPayrollReference(userId, asOf),
    current ? readSavingsEntries(current.id) : [],
    readPosting(current?.journal_id ?? null),
    current ? readMemberLoans([current.id], asOf, true) : null,
    current ? readWithdrawalBalances([current.id]) : null,
  ]);
  let withdrawals: MemberDetail["withdrawals"] = null;
  if (current && withdrawalSource) {
    if (withdrawalSource.state === "ready") {
      const balance = withdrawalSource.data.get(current.id)!;
      withdrawals = { state: "ready", data: balance };
      item.savingsBalance = balance.postedSavings;
      item.withdrawal = balance;
    } else {
      withdrawals = withdrawalSource;
    }
  }
  let loans: MemberDetail["loans"] = null;
  if (current && loanViews) {
    if (loanViews.state === "ready") {
      const { loanBalance, pastDue, penalties } = memberLoanBalances(loanViews.data);
      item.loanBalance = loanBalance;
      item.pastDue = pastDue;
      loans = {
        state: "ready",
        data: { penalties, ...memberLoanAccount(loanViews.data, item.savingsBalance ?? current.savings_balance, dataset.salaryProduct, current.status === "ACTIVE") },
      };
    } else {
      loans = loanViews;
    }
  }
  let documentStorageReady = false;
  try {
    await privateCooperativeFolder();
    documentStorageReady = true;
  } catch {
    documentStorageReady = false;
  }
  let takeHome: MemberDetail["takeHome"] = {
    floor: null,
    savingsPerCutoff: current?.savings_per_cutoff ?? null,
    payrollDeduction: null,
    loanDeduction: null,
    includedInNetPay: null,
    assessmentCutoff: null,
    headroom: null,
    headroomMessage: null,
    withdrawalsUnavailable: true,
  };
  if (current && payroll.state === "verified") {
    const floor = floorCents(dataset.policy, payroll.grossPay);
    takeHome = await memberPayrollAssessment({
      userId, membershipId: current.id, savings: current.savings_per_cutoff, payroll, floor, loans, asOf,
    }, loanViews?.state === "ready" ? loanViews.data : []);
  }
  return {
    item,
    current: current ? { ...currentMembershipToView(current, posting), savingsBalance: item.savingsBalance ?? current.savings_balance } : null,
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
    takeHome: { ...takeHome, withdrawalsUnavailable: withdrawals?.state !== "ready" || withdrawals.data.availableSavings === null },
    loans,
    withdrawals,
  };
}

export async function getMemberStatement(userId: number, search: URLSearchParams): Promise<MemberStatement> {
  const period = statementPeriod(search);
  const member = await readStatementMember(userId);
  if (!member) throw new MemberError(404, "The member is unavailable.");
  const [savings, loans] = await Promise.all([
    readSavingsStatement(userId, member, period), readMemberLoanStatement(member.id, period.from, period.to),
  ]);
  return { ...savings, loans };
}

export async function getMemberLoanDetail(userId: number, loanId: number) {
  const member = await readStatementMember(userId);
  try {
    const loan = member ? await getLoanDetail(loanId, member.id) : null;
    if (!loan) throw new MemberError(404, "The member's loan is unavailable.");
    return loan;
  } catch (error) {
    if (error instanceof LoanError) throw new MemberError(error.status, error.message, error.code);
    throw error;
  }
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
