import type { CatalogDetail, CatalogPayload } from "../types";

export interface CatalogQuery {
  tier: string;
  company: string;
  domain: string;
  q: string;
  page: number;
  size: number;
}

export function toQuery(input: CatalogQuery): string {
  const params = new URLSearchParams();
  if (input.tier !== "ALL") params.set("tier", input.tier);
  if (input.company !== "ALL") params.set("company", input.company);
  if (input.domain !== "ALL") params.set("domain", input.domain);
  if (input.q.trim().length > 0) params.set("q", input.q.trim());
  params.set("page", String(input.page));
  params.set("size", String(input.size));
  return params.toString();
}

export async function fetchCatalog(input: CatalogQuery): Promise<CatalogPayload> {
  const response = await fetch(`/api/fm/management-analytics/tiers?${toQuery(input)}`, { cache: "no-store" });
  const body = (await response.json()) as { success: boolean; data?: CatalogPayload; error?: string };
  if (!response.ok || !body.success || !body.data) {
    throw new Error(body.error ?? `The catalogue could not be read (${response.status}).`);
  }
  return body.data;
}

export async function fetchCatalogDetail(id: number): Promise<CatalogDetail> {
  const response = await fetch(`/api/fm/management-analytics/tiers/${id}`, { cache: "no-store" });
  const body = (await response.json()) as { success: boolean; data?: CatalogDetail; error?: string };
  if (!response.ok || !body.success || !body.data) {
    throw new Error(body.error ?? `The KPI could not be read (${response.status}).`);
  }
  return body.data;
}
