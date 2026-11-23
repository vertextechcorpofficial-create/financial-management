import "server-only";

import { createHash } from "node:crypto";
import { z } from "zod";
import {
  loanProductRoom, passesLoanChecks, payrollHeadroom, payrollOverlap, payrollTermCommitment,
  type LoanAssessmentCheck, type PayrollCommitment,
} from "../loans/loan-assessment";
import { lastDayOfMonth, loanDueDates } from "../loans/loan-schedule";
import { peso } from "../members/format";
import { calculateLoanExample, createLoanTermsSnapshot } from "../policies/loan-terms";
import { money, type Product, type Settings } from "../policies/policy-types";
import { readDirectusItems } from "./directus";
import { loanPostingEnabled } from "./loan-commands";
import { LoanError, loanInstallmentAmount, readLoanAssessmentRecords, type MemberLoanView } from "./loans";
import { amountToCents, latestPayrollReference, percentOfCents, readCooperativePayrollDeductions, signedCentsToAmount, todayManila } from "./member-read";
import { getPolicies } from "./policies";

const id = z.number().int().positive().max(4_294_967_295);
const memberFields = z.object({
  id, user_id: id, employee_name: z.string(), department_name: z.string().nullable(),
  status: z.enum(["ACTIVE", "SEPARATED"]), joined_at: z.iso.date(),
  savings_balance: z.coerce.string().pipe(money), savings_per_cutoff: z.coerce.string().pipe(money),
});
type Borrower = z.infer<typeof memberFields>;

const memberChoice = memberFields.pick({ id: true, user_id: true, employee_name: true, department_name: true });

export const loanDraftSchema = z.object({
  memberId: id,
  productId: id,
  principal: money.optional(),
  itemId: id.optional(),
  quantity: z.number().int().min(1).max(10).optional(),
  rate: z.string().trim().regex(/^\d{1,3}(?:\.\d{1,6})?$/).optional(),
  method: z.enum(["diminishing", "flat", "markup"]),
  term: z.number().int().min(1).max(120),
  frequency: z.enum(["cutoff", "monthly"]),
  mode: z.enum(["payroll", "otc"]),
  releaseMethod: z.enum(["CASH", "PAYROLL", "VENDOR"]),
  purpose: z.string().trim().max(200).default(""),
});

export function loanDraftError(error: z.ZodError) {
  const fields = Object.fromEntries(error.issues.map(issue => [String(issue.path[0]), issue.message]));
  return new LoanError(422, "Check the loan details.", "LOAN_INPUT", fields);
}

export async function listActiveCooperativeMembers(params: URLSearchParams) {
  const size = 10;
  const value = Number(params.get("page") ?? "1");
  const page = Number.isSafeInteger(value) && value > 0 && Number.isSafeInteger(value * size) ? value : 1;
  const term = (params.get("q") ?? "").trim().slice(0, 255);
  const filter = {
    status: { _eq: "ACTIVE" },
    ...(term ? {
      _or: [
        { employee_name: { _icontains: term } },
        { department_name: { _icontains: term } },
        ...(/^[1-9]\d{0,9}$/.test(term) ? [{ user_id: { _eq: Number(term) } }] : []),
      ],
    } : {}),
  };
  const query = new URLSearchParams({
    fields: Object.keys(memberChoice.shape).join(","), filter: JSON.stringify(filter),
    limit: String(size + 1), offset: String((page - 1) * size), sort: "employee_name,id",
  });
  const raw = await readDirectusItems("cooperative_memberships", query);
  const { data } = z.object({ data: z.array(memberChoice) }).parse(raw);
  return {
    members: data.slice(0, size).map(row => ({ id: row.id, employeeNumber: String(row.user_id), name: row.employee_name, department: row.department_name })),
    page, hasMore: data.length > size,
  };
}

export async function loanEnrollmentChoices(params: URLSearchParams) {
  const [choices, policy] = await Promise.all([listActiveCooperativeMembers(params), getPolicies()]);
  return {
    ...choices,
    products: policy.products.filter(product => product.isOpen),
    releaseAvailable: loanPostingEnabled(),
  };
}

async function readBorrower(memberId: number) {
  const query = new URLSearchParams({
    fields: Object.keys(memberFields.shape).join(","), filter: JSON.stringify({ id: { _eq: memberId } }), limit: "1",
  });
  const { data } = z.object({ data: z.array(memberFields).max(1) }).parse(await readDirectusItems("cooperative_memberships", query));
  const member = data[0];
  if (!member || member.status !== "ACTIVE") throw new LoanError(409, "Choose an active Cooperative member.", "MEMBER_INACTIVE");
  return member;
}

