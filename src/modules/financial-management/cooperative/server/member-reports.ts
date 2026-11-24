import "server-only";

import { createHash } from "node:crypto";
import { z } from "zod";
import { monthPeriod } from "../console/reports/report-dates";
import { reportLoanStatuses, reportMenu, reportPageSize, reportRecordTypes, sectionPageParams, type ReportColumn, type ReportResult,
  type MemberReportKey, type ReportPage, type ReportRow, type ReportSection } from "../console/reports/types";
import { isCalendarDate, MEMBER_STATUS_LABEL, savingsKindLabel, statusText } from "../members/format";
import { loanActivityChannels, loanStatementColumns, statementPeriods } from "../members/statement";
import type { DocumentRequirement, MemberRegisterStatus, StatementPeriod } from "../members/types";
import { transactionChannels } from "../transactions/entries";
import { getAuditReport } from "./audit-report";
import { getCollectionsReport } from "./collections-report";
import { readDirectusItems } from "./directus";
import { getDocumentReport, type ComplianceSource } from "./document-compliance-report";
import { getTrialBalanceReport } from "./ledger-report";
import { getLoanReport } from "./loan-reports";
import { readMemberLoans, type MemberLoanView } from "./loans";
import { MemberError } from "./member-errors";
import { memberLoanBalances, readMemberLoanStatement } from "./member-loans";
import { amountToCents, membershipDocumentStatus, memberRegisterStatus, readMemberPages, readStatementMember, readVosEmployeeDirectory,
  signedCentsToAmount, todayManila } from "./member-read";
import { readSavingsPeriodTotals, readSavingsStatement, statementPeriod } from "./member-statement";
import { getMonthEndReport } from "./month-end-report";
import { reportTotals, type ReportFilters } from "./report-data";

const id = z.coerce.number().int().positive();
const decimal = z.union([z.string(), z.number()]).transform(String).pipe(z.string().regex(/^\d+(?:\.\d{1,2})?$/))
  .transform(value => signedCentsToAmount(amountToCents(value)));
const membership = z.object({
  id, user_id: id, employee_name: z.string(), department_name: z.string().nullable(),
  status: z.enum(["ACTIVE", "SEPARATED"]), joined_at: z.iso.date(), savings_per_cutoff: decimal, savings_balance: decimal,
});
const choice = membership.pick({ user_id: true, employee_name: true, department_name: true });
const agreement = z.object({ id, membership_id: id, agreement_no: z.string() });
const file = z.object({ id: z.string(), owner_id: id, document_type_id: id });
const type = z.object({ id, name: z.string() });
const rule = z.object({ id, document_type_id: id });
const reportKey = z.enum(["soa", "savings", "roster", "docs", "portfolio", "aging", "collections", "trial-balance", "month-end", "audit"]);
const statuses = z.enum(["MEMBER", "NON_MEMBER", "SEPARATED", ""]);
const loanStatuses = z.enum(Object.keys(reportLoanStatuses) as Array<keyof typeof reportLoanStatuses>).or(z.literal(""));
const recordTypes = z.enum(Object.keys(reportRecordTypes) as Array<keyof typeof reportRecordTypes>).or(z.literal(""));

type CohortRow = {
  userId: number;
  name: string;
  department: string | null;
  status: MemberRegisterStatus;
  member?: z.output<typeof membership>;
};
type Filters = ReportFilters & { status: MemberRegisterStatus | "" };

function pageNumber(value: string | null, pageSize: number) {
  const page = value === null ? 1 : Number(value);
  if (!Number.isSafeInteger(page) || page < 1 || !Number.isSafeInteger(page * pageSize)) {
    throw new MemberError(400, "Choose a valid report page.");
  }
  return page;
}

export async function getReportMemberChoices(params: URLSearchParams) {
  const size = 10;
  const page = pageNumber(params.get("page"), size);
  const term = params.get("q")?.trim().slice(0, 120);
  const filter = term ? { _or: [
    { employee_name: { _icontains: term } },
    { department_name: { _icontains: term } },
    ...(/^[1-9]\d{0,9}$/.test(term) ? [{ user_id: { _eq: Number(term) } }] : []),
  ] } : {};
  const query = new URLSearchParams({ fields: Object.keys(choice.shape).join(","), filter: JSON.stringify(filter),
    sort: "employee_name,user_id", limit: String(size + 1), offset: String((page - 1) * size) });
  const { data } = z.object({ data: choice.array() }).parse(await readDirectusItems("cooperative_memberships", query));
  return { page, hasMore: data.length > size, members: data.slice(0, size).map(row => ({
    id: row.user_id, employeeNumber: String(row.user_id), name: row.employee_name, department: row.department_name,
  })) };
}

