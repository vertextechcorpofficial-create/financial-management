import { amountToCents, centsToAmount, installmentStatus, loanTotals, type LoanInstallment } from "./loan-schedule";

export type LoanSource<T> =
  | { state: "ready"; data: T }
  | { state: "unavailable"; message: string };

type PostingReference = { journalId: number; journalNo: string; date: string; postedAt: string };
type Allocation = { installmentId: number; principal: string; interest: string; penalty: string };

export type LoanMovement = PostingReference & {
  id: number;
  kind: "PAYMENT" | "OFFSET";
  channel: "OTC" | "PAYROLL" | "CLEARANCE";
  reference: string;
  reversesId: number | null;
  allocations: Allocation[];
};

export type LoanLedger = {
  release: PostingReference & { upfrontInterest?: string; netProceeds?: string };
  installments: Array<LoanInstallment & { id: number }>;
  movements: LoanMovement[];
};

export function repaymentBusinessDate(ledger: LoanLedger, receiptDate: string, today: string) {
  const latest = [
    ...ledger.movements.map(item => item.date),
    ...ledger.installments.flatMap(item => [
      item.accrualProcessedOn ? item.dueDate : "",
      item.penaltyAssessedOn ?? "",
    ]),
  ].reduce((last, date) => date > last ? date : last, ledger.release.date);
  return receiptDate < latest ? today : receiptDate;
}

export type LoanStatementTotals = {
  opening: string;
  released: string;
  paid: string;
  penaltiesPaid: string;
  offsets: string;
  waivedInterest?: string;
  closing: string;
};

export type LoanStatementActivity = {
  key: string;
  date: string;
  kind: "Release" | "Payment" | "Payment reversal" | "Clearance offset" | "Offset reversal" | "Unearned interest removed" | "Interest waiver reversal";
  channel: LoanMovement["channel"] | null;
  reference: string;
  journalNo: string;
  reversesJournalNo: string | null;
  amount: string;
  upfrontInterest?: string;
  netProceeds?: string;
};

function ordered(movements: LoanMovement[]) {
  return [...movements].sort((a, b) => a.date.localeCompare(b.date) || a.postedAt.localeCompare(b.postedAt) ||
    Number(a.reversesId !== null) - Number(b.reversesId !== null) || a.journalId - b.journalId || a.id - b.id);
}

// Replay the recorded installments and allocations instead of relying on today's paid flags.
export function projectLoanLedger(ledger: LoanLedger, asOf: string) {
  if (ledger.release.date > asOf) return { installments: [], ...loanTotals([], asOf), principal: "0.00" };
  const amounts = new Map(ledger.installments.map(installment => [
    installment.id, { principal: 0n, interest: 0n, penalty: 0n },
  ]));
  const reversed = new Set<number>();
  const originals = new Map<number, LoanMovement>();
  for (const movement of ordered(ledger.movements)) {
    if (movement.date > asOf) break;
    if (movement.date < ledger.release.date) throw new Error("Loan activity predates the release.");
    if (movement.reversesId !== null) {
      const original = originals.get(movement.reversesId);
      if (!original || original.kind !== movement.kind || reversed.has(original.id)) {
        throw new Error("Loan reversal has no matching original posting.");
      }
      reversed.add(original.id);
    } else {
      originals.set(movement.id, movement);
    }
    const sign = movement.reversesId === null ? 1n : -1n;
    for (const allocation of movement.allocations) {
      const applied = amounts.get(allocation.installmentId);
      if (!applied) throw new Error("Loan allocation does not belong to the schedule.");
      applied.principal += sign * amountToCents(allocation.principal);
      applied.interest += sign * amountToCents(allocation.interest);
      applied.penalty += sign * amountToCents(allocation.penalty);
    }
  }
  let principal = 0n;
  const installments = ledger.installments.map(installment => {
    const paid = amounts.get(installment.id)!;
    const originalPrincipal = amountToCents(installment.principal);
    const waiver = installment.settlementWaiver;
    const waived = waiver && waiver.date <= asOf && (!waiver.reversedOn || waiver.reversedOn > asOf)
      ? amountToCents(waiver.amount) : 0n;
    const originalInterest = amountToCents(installment.interest) - waived;
    if (paid.principal < 0n || paid.interest < 0n || paid.penalty < 0n || paid.principal > originalPrincipal || paid.interest > originalInterest) {
      throw new Error("Posted loan allocations do not reconcile to the schedule.");
    }
    principal += originalPrincipal - paid.principal;
    const projected = {
      ...installment, paidTotal: centsToAmount(paid.principal + paid.interest),
      paidPrincipal: centsToAmount(paid.principal), paidInterest: centsToAmount(paid.interest), penaltyPaid: centsToAmount(paid.penalty),
      interest: centsToAmount(originalInterest), total: centsToAmount(originalPrincipal + originalInterest),
      penaltyAssessed: installment.penaltyAssessedOn && installment.penaltyAssessedOn > asOf ? "0.00" : installment.penaltyAssessed,
    };
    return { ...projected, status: installmentStatus(projected) };
  });
  return { installments, ...loanTotals(installments, asOf), principal: centsToAmount(principal) };
}

