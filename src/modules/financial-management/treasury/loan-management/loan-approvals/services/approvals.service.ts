import "server-only";

import { formatDateMDY, phtDate, phtStamp, toPhtDateString } from "../pht";
import { statusNoun } from "../format";
import type {
  ApprovalAction,
  ApprovalDetail,
  ApprovalQueueRow,
  ApprovalTimelineEntry,
  LoanEventKind,
  LoanPaymentAccountRow,
  LoanRow,
  LoanStatus,
  ReleaseChannel,
  ReleasePreview,
  ReleasePreviewLine,
} from "../types";
import {
  asBoolean,
  asNumber,
  asNumberOrNull,
  asString,
  createItem,
  directusFetch,
  getItem,
  listItems,
  roundMoney,
  updateItem,
} from "./directus";
import {
  LoanConflictError,
  LoanNotFoundError,
  LoanValidationError,
} from "./errors";
import {
  buildSchedule,
  type BusinessDayRule,
  type FirstPeriodBasis,
  type PaymentFrequency,
  type RepaymentMethod,
} from "./loanEngine";

const LOANS = "loan";
const APPROVALS = "loan_approval";
const EVENTS = "loan_event";
const ENTRIES = "loan_journal_entry";
const LINES = "loan_journal_line";
const SCHEDULE = "loan_schedule";
const MAPPINGS = "loan_gl_mapping";
const ACCOUNTS = "loan_payment_account";
const LOCKS = "loan_period_lock";
const HOLIDAYS = "loan_holiday";
const COA = "chart_of_accounts";
const USERS = "user";

/**
 * What the queue lists. Approval posts the release in the same action, so a new approval lands on
 * `CURRENT` and nothing ever waits for a second step (QA item 16).
 */
const QUEUE_STATUSES: LoanStatus[] = ["PENDING_APPROVAL"];

const LOAN_FIELDS = [
  "id",
  "loan_no",
  "lender_name",
  "lender_type",
  "branch",
  "account_officer",
  "contact_phone",
  "contact_email",
  "purpose",
  "account_no",
  "security",
  "security_value",
  "guarantor",
  "principal",
  "nominal_rate",
  "current_rate",
  "rate_type",
  "repayment_method",
  "payment_frequency",
  "term_payments",
  "release_date",
  "first_payment_date",
  "first_period_basis",
  "business_day_rule",
  "proceeds_account_id",
  "processing_fee",
  "dst_treatment",
  "dst_amount",
  "other_costs",
  "pas23_applies",
  "pas23_borrowing_type",
  "installment_amount",
  "proceeds_net",
  "eir_rate",
  "maturity_date",
  "approval_status",
  "status",
  "schedule_version",
  "submitted_at",
  "submitted_by",
  "approved_at",
  "approved_by",
  "released_at",
  "remarks",
];

type MappingRow = { mapping_key: string; coa_id: number | null };
type CoaRow = { coa_id: number; gl_code: string; account_title: string };

type RawLoan = Record<string, unknown>;

function toLoanRow(raw: RawLoan): LoanRow {
  const number = (key: string) => asNumber(raw[key]);
  return {
    id: number("id"),
    loan_no: asString(raw.loan_no),
    lender_name: asString(raw.lender_name),
    lender_type: asString(raw.lender_type) as LoanRow["lender_type"],
    branch: asString(raw.branch) || null,
    account_officer: asString(raw.account_officer) || null,
    contact_phone: asString(raw.contact_phone) || null,
    contact_email: asString(raw.contact_email) || null,
    account_no: asString(raw.account_no),
    purpose: asString(raw.purpose),
    security: (asString(raw.security) || "NONE") as LoanRow["security"],
    security_value: asNumberOrNull(raw.security_value),
    guarantor: asString(raw.guarantor) || null,
    principal: number("principal"),
    nominal_rate: number("nominal_rate"),
    current_rate: number("current_rate"),
    rate_type: (asString(raw.rate_type) || "FIXED") as LoanRow["rate_type"],
    repayment_method: asString(
      raw.repayment_method,
    ) as LoanRow["repayment_method"],
    payment_frequency: asString(
      raw.payment_frequency,
    ) as LoanRow["payment_frequency"],
    term_payments: number("term_payments"),
    release_date: toPhtDateString(asString(raw.release_date)),
    first_payment_date: toPhtDateString(asString(raw.first_payment_date)),
    first_period_basis: asString(
      raw.first_period_basis,
    ) as LoanRow["first_period_basis"],
    business_day_rule: asString(
      raw.business_day_rule,
    ) as LoanRow["business_day_rule"],
    proceeds_account_id: number("proceeds_account_id"),
    processing_fee: number("processing_fee"),
    dst_treatment: asString(raw.dst_treatment) as LoanRow["dst_treatment"],
    dst_amount: number("dst_amount"),
    other_costs: number("other_costs"),
    penalty_rate_monthly: 0,
    grace_days: 0,
    pas23_applies: asBoolean(raw.pas23_applies),
    pas23_borrowing_type: (asString(raw.pas23_borrowing_type) ||
      null) as LoanRow["pas23_borrowing_type"],
    pas23_asset: null,
    pas23_capitalize_from: null,
    pas23_capitalize_until: null,
    installment_amount: number("installment_amount"),
    proceeds_net: number("proceeds_net"),
    eir_rate: number("eir_rate"),
    maturity_date: asString(raw.maturity_date)
      ? toPhtDateString(asString(raw.maturity_date))
      : null,
    approval_status: asString(
      raw.approval_status,
    ) as LoanRow["approval_status"],
    status: asString(raw.status) as LoanStatus,
    schedule_version: number("schedule_version") || 1,
    advance_balance: 0,
    submitted_at: asString(raw.submitted_at) || null,
    submitted_by: asNumberOrNull(raw.submitted_by),
    approved_at: asString(raw.approved_at) || null,
    approved_by: asNumberOrNull(raw.approved_by),
    released_at: asString(raw.released_at) || null,
    closed_at: null,
    remarks: asString(raw.remarks) || null,
    created_at: asString(raw.created_at),
    created_by: null,
    updated_at: asString(raw.updated_at),
    updated_by: null,
  };
}

