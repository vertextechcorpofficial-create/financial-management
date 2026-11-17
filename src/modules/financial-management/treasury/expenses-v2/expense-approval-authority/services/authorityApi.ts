export const AUTHORITY_API = "/api/fm/treasury/expenses-v2/expense-approval-authority";
export class AuthorityApiError extends Error {
  constructor(message: string, public code: string, public status: number) { super(message); }
}
export async function authorityApi<T>(resource: string, body?: unknown, signal?: AbortSignal): Promise<T> {
  const response = await fetch(`${AUTHORITY_API}/${resource}`, { method: body === undefined ? "GET" : "POST",
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body), cache: "no-store", signal });
  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload || !("data" in payload)) throw new AuthorityApiError(payload?.error || "Authority service returned an invalid response. Your save is not confirmed.", payload?.code || "INVALID_RESPONSE", response.status);
  return payload.data as T;
}
