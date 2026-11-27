import "server-only";

import { z } from "zod";
import { cooperativeAuditTime } from "./audit";
import { cooperativeDirectus, CooperativeDirectusError, readDirectusItems } from "./directus";
import { loanDigest, type LoanActor } from "./loan-commands";
import { readSavingsRevision } from "./withdrawal-store";

export class SavingsCommandError extends Error {
  constructor(readonly status: number, message: string, readonly code: string) {
    super(message);
  }
}

export type SavingsCommand<T> = { type: string; key: string; hash: string; result: z.ZodType<T> };

export async function findSavingsCommand<T>(command: SavingsCommand<T>) {
  const query = new URLSearchParams({
    fields: "request_hash,result", limit: "2",
    filter: JSON.stringify({ command_type: { _eq: command.type }, idempotency_key: { _eq: command.key } }),
  });
  const { data } = z.object({ data: z.array(z.object({ request_hash: z.string(), result: z.unknown() })).max(1) })
    .parse(await readDirectusItems("cooperative_command_receipts", query));
  const receipt = data[0];
  if (!receipt) return null;
  if (receipt.request_hash !== command.hash) {
    throw new SavingsCommandError(409, "This request key was already used for different details.", "IDEMPOTENCY_CONFLICT");
  }
  return { ...command.result.parse(receipt.result), duplicate: true };
}

export async function writeSavingsCommand<T>(
  command: SavingsCommand<T>, memberId: number, revision: number, actor: LoanActor,
  errors: { stale: () => Error; retry: () => Error },
  prepare: (now: Date) => Promise<{ result: T; relations: Record<string, unknown>; membership: Record<string, unknown> }>,
) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const now = new Date();
    const prepared = await prepare(now);
    try {
      // The unique revision key is claimed in the same native mutation as the member update and its nested writes.
      await cooperativeDirectus("/items/cooperative_command_receipts?fields=id", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...prepared.relations,
          membership_id: { ...prepared.membership, id: memberId, savings_revision: revision + 1 },
          command_type: command.type, idempotency_key: command.key, request_hash: command.hash,
          savings_revision_key: loanDigest([memberId, revision]), actor_user_id: actor.actorId,
          result: prepared.result, created_at: cooperativeAuditTime(now),
        }),
      }, 60_000);
      return { ...prepared.result, duplicate: false };
    } catch (cause) {
      const prior = await findSavingsCommand(command);
      if (prior) return prior;
      if (await readSavingsRevision(memberId) !== revision) throw errors.stale();
      if (!(cause instanceof CooperativeDirectusError) || !/unique|duplicate|already exists|deadlock/i.test(cause.detail ?? "")) break;
    }
  }
  throw errors.retry();
}
