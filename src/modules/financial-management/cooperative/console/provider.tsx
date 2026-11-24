"use client";

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { createConsoleState } from "./seed";
import { applyPayment, buildSchedule, loanTotals, settlementFor } from "./calculations";
import { round2 } from "./format";
import {
  CONSOLE_TODAY,
  type Clearance,
  type ConsoleState,
  type DocumentOwner,
  type DocumentRecord,
  type Loan,
  type Member,
  type PayMode,
  type PayFrequency,
  type ProductCode,
  type RepaymentMethod,
} from "./types";

export type EnrollLoanInput = {
  memberId: string;
  productCode: ProductCode;
  principal: number;
  rate: number;
  method: RepaymentMethod;
  months: number;
  frequency: PayFrequency;
  mode: PayMode;
  purpose: string;
  item: string | null;
  quantity: number;
  releaseMethod: "payroll" | "cash";
  signed: boolean;
  approveNow: boolean;
};

type LoanDecision = "approve" | "approve-release" | "release" | "reject";

type ConsoleActions = {
  reset: () => void;
  enrollLoan: (input: EnrollLoanInput) => void;
  decideLoan: (loanId: string, decision: LoanDecision) => void;
  postDeposit: (input: { memberId: string; amount: number; channel: "payroll" | "otc"; date: string; reference: string }) => void;
  postPayment: (input: { loanId: string; amount: number; channel: "payroll" | "otc"; date: string; reference: string }) => void;
  decideWithdrawal: (withdrawalId: string, approved: boolean) => void;
  startClearance: (input: { memberId: string; reason: Clearance["reason"]; separationDate: string; finalPay: number; notes: string }) => void;
  updateClearance: (clearanceId: string, patch: Partial<Pick<Clearance, "reason" | "separationDate" | "finalPay" | "notes">>) => void;
  completeClearance: (clearanceId: string) => void;
  cancelClearance: (clearanceId: string) => void;
  addDocument: (input: { ownerType: DocumentOwner; ownerId: string; category: string; name: string; size: number; mime: string }) => void;
  removeDocument: (documentId: string) => void;
};

const ConsoleContext = createContext<{ state: ConsoleState; actions: ConsoleActions } | null>(null);

const pad = (value: number, width = 4) => String(value).padStart(width, "0");
const nextAgreement = (loans: Loan[]) => {
  const max = loans.reduce((value, loan) => {
    const match = /LA-\d{4}-(\d+)/.exec(loan.agreementNo);
    return Math.max(value, match ? Number(match[1]) : 0);
  }, 0);
  return `LA-2026-${pad(max + 1)}`;
};
const nextLoanCode = (loans: Loan[], prefix: string) => {
  const max = loans.reduce((value, loan) => {
    if (!loan.code.startsWith(`${prefix}-`)) return value;
    const match = new RegExp(`^${prefix}-\\d{4}-(\\d+)$`).exec(loan.code);
    return Math.max(value, match ? Number(match[1]) : 0);
  }, 0);
  return `${prefix}-2026-${pad(max + 1)}`;
};

const makeLoan = (
  state: ConsoleState,
  input: EnrollLoanInput,
  status: Loan["status"],
  releaseDate: string | null,
): Loan => {
  const product = state.products.find(entry => entry.code === input.productCode)!;
  const item = product.items.find(entry => entry.id === input.item) ?? null;
  const principal = product.kind === "GOODS" && item
    ? round2(item.price * Math.max(1, input.quantity))
    : round2(input.principal);
  const method = product.kind === "GOODS" ? "markup" : input.method;
  const start = releaseDate ?? CONSOLE_TODAY;
  return {
    id: `L${Date.now()}`,
    code: nextLoanCode(state.loans, product.prefix),
    memberId: input.memberId,
    productCode: input.productCode,
    principal,
    rate: product.kind === "GOODS" ? 0 : input.rate,
    markup: product.markup,
    method,
    months: input.months,
    frequency: input.frequency,
    mode: input.mode,
    purpose: input.purpose,
    item: item ? `${item.name}${input.quantity > 1 ? ` × ${input.quantity}` : ""}` : null,
    status,
    issueDate: CONSOLE_TODAY,
    releaseDate,
    agreementNo: nextAgreement(state.loans),
    agreementSigned: input.signed,
    releaseMethod: input.releaseMethod,
    penaltyPercent: product.penaltyPercent,
    graceDays: product.graceDays,
    processingFee: product.processingFee,
    schedule: buildSchedule({
      principal,
      rate: input.rate,
      markup: product.markup,
      method,
      months: input.months,
      frequency: input.frequency,
      start,
    }),
    history: [
      { date: CONSOLE_TODAY, text: status === "ACTIVE" ? "Enrolled, approved and released" : "Submitted for approval" },
    ],
  };
};

