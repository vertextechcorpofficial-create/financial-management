import assert from "node:assert/strict";
import { test } from "node:test";
import { calculateWithdrawalBalance, readWithdrawalBalances, type WithdrawalBalanceSnapshot } from "./withdrawal-balances";

const snapshot: WithdrawalBalanceSnapshot = {
  membershipId: 12,
  status: "ACTIVE",
  postedSavings: "1500.00",
  maintainingBalance: "1000.00",
  pendingReservations: [],
};
const reservation = { requestId: "W-2025-0081", amount: "350.00" };

test("a pending request reserves savings and a release consumes that reservation once", () => {
  assert.equal(calculateWithdrawalBalance(snapshot).availableSavings, "500.00");
  const pending = calculateWithdrawalBalance({ ...snapshot, pendingReservations: [reservation] });
  assert.deepEqual(pending, {
    postedSavings: "1500.00", maintainingBalance: "1000.00", pendingAmount: "350.00", pendingCount: 1, availableSavings: "150.00",
  });
  const released = calculateWithdrawalBalance({ ...snapshot, postedSavings: "1150.00" });
  assert.deepEqual(released, {
    postedSavings: "1150.00", maintainingBalance: "1000.00", pendingAmount: "0.00", pendingCount: 0, availableSavings: "150.00",
  });
});

test("rejection or cancellation restores available savings without changing posted savings", () => {
  const pending = calculateWithdrawalBalance({ ...snapshot, pendingReservations: [reservation] });
  const freed = calculateWithdrawalBalance(snapshot);
  assert.equal(freed.postedSavings, pending.postedSavings);
  assert.equal(freed.pendingAmount, "0.00");
  assert.equal(freed.availableSavings, "500.00");
});

test("deduplicates reservation identities across years and retains exact centavos", () => {
  const balance = calculateWithdrawalBalance({
    ...snapshot, postedSavings: "90071992547409.93", maintainingBalance: "90071992547409.61",
    pendingReservations: [
      { requestId: "W-2025-0081", amount: "0.1" },
      { requestId: "W-2025-0081", amount: "0.10" },
      { requestId: "W-2026-0001", amount: "0.21" },
    ],
  });
  assert.equal(balance.pendingAmount, "0.31");
  assert.equal(balance.pendingCount, 2);
  assert.equal(balance.availableSavings, "0.01");
});

test("floors active availability at zero and identifies a separated account", () => {
  const underfunded = { ...snapshot, postedSavings: "1030.00", pendingReservations: [reservation] };
  assert.equal(calculateWithdrawalBalance(underfunded).availableSavings, "0.00");
  assert.equal(calculateWithdrawalBalance({ ...underfunded, status: "SEPARATED" }).availableSavings, null);
  assert.deepEqual(calculateWithdrawalBalance({ ...snapshot, postedSavings: "-0.01" }), {
    postedSavings: "-0.01", maintainingBalance: "1000.00", pendingAmount: "0.00", pendingCount: 0, availableSavings: "0.00",
  });
});

test("distinguishes verified zero reservations from pending rollout and read failures", async () => {
  const ready = await readWithdrawalBalances([12], async () => ({ state: "ready", data: [snapshot] }));
  assert.equal(ready.state, "ready");
  if (ready.state === "ready") assert.equal(ready.data.get(12)?.pendingAmount, "0.00");
  assert.equal((await readWithdrawalBalances([12])).state, "pending_rollout");
  assert.equal((await readWithdrawalBalances([12], async () => { throw new Error("source offline"); })).state, "unavailable");
});

test("rejects incomplete snapshots and reservations that cannot be verified", async () => {
  const invalid = [
    [],
    [snapshot, snapshot],
    [{ ...snapshot, membershipId: 77 }],
    [{ ...snapshot, postedSavings: "1500.001" }],
    [{ ...snapshot, pendingReservations: [{ ...reservation, amount: "0.00" }] }],
    [{ ...snapshot, pendingReservations: [reservation, { ...reservation, amount: "349.99" }] }],
  ];
  for (const data of invalid) {
    assert.equal((await readWithdrawalBalances([12], async () => ({ state: "ready", data }))).state, "unavailable");
  }
});
