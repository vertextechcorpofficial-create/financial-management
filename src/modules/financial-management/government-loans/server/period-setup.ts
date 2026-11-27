import "server-only";

import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import { todayManila } from "@/modules/financial-management/cooperative/members/format";
import { centavos } from "../payroll-handoff/contract";
import { expectedDeduction, monthAfter } from "../loans/monthly-payroll";
import { amountFromCentavos } from "../loans/position";
import type { AgencyActor } from "./agencies";
import {
  GOVERNMENT_LOAN_AGENCIES, GOVERNMENT_LOAN_BILLING_REVISIONS, GOVERNMENT_LOAN_CHANGE_INSTRUCTIONS,
  GOVERNMENT_LOAN_CLOSES, GOVERNMENT_LOAN_PAYROLL_HANDOFFS, GOVERNMENT_LOAN_PAYROLL_RECEIPTS,
  GOVERNMENT_LOAN_PAYROLL_RESULTS, GOVERNMENT_LOAN_REMITTANCES, GOVERNMENT_LOAN_REQUESTS,
  GOVERNMENT_LOAN_SETTINGS, GOVERNMENT_LOAN_SETUP_EVENTS, GovernmentLoansDirectusError,
  readGovernmentLoansItems, writeGovernmentLoansItem,
} from "./directus";
import { readEnrollmentRows } from "./enrollment-sources";
import { readMonthlyLoanSchedules } from "./loan-register";
import { loanCommand } from "./loan-requests";
import { LoanRequestError, positiveId } from "./request-input";
import { readPayrollEvidence, reconcilePayrollEvidence } from "./payroll-month-source";
import { payrollContract, payrollMonth, payrollMoney, readPayrollPages, type PayrollContract } from "./payroll-month-store";

const SETTINGS_MISSING = "Government Loans period settings are not installed. Run `node scripts/government-loans/settings-schema.mjs --apply`.";
const SETUP_EVENTS_MISSING = "Government Loans setup events are not installed. Run `node scripts/government-loans/period-setup-schema.mjs --apply`.";
const openRequestStatuses = ["REQUESTED", "APPROVED", "ENROLLED", "VERIFIED", "ACTIVATING", "ACTIVE", "RETURNED"] as const;
const setupAction = z.enum(["INITIALIZE_PERIOD", "CHANGE_PERIOD", "VALIDATE_CONTRACT", "SAVE_CONTRACT", "CLEAR_CONTRACT",
  "PREVIEW_COVERAGE", "SAVE_COVERAGE"]);
type SetupAction = z.output<typeof setupAction>;

const settingsRow = z.object({
  id: positiveId,
  open_month: z.string().nullable(),
  payroll_receipt_contract: z.unknown().nullable(),
});

const setupEventRow = z.object({
  id: z.uuid(), action: z.string(), month: z.string().nullable(), previous_month: z.string().nullable(),
  actor_id: positiveId, actor_name: z.string(), actor_role: z.string().nullable(), recorded_at: z.string(),
  detail: z.unknown(), command_key: z.uuid(), request_hash: z.string(),
});
const setupEventFields = Object.keys(setupEventRow.shape).join(",");

const runRow = z.object({
  payroll_run_id: positiveId, cutoff_end: z.iso.date(), status: z.string(), posted_at: z.string().nullable(),
});
const itemRow = z.object({ payroll_run_id: positiveId, user_id: positiveId, amount: payrollMoney });
const countResult = z.object({ data: z.array(z.object({ count: z.object({ id: z.coerce.number().int().nonnegative() }) })).max(1) });

type Settings = z.output<typeof settingsRow>;
type Counts = {
  receipts: number; closes: number; remittances: number; billingRevisions: number; payrollResults: number;
  openRequests: number; changeInstructions: number; openHandoffs: number;
};
type PostedRun = { id: number; cutoff: string; postedAt: string | null; total: string; employees: number };
type PostedRuns = { cutoffs: { cutoff: string; runs: PostedRun[] }[]; totalRuns: number; totalBenefit: string };

function stable(value: unknown): string {
  if (Array.isArray(value)) return "[" + value.map(stable).join(",") + "]";
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return "{" + Object.keys(record).sort().map(key => JSON.stringify(key) + ":" + stable(record[key])).join(",") + "}";
  }
  return JSON.stringify(value) ?? "null";
}

const digest = (value: unknown) => createHash("sha256").update(typeof value === "string" ? value : stable(value)).digest("hex");

