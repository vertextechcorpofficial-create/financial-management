import "server-only";

import { z } from "zod";
import { amountToCents, centsToAmount } from "../loans/loan-schedule";
import { money } from "../policies/policy-types";
import { cooperativeAuditEvent, cooperativeAuditTime } from "./audit";
import { readDirectusItems } from "./directus";
import { loanDigest, loanPostingAccounts, prepareCooperativeJournal, requirePostingAccount, type LoanActor } from "./loan-commands";
import { LoanError } from "./loans";
import { todayManila } from "./member-read";
import { getPolicies } from "./policies";
import { findSavingsCommand, writeSavingsCommand } from "./savings-commands";
import { nestedTransactionEntries, transactionIndexEnabled } from "./transaction-index";
import { readSavingsRevision, withdrawalId as id } from "./withdrawal-store";

const commandType = "SAVINGS_DEPOSIT";
const decimal = z.union([z.number(), z.string()]).transform(String).pipe(money);
const draft = z.object({
  memberId: id,
  amount: money.refine(value => amountToCents(value) > 0n, "Enter an amount greater than zero."),
  receiptDate: z.iso.date(),
  reference: z.string().trim().max(40).default(""),
});
const confirmation = draft.extend({
  requestKey: z.uuid(), fingerprint: z.string().regex(/^[a-f0-9]{64}$/), cashReceived: z.literal(true),
});
const memberRow = z.object({
  id, user_id: id, employee_name: z.string(), status: z.enum(["ACTIVE", "SEPARATED"]),
  joined_at: z.iso.date(), savings_balance: decimal, savings_revision: z.number().int().nonnegative(),
});
const depositResult = z.object({
  memberId: id, employeeNo: z.string(), memberName: z.string(), cashier: z.string(), issuedBy: id,
  amount: money, previousBalance: money, balanceAfter: money, receiptDate: z.iso.date(), businessDate: z.iso.date(),
  reference: z.string(), journalId: id, journalNo: z.string(), orNo: z.string(),
});
const stale = () => new LoanError(409, "The savings balance, posting date, or accounts changed. Review the deposit again.", "STALE_DEPOSIT");

function ensureEnabled() {
  if (!transactionIndexEnabled()) throw new LoanError(409, "Counter savings deposits are pending rollout.", "PENDING_ROLLOUT");
}

function parse<T extends z.ZodType>(schema: T, payload: unknown) {
  const result = schema.safeParse(payload);
  if (!result.success) throw new LoanError(422, "Check the deposit details.", "DEPOSIT_INPUT",
    Object.fromEntries(result.error.issues.map(issue => [String(issue.path[0]), issue.message])));
  return result.data;
}

const query = (fields: string, filter: object, limit = 2, sort?: string) => new URLSearchParams({
  fields, filter: JSON.stringify(filter), limit: String(limit), ...(sort ? { sort } : {}),
});

async function review(input: z.output<typeof draft>) {
  const today = todayManila();
  const [members, policy] = await Promise.all([
    readDirectusItems("cooperative_memberships", query(Object.keys(memberRow.shape).join(","), { id: { _eq: input.memberId } }, 1)),
    getPolicies(),
  ]);
  const { data: [member] } = z.object({ data: memberRow.array().max(1) }).parse(members);
  if (member?.status !== "ACTIVE") throw new LoanError(409, "Choose an active Cooperative member.", "MEMBER_INACTIVE");
  if (input.receiptDate < member.joined_at || input.receiptDate > today) {
    throw new LoanError(422, "Check the deposit receipt date.", "DEPOSIT_INPUT", {
      receiptDate: "Choose a date from membership activation through today.",
    });
  }
  const { data: [latest] } = z.object({ data: z.array(z.object({ entry_date: z.iso.date(), balance_after: decimal })).max(1) })
    .parse(await readDirectusItems("cooperative_savings_entries", query("entry_date,balance_after",
      { membership_id: { _eq: member.id } }, 1, "-entry_date,-id")));
  if (await readSavingsRevision(member.id) !== member.savings_revision) throw stale();
  if ((latest?.balance_after ?? "0.00") !== member.savings_balance || (latest && latest.entry_date > today)) {
    throw new LoanError(409, "The member’s posted savings and ledger need reconciliation before depositing.", "DEPOSIT_BALANCE_MISMATCH");
  }
  const businessDate = latest && input.receiptDate < latest.entry_date ? today : input.receiptDate;
  const cents = amountToCents(member.savings_balance) + amountToCents(input.amount);
  if (cents > 999_999_999_999n) throw new LoanError(422, "The resulting savings balance exceeds the supported amount.", "DEPOSIT_INPUT");
  const accounts = loanPostingAccounts(policy);
  const debit = requirePostingAccount(accounts, "CASH_ON_HAND");
  const credit = requirePostingAccount(accounts, "MEMBER_SAVINGS");
  const preview = {
    amount: input.amount, receiptDate: input.receiptDate, businessDate, previousBalance: member.savings_balance,
    balanceAfter: centsToAmount(cents),
    fingerprint: loanDigest([input, today, businessDate, member.savings_revision, member.savings_balance, policy.revision, debit.id, credit.id]),
  };
  return { member, today, debit, credit, preview };
}