const columns: Record<Exclude<MemberReportKey, "docs">, ReportColumn[]> = {
  soa: [{ label: "Date", kind: "date" }, { label: "Particulars" }, { label: "Reference" },
    { label: "Deposit", kind: "money" }, { label: "Withdrawal", kind: "money" }, { label: "Running balance", kind: "money" }],
  savings: [{ label: "Member" }, { label: "Employee no." }, { label: "Department" }, { label: "Current status" },
    { label: "Per cutoff", kind: "money" }, { label: "Opening", kind: "money" }, { label: "Deposits", kind: "money" },
    { label: "Withdrawals", kind: "money" }, { label: "Closing", kind: "money" }],
  roster: [{ label: "Employee" }, { label: "Employee no." }, { label: "Department" }, { label: "Status" },
    { label: "Agreement" }, { label: "Member since", kind: "date" }, { label: "Months", kind: "number" },
    { label: "Documents" }, { label: "Posted savings", kind: "money" }, { label: "Loan balance", kind: "money" }],
};

async function cohort(report: Exclude<MemberReportKey, "soa">, period?: StatementPeriod) {
  const [members, employees] = await Promise.all([
    readMemberPages("cooperative_memberships", membership, {
      sort: "id", filter: period ? { joined_at: { _lte: period.to } } : report === "docs" ? { status: { _eq: "ACTIVE" } } : undefined,
    }),
    report === "roster" ? readVosEmployeeDirectory() : [],
  ]);
  const entries = new Map<number, CohortRow>(employees.map(row => [row.userId, {
    userId: row.userId, name: row.name, department: row.departmentName, status: memberRegisterStatus(undefined, row.active),
  }]));
  for (const row of members) {
    const employee = entries.get(row.user_id);
    entries.set(row.user_id, {
      userId: row.user_id, name: row.employee_name, department: row.department_name ?? employee?.department ?? null,
      status: memberRegisterStatus(row.status, false), member: row,
    });
  }
  return [...entries.values()].sort((a, b) => a.name.localeCompare(b.name, "en-PH") || a.userId - b.userId);
}

async function agreementNumbers(memberIds: number[]) {
  const numbers = new Map<number, string>();
  for (let index = 0; index < memberIds.length; index += 50) {
    const batch = memberIds.slice(index, index + 50);
    const records = await readMemberPages("cooperative_membership_agreements", agreement, {
      sort: "id", filter: { membership_id: { _in: batch } },
    });
    for (const record of records) numbers.set(record.membership_id, record.agreement_no);
  }
  return numbers;
}

async function documentCoverage(memberIds: number[]) {
  const coverage = new Map<number, ReturnType<typeof membershipDocumentStatus>>();
  if (!memberIds.length) return coverage;
  const [types, rules] = await Promise.all([
    readMemberPages("cooperative_document_types", type, { sort: "id", filter: { is_active: { _eq: true } } }),
    readMemberPages("cooperative_policy_document_requirements", rule, {
      sort: "id", filter: { is_active: { _eq: true }, scope: { _eq: "MEMBERSHIP" } },
    }),
  ]);
  const requiredIds = new Set(rules.map(rule => rule.document_type_id));
  const required: DocumentRequirement[] = types.filter(row => requiredIds.has(row.id)).sort((a, b) => a.name.localeCompare(b.name))
    .map(row => ({ documentTypeId: row.id, name: row.name, enforcement: "CHECK" }));
  const present = new Map<number, Set<number>>();
  for (let index = 0; required.length && index < memberIds.length; index += 50) {
    const records = await readMemberPages("cooperative_documents", file, {
      sort: "id", filter: { owner_type: { _eq: "MEMBER" }, owner_id: { _in: memberIds.slice(index, index + 50) },
        removed_at: { _null: true }, document_type_id: { _in: required.map(row => row.documentTypeId) } },
    });
    for (const row of records) {
      const set = present.get(row.owner_id) ?? new Set<number>();
      set.add(row.document_type_id);
      present.set(row.owner_id, set);
    }
  }
  for (const id of memberIds) coverage.set(id, membershipDocumentStatus(required, present.get(id) ?? []));
  return coverage;
}