function parseSetup<T>(schema: z.ZodType<T>, body: unknown): T {
  const result = schema.safeParse(body);
  if (result.success) return result.data;
  const issue = result.error.issues[0];
  throw new LoanRequestError(422, issue ? (issue.path.length ? issue.path.join(".") + ": " : "") + issue.message : "Check the setup details.");
}

function openMonthOf(settings: Settings | null) {
  const month = settings?.open_month ?? null;
  return month && payrollMonth.safeParse(month).success ? month : null;
}

async function readSettings(): Promise<Settings | null> {
  try {
    const [row] = await readEnrollmentRows(GOVERNMENT_LOAN_SETTINGS, settingsRow,
      "id,open_month,payroll_receipt_contract", { id: { _eq: 1 } }, 1);
    return row ?? null;
  } catch (error) {
    if (error instanceof GovernmentLoansDirectusError && error.status === 404) throw new LoanRequestError(503, SETTINGS_MISSING);
    throw error;
  }
}

async function ensureSettingsRow(month: string) {
  const current = await readSettings();
  try {
    if (current) await writeGovernmentLoansItem(GOVERNMENT_LOAN_SETTINGS, { open_month: month }, "id", 1);
    else await writeGovernmentLoansItem(GOVERNMENT_LOAN_SETTINGS, { id: 1, open_month: month, payroll_receipt_contract: null }, "id");
  } catch (error) {
    if (error instanceof GovernmentLoansDirectusError && error.status === 404) throw new LoanRequestError(503, SETTINGS_MISSING);
    throw error;
  }
}

async function writeSettingsContract(contract: PayrollContract | null) {
  try {
    await writeGovernmentLoansItem(GOVERNMENT_LOAN_SETTINGS, { payroll_receipt_contract: contract }, "id", 1);
  } catch (error) {
    if (error instanceof GovernmentLoansDirectusError && error.status === 404) throw new LoanRequestError(503, SETTINGS_MISSING);
    throw error;
  }
}

async function count(collection: Parameters<typeof readGovernmentLoansItems>[0], filter: object) {
  const query = new URLSearchParams({ "aggregate[count]": "id", limit: "1", filter: JSON.stringify(filter) });
  const { data } = countResult.parse(await readGovernmentLoansItems(collection, query));
  return data[0]?.count.id ?? 0;
}

async function operationalCounts(month: string | null): Promise<Counts> {
  if (!month) {
    const [closes, openRequests, openHandoffs] = await Promise.all([
      count(GOVERNMENT_LOAN_CLOSES, {}),
      count(GOVERNMENT_LOAN_REQUESTS, { status: { _in: [...openRequestStatuses] } }),
      count(GOVERNMENT_LOAN_PAYROLL_HANDOFFS, { state: { _nin: ["ACCEPTED", "CANCELLED"] } }),
    ]);
    return { receipts: 0, closes, remittances: 0, billingRevisions: 0, payrollResults: 0,
      openRequests, changeInstructions: 0, openHandoffs };
  }
  const [receipts, closes, remittances, billingRevisions, payrollResults, openRequests, changeInstructions, openHandoffs] = await Promise.all([
    count(GOVERNMENT_LOAN_PAYROLL_RECEIPTS, { month: { _eq: month } }),
    count(GOVERNMENT_LOAN_CLOSES, {}),
    count(GOVERNMENT_LOAN_REMITTANCES, { payroll_month: { _eq: month } }),
    count(GOVERNMENT_LOAN_BILLING_REVISIONS, { month: { _eq: month } }),
    count(GOVERNMENT_LOAN_PAYROLL_RESULTS, { month: { _eq: month } }),
    count(GOVERNMENT_LOAN_REQUESTS, { status: { _in: [...openRequestStatuses] } }),
    count(GOVERNMENT_LOAN_CHANGE_INSTRUCTIONS, { effective_month: { _eq: month } }),
    count(GOVERNMENT_LOAN_PAYROLL_HANDOFFS, { state: { _nin: ["ACCEPTED", "CANCELLED"] } }),
  ]);
  return { receipts, closes, remittances, billingRevisions, payrollResults, openRequests, changeInstructions, openHandoffs };
}

