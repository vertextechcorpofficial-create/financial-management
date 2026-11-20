"use server";

import { z } from "zod";
import { ledgerAccess } from "./access";
import { directusTransaction } from "./transaction-client";
import type { WorkspaceKey } from "../workspaces";

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const cash = z.object({
  type: z.enum(["transfer", "fee", "interest", "taxpay"]), date,
  amount: z.number().positive().max(1e12), account: z.enum(["1000", "1010", "1020"]),
  target: z.string().max(100).optional(), memo: z.string().max(250),
});
const reversal = z.object({ id: z.string().uuid(), date, reason: z.string().trim().min(1).max(200) });
const permissions: Record<z.infer<typeof cash>["type"], WorkspaceKey> = {
  transfer: "inflows-investing", interest: "inflows-investing", fee: "portfolio-rebalancing", taxpay: "tax-compliance",
};

async function submit(command: object, workspace: WorkspaceKey) {
  try {
    const access = await ledgerAccess();
    if (!access?.admin || !access.workspaces.includes(workspace)) return { ok: false as const, message: "You do not have permission for this ledger action." };
    const response = await directusTransaction("/commands", { ...command, actor: access.id });
    const result = await response.json().catch(() => null);
    if (response.status === 400 && typeof result?.message === "string") return { ok: false as const, message: result.message };
    const posted = z.object({ number: z.number().int().positive() }).safeParse(result);
    if (response.status !== 201 || !posted.success) return { ok: false as const, message: "Posting could not be confirmed. Refresh Transactions before retrying." };
    return { ok: true as const, number: posted.data.number };
  } catch {
    return { ok: false as const, message: "Posting could not be confirmed. Refresh Transactions before retrying." };
  }
}

export async function recordCashEntry(input: unknown) {
  const result = cash.safeParse(input);
  return result.success ? submit(result.data, permissions[result.data.type]) : { ok: false as const, message: "Enter a valid date, amount and cash account." };
}

export async function reverseEntry(input: unknown) {
  const result = reversal.safeParse(input);
  return result.success ? submit({ ...result.data, type: "reverse" }, "transactions") : { ok: false as const, message: "Enter a reversal date and reason." };
}
