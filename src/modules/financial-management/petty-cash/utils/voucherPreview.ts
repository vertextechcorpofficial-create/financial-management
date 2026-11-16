export const PREVIEW_RETRY_DELAYS = [1000, 2000] as const;

export function retryablePreviewError(error: Error): boolean {
  const status = (error as { status?: unknown }).status;
  if (typeof status === "number") return status === 0 || status === 502 || status === 503 || status === 504;
  return error.name === "TypeError" || error.name === "AbortError";
}
