import { balance, centavos, fiscalDates, type Entry } from "./ledger";
import { certificateActiveAt } from "./certificates";
import { reconciliationLines } from "./reconciliation";
import type { LedgerRegisters } from "./server/registers";
import { INVESTMENT_DONATIONS_WORKSPACES, type WorkspaceKey } from "./workspaces";
import type { ReconciliationRecord } from "./server/reconciliation-access";
import type { ReviewEvent } from "./annual-review";
import { cgtBalance } from "./trades";
import { loanInterest } from "./loans";

type GivingPolicy = { giveMode?: string; netIncome: number; givePct: number; giveFixed?: number; gainsPct?: number };

export function givingTarget(policy: GivingPolicy, entries: readonly Entry[], from: string, to: string) {
  if (policy.giveMode === "fixed") return Math.max(0, policy.giveFixed ?? 0);
  if (policy.giveMode === "gains") {
    const activity = entries.filter(row => row.date >= from && row.date <= to && row.type !== "closing" &&
      !(row.type === "reversal" && (row.data.periodClose || row.data.sourceType === "closing" || entries.some(source => source.id === row.data.reverses && source.type === "closing"))));
    return Math.max(0, centavos(-balance(activity, "4100") * (policy.gainsPct ?? policy.givePct) / 100) / 100);
  }
  return Math.max(0, centavos(policy.netIncome * policy.givePct / 100) / 100);
}

export function capitalSummary(entries: readonly Entry[], registers: LedgerRegisters, date: string) {
  const subs = registers.subs.filter(row => row.date <= date && !("cancelled" in row && row.cancelled));
  const subscribed = subs.reduce((sum, row) => sum + row.shares, 0);
  const amount = subs.reduce((sum, row) => sum + centavos(row.shares * row.price), 0) / 100;
  const unpaid = subs.reduce((sum, row) => sum + balance(entries, "3020", row.id, date), 0);
  const issued = registers.certs.filter(row => certificateActiveAt(row, date)).reduce((sum, row) => sum + row.shares, 0);
  const pending = subs.filter(row => !row.issuedAt || row.issuedAt > date).reduce((sum, row) => sum + row.shares, 0);
  const authorizedAtDate = registers.corp.increases.filter(row => row.date <= date).sort((a, b) => b.date.localeCompare(a.date))[0]?.to ??
    registers.corp.increases.slice().sort((a, b) => a.date.localeCompare(b.date))[0]?.from ?? registers.corp.authorized;
  return { authorized: authorizedAtDate, subscribed, amount, paid: amount - unpaid, unpaid, issued, outstanding: issued + pending,
    checks: [
      { label: "At least 25% of authorized shares subscribed", ok: subscribed >= authorizedAtDate * 0.25 },
      { label: "At least 25% of subscriptions paid", ok: amount > 0 && amount - unpaid >= amount * 0.25 },
      { label: "Subscriptions within authorized capital", ok: subscribed <= authorizedAtDate },
      { label: "Certificates for all fully paid subscriptions", ok: subs.every(row => balance(entries, "3020", row.id, date) > 0 || Boolean(row.issuedAt && row.issuedAt <= date)) },
      ...registers.corp.increases.filter(row => row.date <= date).flatMap(increase => {
        const related = subs.filter(row => row.incId === increase.id);
        const shares = related.reduce((sum, row) => sum + row.shares, 0);
        const total = related.reduce((sum, row) => sum + centavos(row.shares * row.price), 0) / 100;
        const paid = total - related.reduce((sum, row) => sum + balance(entries, "3020", row.id, date), 0);
        return [{ label: `${increase.secRef}: 25% of increase subscribed`, ok: shares >= (increase.to - increase.from) * 0.25 },
          { label: `${increase.secRef}: 25% of increase subscriptions paid`, ok: total > 0 && paid >= total * 0.25 }];
      }),
    ] };
}

