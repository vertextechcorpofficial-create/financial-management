import { phtStamp } from "../pht";
import { RECONCILIATION_TOLERANCE, STATEMENT_RESULT_LABEL } from "../constants";
import type { LoanOption, StatementRow, StatementResult, StatementVariance } from "../types";
import { createItem, listItems } from "./directus";
import { LoanConflictError, LoanNotFoundError } from "./errors";

function num(value: unknown): number {
  return Number(value ?? 0);
}

function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function num2(value: number): string {
  return round2(value).toFixed(2);
}

type RawLoan = {
  id: number;
  loan_no: string;
  lender_name: string;
  principal: string | number | null;
  advance_balance: string | number | null;
  status: string;
  schedule_version: number | null;
};

type RawInstallment = {
  due_date: string;
  opening_principal: string | number | null;
  closing_principal: string | number | null;
  interest: string | number | null;
  penalty_accrued: string | number | null;
  paid_interest: string | number | null;
  paid_penalty: string | number | null;
  paid_on: string | null;
};

type RawStatement = {
  id: number;
  loan_id: number;
  statement_date: string;
  lender_principal: string | number;
  lender_interest: string | number;
  lender_penalties: string | number;
  lender_advances: string | number;
  our_principal: string | number;
  our_interest: string | number;
  our_penalties: string | number;
  our_advances: string | number;
  result: string;
  remarks: string | null;
  created_at: string | null;
};

const STATEMENT_FIELDS = [
  "id",
  "loan_id",
  "statement_date",
  "lender_principal",
  "lender_interest",
  "lender_penalties",
  "lender_advances",
  "our_principal",
  "our_interest",
  "our_penalties",
  "our_advances",
  "result",
  "remarks",
  "created_at",
];

export async function listLoanOptions(): Promise<LoanOption[]> {
  const { rows } = await listItems<RawLoan>("loan", {
    fields: ["id", "loan_no", "lender_name", "principal", "advance_balance", "status", "schedule_version"],
    sort: "loan_no",
    limit: 500,
  });
  return rows.map((row) => ({
    id: Number(row.id),
    loanNo: row.loan_no,
    lenderName: row.lender_name,
    principal: num(row.principal),
    status: row.status,
  }));
}

/**
 * What our own books say as of the statement date: the billed principal still outstanding, the
 * interest billed but not yet paid, the penalties accrued but not paid, and any advance held.
 */
async function ourFigures(loanId: number, asOf: string) {
  const { rows: loans } = await listItems<RawLoan>("loan", {
    fields: ["id", "loan_no", "lender_name", "principal", "advance_balance", "status", "schedule_version"],
    filter: { id: { _eq: loanId } },
    limit: 1,
  });
  const loan = loans[0];
  if (!loan) throw new LoanNotFoundError("That loan no longer exists.");

  const { rows: schedule } = await listItems<RawInstallment>("loan_schedule", {
    fields: [
      "due_date",
      "opening_principal",
      "closing_principal",
      "interest",
      "penalty_accrued",
      "paid_interest",
      "paid_penalty",
      "paid_on",
    ],
    filter: { _and: [{ loan_id: { _eq: loanId } }, { version: { _eq: Number(loan.schedule_version ?? 1) } }] },
    sort: "period_no",
    limit: 500,
  });

  const billed = schedule.filter((row) => row.due_date <= asOf);
  const lastBilled = billed[billed.length - 1];
  const principal = lastBilled ? num(lastBilled.closing_principal) : num(loan.principal);

  const interestBilled = billed.reduce((total, row) => total + num(row.interest), 0);
  const interestPaid = schedule
    .filter((row) => row.paid_on && row.paid_on <= asOf)
    .reduce((total, row) => total + num(row.paid_interest), 0);
  const penaltyBilled = billed.reduce((total, row) => total + num(row.penalty_accrued), 0);
  const penaltyPaid = schedule
    .filter((row) => row.paid_on && row.paid_on <= asOf)
    .reduce((total, row) => total + num(row.paid_penalty), 0);

  return {
    loan,
    principal: round2(principal),
    interest: round2(Math.max(0, interestBilled - interestPaid)),
    penalties: round2(Math.max(0, penaltyBilled - penaltyPaid)),
    advances: round2(num(loan.advance_balance)),
  };
}

export function variancesOf(row: {
  lenderPrincipal: number;
  lenderInterest: number;
  lenderPenalties: number;
  lenderAdvances: number;
  ourPrincipal: number;
  ourInterest: number;
  ourPenalties: number;
  ourAdvances: number;
}): StatementVariance[] {
  return [
    {
      key: "principal",
      label: "Principal",
      lender: row.lenderPrincipal,
      ours: row.ourPrincipal,
      variance: round2(row.lenderPrincipal - row.ourPrincipal),
    },
    {
      key: "interest",
      label: "Interest",
      lender: row.lenderInterest,
      ours: row.ourInterest,
      variance: round2(row.lenderInterest - row.ourInterest),
    },
    {
      key: "penalties",
      label: "Penalties",
      lender: row.lenderPenalties,
      ours: row.ourPenalties,
      variance: round2(row.lenderPenalties - row.ourPenalties),
    },
    {
      key: "advances",
      label: "Advances",
      lender: row.lenderAdvances,
      ours: row.ourAdvances,
      variance: round2(row.lenderAdvances - row.ourAdvances),
    },
  ];
}

