import "server-only";

import { z } from "zod";
import { cooperativeDirectus, CooperativeDirectusError, readDirectusItems, usesCooperativeQaDatabase } from "./directus";
import {
  amountToCents,
  centsToAmount,
  installmentStatus,
  loanTotals,
  type InstallmentStatus,
  type LoanFrequency,
  type LoanInstallment,
  type LoanMethod,
} from "../loans/loan-schedule";
import { calculateLoanExample } from "../policies/loan-terms";
import { isCalendarDate } from "../members/format";
import { projectLoanLedger, type LoanLedger, type LoanMovement, type LoanSource } from "../loans/loan-activity";
import { todayManila } from "./member-read";

// Enable after the Loans release and repayment flows and the Transactions reversal flow pass posting QA.
const loanPostingVerified = usesCooperativeQaDatabase() || process.env.COOPERATIVE_LOAN_POSTING_VERIFIED === "true";
const pendingLoanPosting = "Member loan balances and activity will be available after Loans posting is verified.";
const loanHistoryError = "Posted loan records could not be verified. Try again or ask the Cooperative office to review the postings.";

export class LoanError extends Error {
  constructor(readonly status: number, message: string, readonly code?: string, readonly fieldErrors?: Record<string, string>) {
    super(message);
  }
}

type Row = Record<string, unknown>;
type Collection = Parameters<typeof readDirectusItems>[0];
const rowsSchema = z.object({ data: z.array(z.record(z.string(), z.unknown())) });

const text = (value: unknown) => typeof value === "string" ? value.trim() : "";
const decimalText = (value: unknown) => (typeof value === "number" ? String(value) : text(value)) || "0.00";
const number = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};
const dateText = (value: unknown) => {
  const parsed = text(value);
  return /^\d{4}-\d{2}-\d{2}/.test(parsed) ? parsed.slice(0, 10) : null;
};
const objectValue = (value: unknown): Row | null => {
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Row : null;
    } catch {
      return null;
    }
  }
  return value && typeof value === "object" && !Array.isArray(value) ? value as Row : null;
};
const idOf = (value: unknown) => {
  const id = number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : 0;
};
const today = () => new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Manila", year: "numeric", month: "2-digit", day: "2-digit",
}).format(new Date());

async function rows(collection: Collection, query: URLSearchParams) {
  const parsed = rowsSchema.safeParse(await readDirectusItems(collection, query));
  if (!parsed.success) throw new LoanError(503, "The Cooperative loan data is temporarily unavailable.");
  return parsed.data.data;
}

async function readByIds(
  collection: Collection,
  field: string,
  ids: number[],
  fields: string,
  extraFilter: Record<string, unknown> = {},
) {
  const unique = [...new Set(ids.filter(id => Number.isSafeInteger(id) && id > 0))];
  const result: Row[] = [];
  for (let start = 0; start < unique.length; start += 100) {
    const query = new URLSearchParams({
      fields,
      limit: "-1",
      filter: JSON.stringify({ [field]: { _in: unique.slice(start, start + 100) }, ...extraFilter }),
    });
    result.push(...await rows(collection, query));
  }
  return result;
}

function groupById(rows: Row[], key: string) {
  const grouped = new Map<number, Row[]>();
  for (const row of rows) {
    const id = idOf(row[key]);
    const group = grouped.get(id);
    if (group) group.push(row);
    else grouped.set(id, [row]);
  }
  return grouped;
}

function postedAmount(value: unknown) {
  const amount = String(value ?? "");
  if (!/^\d+(?:\.\d{1,2})?$/.test(amount)) throw new LoanError(503, loanHistoryError);
  return centsToAmount(amountToCents(amount));
}

const paymentFields = "id,loan_id,member_id,official_receipt_no,reference_no,amount,principal_amount,interest_amount,penalty_amount,channel,receipt_date,posted_at,status,journal_id,reverses_payment_id";
const journalFields = "id,journal_no,business_date,posted_at,command_type,source_type,source_id,reverses_journal_id";
const documentFields = "id,owner_id,document_type_id,file_name,mime_type,size_bytes,uploaded_at,uploaded_by,removed_at";

