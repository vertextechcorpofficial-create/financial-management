import "server-only";

import { z } from "zod";
import { todayManila } from "@/modules/financial-management/cooperative/members/format";
import { eligibleHire } from "../loans/lifecycle";
import { projectLoanPosition } from "../loans/position";
import type { AgencyActor } from "./agencies";
import { readEnrollmentRows } from "./enrollment-sources";
import { pendingRefundLoanIds, readOpenLoanMonth } from "./loan-changes";
import { readMonthlyLoanSchedules } from "./loan-register";
import { loanCommand, loanCommandPartKey } from "./loan-requests";
import { nextPeriodCommand } from "./period-commands";
import { employeeName } from "./request-assessment";
import { LoanRequestError, pageNumber, parseInput, positiveId } from "./request-input";
import { employeeFilter, personFields, staffEmployee, readStaffEvents, saveStaffEvent, staffEventReplay } from "./staff-events";

const personView = (person: z.output<typeof staffEmployee>) => ({
  id: person.user_id, name: employeeName(person), hiredOn: person.user_dateOfHire, separationOn: person.separation_date,
});
const query = z.object({ mode: z.enum(["hires", "exits"]).default("hires"), page: pageNumber,
  q: z.string().trim().max(100).default(""), employee: positiveId.optional() });
const pageSize = 25;

async function readPerson(id: number) {
  const [person] = await readEnrollmentRows("user", staffEmployee, personFields,
    { ...employeeFilter, user_id: { _eq: id } }, 1);
  if (!person) throw new LoanRequestError(404, "Employee could not be found.");
  return personView(person);
}

export async function readDeclaredTransferEmployee(id: number) {
  const person = await readPerson(id);
  if (!person.hiredOn) return undefined;
  const [declaration] = await readStaffEvents({ event_key: { _eq: "declaration:" + id + ":" + person.hiredOn } }, 1);
  return declaration?.detail.hasLoans === true ? { id: person.id, name: person.name, department: null } : undefined;
}

async function clearanceLoans(id: number, month: string) {
  const loans = await readMonthlyLoanSchedules(month, id);
  const pending = await pendingRefundLoanIds(loans.map(loan => loan.row.id));
  return loans.map(loan => clearanceLoan(loan, pending, month));
}

type ScheduleRow = Awaited<ReturnType<typeof readMonthlyLoanSchedules>>[number];
function clearanceLoan(loan: ScheduleRow, pending: Set<number>, month: string) {
  const { status, active } = projectLoanPosition({ ...loan.schedule, openMonth: month, businessDate: todayManila(),
    deductions: loan.history, statement: null, coveredThrough: loan.coveredThrough });
  const refundPending = pending.has(loan.row.id);
  const finalPay = loan.history.filter(result => result.status === "X").at(-1);
  return { loanId: loan.row.id, reference: loan.reference, agency: loan.agency, status, refundPending,
    blocked: active || refundPending, finalPay: finalPay ? { expected: finalPay.expected, withheld: finalPay.amount } : null };
}

async function exitLoanIndex(month: string) {
  const schedules = await readMonthlyLoanSchedules(month);
  const pending = await pendingRefundLoanIds(schedules.map(loan => loan.row.id));
  const byEmployee = new Map<number, ReturnType<typeof clearanceLoan>[]>();
  for (const loan of schedules) {
    const rows = byEmployee.get(loan.row.employee_user_id) ?? [];
    rows.push(clearanceLoan(loan, pending, month));
    byEmployee.set(loan.row.employee_user_id, rows);
  }
  return byEmployee;
}

const eventKey = (mode: "hires" | "exits", id: number, date: string) => (mode === "hires" ? "declaration:" : "clearance:") + id + ":" + date;
export async function listOnboardingExits(params: URLSearchParams) {
  const { mode, page, q, employee } = parseInput(query, Object.fromEntries(params));
  if (employee !== undefined) {
    const person = await readPerson(employee);
    const date = mode === "hires" ? person.hiredOn : person.separationOn;
    const [record] = date ? await readStaffEvents({ event_key: { _eq: eventKey(mode, employee, date) } }, 1) : [];
    const loans = mode === "exits" ? record?.detail.loans ?? await clearanceLoans(employee, await readOpenLoanMonth()) : [];
    return { person, record: record ?? null, loans };
  }
  const today = todayManila();
  const first = new Date(Date.parse(today) - 150 * 86_400_000).toISOString().slice(0, 10);
  const search = q ? q.split(/\s+/).map(part => ({ _or: [
    { user_fname: { _icontains: part } }, { user_mname: { _icontains: part } }, { user_lname: { _icontains: part } },
    ...(/^[1-9]\d{0,9}$/.test(part) ? [{ user_id: { _eq: Number(part) } }] : []),
  ] })) : [];
  const filter = { ...employeeFilter,
    ...(mode === "hires" ? { user_dateOfHire: { _gte: first, _lte: today } } : { separation_date: { _nnull: true } }),
    _and: [...employeeFilter._and, ...search],
  };
  const rows = await readEnrollmentRows("user", staffEmployee, personFields, filter, pageSize + 1,
    "user_lname,user_fname,user_id", (page - 1) * pageSize);
  const people = rows.slice(0, pageSize).map(personView);
  const keys = people.flatMap(person => {
    const date = mode === "hires" ? person.hiredOn : person.separationOn;
    return date ? [eventKey(mode, person.id, date)] : [];
  });
  const events = keys.length ? await readStaffEvents({ event_key: { _in: keys } }, keys.length) : [];
  const loanIndex = mode === "exits" ? await exitLoanIndex(await readOpenLoanMonth()) : new Map<number, ReturnType<typeof clearanceLoan>[]>();
  return { items: people.map(person => {
    const event = events.find(row => row.employee_id === person.id);
    return { ...person, status: event?.status ?? null, hasLoans: event?.detail.hasLoans === true,
      loans: loanIndex.get(person.id) ?? [] };
  }), hasMore: rows.length > pageSize };
}

