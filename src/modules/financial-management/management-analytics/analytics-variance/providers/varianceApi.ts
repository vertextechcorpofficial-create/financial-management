import type { ExceptionBoard, ExceptionDetail, VarianceScanResult } from "../types";

const BASE = "/api/fm/management-analytics/variance";

async function read<T>(response: Response, fallback: string): Promise<T> {
  const text = await response.text();
  const body = text ? (JSON.parse(text) as { success?: boolean; data?: T; error?: string; fieldErrors?: Record<string, string[]> }) : {};
  if (!response.ok || body.success === false) {
    const firstField = body.fieldErrors ? Object.values(body.fieldErrors)[0]?.[0] : null;
    throw new Error(firstField ?? body.error ?? fallback);
  }
  return body.data as T;
}

export interface BoardQuery {
  company: string;
  status: string;
  q: string;
  page: number;
  size: number;
}

export function toQuery(query: BoardQuery): string {
  const params = new URLSearchParams();
  if (query.company && query.company !== "ALL") params.set("company", query.company);
  if (query.status && query.status !== "ALL") params.set("status", query.status);
  if (query.q.trim()) params.set("q", query.q.trim());
  params.set("page", String(query.page));
  params.set("size", String(query.size));
  return params.toString();
}

export async function fetchBoard(query: BoardQuery): Promise<ExceptionBoard> {
  const response = await fetch(`${BASE}?${toQuery(query)}`, { cache: "no-store" });
  return read<ExceptionBoard>(response, "The register could not be read.");
}

export async function fetchDetail(id: number): Promise<ExceptionDetail> {
  const response = await fetch(`${BASE}/${id}`, { cache: "no-store" });
  return read<ExceptionDetail>(response, "That exception could not be read.");
}

export async function scan(period: string, company: string): Promise<VarianceScanResult> {
  const response = await fetch(`${BASE}/scan`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ period, company }),
  });
  return read<VarianceScanResult>(response, "The scan could not be completed.");
}

export async function fileMemo(id: number, memo: string): Promise<ExceptionDetail> {
  const response = await fetch(`${BASE}/${id}/memo`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ memo }),
  });
  return read<ExceptionDetail>(response, "The memo could not be filed.");
}

export async function closeException(id: number, note: string): Promise<ExceptionDetail> {
  const response = await fetch(`${BASE}/${id}/close`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ note }),
  });
  return read<ExceptionDetail>(response, "The exception could not be closed.");
}

export async function recordReading(id: number, period: string, value: number): Promise<ExceptionDetail> {
  const response = await fetch(`${BASE}/${id}/reading`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ period, value }),
  });
  return read<ExceptionDetail>(response, "The reading could not be recorded.");
}

export async function escalate(today?: string) {
  const response = await fetch(`${BASE}/escalate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(today ? { today } : {}),
  });
  return read<{ level1: number; level2: number }>(response, "The escalation sweep could not be completed.");
}
