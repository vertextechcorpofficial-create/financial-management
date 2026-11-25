import type { ImpairmentReviewData, StartReviewPayload, UpdateLinePayload } from "../types";

export async function fetchImpairmentReview(): Promise<ImpairmentReviewData> {
  const res = await fetch("/api/fm/asset-management/impairment-review", {
    cache: "no-store",
  });
  if (!res.ok) {
    const json = await res.json().catch(() => ({}));
    throw new Error(json.error || "Failed to load impairment review data.");
  }
  return res.json();
}

export async function startImpairmentReview(payload: StartReviewPayload): Promise<{ success: boolean; id: number }> {
  const res = await fetch("/api/fm/asset-management/impairment-review", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const json = await res.json().catch(() => ({}));
    throw new Error(json.error || "Failed to start impairment review.");
  }
  return res.json();
}

export async function updateReviewDetails(
  id: number,
  payload: { review_date?: string; review_name?: string }
): Promise<{ success: boolean }> {
  const res = await fetch("/api/fm/asset-management/impairment-review", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id, ...payload }),
  });
  if (!res.ok) {
    const json = await res.json().catch(() => ({}));
    throw new Error(json.error || "Failed to update review.");
  }
  return res.json();
}

export async function discardReview(id: number): Promise<{ success: boolean }> {
  const res = await fetch(`/api/fm/asset-management/impairment-review?id=${id}`, {
    method: "DELETE",
  });
  if (!res.ok) {
    const json = await res.json().catch(() => ({}));
    throw new Error(json.error || "Failed to discard review.");
  }
  return res.json();
}

export async function updateLineDetails(
  lineId: number,
  payload: UpdateLinePayload
): Promise<{ success: boolean }> {
  const res = await fetch(`/api/fm/asset-management/impairment-review/line/${lineId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const json = await res.json().catch(() => ({}));
    throw new Error(json.error || "Failed to update line details.");
  }
  return res.json();
}

export async function toggleLineObsolete(
  lineId: number,
  isObsolete: boolean
): Promise<{ success: boolean }> {
  return updateLineDetails(lineId, { is_obsolete: isObsolete });
}

export async function postImpairmentEntries(reviewId: number): Promise<{ success: boolean; count: number }> {
  const res = await fetch(`/api/fm/asset-management/impairment-review/post-entries`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ review_id: reviewId }),
  });
  if (!res.ok) {
    const json = await res.json().catch(() => ({}));
    throw new Error(json.error || "Failed to post entries.");
  }
  return res.json();
}

export async function signOffImpairmentReview(reviewId: number): Promise<{ success: boolean }> {
  const res = await fetch(`/api/fm/asset-management/impairment-review/sign-off`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ review_id: reviewId }),
  });
  if (!res.ok) {
    const json = await res.json().catch(() => ({}));
    throw new Error(json.error || "Failed to sign off review.");
  }
  return res.json();
}