function blockersFrom(counts: Counts) {
  const blockers: string[] = [];
  if (counts.receipts) blockers.push(`${counts.receipts} Payroll receipt(s) exist for the current open month.`);
  if (counts.closes) blockers.push("A period has already been closed. Use Month-End Close to advance the period.");
  if (counts.remittances) blockers.push(`${counts.remittances} remittance(s) exist for the current open month.`);
  if (counts.billingRevisions) blockers.push(`${counts.billingRevisions} billing revision(s) exist for the current open month.`);
  if (counts.payrollResults) blockers.push(`${counts.payrollResults} Payroll result(s) exist for the current open month.`);
  if (counts.openRequests) blockers.push(`${counts.openRequests} loan request(s) are still filed or active.`);
  if (counts.changeInstructions) blockers.push(`${counts.changeInstructions} loan-change instruction(s) exist for the current open month.`);
  if (counts.openHandoffs) blockers.push(`${counts.openHandoffs} Payroll handoff(s) are still open.`);
  return blockers;
}

async function postedRuns(month: string): Promise<PostedRuns> {
  const runs = await readPayrollPages("payroll_run", runRow, "payroll_run_id,cutoff_end,status,posted_at",
    { cutoff_end: { _gte: month + "-01", _lt: monthAfter(month) + "-01" }, status: { _eq: "POSTED" }, posted_at: { _nnull: true } },
    "cutoff_end,payroll_run_id");
  if (!runs.length) return { cutoffs: [], totalRuns: 0, totalBenefit: "0.00" };
  const items = await readPayrollPages("payroll_run_employee_item", itemRow, "payroll_run_id,user_id,amount", {
    payroll_run_id: { _in: runs.map(run => run.payroll_run_id) }, source_table: { _eq: "benefit_loans" },
    item_type: { _eq: "DEDUCTION" }, category: { _eq: "BENEFIT_LOAN" },
  }, "payroll_run_id,user_id");
  const totals = new Map<number, { cents: bigint; employees: Set<number> }>();
  for (const item of items) {
    const entry = totals.get(item.payroll_run_id) ?? { cents: 0n, employees: new Set<number>() };
    entry.cents += centavos(item.amount);
    entry.employees.add(item.user_id);
    totals.set(item.payroll_run_id, entry);
  }
  const grouped = new Map<string, PostedRun[]>();
  for (const run of runs) {
    const entry = totals.get(run.payroll_run_id);
    const row: PostedRun = { id: run.payroll_run_id, cutoff: run.cutoff_end, postedAt: run.posted_at,
      total: amountFromCentavos(entry?.cents ?? 0n), employees: entry?.employees.size ?? 0 };
    const cutoff = grouped.get(run.cutoff_end) ?? [];
    cutoff.push(row);
    grouped.set(run.cutoff_end, cutoff);
  }
  const cutoffs = [...grouped].sort(([left], [right]) => left.localeCompare(right))
    .map(([cutoff, rows]) => ({ cutoff, runs: rows.sort((left, right) => left.id - right.id) }));
  const totalCents = cutoffs.flatMap(row => row.runs).reduce((sum, run) => sum + centavos(run.total), 0n);
  return { cutoffs, totalRuns: runs.length, totalBenefit: amountFromCentavos(totalCents) };
}

function contractSummary(contract: PayrollContract) {
  const controlTotal = contract.employeeControls.reduce((sum, control) => sum + centavos(control.actual), 0n);
  return {
    month: contract.month,
    approvalReference: contract.approvalReference,
    cutoffs: contract.cutoffs.map(cutoff => ({ cutoff: cutoff.cutoff, runIds: cutoff.runIds, supersededRunIds: cutoff.supersededRunIds })),
    runIds: [...new Set(contract.cutoffs.flatMap(cutoff => [...cutoff.runIds, ...cutoff.supersededRunIds]))],
    controls: contract.employeeControls.length,
    controlTotal: amountFromCentavos(controlTotal),
    outcomes: contract.outcomes.length,
    outcomeDetails: contract.outcomes.map(outcome => ({
      status: outcome.status,
      payrollLoanId: outcome.payrollLoanId,
      reference: outcome.reference,
      balance: outcome.status === "X" ? outcome.balance : null,
    })),
    refunds: contract.refundPayouts.length,
    settled: contract.settled,
  };
}