function postingReference(journal: Row | undefined) {
  const date = dateText(journal?.business_date) ?? "";
  const journalId = idOf(journal?.id);
  const journalNo = text(journal?.journal_no);
  const postedAt = text(journal?.posted_at).replace(" ", "T");
  if (!journalId || !journalNo || !postedAt || !isCalendarDate(date)) throw new LoanError(503, loanHistoryError);
  return { journalId, journalNo, date, postedAt };
}

function sumAmounts<T>(items: readonly T[], amount: (item: T) => string) {
  return items.reduce((sum, item) => sum + amountToCents(amount(item)), 0n);
}

async function readLoanLedgerRows(loanIds: number[], payments: Row[]) {
  const [releases, allocations, journals] = await Promise.all([
    readByIds("cooperative_journals", "source_id", loanIds, journalFields, {
      source_type: { _eq: "LOAN" }, command_type: { _eq: "LOAN_RELEASE" },
    }),
    readByIds("cooperative_loan_payment_allocations", "payment_id", payments.map(row => idOf(row.id)),
      "payment_id,installment_id,principal,interest,penalty,total"),
    readByIds("cooperative_journals", "id", payments.map(row => idOf(row.journal_id)), journalFields),
  ]);
  return {
    releases: groupById(releases, "source_id"), payments: groupById(payments, "loan_id"),
    allocations: groupById(allocations, "payment_id"), journals: new Map(journals.map(row => [idOf(row.id), row])),
  };
}

