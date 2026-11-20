export class MemberApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly payload: {
      code?: string;
      fieldErrors?: Record<string, string>;
      details?: { fingerprint?: string; fieldErrors?: Record<string, string>; checks?: Array<{ key: string; ok: boolean; label: string; detail: string }> };
    } | null,
  ) {
    super(message);
  }
}

export async function memberFetch<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { cache: "no-store", ...init });
  if (response.status === 204) return undefined as T;
  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload) {
    const message = payload && typeof payload.message === "string"
      ? payload.message
      : "The Cooperative request could not be completed.";
    throw new MemberApiError(message, response.status, payload);
  }
  return payload as T;
}

export function fieldErrorsFrom(error: unknown) {
  if (!(error instanceof MemberApiError)) return {};
  return error.payload?.fieldErrors ?? error.payload?.details?.fieldErrors ?? {};
}

export function newRequestKey() {
  const source = globalThis.crypto;
  if (source && typeof source.randomUUID === "function") return source.randomUUID();
  const bytes = new Uint8Array(16);
  if (source && typeof source.getRandomValues === "function") source.getRandomValues(bytes);
  else for (let index = 0; index < bytes.length; index += 1) bytes[index] = Math.floor(Math.random() * 256);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map(byte => byte.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
import { uploadPartSize } from "../document-limits";


export async function uploadMemberDocuments(endpoint: string, documentTypeId: string, uploadKey: string, files: File[]) {
  const form = new FormData();
  form.append("documentTypeId", documentTypeId);
  form.append("uploadKey", uploadKey);
  files.forEach(file => form.append("files", file));
  if (files.reduce((total, file) => total + file.size, 0) < uploadPartSize) {
    return memberFetch(endpoint, { method: "POST", body: form });
  }

  const encoded = new Response(form);
  const contentType = encoded.headers.get("Content-Type");
  const body = await encoded.blob();
  if (body.size <= uploadPartSize) return memberFetch(endpoint, { method: "POST", body: form });
  const attempt = newRequestKey();
  const partUrl = endpoint + "?attempt=" + attempt;
  const sizes: number[] = [];
  try {
    for (let offset = 0; offset < body.size; offset += uploadPartSize) {
      const part = body.slice(offset, offset + uploadPartSize);
      await memberFetch(partUrl + "&part=" + sizes.length, {
        method: "PUT", headers: { "Content-Type": "application/octet-stream" }, body: part,
      });
      sizes.push(part.size);
    }
    return await memberFetch(endpoint, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ attempt, contentType, sizes }),
    });
  } catch (error) {
    void memberFetch(partUrl, { method: "DELETE" }).catch(() => undefined);
    throw error;
  }
}