function structureErrors(contract: PayrollContract, evidence: Awaited<ReturnType<typeof readPayrollEvidence>>) {
  const errors: string[] = [];
  const runMap = new Map(evidence.runs.map(run => [run.payroll_run_id, run]));
  const seenRuns = new Set<number>();
  const cutoffDates = new Set<string>();
  for (const cutoff of contract.cutoffs) {
    if (!cutoff.cutoff.startsWith(contract.month + "-")) errors.push(`Cutoff ${cutoff.cutoff} is outside ${contract.month}.`);
    if (cutoffDates.has(cutoff.cutoff)) errors.push(`Cutoff ${cutoff.cutoff} is listed more than once.`);
    cutoffDates.add(cutoff.cutoff);
    for (const id of [...cutoff.runIds, ...cutoff.supersededRunIds]) {
      if (seenRuns.has(id)) errors.push(`Payroll run #${id} is listed more than once.`);
      seenRuns.add(id);
      const run = runMap.get(id);
      if (!run) errors.push(`Payroll run #${id} was not found.`);
      else if (run.status !== "POSTED" || !run.posted_at) errors.push(`Payroll run #${id} is not posted.`);
      else if (run.cutoff_end !== cutoff.cutoff) errors.push(`Payroll run #${id} ends on ${run.cutoff_end}, not ${cutoff.cutoff}.`);
    }
  }
  const controlKeys = new Set<string>();
  for (const control of contract.employeeControls) {
    const key = control.runId + ":" + control.employeeId;
    if (controlKeys.has(key)) errors.push(`Withholding control for employee #${control.employeeId} in run #${control.runId} is listed more than once.`);
    controlKeys.add(key);
  }
  const outcomeKeys = new Set<string>();
  for (const outcome of contract.outcomes) {
    const key = outcome.runId + ":" + outcome.payrollLoanId;
    if (outcomeKeys.has(key)) errors.push(`Payroll outcome for loan #${outcome.payrollLoanId} in run #${outcome.runId} is listed more than once.`);
    outcomeKeys.add(key);
  }
  return [...new Set(errors)];
}

function buildCoverage(skeleton: PayrollContract, evidence: Awaited<ReturnType<typeof readPayrollEvidence>>,
  schedules: Awaited<ReturnType<typeof readMonthlyLoanSchedules>>, current: PayrollContract | null): PayrollContract {
  const onHold = new Set(evidence.employees.filter(employee => employee.on_hold)
    .map(employee => employee.payroll_run_id + ":" + employee.user_id));
  const employees = new Map(evidence.employees.map(employee => [employee.payroll_run_id + ":" + employee.user_id, employee]));
  const controls = new Map<string, { runId: number; employeeId: number; cents: bigint }>();
  for (const item of evidence.items) {
    const key = item.payroll_run_id + ":" + item.user_id;
    if (onHold.has(key) || !employees.has(key)) continue;
    const control = controls.get(key) ?? { runId: item.payroll_run_id, employeeId: item.user_id, cents: 0n };
    control.cents += centavos(item.amount);
    controls.set(key, control);
  }
  const itemsByLoan = new Map<number, (typeof evidence.items)[number]>();
  for (const item of evidence.items) {
    const previous = itemsByLoan.get(item.source_id);
    if (!previous || item.payroll_run_id > previous.payroll_run_id) itemsByLoan.set(item.source_id, item);
  }
  const outcomes: PayrollContract["outcomes"] = [];
  for (const schedule of schedules) {
    const payrollLoanId = schedule.row.payroll_loan_id;
    if (payrollLoanId === null) continue;
    const item = itemsByLoan.get(payrollLoanId);
    const employeeRun = evidence.employees.find(employee => employee.user_id === schedule.row.employee_user_id &&
      !employee.on_hold && skeleton.cutoffs.some(cutoff => cutoff.runIds.includes(employee.payroll_run_id)));
    const separation = schedule.schedule.changes.find(change => change.kind === "SEPARATION" && !change.reversed && change.month <= skeleton.month);
    if (separation && separation.kind === "SEPARATION") {
      if (separation.balance == null) continue;
      if (schedule.history.some(row => row.status === "X" && row.month < skeleton.month)) continue;
      const runId = item?.payroll_run_id ?? employeeRun?.payroll_run_id;
      if (runId === undefined) continue;
      outcomes.push({
        status: "X", runId, payrollLoanId, balance: separation.balance,
        reference: item ? "Final-pay deduction in Payroll run #" + item.payroll_run_id : "No final-pay deduction reported",
        ...(separation.instructionId ? { instructionId: separation.instructionId } : {}),
        zeroConfirmed: !item,
      });
      continue;
    }
    if (item || !employeeRun) continue;
    if (expectedDeduction(schedule.schedule, schedule.history, skeleton.month) === "0.00") continue;
    outcomes.push({ status: "F", runId: employeeRun.payroll_run_id, payrollLoanId,
      reference: "No deduction reported in Payroll run #" + employeeRun.payroll_run_id });
  }
  return {
    ...skeleton,
    outcomes,
    employeeControls: [...controls.values()]
      .sort((left, right) => left.runId - right.runId || left.employeeId - right.employeeId)
      .map(control => ({ runId: control.runId, employeeId: control.employeeId, actual: amountFromCentavos(control.cents) })),
    refundPayouts: current && current.month === skeleton.month ? current.refundPayouts : [],
    settled: false,
  };
}

