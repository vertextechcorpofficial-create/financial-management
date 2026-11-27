import "server-only";

import { z } from "zod";

const foundationCollections = [
  "cooperative_policy_settings",
  "cooperative_loan_products",
  "cooperative_loan_product_items",
  "cooperative_document_types",
  "cooperative_policy_document_requirements",
  "cooperative_product_document_requirements",
  "cooperative_gl_accounts",
  "cooperative_account_mappings",
  "cooperative_number_series",
  "cooperative_journals",
  "cooperative_gl_lines",
  "cooperative_command_receipts",
  "cooperative_audit_events",
] as const;

type Collection =
  | typeof foundationCollections[number]
  | "cooperative_documents"
  | "cooperative_clearances"
  | "cooperative_loans"
  | "cooperative_loan_installments"
  | "cooperative_loan_payments"
  | "cooperative_loan_payment_allocations"
  | "cooperative_memberships"
  | "cooperative_membership_agreements"
  | "cooperative_savings_entries"
  | "cooperative_transaction_entries"
  | "cooperative_payroll_remittance_batches"
  | "cooperative_payroll_remittance_lines"
  | "cooperative_payroll_record_links"
  | "cooperative_reconciliation_evidence"
  | "cooperative_dividend_drafts"
  | "cooperative_dividend_runs"
  | "cooperative_withdrawal_requests"
  | "cooperative_official_receipts"
  | "payroll_run"
  | "payroll_run_employee"
  | "coop_savings_membership"
  | "employee_loan"
  | "user"
  | "department"
  | "modules"
  | "user_access_modules";

const PrimaryKey = z.union([z.number().int().positive(), z.string().regex(/^[1-9]\d*$/)]);
const Rows = z.object({ data: z.array(z.object({ id: PrimaryKey })).max(1) });
const Settings = z.object({ data: z.object({ id: PrimaryKey.nullable() }).nullable() });

export class CooperativeDirectusError extends Error {
  constructor(readonly status: number, readonly detail?: string) {
    super("The Cooperative data service could not complete the request.");
  }
}

export function usesCooperativeQaDatabase() {
  return process.env.NEXT_PUBLIC_API_BASE_URL?.trim().replace(/\/+$/, "") === "http://100.110.197.61:8056";
}

export async function cooperativeDirectus(path: string, init: RequestInit = {}, timeout = 10_000) {
  const base = process.env.NEXT_PUBLIC_API_BASE_URL?.trim().replace(/\/+$/, "");
  const token = process.env.DIRECTUS_STATIC_TOKEN?.trim();
  if (!base || !token) throw new Error("Directus is not configured.");

  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${token}`);
  const response = await fetch(`${base}${path}`, {
    ...init,
    headers,
    cache: "no-store",
    redirect: "error",
    signal: AbortSignal.timeout(timeout),
  });
  if (!response.ok) {
    const body = await response.json().catch(() => null) as { errors?: Array<{ message?: unknown }> } | null;
    const detail = body?.errors?.find(error => typeof error?.message === "string")?.message;
    throw new CooperativeDirectusError(response.status, typeof detail === "string" ? detail : undefined);
  }
  return response;
}

export async function readDirectusItems(collection: Collection, query: URLSearchParams): Promise<unknown> {
  const response = await cooperativeDirectus(`/items/${collection}?${query}`, {
    headers: { Accept: "application/json" },
  });
  return response.json();
}

export async function readDirectusPages<T extends z.ZodType>(
  collection: Collection, schema: T, query: Record<string, string>,
): Promise<z.output<T>[]> {
  const size = 100;
  const parameters = new URLSearchParams({ sort: "id", ...query, limit: String(size) });
  const pageSchema = z.object({ data: z.array(schema).max(size) });
  const rows: z.output<T>[] = [];
  for (let offset = 0; ; offset += size) {
    parameters.set("offset", String(offset));
    const { data } = pageSchema.parse(await readDirectusItems(collection, parameters));
    rows.push(...data);
    if (data.length < size) return rows;
  }
}

export async function readDirectusByIds<T extends z.ZodType>(
  collection: Collection, schema: T, fields: string, field: string, ids: readonly number[], filter: object = {},
) {
  const unique = [...new Set(ids)];
  const rows: z.output<T>[] = [];
  for (let offset = 0; offset < unique.length; offset += 50) {
    rows.push(...await readDirectusPages(collection, schema, {
      fields, filter: JSON.stringify({ ...filter, [field]: { _in: unique.slice(offset, offset + 50) } }),
    }));
  }
  return rows;
}

export async function isCooperativeDataReady() {
  const query = new URLSearchParams({ fields: "id", limit: "1" });
  try {
    const results = await Promise.all(foundationCollections.map(async collection => {
      const schema = collection === "cooperative_policy_settings" ? Settings : Rows;
      return schema.safeParse(await readDirectusItems(collection, query)).success;
    }));
    return results.every(Boolean);
  } catch {
    return false;
  }
}
