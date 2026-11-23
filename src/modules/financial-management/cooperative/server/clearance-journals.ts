import "server-only";

import { z } from "zod";
import type { calculateSettlement } from "../console/clearance/settlement-calculations";
import type { projectLoanLedger, LoanLedger } from "../loans/loan-activity";
import { amountToCents, centsToAmount } from "../loans/loan-schedule";
import type { PolicyState } from "../policies/policy-types";
import { type SettlementCategory } from "./clearance-records";
import { ClearanceError } from "./clearance-store";
import { readDirectusItems } from "./directus";
import { loanPostingAccounts, readLoanJournalLines, readLoanJournalResults, requirePostingAccount, type LoanPostingPair } from "./loan-commands";
import type { MemberLoanView } from "./loans";

export type SettlementAmounts = ReturnType<typeof calculateSettlement>;
export type SettlementAllocation = SettlementAmounts["allocations"][number];
export type ReviewedLoan = { view: MemberLoanView; ledger: LoanLedger; position: ReturnType<typeof projectLoanLedger> };
export type SettlementJournalDraft = { category: SettlementCategory; amount: string; pairs: LoanPostingPair[] };

const balanceIssue = () => new ClearanceError(503, "The loan's posted receivables could not be verified. Review its release and accrual journals.");

async function allowances(ids: number[], policy: PolicyState) {
  const totals = new Map<number, bigint>();
  if (ids.length === 0) return totals;
  const query = new URLSearchParams({
    fields: "id,source_id", limit: "-1", filter: JSON.stringify({
      source_type: { _eq: "LOAN" }, source_id: { _in: ids.map(String) },
      command_type: { _in: ["LOAN_LOSS_PROVISION", "LOAN_LOSS_PROVISION_REVERSED"] },
    }),
  });
  const data = z.object({ data: z.array(z.object({ id: z.number(), source_id: z.coerce.number().int().positive() })) })
    .parse(await readDirectusItems("cooperative_journals", query)).data;
  if (!data.length) return totals;
  const contra = new Set(policy.accounts.filter(account => account.classification === "ASSET" && account.isContra).map(account => account.id));
  const lines = await readLoanJournalLines(data.map(row => row.id));
  for (const row of data) {
    const matched = (lines.get(row.id) ?? []).filter(line => contra.has(line.account_id));
    if (!matched.length) throw balanceIssue();
    const change = matched.reduce((amount, line) => amount + amountToCents(line.credit) - amountToCents(line.debit), 0n);
    totals.set(row.source_id, (totals.get(row.source_id) ?? 0n) + change);
  }
  if ([...totals.values()].some(amount => amount < 0n)) throw balanceIssue();
  return totals;
}