export async function listPaymentAccounts(): Promise<LoanPaymentAccountRow[]> {
  const { rows } = await listItems<Record<string, unknown>>(ACCOUNTS, {
    fields: ["id", "name", "kind", "coa_id", "charge_pct", "is_active", "sort"],
    sort: "sort,id",
    limit: 100,
  });
  return rows
    .map((row) => ({
      id: asNumber(row.id),
      name: asString(row.name),
      kind: asString(row.kind) as LoanPaymentAccountRow["kind"],
      coa_id: asNumber(row.coa_id),
      charge_pct: asNumber(row.charge_pct),
      is_active: asBoolean(row.is_active),
      sort: asNumber(row.sort),
    }))
    .filter((row) => row.id > 0 && row.is_active);
}

async function loadMapping(): Promise<Map<string, number | null>> {
  const { rows } = await listItems<MappingRow>(MAPPINGS, {
    fields: ["mapping_key", "coa_id"],
    limit: 100,
  });
  const map = new Map<string, number | null>();
  for (const row of rows)
    map.set(
      asString(row.mapping_key).toUpperCase(),
      asNumberOrNull(row.coa_id),
    );
  return map;
}

async function loadCoa(ids: number[]): Promise<Map<number, CoaRow>> {
  const unique = [
    ...new Set(ids.filter((id) => Number.isInteger(id) && id > 0)),
  ];
  if (unique.length === 0) return new Map();
  const { rows } = await listItems<Record<string, unknown>>(COA, {
    fields: ["coa_id", "gl_code", "account_title"],
    filter: { coa_id: { _in: unique } },
    limit: unique.length,
  });
  const map = new Map<number, CoaRow>();
  for (const row of rows) {
    const id = asNumber(row.coa_id);
    map.set(id, {
      coa_id: id,
      gl_code: asString(row.gl_code),
      account_title: asString(row.account_title),
    });
  }
  return map;
}

/** The furthest period the books are closed to, if any. */
export async function lockedThrough(): Promise<string | null> {
  const { rows } = await listItems<Record<string, unknown>>(LOCKS, {
    fields: ["id", "locked_through", "reopened_at"],
    sort: "-locked_through",
    limit: 20,
  });
  let furthest: string | null = null;
  for (const row of rows) {
    // A reopened lock (it carries `reopened_at`) no longer closes anything.
    if (asString(row.reopened_at)) continue;
    const through = toPhtDateString(asString(row.locked_through));
    if (through && (!furthest || through > furthest)) furthest = through;
  }
  return furthest;
}

/**
 * Names for the numeric ids these tables store.
 *
 * The directory is the platform's own `user` table (`user_id` is what
 * `loan_approval.actor_id`, `loan_event.actor_id` and `loan.submitted_by` hold).
 * `/items/directus_users` answers 403 on this instance, and a failed read must leave a
 * dash on the trail rather than fail the whole screen, so this never throws.
 * Same shape as `taxation/payments-2307/services/actor.ts` and loan-reconciliation.
 */
async function loadActorNames(ids: number[]): Promise<Map<number, string>> {
  const unique = [
    ...new Set(ids.filter((id) => Number.isInteger(id) && id > 0)),
  ];
  if (unique.length === 0) return new Map();
  try {
    const { rows } = await listItems<Record<string, unknown>>(USERS, {
      fields: [
        "user_id",
        "user_fname",
        "user_mname",
        "user_lname",
        "user_email",
      ],
      filter: { user_id: { _in: unique } },
      limit: unique.length,
    });
    const map = new Map<number, string>();
    for (const row of rows) {
      const id = asNumber(row.user_id);
      const name = [row.user_fname, row.user_mname, row.user_lname]
        .map(asString)
        .filter(Boolean)
        .join(" ");
      map.set(id, name || asString(row.user_email) || `User ${id}`);
    }
    return map;
  } catch {
    return new Map();
  }
}

