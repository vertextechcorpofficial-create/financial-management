import type { CadencePayload } from "../types";

export async function fetchCadence(period?: string): Promise<CadencePayload> {
  const query = period ? `?period=${encodeURIComponent(period)}` : "";
  const response = await fetch(`/api/fm/management-analytics/cadence${query}`, {
    cache: "no-store",
  });
  const body = (await response.json()) as
    | { success: true; data: CadencePayload }
    | { success: false; error?: string };
  if (!body.success) throw new Error(body.error ?? "The pack could not be read.");
  return body.data;
}
