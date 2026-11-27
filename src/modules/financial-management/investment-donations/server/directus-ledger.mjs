import { ledgerConnectionBase } from "./connection-url.mjs";

export function ledgerClient() {
  const base = process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/+$/, "");
  const token = process.env.DIRECTUS_STATIC_TOKEN;
  if (!base || !token) throw new Error("Directus ledger is not configured.");
  const origin = ledgerConnectionBase(base);
  return async (collection, { query = {}, method = "GET", body } = {}) => {
    if (!/^cgl_[a-z_]+$/.test(collection) || method !== "GET" || body !== undefined) throw new Error("The Directus ledger adapter is read-only and module-scoped.");
    const response = await fetch(`${origin}/items/${collection}?${new URLSearchParams(query)}`, {
      method, headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
      cache: "no-store", redirect: "error", signal: AbortSignal.timeout(30000),
    });
    if (!response.ok) {
      const error = await response.json().catch(() => null);
      throw new Error(`${method} ${collection}: HTTP ${response.status} (${error?.errors?.[0]?.extensions?.code ?? "unknown"})`);
    }
    return response.status === 204 ? null : (await response.json()).data;
  };
}

/** @param {object} [filter] */
export async function ledgerRows(request, collection, sort, filter) {
  const rows = [];
  for (;;) {
    const page = await request(collection, { query: { sort, limit: "100", offset: String(rows.length),
      ...(filter ? { filter: JSON.stringify(filter) } : {}) } });
    if (!Array.isArray(page)) throw new Error(`Invalid response for ${collection}.`);
    if (!page.length) return rows;
    rows.push(...page);
    if (rows.length > 1_000_000) throw new Error(`Ledger row limit exceeded for ${collection}.`);
  }
}