export function charitableDeduction(entries: readonly Entry[], registers: LedgerRegisters, from: string, to: string) {
  const policy = registers.policy as LedgerRegisters["policy"] & { itemizes?: string; taxableIncome?: number; deductCap?: number; marginalRate?: number };
  let full = 0, limited = 0;
  const gifts = entries.filter(row => row.type === "donation" && !row.reversedBy && row.date >= from && row.date <= to);
  for (const gift of gifts) {
    const org = registers.charities.find(row => row.id === gift.data.charityId);
    if (!org) continue;
    const basis = centavos(Number(gift.data.deductBasis ?? gift.data.amount));
    if (gift.data.fullDeduct === true || (gift.data.fullDeduct !== false && gift.data.exempt === true)) full += basis;
    else if (org.donee !== "none" || gift.data.deductible === true) limited += basis;
  }
  const itemized = policy.itemizes !== "no" && policy.itemizes !== "osd";
  const limit = centavos(Math.max(0, policy.taxableIncome ?? 0) * (policy.deductCap ?? 5) / 100);
  const deductible = itemized ? full + Math.min(limited, limit) : 0;
  return { full: full / 100, limited: limited / 100, limit: limit / 100, deductible: deductible / 100,
    saving: centavos(deductible / 100 * (policy.marginalRate ?? 25) / 100) / 100, itemized };
}

export function giftCandidates(registers: LedgerRegisters, date: string) {
  return registers.lots.filter(lot => lot.acctType === "Taxable" && lot.date <= date && lot.openQty > 0).flatMap(lot => {
    const security = registers.securities[lot.sym];
    if (!security || security.price * lot.openQty <= (lot.openCost ?? lot.cost * lot.openQty / lot.qty)) return [];
    const cost = lot.openCost ?? lot.cost * lot.openQty / lot.qty;
    const fairValue = centavos(security.price * lot.openQty) / 100;
    const policy = registers.policy as LedgerRegisters["policy"] & { sttRateOld?: number; sttRate?: number; cgtUnlisted?: number };
    const tax = security.taxClass === "listed" ? fairValue * (date < "2025-07-01" ? policy.sttRateOld ?? 0.6 : policy.sttRate ?? 0.1) / 100 :
      security.taxClass === "unlisted" ? Math.max(0, fairValue - cost) * (policy.cgtUnlisted ?? 15) / 100 : 0;
    return [{ lot, security, cost, fairValue, gain: fairValue - cost, tax: centavos(tax) / 100,
      giftDeduction: cost, cashDeduction: centavos(fairValue - tax) / 100 }];
  });
}

export function periodChecklist(month: string, entries: readonly Entry[], registers: LedgerRegisters, today: string,
  signed?: { snap: Record<string, number>; cash: Record<string, number | string | null>; units: Record<string, number | string | null> }) {
  const end = new Date(`${month}-01T00:00:00Z`);
  if (!Number.isFinite(+end)) return [];
  end.setUTCMonth(end.getUTCMonth() + 1, 0);
  const through = end.toISOString().slice(0, 10);
  const previous = new Date(`${month}-01T00:00:00Z`);
  previous.setUTCMonth(previous.getUTCMonth() - 1);
  const first = entries.map(row => row.date.slice(0, 7)).sort()[0];
  const historical = registers.recons[month];
  const snapshot = signed ?? (historical?.at ? historical : undefined);
  const unchanged = Boolean(snapshot && !reconciliationLines(month, entries, registers.lots, snapshot).some(row => row.changed));
  let accrued = false;
  try { accrued = registers.debts.filter(debt => !("cancelled" in debt && debt.cancelled)).every(debt =>
    centavos(loanInterest(entries, debt, through, registers.policy.dayCount)) === 0); }
  catch { /* Invalid loan settings must not make the close checklist pass. */ }
  return [
    { label: "The month has ended", required: true, ok: through < today },
    { label: "Previous month is closed", required: true, ok: month === first || Boolean(registers.periods[previous.toISOString().slice(0, 7)]?.closedAt) },
    { label: "Reconciliation signed and unchanged", required: true, ok: unchanged },
    { label: "Month-end accruals posted (or none needed)", required: true, ok: accrued },
    { label: "Income receivable reviewed", required: false, ok: ["1200", "1210"].every(code => Math.abs(balance(entries, code, undefined, through)) < 0.005) },
    { label: "BIR payments and returns reviewed", required: false, ok: Math.abs(balance(entries, "2200", undefined, through)) < 0.005 },
    { label: "Month-end prices recorded for holdings", required: false, ok: registers.lots.filter(lot => lot.date <= through && lot.openQty > 0)
      .every(lot => registers.securities[lot.sym]?.priceDate?.slice(0, 7) === month) },
  ];
}

