import "server-only";

import { z } from "zod";
import { buildDashboardSummary, dashboardBusinessDate } from "../console/dashboard/dashboard-summary";
import type { CooperativeWorkspaceKey } from "../workspaces";
import { readDirectusItems } from "./directus";

const journal = z.object({ data: z.array(z.object({ id: z.union([z.number(), z.string()]) })).max(1) });

async function readRecentTransactions(asOf: string) {
  try {
    const query = new URLSearchParams({ fields: "id", "filter[business_date][_lte]": asOf, limit: "1" });
    const { data } = journal.parse(await readDirectusItems("cooperative_journals", query));
    if (!data.length) return { state: "available", rows: [] } as const;
    // GL journal headers establish posting, but the member, channel and amount belong to Transactions.
    return { state: "pending", message: "Waiting for the member transaction journal." } as const;
  } catch {
    return { state: "failed", message: "Could not load recent transactions." } as const;
  }
}

export async function getDashboard(grants: readonly CooperativeWorkspaceKey[]) {
  const asOf = dashboardBusinessDate();
  const transactions = await readRecentTransactions(asOf);
  return buildDashboardSummary(asOf, { transactions }, grants);
}
