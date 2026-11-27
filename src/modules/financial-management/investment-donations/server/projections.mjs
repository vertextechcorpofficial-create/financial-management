import { createHash } from "node:crypto";
import { settingsLocks } from "./master-data.mjs";

const token = value => `summary-${createHash("sha256").update(String(value)).digest("hex").slice(0, 16)}`;
const pick = (value, keys) => Object.fromEntries(keys.filter(key => value?.[key] !== undefined).map(key => [key, structuredClone(value[key])]));
const detailedTypes = {
  transactions: null,
  "capital-stock": new Set(["subscribe", "subcollect", "issue", "shareTransfer", "transferShares", "declareDividend", "payDividend", "divdeclare", "divpay", "contribution"]),
  "inflows-investing": new Set(["transfer", "interest", "dividend", "accrue", "receive", "subcollect", "debt", "debtpay"]),
  "portfolio-rebalancing": new Set(["buy", "sell", "fee", "expaccrue", "exppay"]),
  "charitable-giving": new Set(["donation", "grant"]),
  "tax-compliance": new Set(["sell", "donation", "taxpay", "taxadj", "taxtrueup", "subscribe", "issue", "shareTransfer", "declareDividend", "payDividend", "divdeclare", "divpay"]),
};
const safeDataKeys = ["amount", "sym", "acctType", "qty", "price", "fees", "taxClass", "feeBreakdown", "method", "picks",
  "gain", "cost", "stt", "cgt", "tax", "taxForm", "form", "exempt", "deductible", "deductibility", "fmv", "charityId", "orgId", "dafId", "toId", "target",
  "gross", "net", "withheld", "fwt", "fwtRate", "recId", "payDate", "kind", "shares", "holderId", "subId", "certId", "perShare", "recordDate",
  "dst", "dstBase", "base", "rate", "periodClose", "month", "reverses", "cashCommand", "giftCommand", "tradeCommand", "source", "principal", "interest",
  "wht", "donorTax", "annualDonorTax", "capitalCommand", "dividendId", "loanId", "incId", "fromDeposits", "paid", "par", "transferId", "holderType",
  "taxDue", "taxId", "dstRate", "vehicle", "donee", "deductBasis", "fullDeduct", "receipt", "consumed", "lotId", "payments", "valuation", "recordDate", "boardRef"];

/** Aggregates retain account balances but never original IDs, free text or metadata. */
export function aggregateJournal(journal, tagMap = new Map()) {
  const groups = new Map();
  const sourceEntries = new Map(journal.map(row => [row.id, row]));
  for (const entry of journal) {
    const month = entry.date.slice(0, 7);
    const sourceType = entry.type === "reversal" ? sourceEntries.get(entry.data?.reverses)?.type ?? entry.data?.sourceType : undefined;
    const key = `${month}|${entry.type}|${sourceType ?? ""}|${entry.reversedBy ? "reversed" : "active"}|${entry.type === "donation" ? String(entry.data?.exempt) : ""}`;
    const row = groups.get(key) ?? { id: token(key), no: 0, date: `${month}-01`, type: entry.type,
      memo: "Server-aggregated monthly activity", data: sourceType ? { sourceType } : {}, lines: [], ...(entry.reversedBy ? { reversedBy: "summary-reversal" } : {}) };
    if (entry.type === "donation") {
      row.data.amount = Number(row.data.amount ?? 0) + Number(entry.data?.amount ?? 0);
      row.data.exempt = entry.data?.exempt === true;
    }
    for (const line of entry.lines) {
      const tag = tagMap.get(line.tag) ?? "";
      let target = row.lines.find(item => item.acct === line.acct && item.tag === tag);
      if (!target) { target = { acct: line.acct, tag, dr: 0, cr: 0 }; row.lines.push(target); }
      target.dr = (Math.round(target.dr * 100) + Math.round(line.dr * 100)) / 100;
      target.cr = (Math.round(target.cr * 100) + Math.round(line.cr * 100)) / 100;
    }
    groups.set(key, row);
  }
  return [...groups.values()].sort((a, b) => a.date.localeCompare(b.date)).map((row, index) => ({ ...row, no: index + 1,
    // Netting a single account line avoids double-sided pseudo-journal lines.
    lines: row.lines.flatMap(line => {
      const net = Math.round(line.dr * 100) - Math.round(line.cr * 100);
      return net ? [{ ...line, dr: Math.max(0, net) / 100, cr: Math.max(0, -net) / 100 }] : [];
    }) }));
}