function releaseKeyLabel(key: string): string {
  return (
    {
      LOAN_PRINCIPAL: "the loans payable account",
      UNAMORTIZED_COSTS: "the unamortized costs account",
      CHECKS_UNCLEARED: "the checks issued that have not cleared",
      DST_PAYABLE: "the DST payable account",
    }[key] ?? key
  );
}

/**
 * Builds the release entry's lines from the loan's own terms.
 *
 * Release posts the principal owed against the money we received and the costs we will
 * amortize: `Dr proceeds account (or checks uncleared) + Dr unamortized costs = Cr loans
 * payable`. When we pay the DST ourselves it is not withheld from the proceeds, so it gets
 * its own pair (`Dr unamortized costs / Cr DST payable`) and stays a liability until remitted.
 */
function buildReleaseLines(
  loan: LoanRow,
  account: LoanPaymentAccountRow | null,
  channel: ReleaseChannel,
  mapping: Map<string, number | null>,
): {
  lines: {
    key: string;
    coaId: number | null;
    debit: number;
    credit: number;
    memo: string;
  }[];
  missing: string[];
} {
  const missing: string[] = [];
  const resolve = (key: string): number | null => {
    const coaId = mapping.get(key) ?? null;
    if (!coaId) missing.push(key);
    return coaId;
  };

  const principal = roundMoney(loan.principal);
  const proceeds = roundMoney(loan.proceeds_net);
  const costs = roundMoney(principal - proceeds);
  const dstOurs =
    loan.dst_treatment === "PAID_BY_US" ? roundMoney(loan.dst_amount) : 0;

  const lines: {
    key: string;
    coaId: number | null;
    debit: number;
    credit: number;
    memo: string;
  }[] = [];
  // The debit side of the proceeds: the bank/ewallet account, or the uncleared-checks account.
  if (channel === "CHECK") {
    lines.push({
      key: "CHECKS_UNCLEARED",
      coaId: resolve("CHECKS_UNCLEARED"),
      debit: proceeds,
      credit: 0,
      memo: `Loan proceeds by check · ${loan.loan_no}`,
    });
  } else {
    lines.push({
      key: "PROCEEDS",
      coaId: account ? account.coa_id : null,
      debit: proceeds,
      credit: 0,
      memo: `Loan proceeds · ${loan.loan_no}`,
    });
  }
  if (costs > 0) {
    lines.push({
      key: "UNAMORTIZED_COSTS",
      coaId: resolve("UNAMORTIZED_COSTS"),
      debit: costs,
      credit: 0,
      memo: `Fees and costs withheld · ${loan.loan_no}`,
    });
  }
  if (dstOurs > 0) {
    lines.push({
      key: "UNAMORTIZED_COSTS",
      coaId: mapping.get("UNAMORTIZED_COSTS") ?? null,
      debit: dstOurs,
      credit: 0,
      memo: `Documentary stamp tax we pay · ${loan.loan_no}`,
    });
    lines.push({
      key: "DST_PAYABLE",
      coaId: resolve("DST_PAYABLE"),
      debit: 0,
      credit: dstOurs,
      memo: `Documentary stamp tax payable · ${loan.loan_no}`,
    });
  }
  lines.push({
    key: "LOAN_PRINCIPAL",
    coaId: resolve("LOAN_PRINCIPAL"),
    debit: 0,
    credit: principal,
    memo: `Loan payable · ${loan.loan_no}`,
  });

  return { lines, missing: [...new Set(missing)] };
}

async function describeLines(
  raw: {
    key: string;
    coaId: number | null;
    debit: number;
    credit: number;
    memo: string;
  }[],
): Promise<ReleasePreviewLine[]> {
  const coa = await loadCoa(raw.map((line) => line.coaId ?? 0));
  return raw.map((line) => {
    const row = line.coaId ? coa.get(line.coaId) : undefined;
    return {
      label: line.memo,
      glCode: row?.gl_code ?? null,
      accountTitle: row?.account_title ?? null,
      debit: line.debit,
      credit: line.credit,
    };
  });
}

function accountLabel(account: LoanPaymentAccountRow | null): string | null {
  return account ? account.name : null;
}

interface QueueQuery {
  q?: string;
  status?: string;
  lenderType?: string;
  page?: number;
  pageSize?: number;
}

function queueFilter(query: QueueQuery): Record<string, unknown> {
  const statuses =
    query.status && query.status !== "ALL" ? [query.status] : QUEUE_STATUSES;
  const clauses: Record<string, unknown>[] = [{ status: { _in: statuses } }];
  if (query.lenderType && query.lenderType !== "ALL")
    clauses.push({ lender_type: { _eq: query.lenderType } });
  if (query.q) {
    clauses.push({
      _or: [
        { loan_no: { _icontains: query.q } },
        { lender_name: { _icontains: query.q } },
        { account_no: { _icontains: query.q } },
      ],
    });
  }
  return { _and: clauses };
}

