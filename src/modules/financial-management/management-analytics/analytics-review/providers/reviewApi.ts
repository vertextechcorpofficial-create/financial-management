import type { ReviewDetail } from "../types";

const BASE = "/api/fm/management-analytics/review";

async function read<T>(response: Response, fallback: string): Promise<T> {
  const text = await response.text();
  const body = text ? (JSON.parse(text) as { success?: boolean; data?: T; error?: string; fieldErrors?: Record<string, string[]> }) : {};
  if (!response.ok || body.success === false) {
    const firstField = body.fieldErrors ? Object.values(body.fieldErrors)[0]?.[0] : null;
    throw new Error(firstField ?? body.error ?? fallback);
  }
  return body.data as T;
}

export async function fetchReview(period: string, company: string): Promise<ReviewDetail> {
  const params = new URLSearchParams({ period });
  if (company && company !== "ALL") params.set("company", company);
  const response = await fetch(`${BASE}?${params.toString()}`, { cache: "no-store" });
  return read<ReviewDetail>(response, "The meeting could not be read.");
}

export async function openMeeting(period: string, company: string): Promise<ReviewDetail> {
  const response = await fetch(BASE, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ period, company: company === "ALL" ? undefined : company }),
  });
  return read<ReviewDetail>(response, "The meeting could not be opened.");
}

export async function patchReview(
  id: number,
  patch: { attendees?: string; minutes?: string; status?: "DRAFT" | "FINAL" },
): Promise<ReviewDetail> {
  const response = await fetch(`${BASE}/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  });
  return read<ReviewDetail>(response, "The meeting could not be saved.");
}

export async function patchItem(
  id: number,
  patch: { notes?: string; decision?: string; minutesAlloc?: number },
) {
  const response = await fetch(`${BASE}/item/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  });
  return read(response, "That agenda item could not be saved.");
}

export async function addAction(payload: {
  reviewId?: number;
  exceptionId?: number;
  companyCode?: string;
  title: string;
  dueDate?: string;
  notes?: string;
}) {
  const response = await fetch(`${BASE}/action`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return read(response, "The action could not be recorded.");
}

export async function closeAction(id: number) {
  const response = await fetch(`${BASE}/action/${id}`, { method: "PATCH" });
  return read(response, "The action could not be closed.");
}