export type OnboardingAttention = {
  hires: { count: number; hasMore: boolean; rows: { id: number; name: string; date: string | null }[] };
  clearances: { count: number; hasMore: boolean; rows: { id: number; name: string; date: string | null }[] };
};

export async function readOnboardingAttention(blockedEmployees: ReadonlySet<number>): Promise<OnboardingAttention> {
  const today = todayManila();
  const first = new Date(Date.parse(today) - 150 * 86_400_000).toISOString().slice(0, 10);
  const limit = 50;
  const [hireRows, exitRows] = await Promise.all([
    readEnrollmentRows("user", staffEmployee, personFields,
      { ...employeeFilter, user_dateOfHire: { _gte: first, _lte: today } }, limit, "user_lname,user_fname,user_id"),
    readEnrollmentRows("user", staffEmployee, personFields,
      { ...employeeFilter, separation_date: { _nnull: true } }, limit, "user_lname,user_fname,user_id"),
  ]);
  const hires = hireRows.slice(0, limit).map(personView);
  const exits = exitRows.slice(0, limit).map(personView);
  const hireKeys = hires.flatMap(person => person.hiredOn ? [eventKey("hires", person.id, person.hiredOn)] : []);
  const exitKeys = exits.flatMap(person => person.separationOn ? [eventKey("exits", person.id, person.separationOn)] : []);
  const keys = [...hireKeys, ...exitKeys];
  const events = [];
  for (let start = 0; start < keys.length; start += 50) {
    events.push(...await readStaffEvents({ event_key: { _in: keys.slice(start, start + 50) } }, 50));
  }
  const eventKeys = new Set(events.map(event => event.event_key));
  const pendingHires = hires.filter(person => !person.hiredOn || !eventKeys.has(eventKey("hires", person.id, person.hiredOn)));
  const pendingClearances = exits.filter(person => !person.separationOn ||
    (!eventKeys.has(eventKey("exits", person.id, person.separationOn)) && !blockedEmployees.has(person.id)));
  return {
    hires: { count: pendingHires.length, hasMore: hireRows.length >= limit,
      rows: pendingHires.slice(0, 3).map(person => ({ id: person.id, name: person.name, date: person.hiredOn })) },
    clearances: { count: pendingClearances.length, hasMore: exitRows.length >= limit,
      rows: pendingClearances.slice(0, 3).map(person => ({ id: person.id, name: person.name, date: person.separationOn })) },
  };
}

const input = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("DECLARE"), employeeId: positiveId, hasLoans: z.boolean(), note: z.string().trim().max(500).default("") }),
  z.object({ kind: z.literal("CLEAR"), employeeId: positiveId }),
]);
export async function recordOnboardingExit(body: unknown, key: string | null, actor: AgencyActor) {
  const data = parseInput(input, body);
  const command = loanCommand(key, { workflow: "onboarding-exits", ...data }, actor);
  const previous = await staffEventReplay(command);
  if (previous) return previous;
  const person = await readPerson(data.employeeId);
  const isDeclaration = data.kind === "DECLARE";
  const date = isDeclaration ? person.hiredOn : person.separationOn;
  if (!date || (isDeclaration && !eligibleHire(date, todayManila()))) {
    throw new LoanRequestError(422, isDeclaration ? "This employee is outside the 150-day declaration window." : "A VOS separation date is required.");
  }
  const indexedKey = eventKey(isDeclaration ? "hires" : "exits", person.id, date);
  const [existing] = await readStaffEvents({ event_key: { _eq: indexedKey } }, 1);
  if (existing) {
    if (data.kind === "DECLARE" && (existing.detail.hasLoans !== data.hasLoans || existing.detail.note !== data.note)) {
      throw new LoanRequestError(409, "A declaration for this hire date is already recorded.");
    }
    return existing;
  }
  const month = await readOpenLoanMonth();
  const period = isDeclaration ? undefined : await nextPeriodCommand(month);
  let snapshot: Record<string, unknown> = { name: person.name, effectiveDate: date };
  if (data.kind === "DECLARE") snapshot = { ...snapshot, hasLoans: data.hasLoans, note: data.note };
  else {
    const loans = await clearanceLoans(person.id, month);
    if (loans.some(loan => loan.blocked)) throw new LoanRequestError(409, "Close or settle every loan and confirm any pending Payroll payout first.");
    if ((await readPerson(person.id)).separationOn !== date || await readOpenLoanMonth() !== month) {
      throw new LoanRequestError(409, "Employee separation details changed. Reload the clearance.");
    }
    snapshot = { ...snapshot, loans, month };
  }
  const id = loanCommandPartKey(command.key, "staff-record");
  return saveStaffEvent(command, { id, reference: id, event_key: indexedKey,
    kind: isDeclaration ? "DECLARATION" : "CLEARANCE", employee_id: person.id, loan_id: null,
    revision: 1, status: isDeclaration ? "DECLARED" : "ISSUED", detail: snapshot }, actor, period);
}