function meetsTenure(joined: string, asOf: string, months: number) {
  const [y, m, d] = joined.split("-").map(Number);
  const [year, month, day] = asOf.split("-").map(Number);
  const elapsed = (year - y) * 12 + month - m;
  return elapsed > months || (elapsed === months && day >= Math.min(d, lastDayOfMonth(year, month)));
}

const openCommitments = ["PENDING", "APPROVED", "ACTIVE"];

async function assessPayroll(
  member: Borrower, settings: Settings, date: string, frequency: "MONTHLY" | "CUTOFF",
  installments: Array<{ total: string }>, views: MemberLoanView[],
) {
  const payroll = await latestPayrollReference(member.user_id, date).catch(() => ({
    state: "unavailable" as const, message: "Posted VOS payroll could not be read. Try again.",
  }));
  if (payroll.state !== "verified") return payroll;

  const recorded = await readCooperativePayrollDeductions(member.user_id, payroll).catch(() => null);
  const unavailable = { state: "unavailable" as const, message: "The deductions included in posted payroll could not be verified. Ask Payroll to review the result." };
  if (!recorded) return unavailable;
  const floor = settings.floorMode === "FIXED" ? amountToCents(settings.floorFixedAmount) : percentOfCents(payroll.grossPay, settings.floorPercent);
  const dates = loanDueDates(date, installments.length, frequency);
  const required = new Map<string, { cutoff: string; payment: string }>();
  for (const [index, cutoff] of dates.entries()) {
    const bucket = cutoff.endsWith("-15") ? "15th" : "monthEnd";
    const payment = installments[index].total;
    const previous = required.get(bucket);
    if (!previous) required.set(bucket, { cutoff, payment });
    else if (amountToCents(payment) > amountToCents(previous.payment)) previous.payment = payment;
  }
  const cutoffs = [];
  for (const { cutoff, payment } of required.values()) {
    const commitments: PayrollCommitment[] = [{
      table: "cooperative_memberships", id: member.id, cents: amountToCents(member.savings_per_cutoff),
    }];
    for (const view of views) {
      const { loan, position } = view;
      if (loan.mode !== "PAYROLL" || !openCommitments.includes(loan.status)) continue;
      const current = payrollTermCommitment(loan.frequency, cutoff, position?.installments ?? [], loanInstallmentAmount(view));
      if (current === null) return { state: "unavailable" as const, message: "A salary-deducted loan is missing verified installment terms." };
      if (current > 0n) commitments.push({ table: "cooperative_loans", id: loan.id, cents: current });
    }
    const overlap = payrollOverlap(recorded, commitments);
    if (overlap === null || overlap > amountToCents(payroll.totalDeductions)) return unavailable;
    const { headroom } = payrollHeadroom(payroll.netPay, floor, commitments, overlap);
    cutoffs.push({ cutoff, payment, headroom, ok: amountToCents(payment) <= amountToCents(headroom) });
  }
  return { state: "verified" as const, reference: payroll, cutoffs };
}