export function loanStatementForPeriod(ledger: LoanLedger, from: string, to: string) {
  const activity: LoanStatementActivity[] = [];
  const contracted = ledger.installments.reduce((total, row) => total + amountToCents(row.total), 0n);
  const { release } = ledger;
  let opening = release.date < from ? contracted : 0n;
  const released = release.date >= from && release.date <= to ? contracted : 0n;
  let paid = 0n;
  let penaltiesPaid = 0n;
  let offsets = 0n;
  let waivedInterest = 0n;
  if (released > 0n) {
    activity.push({
      key: "release-" + release.journalId, date: release.date, kind: "Release",
      channel: null, reference: release.journalNo, journalNo: release.journalNo, reversesJournalNo: null,
      amount: centsToAmount(released),
      ...(release.netProceeds !== undefined ? { netProceeds: release.netProceeds, upfrontInterest: release.upfrontInterest } : {}),
    });
  }
  const originals = new Map(ledger.movements.map(movement => [movement.id, movement]));
  for (const movement of ordered(ledger.movements)) {
    if (movement.date > to) break;
    const sign = movement.reversesId === null ? 1n : -1n;
    const installmentPart = sign * movement.allocations.reduce((total, row) => total + amountToCents(row.principal) + amountToCents(row.interest), 0n);
    const penaltyPart = sign * movement.allocations.reduce((total, row) => total + amountToCents(row.penalty), 0n);
    if (movement.date < from) {
      opening -= installmentPart;
      continue;
    }
    const isOffset = movement.kind === "OFFSET";
    if (isOffset) offsets += installmentPart;
    else paid += installmentPart;
    penaltiesPaid += penaltyPart;
    const original = movement.reversesId === null ? undefined : originals.get(movement.reversesId);
    activity.push({
      key: "movement-" + movement.id, date: movement.date,
      kind: isOffset ? (original ? "Offset reversal" : "Clearance offset") : (original ? "Payment reversal" : "Payment"),
      channel: movement.channel, reference: movement.reference, journalNo: movement.journalNo,
      reversesJournalNo: original?.journalNo ?? null, amount: centsToAmount(installmentPart + penaltyPart),
    });
  }
  for (const installment of ledger.installments) {
    const waiver = installment.settlementWaiver;
    if (!waiver) continue;
    const changes = [{ date: waiver.date, amount: amountToCents(waiver.amount), kind: "Unearned interest removed" as const },
      ...(waiver.reversedOn ? [{ date: waiver.reversedOn, amount: -amountToCents(waiver.amount), kind: "Interest waiver reversal" as const }] : [])];
    for (const change of changes) {
      if (change.date > to) continue;
      if (change.date < from) opening -= change.amount;
      else {
        waivedInterest += change.amount;
        activity.push({ key: `interest-waiver-${installment.id}-${change.kind}`, date: change.date, kind: change.kind,
          channel: "CLEARANCE", reference: waiver.reference, journalNo: "", reversesJournalNo: null, amount: centsToAmount(change.amount) });
      }
    }
  }
  const closing = projectLoanLedger(ledger, to).remaining;
  if (opening + released - paid - offsets - waivedInterest !== amountToCents(closing)) {
    throw new Error("Loan statement movements do not reconcile to the closing balance.");
  }
  return {
    totals: {
      opening: centsToAmount(opening), released: centsToAmount(released), paid: centsToAmount(paid),
      penaltiesPaid: centsToAmount(penaltiesPaid), offsets: centsToAmount(offsets), closing,
      ...(waivedInterest ? { waivedInterest: centsToAmount(waivedInterest) } : {}),
    } satisfies LoanStatementTotals,
    activity,
  };
}
