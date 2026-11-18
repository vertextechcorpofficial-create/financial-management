import type { AccountBody, AccountPatch, HolidayBody, HolidayPatch } from "../schemas";
import type { SettingsData } from "../types";

const BASE = "/api/fm/treasury/loan-management/loan-register/settings";

async function readError(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { error?: string; fieldErrors?: Record<string, string[]> };
    if (body.fieldErrors) {
      const first = Object.values(body.fieldErrors)[0];
      if (first?.[0]) return first[0];
    }
    if (body.error) return body.error;
  } catch {
    // Fall through to the status sentence.
  }
  return `The request failed (${response.status}).`;
}

async function send<T>(path: string, method: string, body?: unknown): Promise<T> {
  const response = await fetch(`${BASE}${path}`, {
    method,
    cache: "no-store",
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!response.ok) throw new Error(await readError(response));
  const payload = (await response.json()) as { data: T };
  return payload.data;
}

export function fetchSettings(): Promise<SettingsData> {
  return send<SettingsData>("", "GET");
}

export function createAccount(body: AccountBody & { isActive?: boolean }) {
  return send<{ id: number; name: string }>("/accounts", "POST", body);
}

export interface AccountUpdateResult {
  id: number;
  isActive: boolean;
  paymentCount: number;
  note: string;
}

export function updateAccount(id: number, patch: AccountPatch): Promise<AccountUpdateResult> {
  return send<AccountUpdateResult>(`/accounts/${id}`, "PATCH", patch);
}

export function createHoliday(body: HolidayBody) {
  return send<{ id: number; name: string; holidayDate: string }>("/holidays", "POST", body);
}

export function updateHoliday(id: number, patch: HolidayPatch) {
  return send<{ id: number }>(`/holidays/${id}`, "PATCH", patch);
}

export function deleteHoliday(id: number) {
  return send<{ id: number }>(`/holidays/${id}`, "DELETE");
}

export function updateMapping(mappingKey: string, coaId: number | null) {
  return send<{ mappingKey: string; coaId: number | null; unmappedKeys: string[] }>(
    `/mappings/${encodeURIComponent(mappingKey)}`,
    "PATCH",
    { coaId },
  );
}

export function closeBooks(lockedThrough: string, note: string) {
  return send<{ id: number; lockedThrough: string }>("/locks", "POST", { lockedThrough, note });
}

export function reopenBooks(id: number, reason: string) {
  return send<{ id: number; lockedThrough: string; reopenedAt: string }>(`/locks/${id}`, "POST", { reason });
}