function postedLoanLedger(row: Row, stored: Row[], records: Awaited<ReturnType<typeof readLoanLedgerRows>>): LoanLedger | null {
  const loanId = idOf(row.id);
  const releases = records.releases.get(loanId) ?? [];
  const payments = records.payments.get(loanId) ?? [];
  const releasedOn = dateText(row.released_on);
  if (!releasedOn && !releases.length && !payments.length && !stored.length && ["PENDING", "APPROVED", "REJECTED"].includes(text(row.status))) return null;

  const release = postingReference(releases[0]);
  if (releases.length !== 1 || releases[0].reverses_journal_id != null || release.date !== releasedOn || !stored.length) {
    throw new LoanError(503, loanHistoryError);
  }
  const installments = stored.map(item => ({
    ...parseInstallment(item), id: idOf(item.id),
    principal: postedAmount(item.principal), interest: postedAmount(item.interest), total: postedAmount(item.total),
    penaltyAssessed: postedAmount(item.penalty_assessed),
  })).sort((a, b) => a.no - b.no);
  const installmentIds = new Set(installments.map(item => item.id));
  if (installmentIds.size !== installments.length || installments.some((item, index) =>
    !item.id || item.no !== index + 1 || !isCalendarDate(item.dueDate) || item.dueDate <= release.date ||
    amountToCents(item.principal) + amountToCents(item.interest) !== amountToCents(item.total)) ||
    sumAmounts(installments, item => item.principal) !== amountToCents(postedAmount(row.principal)) ||
    sumAmounts(installments, item => item.total) !== amountToCents(postedAmount(row.total_payable))) {
    throw new LoanError(503, loanHistoryError);
  }

  const originalById = new Map(payments.filter(payment => payment.reverses_payment_id == null)
    .map(payment => [idOf(payment.id), payment]));
  const movements = payments.map((payment): LoanMovement => {
    const paymentId = idOf(payment.id);
    if (!paymentId || idOf(payment.member_id) !== idOf(row.member_id) || !["POSTED", "REVERSED"].includes(text(payment.status))) {
      throw new LoanError(503, loanHistoryError);
    }
    const journal = records.journals.get(idOf(payment.journal_id));
    const reference = postingReference(journal);
    const reversedId = idOf(payment.reverses_payment_id);
    const original = reversedId ? originalById.get(reversedId) : payment;
    if (!original || idOf(journal?.reverses_journal_id) !== (reversedId ? idOf(original.journal_id) : 0)) {
      throw new LoanError(503, loanHistoryError);
    }
    const originalJournal = records.journals.get(idOf(original.journal_id));
    const isOffset = ["CLEARANCE_SETTLEMENT", "LOAN_OFFSET"].includes(text(originalJournal?.command_type));
    const channel = text(original.channel);
    if (!isOffset && (channel !== "OTC" && channel !== "PAYROLL" ||
      text(journal?.source_type) !== "LOAN" || idOf(journal?.source_id) !== loanId ||
      text(journal?.command_type) !== (reversedId ? "LOAN_PAYMENT_REVERSED" : "LOAN_PAYMENT"))) {
      throw new LoanError(503, loanHistoryError);
    }
    const allocations = (records.allocations.get(idOf(original.id)) ?? []).map(allocation => {
      const installmentId = idOf(allocation.installment_id);
      const principal = postedAmount(allocation.principal);
      const interest = postedAmount(allocation.interest);
      const penalty = postedAmount(allocation.penalty);
      if (!installmentIds.has(installmentId) ||
        amountToCents(principal) + amountToCents(interest) + amountToCents(penalty) !== amountToCents(postedAmount(allocation.total))) {
        throw new LoanError(503, loanHistoryError);
      }
      return { installmentId, principal, interest, penalty };
    });
    const principal = sumAmounts(allocations, item => item.principal);
    const interest = sumAmounts(allocations, item => item.interest);
    const penalty = sumAmounts(allocations, item => item.penalty);
    if (!allocations.length || new Set(allocations.map(item => item.installmentId)).size !== allocations.length ||
      principal !== amountToCents(postedAmount(payment.principal_amount)) || interest !== amountToCents(postedAmount(payment.interest_amount)) ||
      penalty !== amountToCents(postedAmount(payment.penalty_amount)) ||
      principal + interest + penalty !== amountToCents(postedAmount(payment.amount))) {
      throw new LoanError(503, loanHistoryError);
    }
    return {
      ...reference, id: paymentId, kind: isOffset ? "OFFSET" : "PAYMENT", channel: isOffset ? "CLEARANCE" : channel as "OTC" | "PAYROLL",
      reference: text(payment.official_receipt_no) || text(payment.reference_no) || reference.journalNo,
      reversesId: reversedId || null, allocations,
    };
  });
  const reversed = new Set(movements.map(movement => movement.reversesId));
  if (payments.some(payment => text(payment.status) === "REVERSED" && !reversed.has(idOf(payment.id)))) {
    throw new LoanError(503, loanHistoryError);
  }
  const ledger = { release, installments, movements };
  const lastPosting = [...movements.map(movement => movement.date), ...installments.map(item => item.penaltyAssessedOn ?? "")]
    .reduce((last, date) => date > last ? date : last, release.date);
  const storedById = new Map(stored.map(installment => [idOf(installment.id), installment]));
  if (projectLoanLedger(ledger, lastPosting).installments.some(installment => {
    const saved = storedById.get(installment.id)!;
    return installment.paidPrincipal !== postedAmount(saved.paid_principal) ||
      installment.paidInterest !== postedAmount(saved.paid_interest) ||
      installment.paidTotal !== postedAmount(saved.paid_total) ||
      installment.penaltyPaid !== postedAmount(saved.penalty_paid) ||
      amountToCents(installment.penaltyPaid) > amountToCents(installment.penaltyAssessed);
  })) throw new LoanError(503, loanHistoryError);
  return ledger;
}

