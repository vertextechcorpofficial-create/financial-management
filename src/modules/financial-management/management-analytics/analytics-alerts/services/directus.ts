import "server-only";

/**
 * Directus access for Management Analytics.
 *
 * Server-only: the static token must never reach a client bundle. Every route in
 * `src/app/api/fm/treasury/bank-management-v2/**` goes through this client, so the
 * module has one place that knows the base URL, the error shape and the field rules.
 */

const BASE_URL = (process.env.NEXT_PUBLIC_API_BASE_URL || "").replace(/\/+$/, "");
const TOKEN = process.env.DIRECTUS_STATIC_TOKEN || "";

export class DirectusError extends Error {
  status: number;
  body: string;

  constructor(message: string, status: number, body: string) {
    super(message);
    this.name = "DirectusError";
    this.status = status;
    this.body = body;
  }
}

export type DirectusList<T> = {
  data?: T[];
  meta?: { filter_count?: number | string };
};

function assertConfigured() {
  if (!BASE_URL) throw new Error("NEXT_PUBLIC_API_BASE_URL is not configured");
  if (!TOKEN) throw new Error("DIRECTUS_STATIC_TOKEN is not configured");
}

/** Backoff between attempts at a read that never reached the host. */
const RETRY_DELAYS_MS = [300];

/** A host that has not answered in six seconds is not about to answer this request either. */
const REQUEST_TIMEOUT_MS = 12000;

/**
 * A failed connect arrives from undici as a bare `TypeError: fetch failed` and a silent host as an
 * abort; anything Directus itself answered is a `DirectusError`, and repeating it repeats the answer.
 */
function isTransportFailure(error: unknown): boolean {
  return error instanceof TypeError || (error instanceof DOMException && error.name === "TimeoutError");
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function requestOnce<T>(url: string, path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    cache: "no-store",
    ...init,
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${TOKEN}`,
      ...(init?.headers ?? {}),
    },
  });

  const text = await response.text().catch(() => "");
  if (!response.ok) {
    // The path belongs in the message: a bare 400 from Directus says nothing about which call broke.
    throw new DirectusError(`Directus request failed (${response.status}) on ${path.split("?")[0]}`, response.status, text);
  }
  return (text ? JSON.parse(text) : {}) as T;
}

export async function directusFetch<T>(path: string, init?: RequestInit): Promise<T> {
  assertConfigured();

  const url = `${BASE_URL}${path.startsWith("/") ? "" : "/"}${path}`;
  // Reads retry a transport failure, because a dropped connection says nothing about the data and the
  // desk read it as "the data desk could not be read" about one load in three. Writes do not retry: a
  // write that did land would land twice.
  const attempts = (init?.method ?? "GET").toUpperCase() === "GET" ? RETRY_DELAYS_MS.length + 1 : 1;

  for (let attempt = 0; ; attempt += 1) {
    try {
      return await requestOnce<T>(url, path, init);
    } catch (error) {
      if (!isTransportFailure(error) || attempt >= attempts - 1) throw error;
      await delay(RETRY_DELAYS_MS[attempt] ?? RETRY_DELAYS_MS[RETRY_DELAYS_MS.length - 1]);
    }
  }
}

export function queryString(params: Record<string, string | number | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === "") continue;
    search.set(key, String(value));
  }
  const query = search.toString();
  return query ? `?${query}` : "";
}

/** Reads a collection page. `fields` must be explicit: `fields=*` is forbidden on this instance. */
export async function listItems<T>(
  collection: string,
  options: {
    fields: string[];
    filter?: Record<string, unknown>;
    sort?: string | string[];
    limit?: number;
    page?: number;
  },
): Promise<{ rows: T[]; total: number }> {
  const limit = options.limit ?? 100;
  const page = options.page ?? 1;
  const query = queryString({
    fields: options.fields.join(","),
    filter: options.filter ? JSON.stringify(options.filter) : undefined,
    sort: Array.isArray(options.sort) ? options.sort.join(',') : options.sort,
    limit,
    page,
    meta: "filter_count",
  });

  const response = await directusFetch<DirectusList<T>>(`/items/${collection}${query}`);
  const total = Number(response.meta?.filter_count ?? response.data?.length ?? 0);
  return { rows: response.data ?? [], total };
}

export async function getItem<T>(collection: string, id: string | number, fields: string[]): Promise<T | null> {
  const query = queryString({ fields: fields.join(",") });
  const response = await directusFetch<{ data?: T }>(`/items/${collection}/${id}${query}`);
  return response.data ?? null;
}

export async function createItem<T>(collection: string, payload: Record<string, unknown>): Promise<T> {
  const response = await directusFetch<{ data: T }>(`/items/${collection}`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
  return response.data;
}

export async function createItems(
  collection: string,
  payloads: Record<string, unknown>[],
): Promise<void> {
  if (payloads.length === 0) return;
  await directusFetch<{ data: unknown[] }>(`/items/${collection}`, {
    method: "POST",
    body: JSON.stringify(payloads),
  });
}

export async function updateItem<T>(
  collection: string,
  id: string | number,
  payload: Record<string, unknown>,
): Promise<T> {
  const response = await directusFetch<{ data: T }>(`/items/${collection}/${id}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
  return response.data;
}

export async function deleteItem(collection: string, id: string | number): Promise<void> {
  await directusFetch<unknown>(`/items/${collection}/${id}`, { method: "DELETE" });
}

export function asString(value: unknown): string {
  if (typeof value === "string") return value.trim();
  return value == null ? "" : String(value).trim();
}

export function asNumberOrNull(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

export function asNumber(value: unknown, fallback = 0): number {
  return asNumberOrNull(value) ?? fallback;
}

export function asBoolean(value: unknown): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value === 1;
  if (typeof value === "string") {
    const normalized = value.toLowerCase();
    return normalized === "1" || normalized === "true";
  }
  return false;
}

export function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/**
 * A short, human sentence from a Directus error body.
 *
 * Directus wraps database rejections in a generic message and puts the real reason inside
 * `errors[0].message` or `errors[0].extensions`, so a bare status code tells the reader nothing.
 */
export function directusReason(body: string): string {
  if (!body) return "";
  try {
    const parsed = JSON.parse(body) as {
      errors?: Array<{ message?: string; extensions?: { field?: string; code?: string } }>;
    };
    const first = parsed.errors?.[0];
    if (!first) return "";
    const field = first.extensions?.field ? `${first.extensions.field}: ` : "";
    return `${field}${first.message ?? ""}`.trim();
  } catch {
    return body.slice(0, 200);
  }
}


