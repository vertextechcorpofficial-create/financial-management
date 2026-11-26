const BASE = process.env.NEXT_PUBLIC_API_BASE_URL;
const TOKEN = process.env.DIRECTUS_STATIC_TOKEN;

export function directusUrl(path: string): string {
  if (!BASE) throw new Error("NEXT_PUBLIC_API_BASE_URL is not set");
  return BASE.replace(/\/+$/, "") + path;
}

function auth(): Record<string, string> {
  return { "Content-Type": "application/json", Authorization: "Bearer " + (TOKEN ?? "") };
}

export interface DirectusList<T> {
  data: T[];
  meta?: { filter_count?: number };
}

export async function get<T>(path: string): Promise<T> {
  const res = await fetch(directusUrl(path), { headers: auth(), cache: "no-store" });
  const body = (await res.json().catch(() => null)) as { data?: T; errors?: { message?: string }[] } | null;
  if (!res.ok) throw new Error(body?.errors?.[0]?.message ?? "Request failed with " + res.status);
  return (body?.data ?? null) as T;
}

export async function post<T>(path: string, payload: unknown): Promise<T> {
  const res = await fetch(directusUrl(path), { method: "POST", headers: auth(), body: JSON.stringify(payload) });
  const body = (await res.json().catch(() => null)) as { data?: T; errors?: { message?: string }[] } | null;
  if (!res.ok) throw new Error(body?.errors?.[0]?.message ?? "Request failed with " + res.status);
  return (body?.data ?? null) as T;
}

export async function patch<T>(path: string, payload: unknown): Promise<T> {
  const res = await fetch(directusUrl(path), { method: "PATCH", headers: auth(), body: JSON.stringify(payload) });
  const body = (await res.json().catch(() => null)) as { data?: T; errors?: { message?: string }[] } | null;
  if (!res.ok) throw new Error(body?.errors?.[0]?.message ?? "Request failed with " + res.status);
  return (body?.data ?? null) as T;
}

/** A list request keeps the meta, which carries the filtered count. */
export async function list<T>(path: string): Promise<{ data: T[]; count: number }> {
  const res = await fetch(directusUrl(path), { headers: auth(), cache: "no-store" });
  const body = (await res.json().catch(() => null)) as { data?: T[]; meta?: { filter_count?: number }; errors?: { message?: string }[] } | null;
  if (!res.ok) throw new Error(body?.errors?.[0]?.message ?? "Request failed with " + res.status);
  const data = body?.data ?? [];
  return { data, count: Number(body?.meta?.filter_count ?? data.length) };
}

export function text(v: unknown): string {
  return typeof v === "string" ? v : "";
}
export function num(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
export function bool(v: unknown): boolean {
  return v === true || v === 1 || v === "1";
}
export function enc(filter: unknown): string {
  return encodeURIComponent(JSON.stringify(filter));
}