function parseInstallment(row: Row): LoanInstallment {
  const storedStatus = text(row.status).toUpperCase() as InstallmentStatus;
  return {
    no: number(row.installment_no),
    dueDate: dateText(row.due_date) ?? "",
    principal: text(row.principal) || "0.00",
    interest: text(row.interest) || "0.00",
    total: text(row.total) || "0.00",
    paidTotal: text(row.paid_total) || "0.00",
    paidPrincipal: text(row.paid_principal) || "0.00",
    paidInterest: text(row.paid_interest) || "0.00",
    penaltyAssessed: text(row.penalty_assessed) || "0.00",
    penaltyAssessedOn: dateText(row.penalty_assessed_on),
    accrualProcessedOn: dateText(row.accrual_processed_on),
    accrualJournalId: idOf(row.accrual_journal_id) || null,
    penaltyPaid: text(row.penalty_paid) || "0.00",
    status: ["UNPAID", "PARTIAL", "PAID"].includes(storedStatus) ? storedStatus : installmentStatus({
      no: number(row.installment_no), dueDate: dateText(row.due_date) ?? "",
      principal: text(row.principal) || "0.00", interest: text(row.interest) || "0.00",
      total: text(row.total) || "0.00", paidTotal: text(row.paid_total) || "0.00",
      paidPrincipal: text(row.paid_principal) || "0.00", paidInterest: text(row.paid_interest) || "0.00",
      penaltyAssessed: text(row.penalty_assessed) || "0.00", penaltyPaid: text(row.penalty_paid) || "0.00",
      status: "UNPAID",
    }),
  };
}

function requiredDocuments(snapshot: Row | null) {
  const documents = Array.isArray(snapshot?.documents) ? snapshot.documents : [];
  return documents.flatMap(value => {
    if (!value || typeof value !== "object" || Array.isArray(value)) return [];
    const item = value as Row;
    const documentTypeId = idOf(item.documentTypeId);
    if (!documentTypeId) return [];
    return [{
      documentTypeId,
      name: text(item.name) || `Document ${documentTypeId}`,
      enforcement: text(item.enforcement).toUpperCase() === "BLOCK" ? "BLOCK" as const : "WARN" as const,
    }];
  });
}

function documentStatus(snapshot: Row | null, documents: Row[]) {
  const required = requiredDocuments(snapshot);
  const done = new Set(documents.filter(row => !row.removed_at).map(row => idOf(row.document_type_id)).filter(Boolean));
  const missing = required.filter(document => !done.has(document.documentTypeId));
  return {
    required,
    done: required.filter(document => done.has(document.documentTypeId)),
    missing,
    warnings: missing.filter(document => document.enforcement === "WARN"),
    blocks: missing.filter(document => document.enforcement === "BLOCK"),
  };
}

export async function readLoanDocumentStatuses(loans: Array<{ id: number; terms_snapshot: unknown }>) {
  const files = await readByIds("cooperative_documents", "owner_id", loans.map(loan => loan.id),
    "owner_id,document_type_id,removed_at", { owner_type: { _eq: "LOAN" }, removed_at: { _null: true } });
  const byLoan = groupById(files, "owner_id");
  return new Map(loans.map(loan => [
    loan.id, documentStatus(objectValue(loan.terms_snapshot), byLoan.get(loan.id) ?? []),
  ]));
}

function methodOf(value: unknown): LoanMethod {
  const normalized = text(value).toUpperCase();
  return normalized === "MARKUP" || normalized === "FLAT" ? normalized : "DIMINISHING";
}

function frequencyOf(value: unknown): LoanFrequency {
  return text(value).toUpperCase() === "MONTHLY" ? "MONTHLY" : "CUTOFF";
}

