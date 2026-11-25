import "server-only";

import { z } from "zod";
import { centavos } from "../payroll-handoff/contract";
import { expectedDeduction, monthAfter, type MonthlyResult, type PayrollEvidence } from "../loans/monthly-payroll";
import { amountFromCentavos } from "../loans/position";
import type { readMonthlyLoanSchedules } from "./loan-register";
import { readPayrollPages, payrollMoney, type PayrollContract } from "./payroll-month-store";
import { flag, positiveId } from "./request-input";

const runRow = z.object({ payroll_run_id: positiveId, cutoff_end: z.iso.date(), status: z.string(), posted_at: z.string().nullable() });
const employeeRow = z.object({
  id: positiveId, user_id: positiveId, payroll_run_id: positiveId, cutoff_end: z.iso.date(), on_hold: flag,
});
const itemRow = z.object({
  item_id: positiveId, payroll_run_employee_id: positiveId, payroll_run_id: positiveId, user_id: positiveId,
  source_id: positiveId, item_key: z.string(), amount: payrollMoney,
});
export type PayrollRun = z.output<typeof runRow>;
export type PayrollEmployee = z.output<typeof employeeRow>;
export type PayrollItem = z.output<typeof itemRow>;

export async function readPayrollEvidence(contract: PayrollContract) {
  const runIds = [...new Set(contract.cutoffs.flatMap(row => [...row.runIds, ...row.supersededRunIds]))];
  const result: { runs: PayrollRun[]; employees: PayrollEmployee[]; items: PayrollItem[] } = { runs: [], employees: [], items: [] };
  for (let index = 0; index < runIds.length; index += 50) {
    const ids = runIds.slice(index, index + 50);
    result.runs.push(...await readPayrollPages("payroll_run", runRow, Object.keys(runRow.shape).join(","),
      { payroll_run_id: { _in: ids } }, "payroll_run_id"));
    const effective = ids.filter(id => contract.cutoffs.some(cutoff => cutoff.runIds.includes(id)));
    if (!effective.length) continue;
    const [employees, items] = await Promise.all([
      readPayrollPages("payroll_run_employee", employeeRow, Object.keys(employeeRow.shape).join(","),
        { payroll_run_id: { _in: effective } }, "id"),
      readPayrollPages("payroll_run_employee_item", itemRow, Object.keys(itemRow.shape).join(","), {
        payroll_run_id: { _in: effective }, source_table: { _eq: "benefit_loans" },
        item_type: { _eq: "DEDUCTION" }, category: { _eq: "BENEFIT_LOAN" },
      }, "item_id"),
    ]);
    result.employees.push(...employees);
    result.items.push(...items);
  }
  return result;
}

type Schedule = Awaited<ReturnType<typeof readMonthlyLoanSchedules>>[number];
const itemKey = (run: number, id: number) => run + ":" + id;

