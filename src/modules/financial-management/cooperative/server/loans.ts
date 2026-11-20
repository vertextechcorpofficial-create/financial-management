import "server-only";

import { z } from "zod";
import { cooperativeDirectus, CooperativeDirectusError, readDirectusItems } from "./directus";
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

export class LoanError extends Error {
  constructor(readonly status: number, message: string, readonly code?: string) {
    super(message);
  }
}

type Row = Record<string, unknown>;
type Collection = Parameters<typeof readDirectusItems>[0];
const rowsSchema = z.object({ data: z.array(z.record(z.string(), z.unknown())) });

const text = (value: unknown) => typeof value === "string" ? value.trim() : "";
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

function methodOf(value: unknown): LoanMethod {
  const normalized = text(value).toUpperCase();
  return normalized === "MARKUP" || normalized === "FLAT" ? normalized : "DIMINISHING";
}

function frequencyOf(value: unknown): LoanFrequency {
  return text(value).toUpperCase() === "MONTHLY" ? "MONTHLY" : "CUTOFF";
}

function mapLoan(row: Row, installments: LoanInstallment[], documents: Row[]) {
  const snapshot = objectValue(row.terms_snapshot);
  const totals = loanTotals(installments, today());
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
    principal: text(row.principal) || "0.00",
    rate: text(row.rate) || "0.00",
    markup: text(row.markup) || "0.00",
    method: methodOf(row.method),
    months: number(row.months),
    frequency: frequencyOf(row.frequency),
    mode: text(row.mode).toUpperCase() === "OTC" ? "OTC" as const : "PAYROLL" as const,
    purpose: text(row.purpose) || null,
    status,
    releaseMethod: text(row.release_method).toUpperCase() || null,
    processingFee: text(row.processing_fee) || "0.00",
    penaltyPercent: text(row.penalty_percent) || "0.00",
    graceDays: number(row.grace_days),
    totalPayable: text(row.total_payable) || "0.00",
    appliedOn: dateText(row.applied_on),
    approvedOn: dateText(row.approved_on),
    releasedOn: dateText(row.released_on),
    agreementSigned: Boolean(row.agreement_signed),
    balance: totals.remaining,
    pastDue: totals.pastDue,
    penalties: totals.penalties,
    paidCount: totals.paidCount,
    installmentCount: installments.length,
    nextDueDate: totals.next?.dueDate ?? null,
    fullyPaid: status === "FULLY_PAID" || (status === "ACTIVE" && totals.fullyPaid),
    documents: docs,
    termsSnapshot: snapshot,
  };
}

function payment(row: Row) {
  return {
    id: idOf(row.id),
    officialReceiptNo: text(row.official_receipt_no) || null,
    referenceNo: text(row.reference_no) || null,
    amount: text(row.amount) || "0.00",
    principal: text(row.principal_amount) || "0.00",
    interest: text(row.interest_amount) || "0.00",
    penalty: text(row.penalty_amount) || "0.00",
    channel: text(row.channel).toUpperCase() === "PAYROLL" ? "PAYROLL" as const : "OTC" as const,
    receiptDate: dateText(row.receipt_date),
    postedAt: text(row.posted_at) || null,
    status: text(row.status).toUpperCase() || "POSTED",
  };
}