function mapLoan(row: Row, installments: LoanInstallment[], documents: Row[], asOf: string, snapshot: Row | null) {
  const totals = loanTotals(installments, asOf);
  const docs = documentStatus(snapshot, documents);
  const status = text(row.status).toUpperCase() || "PENDING";
  return {
    id: idOf(row.id),
    loanNo: text(row.loan_no),
    agreementNo: text(row.agreement_no),
    memberId: idOf(row.member_id),
    memberNo: text(row.member_no) || null,
    memberName: text(row.member_name) || `Member ${idOf(row.member_id)}`,
    department: text(row.department_name) || null,
    productId: idOf(row.product_id),
    productCode: text(row.product_code),
    productName: text(row.product_name) || "Cooperative loan",
    productKind: text(row.product_kind).toUpperCase() === "GOODS" ? "GOODS" as const : "CASH" as const,
    itemName: text(row.item_name) || null,
    itemQuantity: Math.max(1, number(row.item_quantity) || 1),
    principal: decimalText(row.principal),
    rate: decimalText(row.rate),
    markup: decimalText(row.markup),
    method: methodOf(row.method),
    months: number(row.months),
    frequency: frequencyOf(row.frequency),
    mode: text(row.mode).toUpperCase() === "OTC" ? "OTC" as const : "PAYROLL" as const,
    purpose: text(row.purpose) || null,
    status,
    releaseMethod: text(row.release_method).toUpperCase() || null,
    processingFee: decimalText(row.processing_fee),
    penaltyPercent: decimalText(row.penalty_percent),
    graceDays: number(row.grace_days),
    totalPayable: decimalText(row.total_payable),
    appliedOn: dateText(row.applied_on),
    approvedOn: dateText(row.approved_on),
    releasedOn: dateText(row.released_on),
    agreementSigned: row.agreement_signed === true || row.agreement_signed === 1 || row.agreement_signed === "1",
    balance: totals.remaining,
    pastDue: totals.pastDue,
    penalties: totals.penalties,
    paidCount: totals.paidCount,
    installmentCount: installments.length,
    nextDueDate: totals.next?.dueDate ?? null,
    fullyPaid: status === "FULLY_PAID" || (status === "ACTIVE" && totals.fullyPaid),
    documents: docs,
  };
}

async function readLoanViews(loans: Row[], asOf: string, includeDocuments: boolean, verifyPostings = loanPostingVerified) {
  const ids = loans.map(row => idOf(row.id));
  const [installments, documents, payments] = await Promise.all([
    readByIds("cooperative_loan_installments", "loan_id", ids, "*"),
    includeDocuments ? readByIds("cooperative_documents", "owner_id", ids, documentFields, { owner_type: { _eq: "LOAN" } }) : [],
    verifyPostings ? readByIds("cooperative_loan_payments", "loan_id", ids, paymentFields) : [],
  ]);
  const records = verifyPostings ? await readLoanLedgerRows(ids, payments) : null;
  const installmentsByLoan = groupById(installments, "loan_id");
  const documentsByLoan = groupById(documents, "owner_id");
  return loans.map(row => {
    const id = idOf(row.id);
    const stored = installmentsByLoan.get(id) ?? [];
    const files = documentsByLoan.get(id) ?? [];
    const releasedLater = (dateText(row.released_on) ?? "") > asOf;
    const ledger = records && !releasedLater ? postedLoanLedger(row, stored, records) : null;
    const position = ledger ? projectLoanLedger(ledger, asOf) : null;
    const schedule = position?.installments ?? (records ? [] : stored.map(parseInstallment).sort((a, b) => a.no - b.no));
    const termsSnapshot = objectValue(row.terms_snapshot);
    return { loan: mapLoan(row, schedule, files, asOf, termsSnapshot), termsSnapshot, ledger, position, installments: schedule, files, paymentRows: records?.payments.get(id) };
  });
}

export type MemberLoanView = Awaited<ReturnType<typeof readLoanViews>>[number];

async function readLoanRecord(id: number) {
  if (!Number.isSafeInteger(id) || id <= 0) throw new LoanError(400, "Choose a valid loan.");
  try {
    const response = await cooperativeDirectus(`/items/cooperative_loans/${id}?fields=*`);
    const payload = await response.json() as { data?: Row | null };
    return payload.data ?? null;
  } catch (error) {
    if (error instanceof CooperativeDirectusError && error.status === 404) return null;
    throw error;
  }
}

export async function readLoanForChange(id: number, date: string, includeDocuments = false) {
  const row = await readLoanRecord(id);
  if (!row) throw new LoanError(404, "The loan is unavailable.");
  const revision = z.number().int().nonnegative().parse(row.revision);
  const [view] = await readLoanViews([row], date, includeDocuments, true);
  return { ...view, revision };
}

