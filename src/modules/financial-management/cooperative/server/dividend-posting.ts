import "server-only";

import { z } from "zod";
import { dividendPostedRunSchema } from "../console/dividends/types";
import { cooperativeAuditEvent, cooperativeAuditTime } from "./audit";
import { reviewDividendPosting } from "./dividend-review";
import { getDividendRun } from "./dividend-runs";
import { isCooperativeWriteCollision } from "./dividend-source";
import { cooperativeDirectus, usesCooperativeQaDatabase } from "./directus";
import { loanDigest, nextRemittanceJournals, prepareCooperativeJournal, type LoanActor } from "./loan-commands";
import { MemberError } from "./member-errors";
import { todayManila } from "./member-read";
import { findSavingsCommand } from "./savings-commands";
import { nestedTransactionEntries } from "./transaction-index";

const runCommand = "DIVIDEND_RUN_POSTED";
const journalCommands = { STATUTORY: "DIVIDEND_STATUTORY", DECLARATION: "DIVIDEND_DECLARED", MEMBER_CREDIT: "DIVIDEND_CREDITED" } as const;
const confirmation = z.object({
  draftRevision: z.number().int().positive(), fingerprint: z.string().regex(/^[0-9a-f]{64}$/), requestKey: z.uuid(),
});
const receipt = z.object({ year: z.number().int().positive(), reference: z.string() });

