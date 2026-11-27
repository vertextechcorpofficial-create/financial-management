import { balance, centavos, fiscalDates, type Entry } from "./ledger";
import { givingTarget, fiscalActivity, requiredDonationDocs } from "./analytics";
import { reconciliationLines, reconciliationApprovalError } from "./reconciliation";
import { INVESTMENT_DONATIONS_WORKSPACES, type WorkspaceKey } from "./workspaces";
import type { LedgerRegisters } from "./server/registers";
import type { ReconciliationRecord } from "./server/reconciliation-access";
import type { ReviewEvent } from "./annual-review";
import { latestReviewEvents } from "./annual-review";

export type AttentionAlert = { id: string; code: string; severity: "critical" | "warning" | "info"; title: string; message: string;
  sourceModule: WorkspaceKey; sourceRecordId: string; policyReference: string; link: string; evaluatedAt: string;
  details: Record<string, string | number> };
export type AttentionPayload = { alerts: AttentionAlert[]; unavailable: string[]; evaluatedAt: string;
  allocation: { id: string; name: string; actual: number; target: number; band: number; valueCents: number;
    minimum: number; maximum: number; status: "within" | "near" | "outside" }[] };

// Called only by WorkspacePage with the full authoritative ledger, before projection.
export function evaluateAttention(journal: readonly Entry[], registers: LedgerRegisters,
  documents: Record<string, NonNullable<Parameters<typeof requiredDonationDocs>[1]>> | null,
  recons: readonly ReconciliationRecord[] | null, reviews: readonly ReviewEvent[] | null,
  canView: (key: WorkspaceKey) => boolean, evaluatedAt: string): AttentionPayload {
  const date = evaluatedAt.slice(0, 10);
  const entries = journal.filter(row => row.date <= date);
  const ids = new Set(entries.map(row => row.id));
  const active = entries.filter(row => !row.reversedBy || !ids.has(row.reversedBy));
  const result: AttentionPayload = { alerts: [], unavailable: [], evaluatedAt, allocation: [] };
  const add = (sourceModule: WorkspaceKey, code: string, record: string, severity: AttentionAlert["severity"], title: string,
    message: string, details: AttentionAlert["details"] = {}, query: Record<string, string> = {}) => {
    if (!canView(sourceModule)) return;
    result.alerts.push({ id: `${code}:${record}`, code, severity, title, message, sourceModule, sourceRecordId: record,
      policyReference: code, evaluatedAt, details,
      link: `${INVESTMENT_DONATIONS_WORKSPACES.find(row => row.key === sourceModule)!.path}?${new URLSearchParams(query)}` });
  };
  if (canView("portfolio-rebalancing")) {
    const positions = reconciliationLines(date.slice(0, 7), entries, registers.lots).filter(row => !row.isCash);
    let missingPrice = false;
    const values = registers.classes.map(group => positions.reduce((sum, row) => {
      const symbol = row.key.split("|")[0];
      const security = registers.securities[symbol];
      const historical = registers.priceHist[symbol]?.filter(price => price.date <= date).sort((a, b) => b.date.localeCompare(a.date))[0];
      const price = security?.priceDate && security.priceDate > date ? historical?.price : security?.price;
      if (row.current > 0 && price === undefined) missingPrice = true;
      return sum + (security?.cls === group.id && price !== undefined ? centavos(row.current * price) : 0);
    }, 0));
    const total = values.reduce((a, b) => a + b, 0);
    result.allocation = registers.classes.map((group, index) => {
      const actual = total ? values[index] * 100 / total : 0;
      const minimum = Math.max(0, group.target - group.band);
      const maximum = Math.min(100, group.target + group.band);
      // Bounds are inclusive; the outer 20% of the clipped range is near-edge.
      // A zero-width range is comfortable only at its exact target.
      const edge = (maximum - minimum) * 0.2;
      const status = actual < minimum || actual > maximum ? "outside"
        : edge > 0 && (actual <= minimum + edge || actual >= maximum - edge) ? "near" : "within";
      return { id: group.id, name: group.name, actual, target: group.target, band: group.band,
        valueCents: values[index], minimum, maximum, status };
    });
    if (missingPrice) {
      result.allocation = [];
      result.unavailable.push("Allocation unavailable: a current holding has no price on or before the evaluation date.");
    }
    for (const group of result.allocation) if (total && group.status === "outside")
      add("portfolio-rebalancing", "allocation-band", group.id, "warning", `${group.name} outside policy band`,
        "Allocation exceeds the permitted target range.", { actual: group.actual, target: group.target, minimum: group.minimum, maximum: group.maximum });
  }
  for (const [account, target, label] of [["1010", registers.policy.reserveMonths * registers.policy.monthlyExpenses, "Operating reserve"],
    ["1020", registers.policy.liquidityNeed, "Short-term liquidity"]] as const) {
    const actual = centavos(balance(entries, account));
    if (actual < centavos(target)) add("inflows-investing", "preinvestment-reserve", account, "critical", `${label} below policy`,
      "Restore the required reserve before investing.", { actualCents: actual, targetCents: centavos(target) }, { tab: "2" });
  }
  for (const debt of registers.debts) if (debt.rate > registers.policy.debtThreshold && !debt.scheduled && centavos(balance(entries, "2000", debt.id)) < 0)
    add("inflows-investing", "preinvestment-debt", debt.id, "critical", "High-interest debt needs a payoff schedule", debt.name,
      { actualRate: debt.rate, targetRate: registers.policy.debtThreshold }, { tab: "2" });
  if (canView("charitable-giving")) {
    if (documents === null) result.unavailable.push("Donation document source unavailable; recorded receipt declarations remain visible in the giving workspace.");
    for (const gift of active.filter(row => row.type === "donation")) {
      const missing = requiredDonationDocs(gift, documents?.[gift.id] ?? documents?.[`journal:${gift.no}`]).filter(doc => !doc.ok);
      if (missing.length) add("charitable-giving", "donation-evidence", gift.id, "warning", `JE-${gift.no}: incomplete donation evidence`,
        missing.map(doc => doc.label).join("; "), { verification: "An upload alone is not verified evidence" }, { tab: "0", record: gift.id });
    }
    for (const org of registers.charities) if (Object.keys(org.checks).length !== 3 || !Object.values(org.checks).every(value => value && value <= date))
      add("charitable-giving", "organization-vetting", org.id, "warning", "Organization vetting incomplete", org.name, {}, { tab: "1", record: org.id });
    const fy = fiscalDates(date, registers.policy.fyStart);
    const actual = centavos(balance(fiscalActivity(entries, date, registers.policy.fyStart), "5000"));
    const target = centavos(givingTarget(registers.policy, entries, fy.from, fy.to));
    if (actual < target) add("charitable-giving", "giving-progress", fy.from, date >= fy.to ? "warning" : "info", "Giving target progress",
      "Giving remains below the financial-year target.", { actualCents: actual, targetCents: target, deadline: fy.to });
  }
  const first = entries.map(row => row.date.slice(0, 7)).sort()[0];
  const reconKey = canView("monthly-reconciliation-reconciliator") ? "monthly-reconciliation-reconciliator" : "monthly-reconciliation-approver";
  if (recons === null && canView(reconKey)) result.unavailable.push("Monthly reconciliation source unavailable.");
  if (first) for (const cursor = new Date(`${first}-01T00:00:00Z`); cursor.toISOString().slice(0, 7) < date.slice(0, 7); cursor.setUTCMonth(cursor.getUTCMonth() + 1)) {
    const month = cursor.toISOString().slice(0, 7);
    const live = recons?.find(row => row.month_start.slice(0, 7) === month);
    const historic = registers.recons[month];
    const signed = live?.signed_at ? live.payload : !live && historic?.at ? historic : undefined;
    if (recons !== null && (!signed || reconciliationApprovalError(month, entries, registers.lots, signed)))
      add(reconKey, "monthly-reconciliation", month, "warning", `${month}: reconciliation needs sign-off`,
        signed ? "The signed snapshot is stale or invalid." : "No valid signed reconciliation is recorded.", {}, { month });
    if (!registers.periods[month]?.closedAt) add("period-close", "period-unclosed", month, "warning", `${month}: period remains open`,
      "The completed month has not been closed.", {}, { month });
  }
  for (const sub of registers.subs) if (sub.date <= date && !("cancelled" in sub && sub.cancelled) && sub.callDue &&
    Date.parse(`${date}T00:00:00Z`) - Date.parse(`${sub.callDue}T00:00:00Z`) > 30 * 86400000 && centavos(balance(entries, "3020", sub.id)) > 0)
    add("capital-stock", "subscription-delinquent", sub.id, "warning", "Subscription is delinquent", `Subscription ${sub.id} remains unpaid more than 30 days after the call due date.`,
      { actualCents: centavos(balance(entries, "3020", sub.id)), due: sub.callDue }, { tab: "3", record: sub.id });
  const reviewKey = canView("annual-review-preparer") ? "annual-review-preparer" : "annual-review-approver";
  if (reviews === null && canView(reviewKey)) result.unavailable.push("Annual review source unavailable.");
  if (reviews !== null) for (const start of new Set(entries.map(row => fiscalDates(row.date, registers.policy.fyStart).from))) {
    const year = Number(start.slice(0, 4)) + (registers.policy.reviewMonth + 1 < registers.policy.fyStart ? 1 : 0);
    const due = new Date(Date.UTC(year, registers.policy.reviewMonth + 1, 0)).toISOString().slice(0, 10);
    if (date > due && !latestReviewEvents(reviews.filter(row => row.occurred_at.slice(0, 10) <= date)).some(row => row.fiscal_start === start && row.action === "sign"))
      add(reviewKey, "annual-review-overdue", start, "warning", "Annual SOP review overdue", "The scheduled review has no recorded sign-off.", { deadline: due }, { fiscalStart: start });
  }
  const rank = { critical: 0, warning: 1, info: 2 };
  result.alerts.sort((a, b) => rank[a.severity] - rank[b.severity] || a.id.localeCompare(b.id));
  return result;
}