export async function prepareSettlementEntries(reviewed: ReviewedLoan[], amounts: SettlementAmounts, policy: PolicyState) {
  const { funding, dividend } = amounts;
  if (!funding || dividend === null) throw new Error("Settlement amounts are incomplete.");
  const loanAmounts = new Map(amounts.loans.map(loan => [loan.id, loan]));
  const owed = reviewed.filter(({ view }) => loanAmounts.has(view.loan.id));
  const accrualIds = owed.flatMap(({ position }) => position.installments.flatMap(item => item.accrualJournalId ?? []));
  const [lines, receipts, previousAllowance] = await Promise.all([
    readLoanJournalLines([...owed.map(loan => loan.ledger.release.journalId), ...accrualIds]), readLoanJournalResults(accrualIds),
    allowances(amounts.loans.filter(loan => amountToCents(loan.remaining ?? "0.00") > 0n).map(loan => loan.id), policy),
  ]);
  const mapping = loanPostingAccounts(policy);
  const account = (purpose: Parameters<typeof requirePostingAccount>[1]) => requirePostingAccount(mapping, purpose).id;
  const entries = new Map<SettlementCategory, Map<string, { debit: number; credit: number; amount: bigint }>>();
  const provision = new Map<number, string>();
  function add(category: SettlementCategory, value: bigint, accounts: () => [number, number]) {
    if (value <= 0n) return;
    const [debit, credit] = accounts();
    if (debit === credit) throw new ClearanceError(422, "Map different debit and credit accounts for the settlement.");
    const pairs = entries.get(category) ?? new Map();
    const key = `${debit}:${credit}`;
    pairs.set(key, { debit, credit, amount: (pairs.get(key)?.amount ?? 0n) + value });
    entries.set(category, pairs);
  }

  add("DIVIDEND", amountToCents(dividend), () => [account("UNDIVIDED_NET_SURPLUS"), account("MEMBER_SAVINGS")]);
  for (const { view, ledger, position } of owed) {
    const { id, productKind } = view.loan;
    const principalAccount = lines.get(ledger.release.journalId)?.find(line => line.line_no === 1 && amountToCents(line.debit) > 0n);
    const released = ledger.installments.reduce((sum, item) => sum + amountToCents(item.principal), 0n);
    if (!principalAccount || amountToCents(principalAccount.debit) !== released) throw balanceIssue();
    const allocations = amounts.allocations.filter(row => row.loanId === id);
    let residualBooked = amountToCents(position.principal);

    for (const item of position.installments) {
      const originalAccrual = item.accrualJournalId;
      let bookedAccount: number | null = null;
      if (originalAccrual && amountToCents(item.interest) > amountToCents(item.paidInterest)) {
        const restored = z.record(z.string(), z.number()).safeParse(receipts.get(originalAccrual)?.restoredAccrualAccounts);
        const debit = lines.get(originalAccrual)?.find(line => amountToCents(line.debit) > 0n &&
          (restored.success ? line.account_id === restored.data[String(item.id)] : line.line_no === 1));
        if (!debit) throw balanceIssue();
        bookedAccount = debit.account_id;
        residualBooked += amountToCents(item.interest) - amountToCents(item.paidInterest);
      }
      for (const applied of allocations.filter(row => row.installmentNo === item.no)) {
        const category = applied.source === "SAVINGS" ? "SAVINGS_OFFSET" : "SETTLEMENT_WITHHOLDING";
        const debit = () => account(applied.source === "SAVINGS" ? "MEMBER_SAVINGS" : "DUE_FROM_EMPLOYER");
        const principal = amountToCents(applied.principal);
        const interest = amountToCents(applied.interest);
        add(category, principal, () => [debit(), principalAccount.account_id]);
        add(category, interest, () => [debit(), bookedAccount ?? account(productKind === "GOODS" ? "INSTALLMENT_MARKUP_INCOME" : "LOAN_INTEREST_INCOME")]);
        add(category, amountToCents(applied.penalty), () => [debit(), account("PENALTY_INCOME")]);
        residualBooked -= principal + (bookedAccount === null ? 0n : interest);
      }
    }
    const stillOwed = amountToCents(loanAmounts.get(id)?.remaining ?? "0.00");
    if (residualBooked < 0n || residualBooked > stillOwed) throw balanceIssue();
    const net = residualBooked - (previousAllowance.get(id) ?? 0n);
    const required = net > 0n ? net : 0n;
    provision.set(id, centsToAmount(required));
    add("SETTLEMENT_PROVISION", required, () => [account("LOAN_LOSS_PROVISION"), account("LOAN_LOSS_ALLOWANCE")]);
  }
  add("SETTLEMENT_PAYABLE", amountToCents(funding.refund), () => [account("MEMBER_SAVINGS"), account("DUE_TO_DEPARTING_MEMBERS")]);

  const categories: SettlementCategory[] = ["DIVIDEND", "SAVINGS_OFFSET", "SETTLEMENT_WITHHOLDING", "SETTLEMENT_PAYABLE", "SETTLEMENT_PROVISION"];
  const journals: SettlementJournalDraft[] = categories.flatMap(category => {
    const pairs = [...(entries.get(category)?.values() ?? [])];
    if (!pairs.length) return [];
    return [{ category, amount: centsToAmount(pairs.reduce((sum, pair) => sum + pair.amount, 0n)),
      pairs: pairs.map(({ debit, credit, amount }) => ({ debit: { id: debit }, credit: { id: credit }, amount: centsToAmount(amount) })),
    }];
  });
  return { journals, provision };
}