async function validateCoverage(json: string, openMonth: string) {
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    throw new LoanRequestError(422, "The Payroll coverage is not valid JSON.");
  }
  const parsed = payrollContract.safeParse(raw);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    throw new LoanRequestError(422, "The Payroll coverage is invalid" +
      (issue ? `: ${issue.path.join(".") || "contract"} ${issue.message}` : "."));
  }
  const contract = parsed.data;
  if (contract.month !== openMonth) {
    throw new LoanRequestError(422, `The Payroll coverage is for ${contract.month}; the open month is ${openMonth}.`);
  }
  const evidence = await readPayrollEvidence(contract);
  const errors = structureErrors(contract, evidence);
  if (errors.length) throw new LoanRequestError(422, errors.join(" "));
  const schedules = await readMonthlyLoanSchedules(openMonth);
  const reconciliation = reconcilePayrollEvidence(contract, schedules, evidence);
  const warnings = [...new Set(reconciliation.issues)].filter(issue => !errors.includes(issue));
  const contractHash = digest(contract);
  return {
    contract,
    summary: contractSummary(contract),
    warnings,
    contractHash,
    token: digest([openMonth, contractHash]),
  };
}

async function readSetupEvent(command: ReturnType<typeof loanCommand>) {
  try {
    const [row] = await readEnrollmentRows(GOVERNMENT_LOAN_SETUP_EVENTS, setupEventRow, setupEventFields,
      { command_key: { _eq: command.key } }, 1);
    if (!row) return null;
    if (row.actor_id !== command.actor.actorId || row.request_hash !== command.hash) {
      throw new LoanRequestError(409, "This setup key was already used.");
    }
    return row;
  } catch (error) {
    if (error instanceof GovernmentLoansDirectusError && error.status === 404) throw new LoanRequestError(503, SETUP_EVENTS_MISSING);
    throw error;
  }
}

async function writeSetupEvent(action: SetupAction, command: ReturnType<typeof loanCommand>,
  actor: AgencyActor, detail: Record<string, unknown>) {
  const row = {
    id: randomUUID(), action, month: typeof detail.month === "string" ? detail.month : null,
    previous_month: typeof detail.previousMonth === "string" ? detail.previousMonth : null,
    actor_id: actor.actorId, actor_name: actor.actorName, actor_role: actor.actorRole,
    recorded_at: new Date().toISOString(), detail, command_key: command.key, request_hash: command.hash,
  };
  try {
    await writeGovernmentLoansItem(GOVERNMENT_LOAN_SETUP_EVENTS, row, "id");
  } catch (error) {
    const existing = await readSetupEvent(command);
    if (existing) return existing;
    if (error instanceof GovernmentLoansDirectusError && error.code === "RECORD_NOT_UNIQUE") {
      throw new LoanRequestError(409, "Another setup action changed this period. Refresh and review it.");
    }
    throw error;
  }
}