export async function postDividendRun(year: number, actor: LoanActor, body: unknown, clock = () => new Date()) {
  if (!usesCooperativeQaDatabase()) {
    throw new MemberError(409, "Dividend posting is pending rollout in this environment.", "PENDING_ROLLOUT");
  }
  const parsed = confirmation.safeParse(body);
  if (!parsed.success) throw new MemberError(422, "Confirm the reviewed allocation before posting.", "DIVIDEND_CONFIRMATION");
  const input = parsed.data;
  const command = { type: runCommand, key: input.requestKey, hash: loanDigest([year, actor.actorId, input]), result: receipt };
  async function recover() {
    const saved = await findSavingsCommand(command);
    if (!saved) return null;
    const run = await getDividendRun(year);
    if (saved.year !== year || run?.reference !== saved.reference) {
      throw new MemberError(503, "The posted dividend reference could not be verified. Retry the same request.", "DIVIDEND_RETRY");
    }
    return { run, duplicate: true };
  }

  for (let attempt = 0; attempt < 3; attempt++) {
    const recovered = await recover();
    if (recovered) return recovered;
    const now = clock();
    const reviewed = await reviewDividendPosting(year, now).catch(async error => {
      const saved = await recover();
      if (saved) return saved;
      throw error;
    });
    if ("duplicate" in reviewed) return reviewed;
    const { preview, members, revision } = reviewed;
    if (preview.draft.revision !== input.draftRevision || preview.fingerprint !== input.fingerprint) {
      throw new MemberError(409, "The dividend allocation changed. Review the updated figures and confirm again.",
        "DIVIDEND_PREVIEW_CHANGED", undefined, { preview });
    }
    if (!preview.journalPreview.length) {
      throw new MemberError(422, "There are no statutory allocations or member credits to post.", "DIVIDEND_NO_AMOUNTS");
    }

    const { postingDate: date, allocation } = preview;
    const at = cooperativeAuditTime(now);
    const reference = `DIV-${year}`;
    const series = await nextRemittanceJournals(Number(date.slice(0, 4)), preview.journalPreview.length);
    const credits = new Map(allocation.credits.map(row => [row.membershipId, row]));
    const recipients = new Map(preview.recipients.map(row => [row.membershipId, row]));
    const children = [];
    const journals = [];
    for (const [index, plan] of preview.journalPreview.entries()) {
      const { kind, pairs, membershipId } = plan;
      const type = journalCommands[kind];
      const member = membershipId === null ? null : members.get(membershipId)!;
      const recipient = member ? recipients.get(member.id)! : null;
      const amount = member ? credits.get(member.id)!.total : null;
      const posting = await prepareCooperativeJournal({
        type, source: { type: "DIVIDEND", id: year }, date, now, actor, pairs, reservedJournalNo: series.numbers[index],
        audit: ({ journalNo }) => ({
          ...cooperativeAuditEvent(actor, {
            subject: member ? { type: "MEMBERSHIP", id: member.id } : { type: "DIVIDEND", id: year },
            action: type, before: recipient ? { savingsBalance: recipient.before } : undefined,
            after: { year, reference, journalNo, amount, savingsBalance: recipient?.after ?? null },
          }, now), actor_name: actor.actorName,
        }),
      });
      const { journalId: id, journalNo: number } = posting.numbers;
      journals.push({ id, number, kind, membershipId });
      children.push({
        command_type: type, idempotency_key: loanDigest([runCommand, command.key, kind, membershipId]), request_hash: command.hash,
        actor_user_id: actor.actorId, created_at: at, result: { year, reference, number, membershipId, amount, ...recipient },
        ...(member && recipient ? {
          savings_revision_key: loanDigest([member.id, member.savings_revision]),
          membership_id: { id: member.id, savings_revision: member.savings_revision + 1, savings_balance: recipient.after },
        } : {}),
        journal_id: {
          ...posting.receipt.journal_id,
          ...(member && recipient && amount ? {
            savings_entries: { create: [{
              membership_id: member.id, entry_date: date, kind: "DIVIDEND", amount, balance_after: recipient.after,
              reference, posted_at: at, posted_by: actor.actorId,
            }] },
            ...nestedTransactionEntries({ id, date, postedAt: at }, [{
              memberId: member.id, kind: "DIVIDEND", amount, channel: "SYSTEM", sourceReference: reference,
            }]),
          } : {}),
        },
      });
    }
    const run = dividendPostedRunSchema.parse({
      ...preview, reference, postedAt: at, postedBy: actor.actorName, postedById: actor.actorId, journals,
    });
    const event = cooperativeAuditEvent(actor, {
      subject: { type: "DIVIDEND", id: year }, action: runCommand,
      after: {
        year, reference, status: "POSTED", revision: preview.draft.revision, businessDate: date, netSurplus: allocation.netSurplus,
        reserve: allocation.reserve, education: allocation.education, savingsCredits: allocation.savings.allocated,
        patronageRefunds: allocation.patronage.allocated, undividedSurplus: allocation.undividedSurplus,
        journals: journals.map(journal => journal.number),
      },
    }, now);
    if (todayManila(clock()) !== date) continue;
    try {
      const response = await cooperativeDirectus("/items/cooperative_dividend_runs?fields=id", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          calendar_year: year, draft_id: preview.draft.id, snapshot: run,
          audit_event_id: { ...event, actor_name: actor.actorName, dividend_source_revision: revision + 1 },
          posting_commands: { create: [...children, {
            command_type: runCommand, idempotency_key: command.key, request_hash: command.hash,
            actor_user_id: actor.actorId, created_at: at, result: { year, reference }, journal_series_id: series.reference,
          }] },
        }),
      }, 60_000);
      await response.body?.cancel();
      return { run, duplicate: false };
    } catch (error) {
      const saved = await recover();
      if (saved) return saved;
      const existing = await getDividendRun(year);
      if (existing) throw new MemberError(409, "Dividends for this year are already posted.", "DIVIDEND_YEAR_POSTED", undefined, { run: existing });
      if (!isCooperativeWriteCollision(error)) {
        throw new MemberError(503, "Dividend posting could not be confirmed. Retry with the same request.", "DIVIDEND_RETRY");
      }
    }
  }
  throw new MemberError(409, "The posting inputs changed. Refresh the review and confirm again.", "DIVIDEND_PREVIEW_CHANGED");
}