function monthsSince(from: string, to: string) {
  const [year, month, day] = from.split("-").map(Number);
  const [endYear, endMonth, endDay] = to.split("-").map(Number);
  return Math.max(0, (endYear - year) * 12 + endMonth - month - Number(endDay < day));
}

async function statement(userId: number, period: StatementPeriod): Promise<ReportResult> {
  const member = await readStatementMember(userId);
  if (!member) throw new MemberError(404, "The selected member is unavailable.");
  const [result, loans] = await Promise.all([
    readSavingsStatement(userId, member, period), readMemberLoanStatement(member.id, period.from, period.to),
  ]);
  const sections: ReportSection[] = [];
  if (loans.state === "ready") {
    const { data } = loans;
    sections.push({
      key: "loans", label: "Loans",
      columns: [{ label: "Loan" }, { label: "Product" }, ...loanStatementColumns.map(([, label]) => ({ label, kind: "money" as const }))],
      rows: data.entries.map(loan => ({
        id: loan.id, cells: [loan.loanNo, loan.productName, ...loanStatementColumns.map(([key]) => loan[key] ?? "0.00")],
      })),
      totals: ["Total", null, ...loanStatementColumns.map(([key]) => data.totals[key] ?? "0.00")],
    }, {
      key: "activity", label: "Loan activity",
      columns: [{ label: "Date", kind: "date" }, { label: "Loan" }, { label: "Activity" }, { label: "Channel" },
        { label: "Reference" }, { label: "Journal" }, { label: "Reverses journal" }, { label: "Amount", kind: "money" }],
      rows: data.activity.map(row => ({ id: row.key, cells: [
        row.date, row.loanNo, row.kind, row.channel ? loanActivityChannels[row.channel] : null, row.reference,
        row.journalNo || null, row.reversesJournalNo, row.amount,
      ] })),
      totals: [],
    });
  }
  return {
    columns: columns.soa, departments: [],
    metadata: [
      ["Member", result.member.name], ["Employee no.", result.member.employeeNumber], ["Department", result.member.department ?? "—"],
      ["Membership agreement", result.member.agreementNo ?? "—"], ["Status", statusText(result.member.status)],
      ["From", result.from], ["To", result.to],
    ],
    opening: [period.from, "Opening balance", null, null, null, result.openingBalance],
    rows: result.entries.map(row => ({ id: row.id, cells: [row.entryDate, savingsKindLabel[row.kind], row.reference, row.deposit, row.withdrawal, row.runningBalance] })),
    totals: [period.to, "Closing balance", null, result.deposits, result.withdrawals, result.closingBalance],
    sections,
    notices: loans.state === "ready" ? [] : [{ label: "Loans and loan activity", state: loans.state, message: loans.message }],
  };
}

async function selectMembers(key: Exclude<MemberReportKey, "soa">, filters: Filters, period?: StatementPeriod) {
  const all = await cohort(key, period);
  const departments = [...new Set(all.flatMap(row => row.department ? [row.department] : []))].sort((a, b) => a.localeCompare(b, "en-PH"));
  const scoped = all.filter(row => (!filters.department || row.department === filters.department) && (!filters.status || row.status === filters.status));
  const memberIds = (rows: CohortRow[]) => rows.flatMap(row => row.member ? [row.member.id] : []);
  const agreements = key !== "savings" ? await agreementNumbers(memberIds(scoped)) : new Map<number, string>();
  const matches = scoped.filter(row => !filters.q || [row.name, String(row.userId), row.member ? agreements.get(row.member.id) : undefined]
    .some(value => value?.toLocaleLowerCase("en-PH").includes(filters.q)));
  return { departments, matches, agreements, ids: memberIds(matches) };
}

async function membershipCompliance(filters: ReportFilters): Promise<ComplianceSource> {
  const { departments, matches, agreements, ids } = await selectMembers("docs", { ...filters, status: "" });
  const documents = await documentCoverage(ids);
  return { departments, records: matches.map(row => {
    const id = row.member!.id;
    return { id, name: row.name, department: row.department, reference: agreements.get(id) ?? null, ...documents.get(id)! };
  }) };
}