export function donorYear(entries: readonly Entry[], year: string, rate: number, exemption: number) {
  let cumulative = 0;
  return entries.filter(row => row.type === "donation" && !row.reversedBy && row.date.startsWith(year) && !row.data.exempt)
    .sort((a, b) => a.date.localeCompare(b.date) || a.no - b.no).map(row => {
      const before = Math.max(0, cumulative - centavos(exemption));
      cumulative += centavos(Number(row.data.amount));
      const tax = Math.round((Math.max(0, cumulative - centavos(exemption)) - before) * rate / 100) / 100;
      return { entry: row, cumulative: cumulative / 100, tax };
    });
}

export function fiscalActivity(entries: readonly Entry[], date: string, startMonth: number) {
  const { from, to } = fiscalDates(date, startMonth);
  const closingIds = new Set(entries.filter(row => row.type === "closing").map(row => row.id));
  return entries.filter(row => row.date >= from && row.date <= to && row.type !== "closing" &&
    !(row.type === "reversal" && (row.data.periodClose || row.data.sourceType === "closing" || closingIds.has(String(row.data.reverses)))));
}

export function annualReviewEvidence(entries: readonly Entry[], registers: LedgerRegisters, fiscalStart: string,
  documents: Record<string, DocumentEvidence> | null, recons: readonly ReconciliationRecord[] | null) {
  const fy = fiscalDates(fiscalStart, registers.policy.fyStart);
  const activity = fiscalActivity(entries, fiscalStart, registers.policy.fyStart);
  const sources = new Map(entries.map(row => [row.id, row]));
  const funding = activity.filter(row => ["subscribe", "subcollect", "contribution"].includes(row.type === "reversal" ?
    String(sources.get(String(row.data.reverses))?.type ?? row.data.sourceType) : row.type));
  const raised = ["1000", "1010", "1020"].reduce((sum, account) => sum + balance(funding, account), 0);
  let reconciled = 0;
  for (let month = new Date(`${fy.from}T00:00:00Z`); month.toISOString().slice(0, 10) <= fy.to; month.setUTCMonth(month.getUTCMonth() + 1)) {
    const key = month.toISOString().slice(0, 7);
    const live = recons?.find(row => row.month_start.slice(0, 7) === key);
    const historic = registers.recons[key];
    const signed = live?.signed_at ? live.payload : !live && historic?.at ? historic : null;
    if (signed && !reconciliationLines(key, entries, registers.lots, signed).some(row => row.changed)) reconciled++;
  }
  const gifts = entries.filter(row => row.type === "donation" && !row.reversedBy && row.date >= fy.from && row.date <= fy.to);
  const missing = gifts.filter(row => requiredDonationDocs(row, documents?.[row.id]).some(doc => !doc.ok)).length;
  const target = givingTarget(registers.policy, entries, fy.from, fy.to);
  const capitalTarget = Number(registers.policy.savingsTarget ?? 0);
  const format = (amount: number) => amount.toLocaleString("en-PH", { style: "currency", currency: "PHP" });
  const portfolio = registers.lots.reduce((sum, row) => sum + row.openQty * (registers.securities[row.sym]?.price ?? 0), 0);
  const drift = registers.classes.filter(group => {
    const amount = registers.lots.filter(row => registers.securities[row.sym]?.cls === group.id).reduce((sum, row) => sum + row.openQty * (registers.securities[row.sym]?.price ?? 0), 0);
    return portfolio > 0 && Math.abs(amount / portfolio * 100 - group.target) > group.band;
  }).length;
  return [
    `${format(raised)} raised against the ${format(capitalTarget)} annual target; ${reconciled}/12 months signed and unchanged`,
    `${format(-balance(activity, "4100"))} realized gain/loss; ${format(balance(activity, "5100"))} fees; ${drift} classes currently outside policy bands`,
    `${giftCandidates(registers, new Date().toISOString().slice(0, 10)).length} currently held taxable lots with gains`,
    `${format(balance(activity, "5000"))} given; ${format(target)} target; ${missing} gifts with missing documents`,
    `Policy effective ${registers.policy.effectiveDate}; allocation targets total ${registers.classes.reduce((sum, row) => sum + row.target, 0)}%`,
  ];
}

