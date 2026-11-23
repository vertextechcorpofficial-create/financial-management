import { AuthorityError } from "@/modules/financial-management/treasury/expenses-v2/expense-approval-workflow/domain/authorityErrors";

export const COLLECTION = "fm_expense_authority_revisions";
export type Filter = Record<string, unknown>;
export async function directus<T>(path: string, init: RequestInit = {}): Promise<T> {
  const base = process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/+$/, "");
  const token = process.env.DIRECTUS_STATIC_TOKEN;
  if (!base || !token) throw new AuthorityError("STORAGE_UNAVAILABLE", "Directus is not configured.", 503);
  let response: Response;
  try {
    response = await fetch(`${base}/${path}`, { ...init, cache: "no-store", signal: AbortSignal.timeout(15_000),
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...init.headers } });
  } catch { throw new AuthorityError("UPSTREAM_UNAVAILABLE", "Directus did not respond. Retry with the same request ID if saving.", 503); }
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    const duplicate = (payload.errors || []).some((e: { extensions?: { code?: string } }) => ["RECORD_NOT_UNIQUE", "RECORD_ALREADY_EXISTS"].includes(e.extensions?.code || ""));
    if (duplicate || response.status === 409) throw new AuthorityError("REVISION_CONFLICT", "Another change was saved first. Refresh and review before saving again.", 409);
    if (response.status === 403 || response.status === 404) throw new AuthorityError("STORAGE_UNAVAILABLE", "Required Directus collection or permission is unavailable. Contact the administrator.", 503);
    throw new AuthorityError("UPSTREAM_ERROR", `Directus request failed (${response.status}); no success is assumed.`, 502);
  }
  return response.json() as Promise<T>;
}
export async function readRows<T>(collection: string, fields: string, filter: Filter = {}, limit = 50, extra: Record<string, string> = {}): Promise<T[]> {
  const query = new URLSearchParams({ fields, filter: JSON.stringify(filter), limit: String(limit), ...extra });
  const result = await directus<{ data: T[] }>(`items/${collection}?${query}`);
  if (!Array.isArray(result.data)) throw new AuthorityError("INVALID_UPSTREAM", "Invalid Directus response.", 502);
  return result.data;
}
export function enabled(value: unknown) { return value === true || value === 1 || value === "1"; }