async function mapQueueRows(
  rawRows: RawLoan[],
  actorId: number | null,
): Promise<ApprovalQueueRow[]> {
  const [accounts, schedule, names] = await Promise.all([
    listPaymentAccounts(),
    scheduledLoanIds(rawRows.map((row) => asNumber(row.id))),
    loadActorNames(rawRows.map((row) => asNumberOrNull(row.submitted_by) ?? 0)),
  ]);

  const accountById = new Map(accounts.map((account) => [account.id, account]));
  return rawRows.map((raw) => {
    const loan = toLoanRow(raw);
    const account = accountById.get(loan.proceeds_account_id) ?? null;
    return {
      id: loan.id,
      loanNo: loan.loan_no,
      lenderName: loan.lender_name,
      lenderType: loan.lender_type,
      branch: loan.branch,
      principal: loan.principal,
      proceedsNet: loan.proceeds_net,
      installmentAmount: loan.installment_amount,
      termPayments: loan.term_payments,
      annualRate: loan.nominal_rate,
      releaseDate: loan.release_date,
      maturityDate: loan.maturity_date,
      submittedAt: loan.submitted_at,
      submittedBy: loan.submitted_by,
      submittedByName: loan.submitted_by
        ? (names.get(loan.submitted_by) ?? null)
        : null,
      status: loan.status,
      approvalStatus: loan.approval_status,
      selfSubmitted: actorId !== null && loan.submitted_by === actorId,
      hasSchedule: schedule.has(loan.id),
      proceedsAccountLabel: accountLabel(account),
    };
  });
}

/** Which of these loans already have schedule rows, in one query rather than one per row. */
async function scheduledLoanIds(ids: number[]): Promise<Set<number>> {
  const unique = ids.filter((id) => id > 0);
  if (unique.length === 0) return new Set();
  const { rows } = await listItems<Record<string, unknown>>(SCHEDULE, {
    fields: ["loan_id"],
    filter: { loan_id: { _in: unique } },
    limit: unique.length * 12,
  });
  return new Set(rows.map((row) => asNumber(row.loan_id)));
}

export async function loadQueue(
  query: QueueQuery,
  actorId: number | null,
): Promise<{ rows: ApprovalQueueRow[]; total: number }> {
  const pageSize = query.pageSize && query.pageSize > 0 ? query.pageSize : 10;
  const page = query.page ?? 1;
  const pageResult = await listItems<RawLoan>(LOANS, {
    fields: LOAN_FIELDS,
    filter: queueFilter(query),
    sort: "-submitted_at",
    limit: pageSize,
    page,
  });

  const rows = await mapQueueRows(pageResult.rows, actorId);
  return { rows, total: pageResult.total };
}

async function loadLoan(id: number): Promise<LoanRow> {
  const raw = await getItem<RawLoan>(LOANS, id, LOAN_FIELDS);
  if (!raw) throw new LoanNotFoundError("That loan could not be found.");
  return toLoanRow(raw);
}

type TimelineFallback = {
  submittedBy: number | null;
  approvedBy: number | null;
};

/** Two rows describe one action when they agree on the action and land within two seconds. */
const SAME_ACTION_MS = 2000;

function stampOf(value: unknown): number {
  const text = asString(value);
  const at = text ? Date.parse(text) : Number.NaN;
  return Number.isNaN(at) ? Number.NEGATIVE_INFINITY : at;
}

/**
 * One line per action.
 *
 * The register writes an `loan_approval` row and a `loan_event` row for the same submission,
 * and the decision writes the same pair, so reading both printed "Submitted" twice a second
 * apart (finding L7). The approval row is the decision record; the matching event is folded
 * into it (its description and reference fill in when the decision has none).
 * Nothing is deleted: the rows stay where they are.
 */
type TimelineRow = Record<string, unknown>;

/** Neither read needs the loan row, so the caller starts both with it instead of after it. */
async function loadDecisionRows(loanId: number): Promise<TimelineRow[]> {
  const { rows } = await listItems<TimelineRow>(APPROVALS, {
    fields: [
      "id",
      "action",
      "remarks",
      "actor_id",
      "acted_at",
      "self_approved",
    ],
    filter: { loan_id: { _eq: loanId } },
    sort: "-acted_at,-id",
    limit: 100,
  });
  return rows;
}

async function loadEventRows(loanId: number): Promise<TimelineRow[]> {
  const { rows } = await listItems<TimelineRow>(EVENTS, {
    fields: [
      "id",
      "kind",
      "occurred_at",
      "description",
      "amount",
      "reference",
      "actor_id",
    ],
    filter: { loan_id: { _eq: loanId } },
    sort: "-occurred_at,-id",
    limit: 100,
  });
  return rows;
}

/** Every id the trail will name, so one directory read serves the timeline and the header. */
function timelineActorIds(
  decisions: TimelineRow[],
  events: TimelineRow[],
  fallback: TimelineFallback,
): number[] {
  return [
    ...decisions.map((row) => asNumberOrNull(row.actor_id) ?? 0),
    ...events.map((row) => asNumberOrNull(row.actor_id) ?? 0),
    fallback.submittedBy ?? 0,
    fallback.approvedBy ?? 0,
  ];
}