export function reconcilePayrollEvidence(contract: PayrollContract, schedules: Schedule[], evidence: Awaited<ReturnType<typeof readPayrollEvidence>>) {
  const issues: string[] = [];
  const results: MonthlyResult[] = [];
  const cutoffByRun = new Map<number, string>();
  const cutoffDates = new Set<string>();
  const seenRuns = new Set<number>();
  const runs = new Map(evidence.runs.map(run => [run.payroll_run_id, run]));
  for (const coverage of contract.cutoffs) {
    if (!coverage.cutoff.startsWith(contract.month + "-") || cutoffDates.has(coverage.cutoff)) {
      issues.push("Check the approved Payroll cutoff " + coverage.cutoff + ".");
    }
    cutoffDates.add(coverage.cutoff);
    for (const id of [...coverage.runIds, ...coverage.supersededRunIds]) {
      const run = runs.get(id);
      if (seenRuns.has(id) || run?.cutoff_end !== coverage.cutoff || run.status !== "POSTED" || !run.posted_at) {
        issues.push("Payroll run #" + id + " does not match a unique posted cutoff.");
      }
      seenRuns.add(id);
    }
    for (const id of coverage.runIds) cutoffByRun.set(id, coverage.cutoff);
  }

  const employees = new Map<number, PayrollEmployee>();
  const employeeByRun = new Map<string, PayrollEmployee>();
  const employeesAtCutoff = new Set<string>();
  for (const employee of evidence.employees) {
    if (employee.cutoff_end !== cutoffByRun.get(employee.payroll_run_id)) {
      issues.push("Employee result #" + employee.id + " is outside its approved cutoff.");
      continue;
    }
    const key = employee.cutoff_end + ":" + employee.user_id;
    if (employeesAtCutoff.has(key)) issues.push("Cutoff " + employee.cutoff_end + " has overlapping runs for employee #" + employee.user_id + ".");
    employeesAtCutoff.add(key);
    employees.set(employee.id, employee);
    employeeByRun.set(itemKey(employee.payroll_run_id, employee.user_id), employee);
  }

  const links = new Map<number, Schedule>();
  for (const schedule of schedules) {
    const payrollId = schedule.row.payroll_loan_id;
    if (payrollId === null) continue;
    if (links.has(payrollId)) issues.push("Payroll loan #" + payrollId + " links to more than one verified loan.");
    links.set(payrollId, schedule);
  }

  const items = new Map<string, PayrollEvidence>();
  const regular = new Map<number, PayrollEvidence[]>();
  const final = new Map<number, { entry: PayrollEvidence; balance: string }>();
  const controls = new Map<string, bigint>();
  const observed = new Map<string, bigint>();
  for (const control of contract.employeeControls) {
    const key = itemKey(control.runId, control.employeeId);
    if (controls.has(key) || !employeeByRun.has(key)) issues.push("Check the withholding control for employee #" + control.employeeId + ".");
    controls.set(key, centavos(control.actual));
  }
  for (const item of evidence.items) {
    const employee = employees.get(item.payroll_run_employee_id);
    const loan = links.get(item.source_id);
    const key = itemKey(item.payroll_run_id, item.source_id);
    if (!employee || employee.on_hold || employee.payroll_run_id !== item.payroll_run_id || employee.user_id !== item.user_id ||
      loan?.row.employee_user_id !== item.user_id || item.item_key !== "BL:" + item.source_id || items.has(key)) {
      issues.push("Verify the loan, employee, and run links on Payroll item #" + item.item_id + ".");
      continue;
    }
    const control = itemKey(item.payroll_run_id, item.user_id);
    observed.set(control, (observed.get(control) ?? 0n) + centavos(item.amount));
    items.set(key, { runId: item.payroll_run_id, employeeResultId: employee.id, cutoff: employee.cutoff_end,
      itemId: item.item_id, reference: item.item_key, amount: item.amount });
  }

  const outcomeKeys = new Set<string>();
  for (const outcome of contract.outcomes) {
    const key = itemKey(outcome.runId, outcome.payrollLoanId);
    const loan = links.get(outcome.payrollLoanId);
    const employee = loan && employeeByRun.get(itemKey(outcome.runId, loan.row.employee_user_id));
    const item = items.get(key);
    if (!employee || employee.on_hold || outcomeKeys.has(key) || (outcome.status === "F" && item && centavos(item.amount) !== 0n)) {
      issues.push("Review the " + outcome.status + " result for Payroll loan #" + outcome.payrollLoanId + ".");
      continue;
    }
    outcomeKeys.add(key);
    const entry = { runId: outcome.runId, employeeResultId: employee.id, cutoff: employee.cutoff_end,
      itemId: item?.itemId ?? null, reference: outcome.reference, amount: item?.amount ?? "0.00" };
    if (outcome.status === "X") {
      const separation = loan?.schedule.changes.find(change =>
        change.kind === "SEPARATION" && !change.reversed && change.month <= contract.month);
      const conflictingStop = loan?.schedule.changes.some(change => !change.reversed && change.month <= contract.month &&
        (change.kind === "PAID_DIRECTLY" || change.kind === "RENEWED"));
      const recentSeparation = loan?.schedule.changes.some(change => change.kind === "SEPARATION" && !change.reversed && !!change.instructionId);
      const mismatchedInstruction = (recentSeparation || outcome.instructionId) && (separation?.kind !== "SEPARATION" ||
        separation.instructionId !== outcome.instructionId || separation.balance !== outcome.balance);
      if (mismatchedInstruction || (!separation && conflictingStop) || (!item && !outcome.zeroConfirmed) || final.has(outcome.payrollLoanId) ||
        loan?.history.some(row => row.status === "X" && row.month < contract.month) || centavos(entry.amount) > centavos(outcome.balance)) {
        issues.push("Review the final-pay balance and evidence for Payroll loan #" + outcome.payrollLoanId + ".");
        continue;
      }
      final.set(outcome.payrollLoanId, { entry, balance: outcome.balance });
    } else {
      const history = regular.get(outcome.payrollLoanId) ?? [];
      regular.set(outcome.payrollLoanId, [...history, entry]);
    }
  }
  for (const item of evidence.items) {
    const key = itemKey(item.payroll_run_id, item.source_id);
    const entry = items.get(key);
    if (!entry || entry.itemId !== item.item_id || outcomeKeys.has(key) || centavos(entry.amount) === 0n) continue;
    const history = regular.get(item.source_id) ?? [];
    regular.set(item.source_id, [...history, entry]);
  }

  for (const key of new Set([...controls.keys(), ...observed.keys()])) {
    if ((controls.get(key) ?? -1n) !== (observed.get(key) ?? 0n)) {
      const [run, employee] = key.split(":");
      issues.push("Withholding control differs for employee #" + employee + " in run #" + run + ".");
    }
  }

  for (const loan of schedules) {
    const payrollId = loan.row.payroll_loan_id;
    const payrollKey = payrollId ?? 0;
    const entries = regular.get(payrollKey) ?? [];
    const finalPay = final.get(payrollKey);
    const expected = expectedDeduction(loan.schedule, loan.history, contract.month);
    if (loan.schedule.firstDeductionMonth < contract.month && expected !== "0.00" &&
      (!loan.coveredThrough || loan.coveredThrough < monthAfter(contract.month, -1))) {
      issues.push(loan.reference + " is missing earlier Payroll receipt coverage.");
    }
    if (payrollId === null) {
      if (expected !== "0.00") issues.push(loan.reference + " needs a verified Payroll loan link.");
      continue;
    }
    const actual = entries.reduce((sum, item) => sum + centavos(item.amount), 0n);
    const expectedCents = centavos(expected);
    const first = { loanId: loan.row.id, agencyId: loan.row.agency_id, employeeId: loan.row.employee_user_id,
      payrollLoanId: payrollId, month: contract.month };
    if (finalPay) {
      results.push({ ...first, status: "X", amount: finalPay.entry.amount, expected: finalPay.balance, evidence: [finalPay.entry] });
      if (!entries.length) continue;
    }
    if (!entries.length && expectedCents === 0n) continue;
    if (!entries.length || actual > expectedCents || expectedCents === 0n) {
      issues.push(loan.reference + " needs a confirmed result that agrees with its regular deduction schedule.");
      continue;
    }
    results.push({ ...first, status: actual === 0n ? "F" : actual === expectedCents ? "D" : "P",
      amount: amountFromCentavos(actual), expected,
      evidence: entries.sort((a, b) => a.runId - b.runId || a.reference.localeCompare(b.reference)) });
  }
  return { issues: [...new Set(issues)], results: results.sort((a, b) => a.loanId - b.loanId || a.status.localeCompare(b.status)) };
}