type DocumentEvidence = { reference?: string; status?: string; documents?: { cert?: boolean; f1800?: boolean; deed?: boolean } };
export function requiredDonationDocs(entry: Entry, evidence?: DocumentEvidence) {
  const receipt = entry.data.receipt as { cert?: boolean; f1800?: boolean; deed?: boolean } | undefined;
  const form = entry.data.exempt ? { key: "cert" as const, label: "Certificate of Donation (Form 2322)",
    ok: evidence?.documents?.cert ?? Boolean(receipt?.cert) } : { key: "f1800" as const,
    label: "Donor's tax return filed (Form 1800)", ok: evidence?.documents?.f1800 ?? Boolean(evidence?.status === "filed-manually" || receipt?.f1800) };
  return [form, ...(entry.data.consumed ? [{ key: "deed" as const, label: "Deed and securities transfer confirmation",
    ok: evidence?.documents?.deed ?? Boolean(receipt?.deed) }] : [])];
}
export function buildOverviewAlerts(entries: readonly Entry[], registers: LedgerRegisters,
  documents: Record<string, DocumentEvidence> | null = {}, recons: readonly ReconciliationRecord[] | null = [],
  reviews: readonly ReviewEvent[] | null = [], asOf = new Date().toISOString().slice(0, 10)) {
  const output: { text: string; href: string }[] = [];
  const add = (key: WorkspaceKey, text: string) => output.push({ text, href: INVESTMENT_DONATIONS_WORKSPACES.find(row => row.key === key)!.path });
  const after = (days: number) => new Date(Date.parse(`${asOf}T00:00:00Z`) + days * 86400000).toISOString().slice(0, 10);
  const policy = registers.policy;
  const fy = fiscalDates(asOf, policy.fyStart);
  const values = registers.classes.map(group => registers.lots.filter(lot => lot.openQty > 0 && registers.securities[lot.sym]?.cls === group.id)
    .reduce((sum, lot) => sum + lot.openQty * registers.securities[lot.sym].price, 0));
  const total = values.reduce((sum, value) => sum + value, 0);
  registers.classes.forEach((group, index) => {
    const actual = total ? values[index] / total * 100 : 0;
    if (total && Math.abs(actual - group.target) > group.band) add("portfolio-rebalancing", `${group.name} is outside its allocation band (${actual.toFixed(1)}% vs ${group.target}%).`);
  });
  if (balance(entries, "1010", undefined, asOf) < policy.reserveMonths * policy.monthlyExpenses - 0.005) add("inflows-investing", "The emergency and operating reserve is below policy.");
  if (balance(entries, "1020", undefined, asOf) < policy.liquidityNeed - 0.005) add("inflows-investing", "The short-term liquidity reserve is below policy.");
  registers.debts.filter(row => row.rate > policy.debtThreshold && !row.scheduled && balance(entries, "2000", row.id, asOf) < -0.005)
    .forEach(row => add("inflows-investing", `${row.name}: high-interest debt has no payoff schedule.`));
  const docs = documents ?? {};
  const taxTags = new Set<string>();
  for (const entry of entries) {
    for (const line of entry.lines.filter(line => line.acct === "2200" && line.cr > 0)) {
      if (taxTags.has(line.tag) || balance(entries, "2200", line.tag, asOf) >= -0.005) continue;
      taxTags.add(line.tag);
      const due = String(entry.data.taxDue ?? "");
      if (due && due <= after(10)) add("tax-compliance", `Form ${String(entry.data.taxForm ?? "BIR")}: ${due < asOf ? "overdue" : "due within 10 days"} (${due}).`);
    }
  }
  for (const gift of entries.filter(row => row.type === "donation" && !row.reversedBy)) {
    const evidence = docs[gift.id];
    const required = requiredDonationDocs(gift, evidence);
    if (!gift.data.exempt && !required[0].ok) add("tax-compliance", `JE-${gift.no}: donor's tax return (Form 1800) is not recorded as filed.`);
    if (required.some(row => !row.ok)) add("charitable-giving", `JE-${gift.no}: donation documentation is incomplete.`);
  }
  registers.charities.forEach(org => {
    if (!Object.values(org.checks).every(value => value && value <= asOf)) add("charitable-giving", `${org.name}: organization vetting is incomplete.`);
    if (org.donee === "accredited" && org.accredUntil && org.accredUntil <= after(60)) add("charitable-giving", `${org.name}: accreditation ${org.accredUntil < asOf ? "expired" : "expires within 60 days"} (${org.accredUntil}).`);
  });
  for (const row of entries.filter(row => row.type === "accrue" && !row.reversedBy && row.data.payDate && String(row.data.payDate) < asOf)) {
    const tag = String(row.data.recId ?? row.id);
    if (balance(entries, row.data.kind === "Interest" ? "1210" : "1200", tag, asOf) > 0.005) add("inflows-investing", `JE-${row.no}: income receivable is past its expected payment date.`);
  }
  const target = givingTarget(policy, entries, fy.from, fy.to);
  const given = balance(fiscalActivity(entries, asOf, policy.fyStart), "5000");
  if (given < target - 0.005) add("charitable-giving", `${(target - given).toLocaleString("en-PH", { style: "currency", currency: "PHP" })} remains against the giving target.`);
  const first = entries.map(row => row.date.slice(0, 7)).sort()[0];
  if (first) for (let date = new Date(`${first}-01T00:00:00Z`); date.toISOString().slice(0, 7) < asOf.slice(0, 7); date.setUTCMonth(date.getUTCMonth() + 1)) {
    const month = date.toISOString().slice(0, 7);
    const live = recons?.find(row => row.month_start.slice(0, 7) === month);
    const historic = registers.recons[month];
    const signed = live?.signed_at ? live.payload : !live && historic?.at ? historic : null;
    if (!signed) add("monthly-reconciliation-reconciliator", `${month}: reconciliation has not been signed.`);
    else if (reconciliationLines(month, entries, registers.lots, signed).some(row => row.changed)) add("monthly-reconciliation-reconciliator", `${month}: reconciliation changed after sign-off.`);
    if (!registers.periods[month]?.closedAt) add("period-close", `${month}: period is not closed.`);
  }
  registers.subs.filter(row => !("cancelled" in row && row.cancelled) && row.callDue &&
    Date.parse(`${asOf}T00:00:00Z`) - Date.parse(`${row.callDue}T00:00:00Z`) > 30 * 86400000 && balance(entries, "3020", row.id, asOf) > 0.005)
    .forEach(row => add("capital-stock", `Subscription ${row.id}: unpaid balance is delinquent.`));
  const previousDate = new Date(`${fy.from}T00:00:00Z`);
  previousDate.setUTCDate(previousDate.getUTCDate() - 1);
  const previous = fiscalDates(previousDate.toISOString().slice(0, 10), policy.fyStart);
  const cgt = cgtBalance(entries, previous.from, previous.to, policy.cgtUnlisted);
  if (cgt.due !== cgt.booked) add("tax-compliance", `Form 1707-A for the financial year ended ${previous.to} needs a true-up review.`);
  const reviewYears = new Set(entries.filter(row => row.date <= asOf).map(row => fiscalDates(row.date, policy.fyStart).from));
  for (const start of reviewYears) {
    const year = Number(start.slice(0, 4)) + (policy.reviewMonth + 1 < policy.fyStart ? 1 : 0);
    const deadline = new Date(Date.UTC(year, policy.reviewMonth + 1, 0)).toISOString().slice(0, 10);
    if (asOf > deadline && !reviews?.some(row => row.fiscal_start === start && row.action === "sign")) add("annual-review-preparer", `The annual SOP review for the financial year starting ${start} is overdue.`);
  }
  if (centavos(balance(entries)) !== 0) add("transactions", "The trial balance is out of balance.");
  return output;
}