/** Quantity-only summaries allow reconciliation without exposing trading details. */
export function unitSummaries(journal, lots) {
  const lotMap = new Map(lots.map(row => [row.id, row]));
  const entryMap = new Map(journal.map(row => [row.id, row]));
  const groups = new Map();
  const add = (date, sym, acctType, qty) => {
    const key = `${date.slice(0, 7)}|${sym}|${acctType}`;
    const row = groups.get(key) ?? { id: token(`units:${key}`), no: 0, date: `${date.slice(0, 7)}-01`, type: "buy", memo: "Server-aggregated unit movements", lines: [], data: { sym, acctType, qty: 0 } };
    row.data.qty += qty;
    groups.set(key, row);
  };
  for (const entry of journal) {
    const reverse = entry.type === "reversal";
    const source = reverse ? entryMap.get(entry.data?.reverses) : entry;
    if (!source) continue;
    const sign = reverse ? -1 : 1;
    if (source.type === "buy" && typeof source.data.sym === "string" && typeof source.data.acctType === "string" && typeof source.data.qty === "number") add(entry.date, source.data.sym, source.data.acctType, source.data.qty * sign);
    else for (const item of source.data.consumed ?? []) {
      const lot = lotMap.get(item.lotId);
      if (lot) add(entry.date, lot.sym, lot.acctType, -item.qty * sign);
    }
  }
  return [...groups.values()];
}

export function recentLedgerEntries(journal, detailed = false) {
  return [...journal].sort((a, b) => b.date.localeCompare(a.date) || b.no - a.no).slice(0, 6).map(row => ({
    id: detailed ? row.id : token(`recent:${row.id}`), no: row.no, date: row.date, type: row.type,
    memo: detailed ? row.memo : row.type.replace(/([a-z])([A-Z])/g, "$1 $2"),
    lines: detailed ? structuredClone(row.lines) : [], data: { debitTotal: row.lines.reduce((sum, line) => sum + Math.round(line.dr * 100), 0) / 100 },
    ...(row.reversedBy ? { reversedBy: detailed ? row.reversedBy : "summary-reversal" } : {}),
  }));
}

export function projectOverviewAlerts(alerts, registers, { giving = false, inflows = false, capital = false } = {}) {
  const replacements = [
    ...(!giving ? registers.charities.map(row => [row.name, "An organization"]) : []),
    ...(!inflows ? registers.debts.map(row => [row.name, "A loan"]) : []),
    ...(!capital ? registers.subs.map(row => [row.id, "(restricted)"]) : []),
  ].filter(([source]) => source).sort((a, b) => b[0].length - a[0].length);
  return alerts.map(alert => ({ ...alert, text: replacements.reduce((text, [source, replacement]) => text.split(source).join(replacement), alert.text) }));
}

