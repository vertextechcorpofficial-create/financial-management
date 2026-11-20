import type { Levers, ScenarioPayload, ScenarioRow } from "../types";

const BASE = "/api/fm/management-analytics/scenario";

async function read<T>(response: Response): Promise<T> {
  const body = (await response.json().catch(() => null)) as
    | { success?: boolean; data?: T; error?: string; fieldErrors?: Record<string, string[]> }
    | null;
  if (!response.ok || !body || body.success === false) {
    const firstField = body?.fieldErrors ? Object.values(body.fieldErrors)[0]?.[0] : null;
    throw new Error(firstField ?? body?.error ?? `The request failed (${response.status}).`);
  }
  return body.data as T;
}

export async function fetchScenario(): Promise<ScenarioPayload> {
  return read<ScenarioPayload>(await fetch(BASE, { cache: "no-store" }));
}

export interface SaveScenarioBody {
  name: string;
  basePeriod: string;
  fxPct: number;
  note: string | null;
  levers: Levers[];
}

export async function saveScenario(body: SaveScenarioBody): Promise<ScenarioRow> {
  return read<ScenarioRow>(
    await fetch(BASE, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }),
  );
}

export async function activateScenario(id: number): Promise<ScenarioRow> {
  return read<ScenarioRow>(await fetch(`${BASE}/${id}`, { method: "PATCH" }));
}

export async function deleteScenario(id: number): Promise<void> {
  const response = await fetch(`${BASE}/${id}`, { method: "DELETE" });
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error ?? `The scenario could not be removed (${response.status}).`);
  }
}