export async function readPeriodSetup() {
  const settings = await readSettings();
  const openMonth = openMonthOf(settings);
  const [counts, agencies, activeLoans, receipts, runs] = await Promise.all([
    operationalCounts(openMonth),
    count(GOVERNMENT_LOAN_AGENCIES, { is_active: { _eq: true } }),
    count(GOVERNMENT_LOAN_REQUESTS, { status: { _eq: "ACTIVE" } }),
    openMonth ? count(GOVERNMENT_LOAN_PAYROLL_RECEIPTS, { month: { _eq: openMonth } }) : 0,
    openMonth ? postedRuns(openMonth) : Promise.resolve({ cutoffs: [], totalRuns: 0, totalBenefit: "0.00" }),
  ]);
  const parsed = settings?.payroll_receipt_contract == null ? null : payrollContract.safeParse(settings.payroll_receipt_contract);
  const contract = parsed?.success ? parsed.data : null;
  const blockers = openMonth ? blockersFrom(counts) : [];
  return {
    installed: true,
    openMonth,
    businessDate: todayManila(),
    settingsInstalled: true,
    contract,
    contractHash: contract ? digest(contract) : null,
    contractMonth: contract?.month ?? null,
    contractMatchesOpenMonth: !!contract && contract.month === openMonth,
    contractError: parsed && !parsed.success ? "The saved Payroll coverage is invalid. Replace it with the approved JSON." : null,
    counts,
    blockers,
    canInitialize: !openMonth,
    canChange: !!openMonth && blockers.length === 0,
    warnings: !openMonth && (counts.openRequests || counts.openHandoffs)
      ? ["Existing loan activity was found without an open month. Confirm the period before continuing."] : [],
    readiness: { agencies, activeLoans, receipts },
    runs,
  };
}

const coverageFields = {
  approvalReference: z.string().trim().min(1, "Enter the Payroll approval reference.").max(200),
  cutoffs: z.array(z.strictObject({ cutoff: z.iso.date(), runIds: z.array(positiveId).min(1).max(100) })).min(1).max(8),
};

const previewCoverageInput = z.strictObject({ action: z.literal("PREVIEW_COVERAGE"), ...coverageFields });
const saveCoverageInput = z.strictObject({
  action: z.literal("SAVE_COVERAGE"), ...coverageFields,
  contractHash: z.string().regex(/^[a-f0-9]{64}$/),
  token: z.string().regex(/^[a-f0-9]{64}$/),
  acknowledgeWarnings: z.boolean().default(false),
  reason: z.string().trim().max(500).default(""),
  expectedOpenMonth: payrollMonth,
  expectedContractHash: z.string().regex(/^[a-f0-9]{64}$/).nullable(),
});

async function coverageForInput(input: { approvalReference: string; cutoffs: { cutoff: string; runIds: number[] }[] },
  openMonth: string, current: PayrollContract | null) {
  const skeleton: PayrollContract = {
    month: openMonth, approvalReference: input.approvalReference,
    cutoffs: input.cutoffs.map(cutoff => ({ ...cutoff, supersededRunIds: [] })),
    outcomes: [], employeeControls: [], refundPayouts: [], settled: false,
  };
  const evidence = await readPayrollEvidence(skeleton);
  const errors = structureErrors(skeleton, evidence);
  if (errors.length) throw new LoanRequestError(422, errors.join(" "));
  const schedules = await readMonthlyLoanSchedules(openMonth);
  const contract = buildCoverage(skeleton, evidence, schedules, current);
  const contractHash = digest(contract);
  const reconciliation = reconcilePayrollEvidence(contract, schedules, evidence);
  const warnings = [...new Set(reconciliation.issues)];
  return { contract, summary: contractSummary(contract), warnings, contractHash, token: digest([openMonth, contractHash]), openMonth };
}

export async function previewPayrollCoverage(body: unknown) {
  const input = parseSetup(previewCoverageInput, body);
  const settings = await readSettings();
  const openMonth = openMonthOf(settings);
  if (!openMonth) throw new LoanRequestError(409, "Initialize the Government Loans open period first.");
  const current = settings?.payroll_receipt_contract == null ? null : payrollContract.safeParse(settings.payroll_receipt_contract);
  const currentContract = current?.success ? current.data : null;
  const result = await coverageForInput(input, openMonth, currentContract);
  return { summary: result.summary, warnings: result.warnings, contractHash: result.contractHash, token: result.token, openMonth };
}

