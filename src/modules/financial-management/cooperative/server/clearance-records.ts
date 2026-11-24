import "server-only";

import { z } from "zod";
import { money } from "../policies/policy-types";

const id = z.number().int().positive();
export const settlementCategory = z.enum(["DIVIDEND", "SAVINGS_OFFSET", "SETTLEMENT_WITHHOLDING", "SETTLEMENT_PAYABLE", "SETTLEMENT_PROVISION"]);
export type SettlementCategory = z.infer<typeof settlementCategory>;
const journal = z.object({ id, number: z.string(), category: settlementCategory, amount: money });
const withdrawal = z.object({ id, reference: z.string(), amount: money });
const loan = z.object({ id, reference: z.string(), debt: money, recovered: money, remaining: money, provision: money });
const allocation = z.object({
  loanId: id, installmentNo: id, source: z.enum(["SAVINGS", "FINAL_PAY"]),
  principal: money, interest: money, penalty: money, total: money,
});

export const settlementRecord = z.object({
  date: z.iso.date(), separationDate: z.iso.date(), postedAt: z.string(), postedBy: id, postedByName: z.string(),
  savingsBefore: money, dividend: money, savingsApplied: money, finalPayApplied: money, debt: money, remaining: money, refund: money,
  annualRate: z.string(), policyRevision: z.number().int().nonnegative(), fingerprint: z.string(),
  loans: loan.array(), withdrawals: withdrawal.array(), allocations: allocation.array(),
  interestWaivers: z.array(z.object({ loanId: id, installmentNo: id, amount: money })),
  documentIds: z.array(z.string()), finalPay: z.object({ amount: money, source: z.enum(["HR", "PAYROLL"]), reference: z.string(), documentId: z.string() }),
  journals: journal.array(),
});
export const settlementReversalRecord = z.object({
  date: z.iso.date(), postedAt: z.string(), postedBy: id, postedByName: z.string(), reason: z.string(), savingsRestored: money,
  loans: z.array(z.object({ id, reference: z.string(), remaining: money })),
  journals: z.array(journal.extend({ originalId: id, originalNumber: z.string() })),
});
export type SettlementRecord = z.infer<typeof settlementRecord>;
export type SettlementReversalRecord = z.infer<typeof settlementReversalRecord>;
