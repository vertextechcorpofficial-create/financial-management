import { z } from "zod";
import { directus, readRows, enabled } from "../../expense-approval-authority/_lib/directus";
import { AuthorityError } from "@/modules/financial-management/treasury/expenses-v2/expense-approval-workflow/domain/authorityErrors";
import type { AuthorityActor } from "@/modules/financial-management/treasury/expenses-v2/expense-approval-workflow/types";
import type { DummyConfig } from "@/modules/financial-management/treasury/expenses-v2/expense-approval-workflow/domain/dummyWorkflow";
import type { IndependentExpenseEvent } from "@/modules/financial-management/treasury/expenses-v2/expense-approval-workflow/independentTypes";
import { REQUEST_COLLECTION, REQUEST_FIELDS } from "./independent";
import { dummyTier } from "@/modules/financial-management/treasury/expenses-v2/expense-approval-workflow/domain/dummyWorkflow";

export const CONFIG_CASE = "00000000-0000-4000-8000-000000000001";
export const dummyConfigSchema = z.object({
  kind: z.literal("DUMMY_WORKFLOW_CONFIG"), enabled: z.boolean(), origin: z.string().url(),
  companyId: z.number().int().positive(), companyName: z.string().trim().min(2).max(200),
  financeId: z.number().int().positive().optional(), officers: z.object({ DH: z.number().int().positive(), GM: z.number().int().positive(), CFO: z.number().int().positive(), CEO: z.number().int().positive() }).strict(),
  perRequestBudget: z.string().max(20).optional(), policyVersion: z.literal("MEMO_FIXTURE_V1"), routing: z.literal("DIRECT_TO_TIER_TEST"),
  administrators: z.array(z.number().int().positive()).max(10).optional(), auditors: z.array(z.number().int().positive()).max(20).optional(),
}).strict();
export interface ConfigEvent { id: string; revision: number; snapshot: DummyConfig; }
export async function dummyConfiguration(): Promise<ConfigEvent | null> {
  const rows = await readRows<ConfigEvent>(REQUEST_COLLECTION, REQUEST_FIELDS, { case_id: { _eq: CONFIG_CASE } }, 1, { sort: "-revision" });
  if (!rows.length) return null;
  const parsed = dummyConfigSchema.safeParse(rows[0].snapshot);
  if (!parsed.success) throw new AuthorityError("DUMMY_CONFIG", "Dummy configuration is invalid; actions are disabled.", 503);
  return { ...rows[0], snapshot: parsed.data };
}
export function storageOrigin() {
  const base = process.env.NEXT_PUBLIC_API_BASE_URL;
  if (!base) throw new AuthorityError("STORAGE_UNAVAILABLE", "Directus is not configured.", 503);
  return new URL(base).origin;
}
export function requireDummyConfig(config: ConfigEvent | null): ConfigEvent {
  if (process.env.FM_WORKFLOW_DUMMY_DISABLED === "true" || !config?.snapshot.enabled || config.snapshot.origin !== storageOrigin()) throw new AuthorityError("DUMMY_DISABLED", "Dummy testing is disabled or its confirmed storage origin has changed. An administrator must configure Dummy testing first.", 503);
  return config;
}
export function canReadDummy(actor: AuthorityActor, event: IndependentExpenseEvent, config: ConfigEvent | null) {
  if (event.requester_id === actor.id) return true;
  if (event.snapshot.executionMode !== "DUMMY" || event.snapshot.status === "DRAFT") return false;
  if (!config?.snapshot.enabled || config.snapshot.origin !== storageOrigin()) return false;
  return actor.id === config.snapshot.officers[dummyTier(event.snapshot.category, event.snapshot.amount)] || actor.id === event.snapshot.dummyLastOfficerId;
}
export async function verifyLedgerContract() {
  const response = await directus<{ data: { field: string; type: string; schema?: { is_primary_key?: boolean; is_unique?: boolean; max_length?: number } }[] }>(`fields/${REQUEST_COLLECTION}`);
  const fields = response.data;
  if (!Array.isArray(fields) || !fields.some(f => f.field === "id" && f.schema?.is_primary_key && (f.schema.max_length || 0) >= 80) || !fields.some(f => f.field === "request_key" && f.schema?.is_unique) || !fields.some(f => f.field === "snapshot" && f.type === "json")) throw new AuthorityError("LEDGER_CONTRACT", "Unique ledger keys and JSON snapshots must be verified before Dummy decisions are enabled.", 503);
}
export async function verifyTesters(config: DummyConfig) {
  const ids = [...new Set(Object.values(config.officers))];
  const users = await readRows<{ user_id: number; is_deleted?: unknown; isDeleted?: unknown; is_blocked?: unknown }>("user", "user_id,is_deleted,isDeleted,is_blocked", { user_id: { _in: ids } }, ids.length + 1);
  for (const id of ids) {
    const user = users.find(row => Number(row.user_id) === id);
    if (!user || enabled(user.is_deleted) || enabled(user.isDeleted) || enabled(user.is_blocked)) throw new AuthorityError("TESTER_INVALID", `Tester #${id} must be an active ERP account.`, 422);
  }
}