export async function savePayrollCoverage(body: unknown, key: string | null, actor: AgencyActor) {
  const input = parseSetup(saveCoverageInput, body);
  const command = loanCommand(key, input, actor);
  if (await readSetupEvent(command)) return readPeriodSetup();
  const settings = await readSettings();
  const openMonth = openMonthOf(settings);
  if (!openMonth) throw new LoanRequestError(409, "Initialize the Government Loans open period first.");
  if (input.expectedOpenMonth !== openMonth) throw new LoanRequestError(409, "The open month changed. Refresh before saving.");
  const current = settings?.payroll_receipt_contract == null ? null : payrollContract.safeParse(settings.payroll_receipt_contract);
  const currentContract = current?.success ? current.data : null;
  const currentHash = currentContract ? digest(currentContract) : null;
  if (currentHash !== input.expectedContractHash) throw new LoanRequestError(409, "The recorded Payroll coverage changed. Refresh before saving.");
  const result = await coverageForInput(input, openMonth, currentContract);
  if (result.contractHash !== input.contractHash || result.token !== input.token) {
    throw new LoanRequestError(409, "The Payroll coverage changed during review. Review it again.");
  }
  if (result.warnings.length && !input.acknowledgeWarnings) {
    throw new LoanRequestError(422, "Acknowledge the coverage warnings before saving.");
  }
  if (currentContract && currentHash !== result.contractHash && !input.reason) {
    throw new LoanRequestError(422, "Enter a reason for replacing the recorded Payroll coverage.");
  }
  if (result.contractHash === currentHash) return readPeriodSetup();
  await writeSettingsContract(result.contract);
  await writeSetupEvent("SAVE_COVERAGE", command, actor, {
    month: openMonth, previousMonth: openMonth, reason: input.reason,
    contractHash: result.contractHash, previousContractHash: currentHash,
    approvalReference: result.contract.approvalReference, cutoffs: result.summary.cutoffs.map(cutoff => cutoff.cutoff),
    runIds: result.summary.runIds, controls: result.summary.controls, controlTotal: result.summary.controlTotal,
    warnings: result.warnings,
  });
  return readPeriodSetup();
}

const periodInput = z.strictObject({
  action: z.enum(["INITIALIZE_PERIOD", "CHANGE_PERIOD"]),
  month: payrollMonth,
  reason: z.string().trim().max(500).default(""),
  expectedOpenMonth: payrollMonth.nullable(),
});export async function setPeriod(body: unknown, key: string | null, actor: AgencyActor) {
  const input = parseSetup(periodInput, body);
  const command = loanCommand(key, input, actor);
  if (await readSetupEvent(command)) return readPeriodSetup();
  const settings = await readSettings();
  const current = openMonthOf(settings);
  if (current !== input.expectedOpenMonth) throw new LoanRequestError(409, "The open month changed. Refresh before saving.");
  if (current === input.month) return readPeriodSetup();
  if (current) {
    const blockers = blockersFrom(await operationalCounts(current));
    if (blockers.length) throw new LoanRequestError(409, blockers.join(" "));
    if (!input.reason) throw new LoanRequestError(422, "Enter a reason for changing the open month.");
  }
  await ensureSettingsRow(input.month);
  await writeSetupEvent(current ? "CHANGE_PERIOD" : "INITIALIZE_PERIOD", command, actor, {
    month: input.month, previousMonth: current, reason: input.reason, businessDate: todayManila(),
    counts: await operationalCounts(current),
  });
  return readPeriodSetup();
}

const validateInput = z.strictObject({
  action: z.literal("VALIDATE_CONTRACT"),
  json: z.string().min(1).max(256_000),
  fileName: z.string().trim().max(255).optional(),
});

export async function validatePayrollContract(body: unknown) {
  const input = parseSetup(validateInput, body);
  const settings = await readSettings();
  const openMonth = openMonthOf(settings);
  if (!openMonth) throw new LoanRequestError(409, "Initialize the Government Loans open period first.");
  const validated = await validateCoverage(input.json, openMonth);
  return { summary: validated.summary, warnings: validated.warnings, contractHash: validated.contractHash, token: validated.token, openMonth };
}

const saveInput = validateInput.extend({
  action: z.literal("SAVE_CONTRACT"),
  contractHash: z.string().regex(/^[a-f0-9]{64}$/),
  token: z.string().regex(/^[a-f0-9]{64}$/),
  acknowledgeWarnings: z.boolean().default(false),
  reason: z.string().trim().max(500).default(""),
  expectedOpenMonth: payrollMonth,
  expectedContractHash: z.string().regex(/^[a-f0-9]{64}$/).nullable(),
});

