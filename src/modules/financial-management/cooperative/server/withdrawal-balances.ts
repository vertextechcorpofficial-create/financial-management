import "server-only";

import { z } from "zod";
import { amountToCents, centsToAmount, signedCentsToAmount } from "./member-read";
import { readWithdrawalSnapshots, withdrawalPostingEnabled, withdrawalPendingMessage } from "./withdrawal-store";

export type WithdrawalSource<T> =
  | { state: "ready"; data: T }
  | { state: "pending_rollout" | "unavailable"; message: string };

const amount = z.string().regex(/^\d+(?:\.\d{1,2})?$/);
const snapshotSchema = z.object({
  membershipId: z.number().int().positive(),
  status: z.enum(["ACTIVE", "SEPARATED"]),
  postedSavings: z.string().regex(/^-?\d+(?:\.\d{1,2})?$/),
  maintainingBalance: amount,
  pendingReservations: z.array(z.object({ requestId: z.string().trim().min(1), amount })),
});

export type WithdrawalBalanceSnapshot = z.output<typeof snapshotSchema>;
export type WithdrawalBalance = {
  postedSavings: string;
  maintainingBalance: string;
  pendingAmount: string;
  pendingCount: number;
  availableSavings: string | null;
};

// The posting service supplies one committed snapshot per membership. Pending reservations
// include commitments from any year, and the policy amount belongs to the same snapshot.
type WithdrawalSnapshotReader = (membershipIds: readonly number[]) => Promise<WithdrawalSource<WithdrawalBalanceSnapshot[]>>;

const readCommittedSnapshots: WithdrawalSnapshotReader = async ids => withdrawalPostingEnabled()
  ? { state: "ready", data: await readWithdrawalSnapshots([...ids]) }
  : { state: "pending_rollout", message: withdrawalPendingMessage };

export function calculateWithdrawalBalance(snapshot: WithdrawalBalanceSnapshot): WithdrawalBalance {
  const verified = snapshotSchema.parse(snapshot);
  const reservations = new Map<string, bigint>();
  for (const reservation of verified.pendingReservations) {
    const cents = amountToCents(reservation.amount);
    const previous = reservations.get(reservation.requestId);
    if (cents === 0n || (previous !== undefined && previous !== cents)) {
      throw new Error("A pending withdrawal reservation could not be verified.");
    }
    reservations.set(reservation.requestId, cents);
  }
  const pending = [...reservations.values()].reduce((total, cents) => total + cents, 0n);
  const savings = amountToCents(verified.postedSavings);
  const maintaining = amountToCents(verified.maintainingBalance);
  const available = savings - maintaining - pending;
  return {
    postedSavings: signedCentsToAmount(savings),
    maintainingBalance: centsToAmount(maintaining),
    pendingAmount: centsToAmount(pending),
    pendingCount: reservations.size,
    availableSavings: verified.status === "ACTIVE" ? centsToAmount(available > 0n ? available : 0n) : null,
  };
}

export async function readWithdrawalBalances(
  membershipIds: readonly number[],
  readSnapshots: WithdrawalSnapshotReader = readCommittedSnapshots,
): Promise<WithdrawalSource<Map<number, WithdrawalBalance>>> {
  const ids = new Set(membershipIds);
  try {
    const snapshots = await readSnapshots([...ids]);
    if (snapshots.state !== "ready") return snapshots;
    const balances = new Map<number, WithdrawalBalance>();
    for (const snapshot of snapshots.data) {
      if (!ids.has(snapshot.membershipId) || balances.has(snapshot.membershipId)) {
        throw new Error("Withdrawal balance snapshots do not match the requested memberships.");
      }
      balances.set(snapshot.membershipId, calculateWithdrawalBalance(snapshot));
    }
    if (balances.size !== ids.size) throw new Error("A membership withdrawal balance is missing.");
    return { state: "ready", data: balances };
  } catch {
    return { state: "unavailable", message: "Withdrawal balances could not be verified. Try again." };
  }
}