export function CooperativeConsoleProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<ConsoleState>(() => createConsoleState());

  useEffect(() => {
    const pending =
      state.loans.filter(loan => loan.status === "PENDING").length +
      state.withdrawals.filter(withdrawal => withdrawal.status === "PENDING").length;
    const badges = { approvals: pending ? String(pending) : "" };
    try {
      sessionStorage.setItem("feature-sidebar-badges", JSON.stringify(badges));
    } catch {
      // Session storage is optional; the in-page queues still show the count.
    }
    window.dispatchEvent(new CustomEvent("feature-sidebar-badges", { detail: badges }));
  }, [state.members, state.loans, state.withdrawals]);

  useEffect(() => () => {
    try {
      sessionStorage.removeItem("feature-sidebar-badges");
    } catch {
      // Ignore unavailable session storage.
    }
    window.dispatchEvent(new CustomEvent("feature-sidebar-badges", { detail: {} }));
  }, []);

  const value = useMemo(() => {
    const actions: ConsoleActions = {
      reset: () => setState(createConsoleState()),
      enrollLoan: input => setState(current => {
        const status: Loan["status"] = input.approveNow ? "ACTIVE" : "PENDING";
        const loan = makeLoan(current, input, status, input.approveNow ? CONSOLE_TODAY : null);
        const journal = input.approveNow
          ? [...current.journal, {
              id: `J${Date.now()}e`,
              date: CONSOLE_TODAY,
              memberId: input.memberId,
              kind: "DISBURSEMENT" as const,
              amount: loan.principal,
              channel: input.releaseMethod === "payroll" ? "payroll" as const : "otc" as const,
              reference: loan.code,
              loanId: loan.id,
            }]
          : current.journal;
        return { ...current, loans: [...current.loans, loan], journal };
      }),
      decideLoan: (loanId, decision) => setState(current => {
        const loan = current.loans.find(entry => entry.id === loanId);
        if (!loan) return current;
        if (decision === "reject") {
          return {
            ...current,
            loans: current.loans.map(entry => entry.id === loanId
              ? {
                  ...entry,
                  status: "REJECTED" as const,
                  history: [...entry.history, { date: CONSOLE_TODAY, text: "Rejected by Coop Officer" }],
                }
              : entry),
          };
        }
        if (decision === "approve" && loan.status === "PENDING") {
          return {
            ...current,
            loans: current.loans.map(entry => entry.id === loanId
              ? {
                  ...entry,
                  status: "APPROVED" as const,
                  history: [...entry.history, { date: CONSOLE_TODAY, text: "Approved by Coop Officer" }],
                }
              : entry),
          };
        }
        const release = decision === "approve-release" || decision === "release";
        if (!release) return current;
        const schedule = buildSchedule({
          principal: loan.principal,
          rate: loan.rate,
          markup: loan.markup,
          method: loan.method,
          months: loan.months,
          frequency: loan.frequency,
          start: CONSOLE_TODAY,
        });
        const updated: Loan = {
          ...loan,
          status: "ACTIVE",
          releaseDate: CONSOLE_TODAY,
          schedule,
          history: [...loan.history, { date: CONSOLE_TODAY, text: "Approved and released by Coop Officer" }],
        };
        return {
          ...current,
          loans: current.loans.map(entry => entry.id === loanId ? updated : entry),
          journal: [...current.journal, {
            id: `J${Date.now()}f`,
            date: CONSOLE_TODAY,
            memberId: loan.memberId,
            kind: "DISBURSEMENT" as const,
            amount: loan.principal,
            channel: loan.releaseMethod === "payroll" ? "payroll" as const : "otc" as const,
            reference: loan.code,
            loanId: loan.id,
          }],
        };
      }),
      postDeposit: input => setState(current => {
        if (!(input.amount > 0)) return current;
        return {
          ...current,
          members: current.members.map(member => member.id === input.memberId
            ? { ...member, savings: round2(member.savings + input.amount) }
            : member),
          journal: [...current.journal, {
            id: `J${Date.now()}g`,
            date: input.date,
            memberId: input.memberId,
            kind: "DEPOSIT" as const,
            amount: input.amount,
            channel: input.channel,
            reference: input.reference || "Counter deposit",
          }],
        };
      }),
      postPayment: input => setState(current => {
        const loan = current.loans.find(entry => entry.id === input.loanId);
        if (!loan || !(input.amount > 0)) return current;
        const allocated = applyPayment(loan, input.amount, input.date, current.settings.penaltyFirst);
        const totals = loanTotals({ ...loan, schedule: allocated.schedule }, input.date);
        const nextLoan: Loan = {
          ...loan,
          schedule: allocated.schedule,
          status: totals.remaining <= 0.005 && totals.penalties <= 0.005 ? "FULLY_PAID" : loan.status,
          history: [...loan.history, {
            date: input.date,
            text: `Payment of ${allocated.applied.toFixed(2)} posted (${input.channel === "payroll" ? "payroll remittance" : "over the counter"})`,
          }],
        };
        return {
          ...current,
          loans: current.loans.map(entry => entry.id === loan.id ? nextLoan : entry),
          journal: [...current.journal, {
            id: `J${Date.now()}h`,
            date: input.date,
            memberId: loan.memberId,
            kind: "LOAN_PAYMENT" as const,
            amount: allocated.applied,
            channel: input.channel,
            reference: input.reference || loan.code,
            loanId: loan.id,
            installmentPart: allocated.installmentPart,
            penaltyPart: allocated.penaltyPart,
          }],
        };
      }),
      decideWithdrawal: (withdrawalId, approved) => setState(current => {
        const withdrawal = current.withdrawals.find(entry => entry.id === withdrawalId);
        if (!withdrawal || withdrawal.status !== "PENDING") return current;
        if (!approved) {
          return {
            ...current,
            withdrawals: current.withdrawals.map(entry => entry.id === withdrawalId
              ? {
                  ...entry,
                  status: "REJECTED" as const,
                  history: [...entry.history, { date: CONSOLE_TODAY, text: "Rejected by Coop Officer" }],
                }
              : entry),
          };
        }
        return {
          ...current,
          members: current.members.map(member => member.id === withdrawal.memberId
            ? { ...member, savings: round2(member.savings - withdrawal.amount) }
            : member),
          withdrawals: current.withdrawals.map(entry => entry.id === withdrawalId
            ? {
                ...entry,
                status: "RELEASED" as const,
                history: [...entry.history, { date: CONSOLE_TODAY, text: "Approved and released by Coop Officer" }],
              }
            : entry),
          journal: [...current.journal, {
            id: `J${Date.now()}i`,
            date: CONSOLE_TODAY,
            memberId: withdrawal.memberId,
            kind: "WITHDRAWAL" as const,
            amount: withdrawal.amount,
            channel: withdrawal.method,
            reference: withdrawal.code,
          }],
        };
      }),
      startClearance: input => setState(current => {
        const clearance: Clearance = {
          id: `C${Date.now()}`,
          code: `CL-2026-${pad(current.cases.length + 4)}`,
          memberId: input.memberId,
          reason: input.reason,
          separationDate: input.separationDate,
          finalPay: input.finalPay,
          notes: input.notes,
          status: "DRAFT",
          history: [{ date: CONSOLE_TODAY, text: "Clearance started" }],
        };
        return { ...current, cases: [...current.cases, clearance] };
      }),
      updateClearance: (clearanceId, patch) => setState(current => ({
        ...current,
        cases: current.cases.map(entry => entry.id === clearanceId && entry.status === "DRAFT"
          ? { ...entry, ...patch }
          : entry),
      })),
      completeClearance: clearanceId => setState(current => {
        const clearance = current.cases.find(entry => entry.id === clearanceId);
        if (!clearance || clearance.status !== "DRAFT") return current;
        const settlement = settlementFor(current, clearance);
        const journal = [...current.journal];
        const add = (kind: "DIVIDEND" | "OFFSET" | "WITHDRAWAL", amount: number, reference: string) => {
          if (amount <= 0) return;
          journal.push({
            id: `J${Date.now()}-${kind}`,
            date: CONSOLE_TODAY,
            memberId: clearance.memberId,
            kind,
            amount,
            channel: "system",
            reference,
          });
        };
        add("DIVIDEND", settlement.dividend, `${clearance.code} pro-rated dividend`);
        add("OFFSET", settlement.fromEquity, `${clearance.code} loan offset`);
        add("WITHDRAWAL", settlement.refund, `${clearance.code} savings released with final pay`);
        return {
          ...current,
          members: current.members.map(member => member.id === clearance.memberId
            ? { ...member, status: "SEPARATED" as const, savings: 0, savingsPerCutoff: 0 }
            : member),
          loans: current.loans.map(loan => loan.memberId === clearance.memberId && loan.status === "ACTIVE"
            ? {
                ...loan,
                status: settlement.unrecovered > 0 ? "DEFAULTED" as const : "FULLY_PAID" as const,
                schedule: loan.schedule.map(installment => ({ ...installment, paid: installment.total, offset: true })),
                history: [...loan.history, {
                  date: CONSOLE_TODAY,
                  text: settlement.unrecovered > 0
                    ? `Endorsed for collection: ${settlement.unrecovered.toFixed(2)} unrecovered`
                    : "Settled through exit clearance",
                }],
              }
            : loan),
          withdrawals: current.withdrawals.map(withdrawal => withdrawal.memberId === clearance.memberId && withdrawal.status === "PENDING"
            ? {
                ...withdrawal,
                status: "CANCELLED" as const,
                history: [...withdrawal.history, { date: CONSOLE_TODAY, text: "Cancelled by exit clearance" }],
              }
            : withdrawal),
          cases: current.cases.map(entry => entry.id === clearanceId
            ? {
                ...entry,
                status: "COMPLETED" as const,
                snapshot: settlement,
                history: [...entry.history, { date: CONSOLE_TODAY, text: `Settled; membership closed${settlement.refund ? `; ${settlement.refund.toFixed(2)} refunded` : ""}` }],
              }
            : entry),
          journal,
        };
      }),
      cancelClearance: clearanceId => setState(current => ({
        ...current,
        cases: current.cases.map(entry => entry.id === clearanceId && entry.status === "DRAFT"
          ? {
              ...entry,
              status: "CANCELLED" as const,
              history: [...entry.history, { date: CONSOLE_TODAY, text: "Clearance cancelled" }],
            }
          : entry),
      })),
      addDocument: input => setState(current => ({
        ...current,
        documents: [...current.documents, {
          id: `D${Date.now()}`,
          ...input,
          uploadedAt: CONSOLE_TODAY,
          uploadedBy: "Coop Officer",
        }],
      })),
      removeDocument: documentId => setState(current => ({
        ...current,
        documents: current.documents.filter(document => document.id !== documentId),
      })),
    };
    return { state, actions };
  }, [state]);

  return <ConsoleContext.Provider value={value}>{children}</ConsoleContext.Provider>;
}

export function useConsole() {
  const context = useContext(ConsoleContext);
  if (!context) throw new Error("useConsole must be used inside CooperativeConsoleProvider.");
  return context;
}

export const memberById = (state: ConsoleState, id: string) => state.members.find(member => member.id === id);
export const loanById = (state: ConsoleState, id: string) => state.loans.find(loan => loan.id === id);
export const documentsFor = (state: ConsoleState, ownerType: DocumentRecord["ownerType"], ownerId: string) =>
  state.documents.filter(document => document.ownerType === ownerType && document.ownerId === ownerId);
export const documentStatus = (state: ConsoleState, ownerType: DocumentRecord["ownerType"], ownerId: string, required: string[]) => {
  const have = new Set(documentsFor(state, ownerType, ownerId).map(document => document.category));
  const missing = required.filter(category => !have.has(category));
  return { required, missing, done: required.length - missing.length };
};
export const memberDisplayName = (member: Member) => `${member.firstName} ${member.lastName}`;