export async function readLoansForRemittance(ids: number[], date: string) {
  const loans = await readByIds("cooperative_loans", "id", ids, "*");
  const revisions = new Map(loans.map(row => [idOf(row.id), z.number().int().nonnegative().parse(row.revision)]));
  return new Map((await readLoanViews(loans, date, false, true)).map(view =>
    [view.loan.id, { ...view, revision: revisions.get(view.loan.id)! }]));
}

export async function readLoanAssessmentRecords(memberId: number, asOf: string) {
  const loans = await readByIds("cooperative_loans", "member_id", [memberId], "*");
  if (loans.some(row => !idOf(row.id) || idOf(row.member_id) !== memberId ||
    !["PENDING", "APPROVED", "ACTIVE", "DEFAULTED", "FULLY_PAID", "REJECTED"].includes(text(row.status)))) {
    throw new LoanError(503, loanHistoryError);
  }
  const open = loans.filter(row => ["PENDING", "APPROVED", "ACTIVE", "DEFAULTED"].includes(text(row.status)));
  for (const row of open) postedAmount(row.principal);
  const views = await readLoanViews(open, asOf, false, true);
  if (views.some(({ loan, position }) =>
    !loan.productId || (["ACTIVE", "DEFAULTED"].includes(loan.status) ? !position : Boolean(position)))) {
    throw new LoanError(503, loanHistoryError);
  }
  return { loanIds: loans.map(row => idOf(row.id)).sort((a, b) => a - b), views };
}

export async function readMemberLoans(memberIds: number[], asOf: string, includeDocuments = false): Promise<LoanSource<MemberLoanView[]>> {
  if (!loanPostingVerified) return { state: "pending_rollout", message: pendingLoanPosting };
  try {
    const loans = await readByIds("cooperative_loans", "member_id", memberIds, "*");
    return { state: "ready", data: await readLoanViews(loans, asOf, includeDocuments) };
  } catch {
    return { state: "unavailable", message: loanHistoryError };
  }
}

export function loanInstallmentAmount(view: MemberLoanView) {
  const { loan, installments } = view;
  if (installments.length) return installments[0].total;
  if (!["PENDING", "APPROVED", "REJECTED"].includes(loan.status) || !loan.agreementSigned || loan.months < 1 || loan.months > 120) return null;
  const method = loan.method === "DIMINISHING" ? "diminishing" : loan.method === "FLAT" ? "flat" : "markup";
  try {
    const signedPayment = text(objectValue(view.termsSnapshot?.pricing)?.regularPayment);
    if (signedPayment) return postedAmount(signedPayment);
    if (amountToCents(loan.principal) > 0n) return calculateLoanExample(loan.principal, method === "markup" ? loan.markup : loan.rate, method,
      loan.months, loan.frequency === "CUTOFF" ? "cutoff" : "monthly").regularPayment;
  } catch {
    return null;
  }
  return null;
}

function payment(row: Row, movement?: LoanMovement) {
  const signed = (value: unknown) => {
    if (!movement) return decimalText(value);
    const amount = amountToCents(postedAmount(value));
    return centsToAmount(movement.reversesId ? -amount : amount);
  };
  return {
    id: idOf(row.id),
    officialReceiptNo: text(row.official_receipt_no) || null,
    referenceNo: text(row.reference_no) || null,
    amount: signed(row.amount),
    principal: signed(row.principal_amount),
    interest: signed(row.interest_amount),
    penalty: signed(row.penalty_amount),
    channel: movement?.channel ?? (text(row.channel).toUpperCase() === "PAYROLL" ? "PAYROLL" : "OTC"),
    receiptDate: dateText(row.receipt_date),
    businessDate: movement?.date ?? dateText(row.receipt_date),
    postedAt: text(row.posted_at) || null,
    status: movement?.reversesId ? "REVERSAL" : text(row.status).toUpperCase() || "POSTED",
    journalNo: movement?.journalNo ?? null,
  };
}