export async function savePayrollContract(body: unknown, key: string | null, actor: AgencyActor) {
  const input = parseSetup(saveInput, body);
  const command = loanCommand(key, input, actor);
  if (await readSetupEvent(command)) return readPeriodSetup();
  const settings = await readSettings();
  const openMonth = openMonthOf(settings);
  if (!openMonth) throw new LoanRequestError(409, "Initialize the Government Loans open period first.");
  if (input.expectedOpenMonth !== openMonth) throw new LoanRequestError(409, "The open month changed. Refresh before saving.");
  const current = settings?.payroll_receipt_contract == null ? null : payrollContract.safeParse(settings.payroll_receipt_contract);
  const currentContract = current?.success ? current.data : null;
  const currentHash = currentContract ? digest(currentContract) : null;
  if (currentHash !== input.expectedContractHash) throw new LoanRequestError(409, "The saved Payroll coverage changed. Refresh before saving.");
  const validated = await validateCoverage(input.json, openMonth);
  if (validated.contractHash !== input.contractHash || validated.token !== input.token) {
    throw new LoanRequestError(409, "The Payroll coverage changed during validation. Validate it again.");
  }
  if (validated.warnings.length && !input.acknowledgeWarnings) {
    throw new LoanRequestError(422, "Acknowledge the Payroll coverage warnings before saving.");
  }
  if (currentContract && currentHash !== validated.contractHash && !input.reason) {
    throw new LoanRequestError(422, "Enter a reason for replacing the Payroll coverage.");
  }
  if (validated.contractHash === currentHash) return readPeriodSetup();
  await writeSettingsContract(validated.contract);
  await writeSetupEvent("SAVE_CONTRACT", command, actor, {
    month: openMonth, previousMonth: openMonth, reason: input.reason, fileName: input.fileName ?? null,
    contractHash: validated.contractHash, previousContractHash: currentHash,
    approvalReference: validated.contract.approvalReference, cutoffs: validated.summary.cutoffs.map(cutoff => cutoff.cutoff),
    runIds: validated.summary.runIds, controls: validated.summary.controls, controlTotal: validated.summary.controlTotal,
    warnings: validated.warnings,
  });
  return readPeriodSetup();
}

const clearInput = z.strictObject({
  action: z.literal("CLEAR_CONTRACT"),
  reason: z.string().trim().min(1).max(500),
  expectedOpenMonth: payrollMonth,
  expectedContractHash: z.string().regex(/^[a-f0-9]{64}$/).nullable(),
});

export async function clearPayrollContract(body: unknown, key: string | null, actor: AgencyActor) {
  const input = parseSetup(clearInput, body);
  const command = loanCommand(key, input, actor);
  if (await readSetupEvent(command)) return readPeriodSetup();
  const settings = await readSettings();
  const openMonth = openMonthOf(settings);
  if (!openMonth || openMonth !== input.expectedOpenMonth) throw new LoanRequestError(409, "The open month changed. Refresh before clearing coverage.");
  const current = settings?.payroll_receipt_contract == null ? null : payrollContract.safeParse(settings.payroll_receipt_contract);
  const currentContract = current?.success ? current.data : null;
  const currentHash = currentContract ? digest(currentContract) : null;
  if (currentHash !== input.expectedContractHash) throw new LoanRequestError(409, "The saved Payroll coverage changed. Refresh before clearing it.");
  if (!currentContract) return readPeriodSetup();
  const receipts = await count(GOVERNMENT_LOAN_PAYROLL_RECEIPTS, { month: { _eq: openMonth } });
  if (receipts) throw new LoanRequestError(409, "A Payroll receipt already exists for this month. Replace the coverage instead of clearing it.");
  await writeSettingsContract(null);
  await writeSetupEvent("CLEAR_CONTRACT", command, actor, {
    month: openMonth, previousMonth: openMonth, reason: input.reason, previousContractHash: currentHash,
  });
  return readPeriodSetup();
}

export async function runPeriodSetup(body: unknown, key: string | null, actor: AgencyActor) {
  const action = z.object({ action: setupAction }).safeParse(body);
  if (!action.success) throw new LoanRequestError(422, "Choose a setup action.");
  switch (action.data.action) {
    case "INITIALIZE_PERIOD":
    case "CHANGE_PERIOD":
      return setPeriod(body, key, actor);
    case "VALIDATE_CONTRACT":
      return validatePayrollContract(body);
    case "SAVE_CONTRACT":
      return savePayrollContract(body, key, actor);
    case "PREVIEW_COVERAGE":
      return previewPayrollCoverage(body);
    case "SAVE_COVERAGE":
      return savePayrollCoverage(body, key, actor);
    case "CLEAR_CONTRACT":
      return clearPayrollContract(body, key, actor);
  }
  throw new LoanRequestError(422, "Choose a setup action.");
}