export async function assessBorrower(input: {
  memberId: number; productId: number; settings: Settings; date: string; excludeLoanId?: number;
  principal: string; mode: "payroll" | "otc"; frequency: "monthly" | "cutoff"; installments: Array<{ total: string }>;
  rules: Pick<Product, "limitType" | "savingsMultiple" | "fixedCeiling" | "minimumMembershipMonths">;
}) {
  const { memberId, productId, rules, settings, date, excludeLoanId } = input;
  const [member, records] = await Promise.all([readBorrower(memberId), readLoanAssessmentRecords(memberId, date)]).catch(error => {
    if (error instanceof LoanError) throw error;
    throw new LoanError(503, "The member’s loan records could not be verified. Try again.");
  });
  const views = records.views.filter(view => view.loan.id !== excludeLoanId);
  let committed = 0n;
  let arrears = 0n;
  for (const { loan, position } of views) {
    if (position) arrears += amountToCents(position.pastDue);
    if (loan.productId === productId && openCommitments.includes(loan.status)) {
      committed += amountToCents(position?.principal ?? loan.principal);
    }
  }
  const room = loanProductRoom({ ...rules, isOpen: true }, member.savings_balance, committed);
  const payroll = input.mode === "payroll"
    ? await assessPayroll(member, settings, date, input.frequency === "monthly" ? "MONTHLY" : "CUTOFF", input.installments, views)
    : { state: "not_required" as const };
  const tenureMet = meetsTenure(member.joined_at, date, rules.minimumMembershipMonths);
  const checks: LoanAssessmentCheck[] = [
    { key: "active", label: "Active member", ok: true, detail: member.employee_name },
    { key: "tenure", label: "Membership tenure", ok: tenureMet,
      severity: tenureMet ? undefined : "warning",
      detail: `Member since ${member.joined_at}. Product minimum is ${rules.minimumMembershipMonths} months.` },
    { key: "limit", label: "Product limit", ok: room.state === "unlimited" || room.state === "ready" && amountToCents(input.principal) <= amountToCents(room.amount),
      detail: room.state === "ready" ? peso(room.amount) + " available to borrow." : room.state === "unlimited" ? "No principal ceiling for this product." : room.message },
    { key: "arrears", label: "Past-due installments", ok: arrears === 0n,
      detail: arrears === 0n ? "All loans are current." : peso(signedCentsToAmount(arrears)) + " past due." },
    { key: "payroll", label: "Take-home pay", ok: payroll.state === "not_required" || payroll.state === "verified" && payroll.cutoffs.every(row => row.ok),
      detail: payroll.state === "not_required" ? "Repaid over the counter." : payroll.state === "verified" ? "Verified payroll cutoff " + payroll.reference.cutoffDate + "." : payroll.message },
  ];
  return { member, loanIds: records.loanIds, checks, payroll };
}

export async function assessLoanEnrollment(draft: z.infer<typeof loanDraftSchema>) {
  const date = todayManila();
  const policy = await getPolicies();
  if (!policy.settings) throw new LoanError(503, "Configure the Cooperative membership settings before enrolling a loan.");
  const product = policy.products.find(row => row.id === draft.productId);
  if (!product?.isOpen) throw new LoanError(409, "Choose a product that is open for new loans.", "PRODUCT_CLOSED");

  const releaseMethod = product.kind === "GOODS" ? "VENDOR" : draft.releaseMethod;
  if (product.kind === "CASH" && releaseMethod === "VENDOR") throw new LoanError(422, "Choose cash at the office or the payroll bank account.");
  let terms;
  try {
    terms = createLoanTermsSnapshot(product, policy.documentTypes, policy.revision, draft);
  } catch (error) {
    throw new LoanError(422, error instanceof Error ? error.message : "Check the loan details.", "LOAN_INPUT");
  }
  const estimate = calculateLoanExample(terms.principal, terms.ratePercent, terms.method, terms.term, terms.frequency);
  if (!money.safeParse(estimate.totalPayable).success) throw new LoanError(422, "The total payable exceeds the supported amount.");
  const { member, loanIds, checks, payroll } = await assessBorrower({
    memberId: draft.memberId, productId: product.id, settings: policy.settings, date, rules: product,
    principal: terms.principal, mode: draft.mode, frequency: draft.frequency, installments: estimate.installments,
  });
  const { installments, ...pricing } = estimate;
  const snapshot = {
    ...terms, signingDate: date, purpose: draft.purpose, releaseMethod, pricing,
    borrower: { membershipId: member.id, userId: member.user_id, name: member.employee_name, department: member.department_name },
    payroll: payroll.state === "verified" ? payroll : null,
  };
  const fingerprint = createHash("sha256").update(JSON.stringify([snapshot, checks, loanIds])).digest("hex");
  return {
    member, snapshot, loanIds, installments, checks, payroll, fingerprint, canEnroll: passesLoanChecks(checks),
  };
}

export async function previewLoanEnrollment(payload: unknown) {
  const parsed = loanDraftSchema.safeParse(payload);
  if (!parsed.success) throw loanDraftError(parsed.error);
  const { snapshot, installments, checks, payroll, fingerprint, canEnroll } = await assessLoanEnrollment(parsed.data);
  return { snapshot, installments, checks, payroll, fingerprint, canEnroll };
}

export type LoanEnrollmentChoices = Awaited<ReturnType<typeof loanEnrollmentChoices>>;
export type LoanEnrollmentPreview = Awaited<ReturnType<typeof previewLoanEnrollment>>;