function history(loan: Row, audit: Row[]) {
  const entries: Array<{ date: string; text: string; actor: string | null }> = [];
  const applied = dateText(loan.applied_on);
  const approved = dateText(loan.approved_on);
  const released = dateText(loan.released_on);
  if (applied && !audit.some(row => row.action === "LOAN_ENROLLED")) entries.push({ date: applied, text: "Submitted for approval", actor: null });
  if (approved && !audit.some(row => row.action === "LOAN_APPROVED" || row.action === "LOAN_RELEASED" && released === approved)) {
    entries.push({ date: approved, text: "Approved", actor: null });
  }
  if (released && !audit.some(row => row.action === "LOAN_RELEASED")) entries.push({ date: released, text: "Released", actor: null });
  for (const row of audit) {
    const at = text(row.occurred_at).replace(" ", "T");
    const time = new Date(at.endsWith("Z") ? at : at + "Z");
    const date = row.action === "LOAN_ENROLLED" ? applied ?? dateText(row.occurred_at)
      : row.action === "LOAN_APPROVED" ? approved
        : row.action === "LOAN_RELEASED" ? released
          : Number.isNaN(time.valueOf()) ? null : todayManila(time);
    const action = text(row.action).replaceAll("_", " ").toLowerCase();
    if (!date || !action) continue;
    entries.push({
      date,
      text: row.action === "LOAN_ENROLLED" ? "Submitted for approval" : [
        action.replace(/^./, character => character.toUpperCase()), text(row.reason),
      ].filter(Boolean).join(" · "),
      actor: text(row.actor_name) || (idOf(row.actor_user_id) ? `User ${idOf(row.actor_user_id)}` : null),
    });
  }
  return entries.sort((a, b) => a.date.localeCompare(b.date));
}

export async function getLoanRegister(params: URLSearchParams) {
  const page = Math.max(1, Number(params.get("page") ?? "1") || 1);
  const search = text(params.get("search")).toLowerCase();
  const product = text(params.get("product"));
  const status = text(params.get("status")).toUpperCase();
  const mode = text(params.get("mode")).toUpperCase();
  const missingDocsOnly = params.get("missingDocs") === "true";

  const loanRows = await rows("cooperative_loans", new URLSearchParams({
    fields: "*", limit: "-1", sort: "-applied_on,-id",
  }));
  const [views, productRows] = await Promise.all([
    readLoanViews(loanRows, today(), true),
    rows("cooperative_loan_products", new URLSearchParams({
      fields: "product_code,name,is_open", limit: "-1", sort: "name",
    })).catch(() => []),
  ]);

  const mapped = views.map(view => view.loan);

  const active = mapped.filter(loan => loan.status === "ACTIVE");
  const pending = mapped.filter(loan => loan.status === "PENDING");
  const approved = mapped.filter(loan => loan.status === "APPROVED");
  const pastDue = active.filter(loan => amountToCents(loan.pastDue) > 0n);
  const sum = (list: typeof mapped, field: "balance" | "pastDue" | "penalties" | "principal") =>
    centsToAmount(list.reduce((total, loan) => total + amountToCents(loan[field]), 0n));

  let filtered = mapped.filter(loan => {
    const haystack = [loan.loanNo, loan.memberName, loan.memberNo, loan.agreementNo, loan.purpose]
      .filter(Boolean).join(" ").toLowerCase();
    if (search && !haystack.includes(search)) return false;
    if (product && loan.productCode !== product) return false;
    if (mode && loan.mode !== mode) return false;
    if (missingDocsOnly && !loan.documents.missing.length) return false;
    if (status === "PAST_DUE") return loan.status === "ACTIVE" && amountToCents(loan.pastDue) > 0n;
    if (status === "MISSING_DOCS") return loan.documents.missing.length > 0;
    return !status || loan.status === status;
  });

  const total = filtered.length;
  const start = (page - 1) * 50;
  filtered = filtered.slice(start, start + 50);

  const products = productRows.map(row => ({
    code: text(row.product_code),
    name: text(row.name),
    open: Boolean(row.is_open),
  })).filter(item => item.code);

  return {
    tiles: {
      active: { count: active.length, balance: sum(active, "balance") },
      pending: { count: pending.length, principal: sum(pending, "principal") },
      approved: { count: approved.length },
      pastDue: { count: pastDue.length, amount: sum(pastDue, "pastDue"), penalties: sum(pastDue, "penalties") },
    },
    rows: filtered,
    page,
    pageSize: 50,
    total,
    hasMore: start + filtered.length < total,
    filterOptions: {
      products,
      statuses: ["PENDING", "APPROVED", "ACTIVE", "FULLY_PAID", "REJECTED", "DEFAULTED", "PAST_DUE", "MISSING_DOCS"],
      modes: ["PAYROLL", "OTC"],
    },
  };
}