async function memberReport(key: "savings" | "roster", filters: Filters, day: string, period?: StatementPeriod): Promise<ReportResult> {
  const { departments, matches, agreements, ids } = await selectMembers(key, filters, period);
  const result = { columns: columns[key], metadata: [] as Array<[string, string]>, departments };

  if (period) {
    const amounts = await readSavingsPeriodTotals(ids, period);
    const sum = { perCutoff: 0n, opening: 0n, deposits: 0n, withdrawals: 0n, closing: 0n };
    const rows = matches.map(row => {
      const member = row.member!;
      const totals = amounts.get(member.id)!;
      sum.perCutoff += amountToCents(member.savings_per_cutoff);
      sum.opening += amountToCents(totals.openingBalance);
      sum.deposits += amountToCents(totals.deposits);
      sum.withdrawals += amountToCents(totals.withdrawals);
      sum.closing += amountToCents(totals.closingBalance);
      return { id: row.userId, cells: [
        row.name, String(row.userId), row.department, MEMBER_STATUS_LABEL[row.status], member.savings_per_cutoff,
        totals.openingBalance, totals.deposits, totals.withdrawals, totals.closingBalance,
      ] };
    });
    return { ...result, rows, totals: ["Total", null, null, null,
      ...[sum.perCutoff, sum.opening, sum.deposits, sum.withdrawals, sum.closing].map(signedCentsToAmount)] };
  }

  const [documents, loans] = await Promise.all([
    documentCoverage(ids).catch(() => null),
    ids.length ? readMemberLoans(ids, day) : { state: "ready" as const, data: [] },
  ]);
  const notices: NonNullable<ReportResult["notices"]> = [];
  const byMember = new Map<number, MemberLoanView[]>();
  if (loans.state === "ready") {
    for (const view of loans.data) {
      const group = byMember.get(view.loan.memberId) ?? [];
      group.push(view);
      byMember.set(view.loan.memberId, group);
    }
  } else {
    notices.push({ label: "Loan balances", state: loans.state, message: loans.message });
  }
  if (!documents) notices.push({ label: "Membership documents", state: "unavailable", message: "Document requirements could not be checked." });
  const rows = matches.map(row => {
    const member = row.member;
    const docs = member ? documents?.get(member.id) : undefined;
    const loanBalance = member && loans.state === "ready" ? memberLoanBalances(byMember.get(member.id) ?? []).loanBalance : null;
    return { id: row.userId, cells: [
      row.name, String(row.userId), row.department, MEMBER_STATUS_LABEL[row.status],
      member ? agreements.get(member.id) ?? null : null, member?.joined_at ?? null,
      member ? monthsSince(member.joined_at, day) : null, docs ? docs.onFile + " of " + docs.required : null,
      member?.savings_balance ?? null, loanBalance,
    ] };
  });
  const totals = reportTotals(columns.roster, rows);
  if (loans.state !== "ready") totals[totals.length - 1] = null;
  return { ...result, rows, totals, notices };
}

function portfolioRange(params: URLSearchParams) {
  const from = params.get("from") || "";
  const to = params.get("to") || "";
  if ((from && !isCalendarDate(from)) || (to && !isCalendarDate(to)) || (from && to && from > to)) {
    throw new MemberError(422, "Enter a valid release date range.");
  }
  return { from, to };
}