function buildTimeline(
  decisions: TimelineRow[],
  events: TimelineRow[],
  names: Map<number, string>,
  fallback: TimelineFallback,
): ApprovalTimelineEntry[] {
  const nameFor = (actorId: number | null): string | null =>
    actorId ? (names.get(actorId) ?? `User ${actorId}`) : null;

  const entries: ApprovalTimelineEntry[] = [];
  for (const row of decisions) {
    const action = asString(row.action) as ApprovalAction;
    const fallbackId =
      action === "SUBMITTED" || action === "RESUBMITTED"
        ? fallback.submittedBy
        : fallback.approvedBy;
    entries.push({
      id: `approval-${asNumber(row.id)}`,
      kind: "DECISION",
      action,
      label: ACTION_LABEL[action] ?? action,
      occurredAt: asString(row.acted_at),
      description: null,
      remarks: asString(row.remarks) || null,
      amount: null,
      reference: null,
      actorName: nameFor(asNumberOrNull(row.actor_id)) ?? nameFor(fallbackId),
      selfApproved: asBoolean(row.self_approved),
    });
  }

  for (const row of events) {
    const kind = asString(row.kind) as LoanEventKind;
    const at = stampOf(row.occurred_at);
    const twin = entries.find(
      (entry) =>
        entry.kind === "DECISION" &&
        entry.action === kind &&
        Math.abs(stampOf(entry.occurredAt) - at) <= SAME_ACTION_MS,
    );
    if (twin) {
      twin.description ??= asString(row.description) || null;
      twin.reference ??= asString(row.reference) || null;
      twin.actorName ??= nameFor(asNumberOrNull(row.actor_id));
      continue;
    }
    entries.push({
      id: `event-${asNumber(row.id)}`,
      kind: "EVENT",
      action: kind,
      label: EVENT_LABEL[kind] ?? kind,
      occurredAt: asString(row.occurred_at),
      description: asString(row.description) || null,
      remarks: null,
      amount: asNumberOrNull(row.amount),
      reference: asString(row.reference) || null,
      actorName: nameFor(asNumberOrNull(row.actor_id)),
      selfApproved: false,
    });
  }

  return entries.sort((a, b) =>
    a.occurredAt < b.occurredAt ? 1 : a.occurredAt > b.occurredAt ? -1 : 0,
  );
}

const ACTION_LABEL: Record<string, string> = {
  SUBMITTED: "Submitted",
  RESUBMITTED: "Resubmitted",
  APPROVED: "Approved",
  REJECTED: "Rejected",
};

const EVENT_LABEL: Record<string, string> = {
  SUBMITTED: "Submitted",
  APPROVED: "Approved",
  REJECTED: "Rejected",
  RELEASED: "Released",
  PAYMENT: "Payment",
  PAYMENT_REVERSED: "Payment reversed",
  ENCASHED: "Check encashed",
  PREPAYMENT: "Prepayment",
  RATE_CHANGE: "Rate change",
  RESTRUCTURE: "Restructured",
  PAYOFF: "Paid off",
  PAS23: "Borrowing costs",
  SOA_COMPARED: "Statement compared",
  DOCUMENT: "Document",
  SCHEDULE_REBUILT: "Schedule rebuilt",
};

async function loadScheduleCount(
  loanId: number,
  version: number,
): Promise<number> {
  const { total } = await listItems<Record<string, unknown>>(SCHEDULE, {
    fields: ["id"],
    filter: {
      _and: [{ loan_id: { _eq: loanId } }, { version: { _eq: version } }],
    },
    limit: 1,
  });
  return total;
}