function toRow(raw: RawStatement, loans: Map<number, RawLoan>): StatementRow {
  const loan = loans.get(Number(raw.loan_id));
  return {
    id: Number(raw.id),
    loanId: Number(raw.loan_id),
    loanNo: loan?.loan_no ?? `Loan ${raw.loan_id}`,
    lenderName: loan?.lender_name ?? "",
    statementDate: raw.statement_date,
    lenderPrincipal: num(raw.lender_principal),
    lenderInterest: num(raw.lender_interest),
    lenderPenalties: num(raw.lender_penalties),
    lenderAdvances: num(raw.lender_advances),
    ourPrincipal: num(raw.our_principal),
    ourInterest: num(raw.our_interest),
    ourPenalties: num(raw.our_penalties),
    ourAdvances: num(raw.our_advances),
    result: raw.result === "AGREES" ? "AGREES" : "DIFFERS",
    remarks: raw.remarks,
    createdAt: raw.created_at,
  };
}

async function loansById(ids: number[]): Promise<Map<number, RawLoan>> {
  const unique = [...new Set(ids.filter((id) => Number.isInteger(id) && id > 0))];
  if (unique.length === 0) return new Map();
  const { rows } = await listItems<RawLoan>("loan", {
    fields: ["id", "loan_no", "lender_name", "principal", "advance_balance", "status", "schedule_version"],
    filter: { id: { _in: unique } },
    limit: 200,
  });
  return new Map(rows.map((row) => [Number(row.id), row]));
}

export async function listStatements(input: {
  result?: "ALL" | "AGREES" | "DIFFERS";
  loanId?: number;
  page?: number;
  pageSize?: number;
}): Promise<{ rows: StatementRow[]; total: number; page: number; pageSize: number }> {
  const page = input.page ?? 1;
  const pageSize = input.pageSize && input.pageSize > 0 ? input.pageSize : 10;
  const conditions: Record<string, unknown>[] = [];
  if (input.result && input.result !== "ALL") conditions.push({ result: { _eq: input.result } });
  if (input.loanId) conditions.push({ loan_id: { _eq: input.loanId } });
  const filter = conditions.length === 0 ? undefined : conditions.length === 1 ? conditions[0] : { _and: conditions };

  const { rows, total } = await listItems<RawStatement>("loan_statement_comparison", {
    fields: STATEMENT_FIELDS,
    filter,
    sort: "-statement_date,-id",
    limit: pageSize,
    page,
  });
  const loans = await loansById(rows.map((row) => Number(row.loan_id)));
  return { rows: rows.map((row) => toRow(row, loans)), total, page, pageSize };
}

/** Records one lender statement: our figures are computed, never typed, and the verdict follows. */
export async function recordStatement(
  input: {
    loanId: number;
    statementDate: string;
    lenderPrincipal: number;
    lenderInterest: number;
    lenderPenalties: number;
    lenderAdvances: number;
    remarks?: string;
  },
  actorId: number | null,
): Promise<{ row: StatementRow; variances: StatementVariance[]; result: StatementResult; sentence: string }> {
  const ours = await ourFigures(input.loanId, input.statementDate);

  const variances = variancesOf({
    lenderPrincipal: input.lenderPrincipal,
    lenderInterest: input.lenderInterest,
    lenderPenalties: input.lenderPenalties,
    lenderAdvances: input.lenderAdvances,
    ourPrincipal: ours.principal,
    ourInterest: ours.interest,
    ourPenalties: ours.penalties,
    ourAdvances: ours.advances,
  });

  const breaks = variances.filter((line) => Math.abs(line.variance) >= RECONCILIATION_TOLERANCE);
  const result: StatementResult = breaks.length === 0 ? "AGREES" : "DIFFERS";

  const peso = (value: number) =>
    new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" }).format(value);
  const sentence =
    result === "AGREES"
      ? `The lender's ${peso(input.lenderPrincipal)} principal, ${peso(input.lenderInterest)} interest, ${peso(input.lenderPenalties)} penalties and ${peso(input.lenderAdvances)} advances all match our books on ${input.statementDate}.`
      : `Our books differ on ${breaks.map((line) => line.label.toLowerCase()).join(", ")}: ${breaks
          .map((line) => `${line.label} ${peso(line.variance)}`)
          .join(", ")}.`;

  const now = phtStamp();
  const saved = await createItem<RawStatement>("loan_statement_comparison", {
    loan_id: input.loanId,
    statement_date: input.statementDate,
    lender_principal: num2(input.lenderPrincipal),
    lender_interest: num2(input.lenderInterest),
    lender_penalties: num2(input.lenderPenalties),
    lender_advances: num2(input.lenderAdvances),
    our_principal: num2(ours.principal),
    our_interest: num2(ours.interest),
    our_penalties: num2(ours.penalties),
    our_advances: num2(ours.advances),
    result,
    remarks: input.remarks?.trim() ? input.remarks.trim() : null,
    created_at: now,
    created_by: actorId,
    updated_at: now,
    updated_by: actorId,
  });

  const loans = await loansById([input.loanId]);
  return {
    row: toRow(saved, loans),
    variances,
    result,
    sentence: `${STATEMENT_RESULT_LABEL[result]}. ${sentence}`,
  };
}

/** A period already signed off cannot gain a statement for a date inside it — the lock rule. */
export async function assertStatementDateOpen(statementDate: string, lockedThrough: string | null) {
  if (lockedThrough && statementDate <= lockedThrough) {
    throw new LoanConflictError(
      `The books are closed through ${lockedThrough}, so a statement dated ${statementDate} cannot be recorded.`,
    );
  }
}