export function projectLedger(workspace, journal, registers) {
  const reconciliation = workspace === "monthly-reconciliation-reconciliator" || workspace === "monthly-reconciliation-approver";
  const policy = Object.fromEntries(Object.entries(registers.policy).map(([key, value]) => [key, typeof value === "number" ? 0 : ""]));
  Object.assign(policy, { fyStart: registers.policy.fyStart, dayCount: registers.policy.dayCount, currency: "PHP", costMethod: "specific", giveMode: "income" });
  const out = {
    corp: { name: registers.corp.name, secReg: "", secRegDate: "", par: 0, authorized: 0, increases: [] }, policy,
    classes: [], securities: {}, priceHist: {}, lots: [], debts: [], holders: [], subs: [], certs: [], transfers: [], dividends: [],
    charities: [], grants: [], periods: {}, recons: {}, review: {}, calls: [], capitalIncreases: [], accountMappings: [], masterRevisions: {}, periodEvents: [],
    settingsLocks: settingsLocks(registers, journal),
  };
  const copy = (...keys) => { for (const key of keys) out[key] = structuredClone(registers[key] ?? out[key]); };
  const financial = workspace !== "policy-targets";
  if (financial) {
    const policyFields = {
      "capital-stock": ["dstIssue", "dstIssueOld", "dstTransfer", "divWhtInd", "divWhtNr", "dayCount"],
      "monthly-reconciliation-reconciliator": [], "monthly-reconciliation-approver": [], "period-close": ["dayCount"], "transactions": [],
    }[workspace];
    if (policyFields) Object.assign(out.policy, pick(registers.policy, policyFields)); else copy("policy");
    out.policy.owner = "";
    out.policy.focusAreas = "";
  }
  if (workspace === "policy-targets") {
    copy("corp", "policy", "classes", "accountMappings", "masterRevisions");
    // The policy form needs reference summaries, not holdings or journal details.
    out.securities = Object.fromEntries(Object.values(registers.securities).map(row => [row.sym, pick(row, ["sym", "name", "cls", "taxClass", "active", "inactive"])]));
    return { journal: [], registers: out };
  }
  const analytics = ["overview", "annual-review"].includes(workspace);
  const investment = analytics || reconciliation || ["inflows-investing", "portfolio-rebalancing", "charitable-giving", "period-close"].includes(workspace);
  if (investment) copy("classes", "securities");
  if (["portfolio-rebalancing", "charitable-giving"].includes(workspace)) copy("lots", "priceHist");
  else if (investment) {
    const positions = new Map();
    for (const lot of registers.lots) {
      const key = `${lot.sym}|${lot.acctType}`;
      const row = positions.get(key) ?? { id: token(key), seq: 0, sym: lot.sym, acctType: lot.acctType, date: "", qty: 0, cost: 0, openQty: 0, openCost: 0, txnId: "" };
      row.qty += lot.openQty;
      row.openQty += lot.openQty;
      row.cost += lot.openCost ?? lot.cost * lot.openQty / lot.qty;
      row.openCost = row.cost;
      positions.set(key, row);
    }
    out.lots = [...positions.values()].filter(row => row.openQty > 0);
  }
  const tagMap = new Map(registers.debts.map(row => [row.id, token(`debt:${row.id}`)]));
  if (analytics) {
    out.corp = { ...pick(registers.corp, ["name", "authorized", "par"]), secReg: "", secRegDate: "", increases: (registers.corp.increases ?? []).map(row => ({ ...row, id: token(row.id), secRef: "SEC increase" })) };
    out.subs = registers.subs.map(row => {
      tagMap.set(row.id, token(row.id));
      return { ...pick(row, ["date", "shares", "price", "kind", "issuedAt", "callDue", "callDate"]), id: token(row.id), holderId: token(row.holderId), incId: row.incId ? token(row.incId) : "", certNo: "", txnId: "" };
    });
    out.certs = registers.certs.map(row => ({ ...pick(row, ["date", "shares", "cancelledAt", "voidedAt"]),
      id: token(row.id), holderId: token(row.holderId), subId: row.subId ? token(row.subId) : "", no: "", certNo: "",
      ...(row.history ? { history: row.history.map(event => ({ date: event.date, action: event.action, transferId: token(event.transferId) })) } : {}) }));
  }
  if (analytics || ["inflows-investing", "period-close"].includes(workspace)) {
    out.debts = registers.debts.map(row => ({ ...row, id: analytics ? tagMap.get(row.id) : row.id,
      name: analytics ? "Loan" : row.name }));
  }
  if (workspace === "capital-stock") copy("corp", "holders", "subs", "certs", "transfers", "dividends", "calls", "capitalIncreases");
  if (workspace === "inflows-investing") {
    copy("subs");
    out.holders = registers.holders.map(row => ({ id: row.id, name: row.name }));
  }
  if (["charitable-giving", "tax-compliance"].includes(workspace)) copy("charities", "grants");
  else if (analytics) out.charities = registers.charities.map(row => ({ ...pick(row, ["id", "isDAF", "donee", "accredUntil", "expenseRatio", "checks"]), name: "Organization", reg: "", jurisdiction: "", focus: "", notes: "" }));
  if (reconciliation || ["overview", "annual-review", "period-close"].includes(workspace)) {
    copy("periods");
    out.periodEvents = (registers.periodEvents ?? []).map(event => ({ ...event, actor: workspace === "period-close" ? event.actor : 0, reason: workspace === "period-close" ? event.reason : null }));
    if (workspace !== "period-close") for (const period of Object.values(out.periods)) { delete period.closedBy; delete period.accruedBy; delete period.reopenReason; }
  }
  if (reconciliation || ["period-close", "overview"].includes(workspace)) {
    copy("recons");
    if (!reconciliation) for (const row of Object.values(out.recons)) { row.notes = {}; row.by = ""; }
  }
  if (workspace === "annual-review") copy("review");
  if (["capital-stock", "portfolio-rebalancing", "charitable-giving"].includes(workspace)) {
    const entities = workspace === "capital-stock" ? ["holders", "calls", "capitalIncreases"] : workspace === "portfolio-rebalancing" ? ["securities", "prices"] : ["charities"];
    out.masterRevisions = pick(registers.masterRevisions, entities);
  }
  if (workspace === "inflows-investing") out.masterRevisions = pick(registers.masterRevisions, ["debts"]);
  const types = detailedTypes[workspace];
  if (workspace === "transactions") {
    return { journal: journal.map(entry => {
      const data = pick(entry.data, safeDataKeys);
      if (Array.isArray(data.payments)) data.payments = data.payments.map(row => pick(row, ["holderId", "gross", "withheld", "cash", "rate", "offsets"]));
      return { ...entry, data };
    }), registers: out };
  }
  if (types) {
    const detailedIds = new Set(journal.filter(entry => types.has(entry.type)).map(row => row.id));
    const isDetailed = entry => detailedIds.has(entry.id) || (entry.type === "reversal" && detailedIds.has(entry.data?.reverses));
    const detailed = journal.filter(isDetailed).map(entry => ({ ...entry,
      memo: workspace === "tax-compliance" ? `${entry.type} JE-${entry.no}` : entry.memo, data: pick(entry.data, safeDataKeys) }));
    // Unrelated activity contributes balances only, never transaction-level details.
    const summary = aggregateJournal(journal.filter(entry => !isDetailed(entry)));
    return { journal: [...detailed, ...summary], registers: out };
  }
  const quantity = reconciliation || ["overview", "period-close"].includes(workspace) ? unitSummaries(journal, registers.lots) : [];
  return { journal: [...aggregateJournal(journal, analytics ? tagMap : new Map()), ...quantity], registers: out };
}