export async function loadDetail(
  id: number,
  actorId: number | null,
  channel: ReleaseChannel = "TRANSFER",
  accountId?: number | null,
): Promise<ApprovalDetail> {
  // Opening this dialog used to take five Directus waves: the loan, then six reads, then the
  // actor names, then the chart of accounts, then the names again. Only the loan row is a
  // prerequisite for the rest, so the work now runs in two waves and reads names once.
  const [loan, accounts, mapping, locked, decisions, events] =
    await Promise.all([
      loadLoan(id),
      listPaymentAccounts(),
      loadMapping(),
      lockedThrough(),
      loadDecisionRows(id),
      loadEventRows(id),
    ]);

  const account =
    accounts.find(
      (item) => item.id === (accountId ?? loan.proceeds_account_id),
    ) ?? null;
  const { lines: rawLines, missing } = buildReleaseLines(
    loan,
    account,
    channel,
    mapping,
  );
  const fallback: TimelineFallback = {
    submittedBy: loan.submitted_by,
    approvedBy: loan.approved_by,
  };
  const [lines, names, schedulePeriods] = await Promise.all([
    describeLines(rawLines),
    loadActorNames(timelineActorIds(decisions, events, fallback)),
    loadScheduleCount(id, loan.schedule_version),
  ]);
  const timeline = buildTimeline(decisions, events, names, fallback);
  const preview: ReleasePreview = {
    lines,
    totalDebit: roundMoney(lines.reduce((sum, line) => sum + line.debit, 0)),
    totalCredit: roundMoney(lines.reduce((sum, line) => sum + line.credit, 0)),
    missingMappingKeys: missing,
    channel,
    releaseDate: phtDate(),
    accountId: account?.id ?? null,
    accountLabel: accountLabel(account),
  };

  const approvedBy = loan.approved_by;
  const row: ApprovalQueueRow = {
    id: loan.id,
    loanNo: loan.loan_no,
    lenderName: loan.lender_name,
    lenderType: loan.lender_type,
    branch: loan.branch,
    principal: loan.principal,
    proceedsNet: loan.proceeds_net,
    installmentAmount: loan.installment_amount,
    termPayments: loan.term_payments,
    annualRate: loan.nominal_rate,
    releaseDate: loan.release_date,
    maturityDate: loan.maturity_date,
    submittedAt: loan.submitted_at,
    submittedBy: loan.submitted_by,
    submittedByName: loan.submitted_by
      ? (names.get(loan.submitted_by) ?? null)
      : null,
    status: loan.status,
    approvalStatus: loan.approval_status,
    selfSubmitted: actorId !== null && loan.submitted_by === actorId,
    hasSchedule: schedulePeriods > 0,
    proceedsAccountLabel: accountLabel(account),
  };

  return {
    row,
    accounts,
    timeline,
    preview,
    lockedThrough: locked,
    schedulePeriods,
    submittedByName: loan.submitted_by
      ? (names.get(loan.submitted_by) ?? `User ${loan.submitted_by}`)
      : null,
    approvedByName: approvedBy
      ? (names.get(approvedBy) ?? `User ${approvedBy}`)
      : null,
    approvedAt: loan.approved_at,
    releasedAt: loan.released_at,
    purpose: loan.purpose,
    accountNo: loan.account_no,
    processingFee: loan.processing_fee,
    dstAmount: loan.dst_amount,
    otherCosts: loan.other_costs,
    eirRate: loan.eir_rate,
    accountOfficer: loan.account_officer,
    contactPhone: loan.contact_phone,
    contactEmail: loan.contact_email,
    security: loan.security,
    securityValue: loan.security_value,
    guarantor: loan.guarantor,
    rateType: loan.rate_type,
    repaymentMethod: loan.repayment_method,
    paymentFrequency: loan.payment_frequency,
    firstPaymentDate: loan.first_payment_date,
    firstPeriodBasis: loan.first_period_basis,
    businessDayRule: loan.business_day_rule,
    pas23Applies: Boolean(loan.pas23_applies),
    pas23BorrowingType: loan.pas23_borrowing_type,
  };
}

function assertDecidable(loan: LoanRow): void {
  if (loan.status === "PENDING_APPROVAL") return;
  throw new LoanConflictError(
    `This loan is ${statusNoun(loan.status)}, so it can no longer be approved or rejected.`,
  );
}

async function assertOpenPeriod(releaseDate: string): Promise<void> {
  const locked = await lockedThrough();
  if (locked && releaseDate <= locked) {
    throw new LoanConflictError(
      `The books are closed through ${formatDateMDY(locked)}, so a loan released on ${formatDateMDY(releaseDate)} cannot be approved. Ask accounting to reopen the period.`,
    );
  }
}

/**
 * Approves a loan and posts its release in the same action: the approval decision, the RELEASE
 * entry, schedule version 1 and the loan's move to Current happen together, so there is no
 * "Awaiting release" step to get stuck in.
 *
 * Everything is validated before the first write: a refused approval (already posted, closed
 * period, unmapped GL account) leaves the loan exactly as it was.
 */