export async function getLoanDetail(id: number, memberId?: number) {
  if (!Number.isSafeInteger(id) || id <= 0) throw new LoanError(400, "Choose a valid loan.");
  let row: Row | null = null;
  if (memberId !== undefined) {
    [row = null] = await readByIds("cooperative_loans", "id", [id], "*", { member_id: { _eq: memberId } });
    if (!row || idOf(row.member_id) !== memberId || idOf(row.id) !== id) return null;
    if (!loanPostingVerified) throw new LoanError(503, pendingLoanPosting, "PENDING_ROLLOUT");
  } else {
    row = await readLoanRecord(id);
  }
  if (!row) return null;

  const [paymentsBeforeRollout, auditRows, releases] = await Promise.all([
    loanPostingVerified || !row.released_on ? [] : readByIds("cooperative_loan_payments", "loan_id", [id], "id"),
    rows("cooperative_audit_events", new URLSearchParams({
      fields: "id,action,occurred_at,actor_user_id,actor_name,reason",
      "filter[entity_type][_eq]": "LOAN",
      "filter[entity_id][_eq]": String(id),
      limit: "-1",
      sort: "-occurred_at",
    })).catch(() => []),
    row.released_on ? rows("cooperative_command_receipts", new URLSearchParams({
      fields: "result", "filter[loan_id][_eq]": String(id), "filter[command_type][_eq]": "LOAN_RELEASE", limit: "2",
    })) : [],
  ]);
  const [view] = await readLoanViews([row], today(), true, loanPostingVerified || paymentsBeforeRollout.length > 0);

  const documents = view.files.filter(row => !row.removed_at).map(row => ({
    id: typeof row.id === "string" ? row.id : String(idOf(row.id)),
    documentTypeId: idOf(row.document_type_id),
    fileName: text(row.file_name),
    mimeType: text(row.mime_type),
    sizeBytes: number(row.size_bytes),
    uploadedAt: text(row.uploaded_at) || null,
    uploadedBy: idOf(row.uploaded_by) || null,
    removedAt: text(row.removed_at) || null,
  }));
  const movements = new Map(view.ledger?.movements.map(movement => [movement.id, movement]));
  const signedPricing = z.object({
    paymentCount: z.number().int().positive(), regularPayment: z.string(), finalPayment: z.string(),
  }).safeParse(view.termsSnapshot?.pricing);
  const release = releases.length === 1 ? z.object({
    id: z.number(), status: z.literal("ACTIVE"), date: z.iso.date(), journalId: z.number(), journalNo: z.string(),
    orNo: z.string().nullable(), payoutReference: z.string().nullable(), feeChannel: z.enum(["CASH", "BANK"]).nullable(), feeReference: z.string().nullable(),
  }).safeParse(objectValue(releases[0].result)) : undefined;

  return {
    loan: { ...view.loan, termsSnapshot: view.termsSnapshot, signedPricing: signedPricing.data ?? null },
    installments: view.installments,
    payments: (view.paymentRows ?? []).map(row => payment(row, movements.get(idOf(row.id))))
      .sort((a, b) => (b.businessDate ?? "").localeCompare(a.businessDate ?? "") || (b.postedAt ?? "").localeCompare(a.postedAt ?? "") || b.id - a.id),
    documents,
    history: history(row, auditRows),
    release: release?.data?.id === id ? release.data : null,
  };
}
