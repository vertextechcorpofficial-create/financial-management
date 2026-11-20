import type { AlertState, AlertsPayload } from "../types";

async function read<T>(response: Response, fallback: string): Promise<T> {
  const body = (await response.json()) as { success: true; data: T } | { success: false; error?: string };
  if (!body.success) throw new Error(body.error ?? fallback);
  return body.data;
}

export async function fetchAlerts(state?: string, type?: string, page = 1, size = 10): Promise<AlertsPayload> {
  const params = new URLSearchParams();
  if (state) params.set("state", state);
  if (type) params.set("type", type);
  params.set("page", String(page));
  params.set("size", String(size));
  const query = params.toString();
  const response = await fetch(`/api/fm/management-analytics/alerts${query ? `?${query}` : ""}`, {
    cache: "no-store",
  });
  return read<AlertsPayload>(response, "The alerts could not be read.");
}

export async function generateAlerts(): Promise<{ created: number; skipped: number; drafted: number }> {
  const response = await fetch("/api/fm/management-analytics/alerts/generate", { method: "POST" });
  return read(response, "The alert sweep could not run.");
}

export async function setAlertState(id: number, state: AlertState): Promise<{ id: number; state: AlertState }> {
  const response = await fetch(`/api/fm/management-analytics/alerts/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ state }),
  });
  return read(response, "The alert could not be updated.");
}

export async function setAlertPolicy(id: number, body: { isEnabled?: boolean; channel?: string }): Promise<{ id: number }> {
  const response = await fetch(`/api/fm/management-analytics/alerts/policy/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return read(response, "The delivery rule could not be saved.");
}