export async function approveLoan(
  id: number,
  remarks: string,
  actorId: number | null,
): Promise<ApproveResult> {
  const loan = await loadLoan(id);
  if (
    loan.status === "CURRENT" ||
    loan.status === "OVERDUE" ||
    loan.status === "PAID_OFF" ||
    loan.status === "PREPAID"
  ) {
    throw new LoanConflictError("This loan is already approved and posted.");
  }
  assertDecidable(loan);

  const releaseDate = toPhtDateString(loan.release_date);
  if (!releaseDate) {
    throw new LoanValidationError(
      "The loan has no release date to post against.",
      { releaseDate: ["Set the release date first."] },
    );
  }
  if (releaseDate > phtDate()) {
    throw new LoanValidationError(
      "The release date cannot be in the future: the money has not arrived yet.",
      {
        releaseDate: ["Pick today or an earlier date."],
      },
    );
  }
  await assertOpenPeriod(releaseDate);

  const accounts = await listPaymentAccounts();
  const account =
    accounts.find((item) => item.id === loan.proceeds_account_id) ?? null;
  if (!account)
    throw new LoanConflictError(
      "The proceeds account on this loan is not in the active payment account list.",
    );

  // The approval has no channel picker: the money is taken as arriving at the loan's own proceeds
  // account, which is the same assumption the approval queue's preview makes.
  const channel: ReleaseChannel = "TRANSFER";
  const posted = await postReleaseEntry(
    loan,
    releaseDate,
    channel,
    account,
    actorId,
  );

  const now = phtStamp();
  const selfApproved = actorId !== null && loan.submitted_by === actorId;

  await updateItem(LOANS, id, {
    approval_status: "APPROVED",
    status: "CURRENT",
    approved_at: now,
    approved_by: actorId,
    released_at: `${releaseDate}T00:00:00`,
    release_date: releaseDate,
    proceeds_account_id: account.id,
    updated_at: now,
    updated_by: actorId,
  });
  await createItem(APPROVALS, {
    loan_id: id,
    action: "APPROVED",
    remarks: remarks || null,
    actor_id: actorId,
    acted_at: now,
    self_approved: selfApproved,
    created_at: now,
    created_by: actorId,
    updated_at: now,
    updated_by: actorId,
  });
  await createItem(EVENTS, {
    loan_id: id,
    kind: "APPROVED",
    occurred_at: now,
    description: `Approved: ${loan.loan_no} · ${loan.lender_name}`,
    amount: loan.principal,
    reference: loan.loan_no,
    actor_id: actorId,
    created_at: now,
    created_by: actorId,
    updated_at: now,
    updated_by: actorId,
  });
  await createItem(EVENTS, {
    loan_id: id,
    kind: "RELEASED",
    occurred_at: now,
    description: `Released ${channelNoun(channel)} on ${releaseDate} to ${account.name} · ${posted.entryNo}`,
    amount: loan.principal,
    reference: posted.entryNo,
    actor_id: actorId,
    created_at: now,
    created_by: actorId,
    updated_at: now,
    updated_by: actorId,
  });

  return {
    loanNo: loan.loan_no,
    selfApproved,
    status: "CURRENT",
    entryNo: posted.entryNo,
    totalDebit: posted.totalDebit,
    scheduleRows: posted.scheduleRows,
    lines: posted.lines,
  };
}

export async function rejectLoan(
  id: number,
  reason: string,
  actorId: number | null,
): Promise<{ loanNo: string }> {
  const trimmed = reason.trim();
  if (trimmed.length < 3) {
    throw new LoanValidationError("Say why the loan is being rejected.", {
      reason: ["Give the preparer a sentence they can act on."],
    });
  }
  const loan = await loadLoan(id);
  assertDecidable(loan);

  const now = phtStamp();
  await updateItem(LOANS, id, {
    approval_status: "REJECTED",
    status: "REJECTED",
    updated_at: now,
    updated_by: actorId,
  });
  await createItem(APPROVALS, {
    loan_id: id,
    action: "REJECTED",
    remarks: trimmed,
    actor_id: actorId,
    acted_at: now,
    self_approved: false,
    created_at: now,
    created_by: actorId,
    updated_at: now,
    updated_by: actorId,
  });
  await createItem(EVENTS, {
    loan_id: id,
    kind: "REJECTED",
    occurred_at: now,
    description: `Rejected: ${trimmed}`,
    amount: loan.principal,
    reference: loan.loan_no,
    actor_id: actorId,
    created_at: now,
    created_by: actorId,
    updated_at: now,
    updated_by: actorId,
  });

  return { loanNo: loan.loan_no };
}

async function nextEntryNo(entryDate: string): Promise<string> {
  const year = entryDate.slice(0, 4);
  const prefix = `LJE-${year}-`;
  // Counted entries break as soon as a probe or a reversal is deleted, so read the highest
  // number actually in use. Four-digit padding keeps the string sort equal to the numeric one.
  const { rows } = await listItems<Record<string, unknown>>(ENTRIES, {
    fields: ["entry_no"],
    filter: { entry_no: { _starts_with: prefix } },
    sort: "-entry_no",
    limit: 1,
  });
  const last = rows.length > 0 ? asString(rows[0].entry_no) : "";
  const lastNumber = last.startsWith(prefix)
    ? Number.parseInt(last.slice(prefix.length), 10)
    : 0;
  const next =
    Number.isFinite(lastNumber) && lastNumber > 0 ? lastNumber + 1 : 1;
  return `${prefix}${String(next).padStart(4, "0")}`;
}

async function buildScheduleRows(
  loan: LoanRow,
): Promise<ReturnType<typeof buildSchedule>> {
  const { rows: holidays } = await listItems<Record<string, unknown>>(
    HOLIDAYS,
    {
      fields: ["holiday_date"],
      limit: 500,
    },
  );
  return buildSchedule({
    principal: loan.principal,
    annualRate: loan.nominal_rate,
    termPayments: loan.term_payments,
    repaymentMethod: loan.repayment_method as RepaymentMethod,
    paymentFrequency: loan.payment_frequency as PaymentFrequency,
    releaseDate: loan.release_date,
    firstPaymentDate: loan.first_payment_date,
    firstPeriodBasis: loan.first_period_basis as FirstPeriodBasis,
    businessDayRule: loan.business_day_rule as BusinessDayRule,
    holidays: holidays
      .map((row) => toPhtDateString(asString(row.holiday_date)))
      .filter(Boolean),
  });
}

