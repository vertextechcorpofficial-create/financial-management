import type { DataPayload } from "../types";

export async function fetchData(period?: string): Promise<DataPayload> {
  const query = period ? `?period=${encodeURIComponent(period)}` : "";
  const response = await fetch(`/api/fm/management-analytics/data${query}`, { cache: "no-store" });
  const body = (await response.json()) as { success: boolean; data?: DataPayload; error?: string };
  if (!response.ok || !body.success || !body.data) {
    throw new Error(body.error ?? `The data desk could not be read (${response.status}).`);
  }
  return body.data;
}

export interface ReadingInput {
  kpiId: number;
  period: string;
  value: number;
  basis: "ACTUAL" | "PROVISIONAL";
  sourceCode: string;
  note: string | null;
}

export interface ReadingResult {
  id: number;
  created: boolean;
  value: number | null;
}

export async function postReading(input: ReadingInput): Promise<ReadingResult> {
  const response = await fetch("/api/fm/management-analytics/data/readings", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const body = (await response.json()) as {
    success: boolean;
    data?: ReadingResult;
    error?: string;
    fieldErrors?: Record<string, string[]>;
  };
  if (!response.ok || !body.success || !body.data) {
    const first = body.fieldErrors ? Object.values(body.fieldErrors)[0]?.[0] : undefined;
    throw new Error(first ?? body.error ?? `The reading was not saved (${response.status}).`);
  }
  return body.data;
}

export interface ValidationResponse {
  period: string;
  gates: Array<{ gate: string; status: string; rowsOk: number; rowsFailed: number; detail: string }>;
}

export async function runChecks(period: string): Promise<ValidationResponse> {
  const response = await fetch("/api/fm/management-analytics/data/validate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ period }),
  });
  const body = (await response.json()) as { success: boolean; data?: ValidationResponse; error?: string };
  if (!response.ok || !body.success || !body.data) {
    throw new Error(body.error ?? `The checks did not run (${response.status}).`);
  }
  return body.data;
}

export function exportUrl(period: string): string {
  return `/api/fm/management-analytics/data/export?period=${encodeURIComponent(period)}`;
}

export interface SourceRefreshResult {
  code: string;
  name: string;
  readings: number;
  latestPeriod: string | null;
  previousLastSync: string | null;
  lastSyncAt: string;
  fresh: boolean;
}

export async function refreshSource(code: string): Promise<SourceRefreshResult> {
  const response = await fetch(`/api/fm/management-analytics/data/sources/${encodeURIComponent(code)}/refresh`, {
    method: "POST",
  });
  const body = (await response.json()) as { success: boolean; data?: SourceRefreshResult; error?: string };
  if (!response.ok || !body.success || !body.data) {
    throw new Error(body.error ?? `The source could not be re-read (${response.status}).`);
  }
  return body.data;
}
