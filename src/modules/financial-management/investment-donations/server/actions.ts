import "server-only";

import { z } from "zod";
import { ledgerAccess } from "./access";
import { ledgerDatabase } from "./database";
import { changePeriod, InvalidCommand, reconcile, recordDonationDocument, transact, updateAnnualReview } from "./transactions.mjs";
import type { WorkspaceKey } from "../workspaces";
import { allows, workspaceRole } from "./permissions";

export async function saveAnnualReview(input: unknown) {
  const parsed = z.object({ fiscalStart: z.string(), revision: z.number().int().nonnegative(),
    checks: z.array(z.boolean()).length(5).optional(), reason: z.string().trim().max(500).optional(),
    type: z.enum(["draft", "sign", "reopen"]) }).safeParse(input);
  if (!parsed.success) return { ok: false as const, message: "Invalid annual review request." };
  try {
    const access = await ledgerAccess();
    if (!access || !allows(workspaceRole(access, "annual-review"), parsed.data.type === "draft" ? "prepare" : "approve")) {
      return { ok: false as const, message: "You do not have permission for this review action." };
    }
    const { checks, reason, ...command } = parsed.data;
    await updateAnnualReview(ledgerDatabase(), { ...command, checks, reason, actor: access.id });
    return { ok: true as const };
  } catch (error) {
    return { ok: false as const, message: error instanceof InvalidCommand ? error.message : "Review update could not be confirmed. Refresh before retrying." };
  }
}

export async function saveDonationDocument(input: unknown, cgt = false) {
  const parsed = z.object({ id: z.string().min(1).max(64), reference: z.string().trim().min(1).max(200),
    status: z.enum(["reference-only", "filed-manually"]).optional(),
    filedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    receiptReference: z.string().trim().min(1).max(200).optional(),
    evidenceReference: z.string().trim().min(1).max(200).optional() }).safeParse(input);
  if (!parsed.success) return { ok: false as const, message: "Enter a document reference." };
  try {
    const access = await ledgerAccess();
    if (!access || !allows(workspaceRole(access, cgt ? "tax-compliance" : "charitable-giving"), "approve")) {
      return { ok: false as const, message: "Approval permission is required." };
    }
    await recordDonationDocument(ledgerDatabase(), { ...parsed.data, actor: access.id, cgt });
    return { ok: true as const };
  } catch (error) {
    return { ok: false as const, message: error instanceof InvalidCommand ? error.message : "Document save could not be confirmed. Refresh before retrying." };
  }
}

export async function submitPeriod(input: unknown) {
  const parsed = z.object({ month: z.string().regex(/^[1-9]\d{3}-(0[1-9]|1[0-2])$/),
    type: z.enum(["accrue", "close", "reopen"]), reason: z.string().trim().max(500).optional() }).safeParse(input);
  if (!parsed.success) return { ok: false as const, message: "Invalid period command." };
  try {
    const access = await ledgerAccess();
    if (!access || !allows(workspaceRole(access, "period-close"), parsed.data.type === "accrue" ? "prepare" : "approve")) {
      return { ok: false as const, message: "Period approval permission is required." };
    }
    await changePeriod(ledgerDatabase(), { ...parsed.data, actor: access.id });
    return { ok: true as const };
  } catch (error) {
    return { ok: false as const, message: error instanceof InvalidCommand ? error.message : "Period update could not be confirmed. Refresh before retrying." };
  }
}

const statement = z.object({
  cash: z.record(z.string().max(100), z.number().finite().nullable()),
  units: z.record(z.string().max(100), z.number().finite().nullable()),
  notes: z.record(z.string().max(100), z.string().max(500)),
});
const reconciliation = z.object({
  month: z.string().regex(/^[1-9]\d{3}-(0[1-9]|1[0-2])$/), revision: z.number().int().nonnegative(),
  type: z.enum(["draft", "sign", "reopen"]), statement: statement.optional(),
  reason: z.string().trim().min(1).max(500).optional(),
});

export async function saveReconciliation(input: unknown) {
  const parsed = reconciliation.safeParse(input);
  if (!parsed.success) return { ok: false as const, message: "Invalid reconciliation values." };
  try {
    const access = await ledgerAccess();
    if (!access || !allows(workspaceRole(access, "monthly-reconciliation"), parsed.data.type === "draft" ? "prepare" : "approve")) {
      return { ok: false as const, message: "You do not have permission for this reconciliation action." };
    }
    await ledgerDatabase().transaction(trx => reconcile(trx, { ...parsed.data, actor: access.id }));
    return { ok: true as const };
  } catch (error) {
    if (error instanceof InvalidCommand) return { ok: false as const, message: error.message };
  }
  return { ok: false as const, message: "The reconciliation could not be confirmed. Refresh before retrying." };
}

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
export async function reconcileCgt(input: unknown) {
  const parsed = z.object({ fiscalStart: date, date }).safeParse(input);
  return parsed.success ? submit({ ...parsed.data, type: "cgtClose" }, "tax-compliance", "approve") :
    { ok: false as const, message: "Enter the fiscal start and posting dates." };
}
const trade = z.object({
  type: z.enum(["buy", "sell"]), date, sym: z.string().min(1).max(64),
  acctType: z.enum(["Taxable", "PERA"]), account: z.enum(["1000", "1010", "1020"]),
  qty: z.number().positive().max(1e9), price: z.number().positive().max(1e12),
  fees: z.number().min(0).max(1e12), memo: z.string().max(250),
  picks: z.array(z.object({ lotId: z.string().min(1).max(64), qty: z.number().positive().max(1e9) })).max(100).optional(),
});

export async function recordTrade(input: unknown) {
  const parsed = trade.safeParse(input);
  return parsed.success ? submit(parsed.data, "portfolio-rebalancing") :
    { ok: false as const, message: "Enter valid trade details and lot quantities." };
}