function history(loan: Row, audit: Row[]) {
  const entries: Array<{ date: string; text: string; actor: string | null }> = [];
  const applied = dateText(loan.applied_on);
  const approved = dateText(loan.approved_on);
  const released = dateText(loan.released_on);
  if (applied) entries.push({ date: applied, text: "Submitted for approval", actor: null });
  if (approved) entries.push({ date: approved, text: "Approved", actor: null });
  if (released) entries.push({ date: released, text: "Released", actor: null });
  for (const row of audit) {
    const date = dateText(row.occurred_at);
    const action = text(row.action).replaceAll("_", " ").toLowerCase();
    if (!date || !action) continue;
    entries.push({
      date,
      text: action.replace(/^./, character => character.toUpperCase()),
      actor: row.actor_user_id !== null && row.actor_user_id !== undefined ? `User ${number(row.actor_user_id)}` : null,
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
  const loanIds = loanRows.map(row => idOf(row.id));
  const [installmentRows, documentRows, productRows] = await Promise.all([
    readByIds("cooperative_loan_installments", "loan_id", loanIds,
      "id,loan_id,installment_no,due_date,principal,interest,total,paid_total,paid_principal,paid_interest,penalty_assessed,penalty_paid,status"),
    readByIds("cooperative_documents", "owner_id", loanIds,
      "id,owner_id,document_type_id,file_name,mime_type,size_bytes,uploaded_at,uploaded_by,removed_at",
      { owner_type: { _eq: "LOAN" } }),
    rows("cooperative_loan_products", new URLSearchParams({
      fields: "product_code,name,is_open", limit: "-1", sort: "name",
    })).catch(() => []),
  ]);

  const installmentsByLoan = new Map<number, LoanInstallment[]>();
  for (const row of installmentRows) {
    const loanId = idOf(row.loan_id);
    const list = installmentsByLoan.get(loanId) ?? [];
    list.push(parseInstallment(row));
    installmentsByLoan.set(loanId, list);
  }
  for (const list of installmentsByLoan.values()) list.sort((a, b) => a.no - b.no);

  const documentsByLoan = new Map<number, Row[]>();
  for (const row of documentRows) {
    const loanId = idOf(row.owner_id);
    const list = documentsByLoan.get(loanId) ?? [];
    list.push(row);
    documentsByLoan.set(loanId, list);
  }

  const mapped = loanRows.map(row => {
    const id = idOf(row.id);
    return mapLoan(row, installmentsByLoan.get(id) ?? [], documentsByLoan.get(id) ?? []);
  });

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

export async function getLoanDetail(id: number) {
  if (!Number.isSafeInteger(id) || id <= 0) throw new LoanError(400, "Choose a valid loan.");
  let row: Row | null = null;
  try {
    const response = await cooperativeDirectus(`/items/cooperative_loans/${id}?fields=*`);
    const payload = await response.json() as { data?: Row | null };
    row = payload.data ?? null;
  } catch (error) {
    if (error instanceof CooperativeDirectusError && error.status === 404) return null;
    throw error;
  }
  if (!row) return null;

  const [installmentRows, paymentRows, documentRows, auditRows] = await Promise.all([
    readByIds("cooperative_loan_installments", "loan_id", [id],
      "id,loan_id,installment_no,due_date,principal,interest,total,paid_total,paid_principal,paid_interest,penalty_assessed,penalty_paid,status"),
    readByIds("cooperative_loan_payments", "loan_id", [id],
      "id,official_receipt_no,reference_no,amount,principal_amount,interest_amount,penalty_amount,channel,receipt_date,posted_at,status"),
    readByIds("cooperative_documents", "owner_id", [id],
      "id,owner_id,document_type_id,file_name,mime_type,size_bytes,uploaded_at,uploaded_by,removed_at",
      { owner_type: { _eq: "LOAN" } }),
    rows("cooperative_audit_events", new URLSearchParams({
      fields: "id,action,occurred_at,actor_user_id,reason",
      "filter[entity_type][_eq]": "LOAN",
      "filter[entity_id][_eq]": String(id),
      limit: "-1",
      sort: "-occurred_at",
    })).catch(() => []),
  ]);

  const installments = installmentRows.map(parseInstallment).sort((a, b) => a.no - b.no);
  const documents = documentRows.map(row => ({
    id: idOf(row.id),
    documentTypeId: idOf(row.document_type_id),
    fileName: text(row.file_name),
    mimeType: text(row.mime_type),
    sizeBytes: number(row.size_bytes),
    uploadedAt: text(row.uploaded_at) || null,
    uploadedBy: idOf(row.uploaded_by) || null,
    removedAt: text(row.removed_at) || null,
  }));

  return {
    loan: mapLoan(row, installments, documentRows),
    installments,
    payments: paymentRows.map(payment).sort((a, b) => (b.receiptDate ?? "").localeCompare(a.receiptDate ?? "")),
    documents,
    history: history(row, auditRows),
  };
}
