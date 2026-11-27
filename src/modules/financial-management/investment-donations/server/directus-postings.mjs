import { createHash } from "node:crypto";
import { ledgerConnectionBase } from "./connection-url.mjs";

const uuid = value => typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

function client() {
  const base = ledgerConnectionBase(process.env.NEXT_PUBLIC_API_BASE_URL);
  const token = process.env.DIRECTUS_STATIC_TOKEN;
  if (!token) throw new Error("Directus ledger is not configured.");
  return { base, headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" } };
}

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object") return Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])]));
  return value;
}
export function postingHash(operation, input) {
  return createHash("sha256").update(JSON.stringify(stable({ operation, input }))).digest("hex");
}

export async function getPosting(commandId) {
  if (!uuid(commandId)) throw new Error("Invalid posting command ID.");
  const { base, headers } = client();
  const query = new URLSearchParams({ limit: "1", "filter[command_id][_eq]": commandId.toLowerCase() });
  const response = await fetch(`${base}/items/cgl_postings?${query}`, { headers, redirect: "error", cache: "no-store", signal: AbortSignal.timeout(30000) });
  if (!response.ok) throw new Error(`Directus posting lookup failed (${response.status}).`);
  const body = await response.json();
  return Array.isArray(body.data) ? body.data[0] ?? null : null;
}

/**
 * Creates the only authoritative record in the no-extension design. The
 * unique command_id and state_revision constraints turn duplicate/retry and
 * concurrent same-revision attempts into safe conflicts. The caller must have
 * generated and validated the complete immutable snapshot before calling this.
 */
export async function createPosting({ commandId, stateRevision, actor, operation, postingDate, input, snapshot }) {
  if (!uuid(commandId) || !Number.isSafeInteger(stateRevision) || stateRevision < 0 || !Number.isSafeInteger(actor) || actor <= 0 ||
      typeof operation !== "string" || !/^\w[\w-]{0,39}$/.test(operation) || !/^\d{4}-\d{2}-\d{2}$/.test(postingDate) ||
      !snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)) throw new Error("The complete validated posting snapshot is required.");
  const { base, headers } = client();
  const payload = { command_id: commandId.toLowerCase(), state_revision: stateRevision, actor, operation,
    payload_hash: postingHash(operation, input), posting_date: postingDate, status: "posted", snapshot };
  const response = await fetch(`${base}/items/cgl_postings`, { method: "POST", headers, body: JSON.stringify(payload),
    redirect: "error", cache: "no-store", signal: AbortSignal.timeout(30000) });
  const body = await response.json().catch(() => null);
  if (response.ok) return body?.data ?? payload;
  if ([400, 409].includes(response.status)) {
    const existing = await getPosting(commandId);
    if (existing && existing.payload_hash === payload.payload_hash && existing.actor === actor) return { ...existing, replayed: true };
  }
  throw new Error(`Posting was not committed (${response.status}). Retry using the same command ID only after checking status.`);
}
