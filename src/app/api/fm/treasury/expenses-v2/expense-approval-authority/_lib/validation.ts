import { z } from "zod";
import { TIERS } from "@/modules/financial-management/treasury/expenses-v2/expense-approval-authority/types";

const id = z.number().int().positive().safe();
const key = z.string().uuid();
const reason = z.string().trim().min(5).max(2000);
const timestamp = z.string().datetime({ offset: true }).transform(v => new Date(v).toISOString());
const rule = z.object({ code: z.string().max(60), name: z.string().max(100), page: z.number().int().min(1).max(2),
  departmentHead: z.string().max(20).nullable(), generalManager: z.string().max(20), cfo: z.string().max(20), coaIds: z.array(id).max(100) }).strict();
export const commandSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("CREATE_POLICY"), companyId: id, name: z.string().trim().min(3).max(150), sourceId: key.optional(), reason }).strict(),
  z.object({ action: z.literal("UPDATE_POLICY"), id: key, name: z.string().trim().min(3).max(150), rules: z.array(rule).length(25), reason }).strict(),
  z.object({ action: z.literal("SUBMIT_POLICY"), id: key, reason }).strict(),
  z.object({ action: z.literal("PUBLISH_POLICY"), id: key, effectiveFrom: timestamp, effectiveTo: timestamp.nullable(), signedReference: z.string().trim().min(5).max(1000), authorized: z.literal(true), reason }).strict(),
  z.object({ action: z.literal("REVOKE_POLICY"), id: key, reason }).strict(),
  z.object({ action: z.literal("CREATE_DELEGATION"), companyId: id, userId: id, tier: z.enum(TIERS), divisionId: id.nullable(), departmentId: id.nullable(), startsAt: timestamp, endsAt: timestamp.nullable(), reason }).strict(),
  z.object({ action: z.literal("REVOKE_DELEGATION"), id: key, reason }).strict(),
  z.object({ action: z.literal("RESOLVE_EXCEPTION"), id: key, status: z.enum(["IN_REVIEW", "RESOLVED", "DISMISSED"]), reason }).strict(),
]);
export const mutationSchema = z.object({ expectedRevision: z.number().int().nonnegative().safe(), requestId: key, command: commandSchema }).strict();
export const evaluationSchema = z.object({
  policyId: key, expenseId: id.nullable(),
  categoryCode: z.string().min(1).max(60).optional(), amount: z.string().max(20).optional(),
  divisionId: id.nullable().optional(), departmentId: id.nullable().optional(), coaId: id.nullable().optional(),
  save: z.boolean(), expectedRevision: z.number().int().nonnegative().safe(), requestId: key,
}).strict();
