export const transactionTypes = [
  "SAVINGS_DEPOSIT", "MEMBERSHIP_FEE", "LOAN_RELEASE", "PROCESSING_FEE", "LOAN_PAYMENT",
  "LOAN_PAYMENT_REVERSED", "WITHDRAWAL", "SETTLEMENT_PAYOUT", "SAVINGS_OFFSET", "DIVIDEND", "SAVINGS_DEPOSIT_REVERSED",
] as const;
export const transactionChannels = ["OTC", "PAYROLL", "BANK", "SYSTEM"] as const;
export const transactionDirections = ["IN", "OUT", "NON_CASH"] as const;

export type TransactionType = typeof transactionTypes[number];
export type TransactionChannel = typeof transactionChannels[number];

export const transactionLabels: Record<TransactionType, string> = {
  SAVINGS_DEPOSIT: "Savings deposit", MEMBERSHIP_FEE: "Membership fee", LOAN_RELEASE: "Loan release",
  PROCESSING_FEE: "Loan processing fee", LOAN_PAYMENT: "Loan payment", LOAN_PAYMENT_REVERSED: "Loan payment reversal",
  WITHDRAWAL: "Savings withdrawal", SETTLEMENT_PAYOUT: "Settlement payout",
  SAVINGS_OFFSET: "Savings offset", DIVIDEND: "Dividend", SAVINGS_DEPOSIT_REVERSED: "Savings deposit reversal",
};

export const channelLabels: Record<TransactionChannel, string> = {
  OTC: "Over the counter", PAYROLL: "Payroll remittance", BANK: "Bank transfer", SYSTEM: "System",
};

const direction: Record<TransactionType, typeof transactionDirections[number]> = {
  SAVINGS_DEPOSIT: "IN", MEMBERSHIP_FEE: "IN", LOAN_RELEASE: "OUT", PROCESSING_FEE: "IN",
  LOAN_PAYMENT: "IN", LOAN_PAYMENT_REVERSED: "OUT", WITHDRAWAL: "OUT", SETTLEMENT_PAYOUT: "OUT",
  SAVINGS_OFFSET: "NON_CASH", DIVIDEND: "NON_CASH", SAVINGS_DEPOSIT_REVERSED: "OUT",
};

export type TransactionComponent = {
  memberId: number;
  kind: TransactionType;
  channel: TransactionChannel;
  amount: string;
  receivedOn?: string;
  reference?: string | null;
  sourceReference?: string | null;
  orNo?: string | null;
  loanId?: number;
  paymentId?: number;
};

export function transactionEntries(journal: { id: number; date: string; postedAt: string }, parts: readonly TransactionComponent[]) {
  return parts.map(part => {
    if (!/^\d{1,10}(?:\.\d{1,2})?$/.test(part.amount) || Number(part.amount) <= 0) {
      throw new Error("Expected a positive posted transaction amount.");
    }
    const [whole, fraction = ""] = part.amount.split(".");
    return {
      entry_key: `${journal.id}:${part.kind}:${part.paymentId ?? part.loanId ?? part.memberId}`,
      journal_id: journal.id, membership_id: part.memberId, business_date: journal.date, posted_at: journal.postedAt,
      kind: part.kind, channel: part.channel, direction: direction[part.kind], amount: `${BigInt(whole)}.${fraction.padEnd(2, "0")}`,
      receipt_date: part.receivedOn ?? null, reference: part.reference || null, source_reference: part.sourceReference || null,
      or_no: part.orNo ?? null, loan_id: part.loanId ?? null, payment_id: part.paymentId ?? null,
    };
  });
}