export async function recordGiving(input: unknown) {
  const gift = trade.omit({ type: true, acctType: true, fees: true, account: true }).extend({
    type: z.literal("gift"), target: z.string().min(1).max(64), valuation: z.string().trim().min(1).max(200),
  });
  const grant = z.object({ type: z.literal("grant"), date, fund: z.string().min(1).max(64),
    recipient: z.string().min(1).max(64), amount: z.number().positive().max(1e12) });
  const result = z.discriminatedUnion("type", [gift, grant]).safeParse(input);
  if (!result.success) return { ok: false as const, message: "Enter valid gift or grant details." };
  return submit(result.data.type === "gift" ? { ...result.data, acctType: "Taxable", fees: 0, account: "1000" } : result.data,
    "charitable-giving");
}

export async function issueCertificate(input: unknown) {
  const parsed = z.object({ date, target: z.string().min(1).max(64), certNo: z.string().trim().regex(/^[A-Za-z0-9-]{1,40}$/) }).safeParse(input);
  return parsed.success ? submit({ ...parsed.data, type: "issue" }, "capital-stock", "approve") :
    { ok: false as const, message: "Enter a valid date and certificate number." };
}

export async function createSubscription(input: unknown) {
  const parsed = z.object({ date, holderId: z.string().min(1).max(64), shares: z.number().int().positive(),
    price: z.number().positive(), paid: z.number().nonnegative(),
    account: z.enum(["1000", "1010", "1020"]) }).safeParse(input);
  return parsed.success ? submit({ ...parsed.data, type: "subscribe" }, "capital-stock") :
    { ok: false as const, message: "Enter valid subscription details." };
}

export async function recordCapitalAction(input: unknown) {
  const id = z.string().min(1).max(64);
  const cert = z.string().trim().regex(/^[A-Za-z0-9-]{1,40}$/);
  const result = z.discriminatedUnion("type", [
    z.object({ type: z.literal("shareTransfer"), date, target: id.optional(), targets: z.array(id).min(1).max(100).optional(), toId: id, shares: z.number().int().positive(),
      price: z.number().min(0).max(1e12), carRef: z.string().trim().min(1).max(120), deedRef: z.string().trim().min(1).max(120),
      buyerNo: cert, balanceNo: cert.optional() }),
    z.object({ type: z.literal("voidTransfer"), date, target: id, reason: z.string().trim().min(1).max(500),
      evidenceRef: z.string().trim().min(1).max(200).optional(), confirmHistorical: z.boolean().optional() }),
    z.object({ type: z.literal("declareDividend"), date, perShare: z.number().positive().max(1e6), confirmUnrestricted: z.literal(true),
      payDate: date }),
    z.object({ type: z.literal("payDividend"), date, target: id, account: z.enum(["1000", "1010", "1020"]) }),
  ]).safeParse(input);
  if (!result.success) return { ok: false as const, message: "Enter valid capital stock details." };
  if (result.data.type === "declareDividend") {
    const payDay = new Date(`${result.data.payDate}T00:00:00Z`);
    if (!Number.isFinite(+payDay) || payDay.toISOString().slice(0, 10) !== result.data.payDate || result.data.payDate < result.data.date) {
      return { ok: false as const, message: "Payment date must be on or after the declaration." };
    }
  }
  return submit(result.data, "capital-stock", "approve");
}
const cash = z.object({
  type: z.enum(["transfer", "fee", "interest", "taxpay", "expaccrue", "exppay", "accrueDividend", "accrueInterest", "collectIncome", "cashDonation", "subcollect", "borrow", "repay"]), date,
  amount: z.number().positive().max(1e12), account: z.enum(["1000", "1010", "1020"]),
  target: z.string().max(100).optional(), memo: z.string().max(250), payDate: date.optional(),
  name: z.string().trim().max(120).optional(), rate: z.number().min(0).max(100).optional(),
});
const reversal = z.object({ id: z.string().uuid(), date, reason: z.string().trim().min(1).max(200) });
const permissions: Record<z.infer<typeof cash>["type"], WorkspaceKey> = {
  transfer: "inflows-investing", interest: "inflows-investing", fee: "portfolio-rebalancing", taxpay: "tax-compliance",
  expaccrue: "portfolio-rebalancing", exppay: "portfolio-rebalancing",
  accrueDividend: "inflows-investing", accrueInterest: "inflows-investing", collectIncome: "inflows-investing",
  cashDonation: "charitable-giving",
  subcollect: "inflows-investing",
  borrow: "inflows-investing", repay: "inflows-investing",
};

async function submit(command: object, workspace: WorkspaceKey, required: "prepare" | "approve" = "prepare") {
  try {
    const access = await ledgerAccess();
    if (!access || !allows(workspaceRole(access, workspace), required)) return { ok: false as const, message: "You do not have permission for this ledger action." };
    const result = await transact(ledgerDatabase(), { ...command, actor: access.id });
    return { ok: true as const, number: result.number };
  } catch (error) {
    if (error instanceof InvalidCommand) return { ok: false as const, message: error.message };
    return { ok: false as const, message: "Posting could not be confirmed. Refresh Transactions before retrying." };
  }
}

export async function recordCashEntry(input: unknown) {
  const result = cash.safeParse(input);
  return result.success ? submit(result.data, permissions[result.data.type]) : { ok: false as const, message: "Enter a valid date, amount and cash account." };
}

export async function reverseEntry(input: unknown) {
  const result = reversal.safeParse(input);
  return result.success ? submit({ ...result.data, type: "reverse" }, "transactions", "approve") : { ok: false as const, message: "Enter a reversal date and reason." };
}
