import type { DisposalInput, DisposalResponse } from "../../types";

const API = "/api/fm/lgu-asset-management-system/disposal";

async function safeJson(res: Response): Promise<unknown> {
  const ct = res.headers.get("content-type") || "";
  if (ct.includes("application/json")) return res.json();
  return res.text();
}

function errMsg(data: unknown): string {
  if (!data) return "Request failed";
  if (typeof data === "string") return data;
  const d = data as Record<string, unknown>;
  const errors = d?.errors as Array<Record<string, unknown>> | undefined;
  return String(errors?.[0]?.message || d?.message || "Request failed");
}

export async function fetchDisposals(params: { page?: number; q?: string }): Promise<DisposalResponse> {
  const search = new URLSearchParams();
  if (params.page) search.set("page", String(params.page));
  if (params.q) search.set("q", params.q);
  const res = await fetch(API + "?" + search.toString(), { cache: "no-store" });
  const data = await safeJson(res);
  if (!res.ok) throw new Error(errMsg(data));
  return data as DisposalResponse;
}

export async function disposalAction(
  action: "iirup" | "dispose",
  input: DisposalInput
): Promise<DisposalResponse> {
  const res = await fetch(API, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, ...input }),
  });
  const data = await safeJson(res);
  if (!res.ok) throw new Error(errMsg(data));
  return data as DisposalResponse;
}