export async function previewSavingsDeposit(payload: unknown) {
  ensureEnabled();
  return (await review(parse(draft, payload))).preview;
}

export async function postSavingsDeposit(payload: unknown, actor: LoanActor) {
  ensureEnabled();
  const input = parse(confirmation, payload);
  const command = {
    type: commandType, key: input.requestKey, hash: loanDigest([actor.actorId, input]), result: depositResult,
  };
  const prior = await findSavingsCommand(command);
  if (prior) return prior;
  const checked = await (async () => {
    const assessed = await review(draft.parse(input));
    if (assessed.preview.fingerprint !== input.fingerprint) throw stale();
    return assessed;
  })().catch(async error => {
    const saved = await findSavingsCommand(command);
    if (saved) return saved;
    throw error;
  });
  if ("duplicate" in checked) return checked;
  const { member, preview, debit, credit } = checked;
  return writeSavingsCommand(command, member.id, member.savings_revision, actor, {
    stale, retry: () => new LoanError(503, "The deposit could not be confirmed. Retry with the same request.", "DEPOSIT_RETRY"),
  }, async now => {
    if (todayManila(now) !== checked.today) throw stale();
    const at = cooperativeAuditTime(now);
    const posting = await prepareCooperativeJournal({
      type: commandType, source: { type: "MEMBERSHIP", id: member.id }, date: preview.businessDate, now, actor,
      pairs: [{ debit, credit, amount: input.amount }], depositReceipt: { membershipId: member.id, amount: input.amount },
      audit: ({ journalNo, orNo }) => ({
        ...cooperativeAuditEvent(actor, {
          subject: { type: "MEMBERSHIP", id: member.id }, action: "SAVINGS_DEPOSIT_POSTED",
          before: { savingsBalance: preview.previousBalance },
          after: { savingsBalance: preview.balanceAfter, amount: input.amount, receiptDate: input.receiptDate,
            businessDate: preview.businessDate, reference: input.reference || null, channel: "OTC", journalNo, orNo },
        }, now), actor_name: actor.actorName,
      }),
    });
    const orNo = z.string().parse(posting.numbers.orNo);
    const result = {
      memberId: member.id, memberName: member.employee_name, employeeNo: String(member.user_id),
      cashier: actor.actorName, issuedBy: actor.actorId, amount: preview.amount, previousBalance: preview.previousBalance,
      balanceAfter: preview.balanceAfter, receiptDate: input.receiptDate, businessDate: preview.businessDate,
      reference: input.reference, journalId: posting.numbers.journalId, journalNo: posting.numbers.journalNo, orNo,
    };
    return {
      result, membership: { savings_balance: result.balanceAfter },
      relations: { ...posting.receipt, journal_id: {
        ...posting.receipt.journal_id,
        savings_entries: { create: [{
          membership_id: member.id, entry_date: result.businessDate, kind: "DEPOSIT", amount: result.amount,
          balance_after: result.balanceAfter, reference: orNo, posted_at: at, posted_by: actor.actorId,
        }] },
        ...nestedTransactionEntries({ id: result.journalId, date: result.businessDate, postedAt: at }, [{
          kind: commandType, memberId: member.id, channel: "OTC", amount: result.amount, orNo,
          reference: input.reference, receivedOn: result.receiptDate,
        }]),
      } },
    };
  });
}

export async function getSavingsDepositReceipt(journalId: number) {
  if (!id.safeParse(journalId).success) throw new LoanError(400, "Choose a valid receipt.");
  const filter = { journal_id: { _eq: journalId } };
  const journalMatch = { ...filter, command_type: { _eq: commandType } };
  const { data: [command] } = z.object({ data: z.array(z.object({ result: depositResult })).max(1) })
    .parse(await readDirectusItems("cooperative_command_receipts", query("result", journalMatch)));
  if (!command) throw new LoanError(404, "The deposit receipt is unavailable.");
  const result = command.result;
  const official = z.object({
    or_no: z.string(), membership_id: id, business_date: z.iso.date(), amount: decimal, fee_part: decimal, deposit_part: decimal,
    issued_by: id, journal_id: z.object({ id, journal_no: z.string(), command_type: z.literal(commandType), business_date: z.iso.date() }),
  });
  const { data: [or] } = z.object({ data: official.array().max(1) }).parse(await readDirectusItems("cooperative_official_receipts",
    query("or_no,membership_id,business_date,amount,deposit_part,fee_part,issued_by,journal_id.id,journal_id.journal_no,journal_id.command_type,journal_id.business_date", filter)));
  if (!or || result.journalId !== journalId || or.journal_id.id !== journalId || or.journal_id.journal_no !== result.journalNo ||
    result.orNo !== or.or_no || or.business_date !== result.businessDate || or.journal_id.business_date !== result.businessDate ||
    or.membership_id !== result.memberId || or.issued_by !== result.issuedBy || or.fee_part !== "0.00" ||
    or.amount !== result.amount || or.deposit_part !== result.amount) {
    throw new LoanError(503, "The receipt could not be reconciled to the posted deposit.");
  }
  return result;
}

export type SavingsDepositPreview = Awaited<ReturnType<typeof previewSavingsDeposit>>;
export type SavingsDepositResult = Awaited<ReturnType<typeof postSavingsDeposit>>;