export interface ApproveResult {
  loanNo: string;
  selfApproved: boolean;
  status: LoanStatus;
  entryNo: string;
  totalDebit: number;
  scheduleRows: number;
  lines: number;
}

interface PostedRelease {
  entryNo: string;
  totalDebit: number;
  scheduleRows: number;
  lines: number;
}

/**
 * Posts a loan's RELEASE entry and builds schedule version 1 when the loan has none. Shared by
 * approval (which posts immediately) and the release action kept for loans already in the queue.
 *
 * Refuses before the first write when a GL account is unmapped or the entry does not balance;
 * a failed line write pulls the header back out, so nothing half-posted is left behind.
 */
async function postReleaseEntry(
  loan: LoanRow,
  releaseDate: string,
  channel: ReleaseChannel,
  account: LoanPaymentAccountRow,
  actorId: number | null,
): Promise<PostedRelease> {
  const mapping = await loadMapping();
  const { lines: rawLines, missing } = buildReleaseLines(
    loan,
    account,
    channel,
    mapping,
  );
  if (missing.length > 0) {
    throw new LoanConflictError(
      `Ask accounting to map ${missing.map((key) => `${releaseKeyLabel(key)} (${key})`).join(" and ")} before its release can be posted.`,
    );
  }

  const totalDebit = roundMoney(
    rawLines.reduce((sum, line) => sum + line.debit, 0),
  );
  const totalCredit = roundMoney(
    rawLines.reduce((sum, line) => sum + line.credit, 0),
  );
  if (totalDebit !== totalCredit) {
    throw new LoanConflictError(
      "The release entry does not balance, so nothing was posted. Check the fees and DST on the loan.",
    );
  }

  const now = phtStamp();

  // A previous attempt can have posted the entry and then failed before the loan moved. Reuse
  // that entry instead of posting a second one; the loan row is the part that still has to change.
  const { rows: posted } = await listItems<Record<string, unknown>>(ENTRIES, {
    fields: ["id", "entry_no", "entry_date", "total_debit"],
    filter: {
      _and: [
        { loan_id: { _eq: loan.id } },
        { entry_type: { _eq: "RELEASE" } },
        { status: { _eq: "POSTED" } },
      ],
    },
    sort: "-id",
    limit: 1,
  });
  const existing = posted[0];
  const entryNo = existing
    ? asString(existing.entry_no)
    : await nextEntryNo(releaseDate);

  if (!existing) {
    const entry = await createItem<Record<string, unknown>>(ENTRIES, {
      loan_id: loan.id,
      entry_no: entryNo,
      entry_date: releaseDate,
      entry_type: "RELEASE",
      description: `Loan release · ${loan.loan_no} · ${loan.lender_name}`,
      period_key: releaseDate.slice(0, 7),
      status: "POSTED",
      total_debit: totalDebit,
      total_credit: totalCredit,
      created_at: now,
      created_by: actorId,
      updated_at: now,
      updated_by: actorId,
    });
    const entryId = asNumber(entry.id);

    try {
      for (const [index, line] of rawLines.entries()) {
        await createItem(LINES, {
          entry_id: entryId,
          line_no: index + 1,
          coa_id: line.coaId,
          memo: line.memo,
          debit: line.debit,
          credit: line.credit,
          created_at: now,
          created_by: actorId,
          updated_at: now,
          updated_by: actorId,
        });
      }
    } catch (error) {
      // Do not leave half an entry in the ledger: pull the header back out and rethrow.
      await directusFetch(`/items/${ENTRIES}/${entryId}`, {
        method: "DELETE",
      }).catch(() => undefined);
      throw error;
    }
  }

  let scheduleRows = 0;
  if (!(await loadScheduleCount(loan.id, 1))) {
    const rows = await buildScheduleRows(loan);
    for (const row of rows) {
      await createItem(SCHEDULE, {
        loan_id: loan.id,
        version: 1,
        period_no: row.periodNo,
        due_date: row.dueDate,
        payment_due_date: row.paymentDueDate,
        opening_principal: row.openingPrincipal,
        interest: row.interest,
        principal: row.principal,
        payment: row.payment,
        closing_principal: row.closingPrincipal,
        flat_interest: row.flatInterest,
        rule78_interest: row.rule78Interest,
        status: "UPCOMING",
        created_at: now,
        created_by: actorId,
        updated_at: now,
        updated_by: actorId,
      });
      scheduleRows += 1;
    }
    await createItem(EVENTS, {
      loan_id: loan.id,
      kind: "SCHEDULE_REBUILT",
      occurred_at: now,
      description: `Schedule built on release: ${scheduleRows} installments`,
      amount: null,
      reference: loan.loan_no,
      actor_id: actorId,
      created_at: now,
      created_by: actorId,
      updated_at: now,
      updated_by: actorId,
    });
  }

  return { entryNo, totalDebit, scheduleRows, lines: rawLines.length };
}

export function channelNoun(channel: ReleaseChannel): string {
  return channel === "CHECK"
    ? "by check"
    : channel === "CASH"
      ? "in cash"
      : "by transfer";
}