export async function getMemberReport(params: URLSearchParams) {
  const key = reportKey.safeParse(params.get("report"));
  if (!key.success) throw new MemberError(400, "Choose an available report.");
  const report = key.data;
  const page = pageNumber(params.get("page"), reportPageSize);
  const day = todayManila();
  const common = {
    q: (params.get("q") ?? "").trim().slice(0, 120).toLocaleLowerCase("en-PH"),
    department: (params.get("department") ?? "").trim().slice(0, 160),
  };
  const detailPages = {
    loans: report === "soa" ? pageNumber(params.get(sectionPageParams.loans), reportPageSize) : 1,
    activity: report === "soa" ? pageNumber(params.get(sectionPageParams.activity), reportPageSize) : 1,
    remittances: report === "month-end" ? pageNumber(params.get(sectionPageParams.remittances), reportPageSize) : 1,
  };
  let result: ReportResult;
  let selection: unknown;
  if (report === "trial-balance" || report === "audit") {
    const defaults = statementPeriods(day)[report === "audit" ? "This month" : "Last month"];
    const period = statementPeriod(new URLSearchParams({
      from: params.get("from") ?? defaults.from, to: params.get("to") ?? defaults.to,
    }));
    if (report === "trial-balance") {
      selection = period;
      result = await getTrialBalanceReport(period);
    } else {
      const actor = params.get("actorId") || "";
      const action = params.get("action") || "";
      if (actor && !/^(0|[1-9]\d{0,9})$/.test(actor)) throw new MemberError(400, "Choose a valid actor.");
      if (action && !/^[A-Z][A-Z0-9_]{0,63}$/.test(action)) throw new MemberError(400, "Choose a valid audit action.");
      const filters = { actorId: actor ? Number(actor) : undefined, action, q: common.q };
      selection = [period, filters];
      result = await getAuditReport(period, filters);
    }
  } else if (report === "month-end") {
    const month = params.get("month") ?? statementPeriods(day)["Last month"].to.slice(0, 7);
    const period = monthPeriod(month);
    if (!period || month >= day.slice(0, 7)) throw new MemberError(422, "Choose a completed Manila calendar month.");
    selection = period;
    result = await getMonthEndReport(period);
  } else if (report === "soa") {
    const userId = params.get("member");
    if (!userId || !/^[1-9]\d{0,9}$/.test(userId)) throw new MemberError(422, "Select a member for the statement.");
    const period = statementPeriod(params);
    selection = [userId, period];
    result = await statement(Number(userId), period);
  } else if (report === "portfolio" || report === "aging" || report === "collections") {
    const requestedProduct = params.get("product");
    const product = requestedProduct ? id.safeParse(requestedProduct) : null;
    if (product && !product.success) throw new MemberError(400, "Choose a valid loan product.");
    const filters = { ...common, product: product?.data ?? null };
    if (report === "collections") {
      const channel = z.enum(transactionChannels).or(z.literal("")).safeParse(params.get("channel") ?? "");
      if (!channel.success) throw new MemberError(400, "Choose a valid payment channel.");
      const range = statementPeriod(new URLSearchParams({
        from: params.get("from") ?? day.slice(0, 4) + "-01-01", to: params.get("to") ?? day,
      }));
      selection = [filters, channel.data, range];
      result = await getCollectionsReport({ ...filters, channel: channel.data }, range);
    } else {
      const status = loanStatuses.safeParse(report === "portfolio" ? params.get("status") ?? "" : "");
      if (!status.success) throw new MemberError(400, "Choose a valid loan status.");
      const range = report === "portfolio" ? portfolioRange(params) : { from: "", to: "" };
      selection = [filters, status.data, range];
      result = await getLoanReport(report, { ...filters, ...range, status: status.data }, day);
    }
  } else if (report === "docs") {
    const recordType = recordTypes.safeParse(params.get("recordType") ?? "");
    if (!recordType.success) throw new MemberError(400, "Choose a valid record type.");
    selection = [common, recordType.data];
    result = await getDocumentReport(common, recordType.data, () => membershipCompliance(common));
  } else {
    const status = statuses.safeParse(params.get("status") ?? "");
    if (!status.success || (report === "savings" && status.data === "NON_MEMBER")) {
      throw new MemberError(400, "Choose a valid membership status.");
    }
    const filters = { ...common, status: status.data };
    const period = report === "savings" ? statementPeriod(params) : undefined;
    selection = [filters, period];
    result = await memberReport(report, filters, day, period);
  }
  const { departments, products, actors, actions, ...content } = result;
  const fingerprint = createHash("sha256").update(JSON.stringify([report, selection, day, content])).digest("hex");
  return { report, page, detailPages, fingerprint, generatedOn: day, ...content, departments, products, actors, actions };
}

function paginate(rows: ReportRow[], page: number) {
  const current = Math.min(page, Math.max(1, Math.ceil(rows.length / reportPageSize)));
  const start = (current - 1) * reportPageSize;
  return { rows: rows.slice(start, start + reportPageSize), page: current, count: rows.length, pageSize: reportPageSize };
}

export function reportPage(result: Awaited<ReturnType<typeof getMemberReport>>): ReportPage {
  const { rows, page, sections, detailPages, ...rest } = result;
  return { ...rest, ...paginate(rows, page),
    sections: sections?.map(section => ({ ...section, ...paginate(section.rows, detailPages[section.key]) })) };
}

export function reportFilename(result: Awaited<ReturnType<typeof getMemberReport>>) {
  return "cooperative-" + reportMenu[result.report].label.toLowerCase().replaceAll(" ", "-") + "-" + result.generatedOn + ".csv";
}
