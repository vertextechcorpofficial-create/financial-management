"use client";

import type { CarryoverKind, CarryoverLotDetail, EntityProfile, EntitySnapshot, RegistryCompany } from "../types";

const BASE = "/api/fm/taxation/entity-worksheet";

interface Envelope<T> {
  success: boolean;
  data?: T;
  error?: string;
  fieldErrors?: Record<string, string[]>;
}

export class WorksheetApiError extends Error {
  fieldErrors?: Record<string, string[]>;

  constructor(message: string, fieldErrors?: Record<string, string[]>) {
    super(message);
    this.name = "WorksheetApiError";
    this.fieldErrors = fieldErrors;
  }
}

function unwrap<T>(payload: Envelope<T>): T {
  if (!payload.success || payload.data === undefined) {
    throw new WorksheetApiError(payload.error ?? "The request failed.", payload.fieldErrors);
  }
  return payload.data;
}

export interface WorksheetPayload {
  companies: RegistryCompany[];
  snapshot: EntitySnapshot;
}

export async function fetchWorksheet(companyId: number, year: number, fresh = false): Promise<WorksheetPayload> {
  const suffix = fresh ? "&refresh=1" : "";
  const response = await fetch(`${BASE}?companyId=${companyId}&year=${year}${suffix}`, { cache: "no-store" });
  const payload = (await response.json()) as Envelope<WorksheetPayload>;
  return unwrap(payload);
}

export async function saveProfile(profile: EntityProfile): Promise<EntityProfile> {  const response = await fetch(BASE, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(profile),
  });

  const text = await response.text();
  let payload: (Envelope<EntityProfile> & { detail?: string }) | null = null;
  try {
    payload = JSON.parse(text) as Envelope<EntityProfile> & { detail?: string };
  } catch {
    payload = null;
  }

  if (!payload) {
    // A route-level failure (proxy, middleware, crash) never returns the envelope.
    throw new WorksheetApiError(
      response.ok
        ? "The profile could not be saved: the server returned an unreadable answer."
        : `The profile could not be saved (HTTP ${response.status}).`,
    );
  }

  return unwrap(payload);
}

export interface CarryoverLotPayload {
  companyId: number;
  taxYear: number;
  kind: CarryoverKind;
  originYear: number;
  amount: number;
  amountUsed: number;
  expiresAfterYear: number | null;
}

async function send<T>(method: "POST" | "PATCH", body: unknown): Promise<T> {
  const response = await fetch(`${BASE}/carryovers`, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload = (await response.json().catch(() => null)) as Envelope<T> | null;
  if (!payload) {
    throw new WorksheetApiError(`The carryover lot could not be saved (HTTP ${response.status}).`);
  }
  return unwrap(payload);
}

export async function recordCarryoverLot(input: CarryoverLotPayload): Promise<CarryoverLotDetail> {
  return send<CarryoverLotDetail>("POST", input);
}

export async function updateCarryoverUsed(input: {
  companyId: number;
  taxYear: number;
  id: number;
  amountUsed: number;
}): Promise<CarryoverLotDetail> {
  return send<CarryoverLotDetail>("PATCH", input);
}
export interface ManualEntryInput {
  companyId: number;
  taxYear: number;
  lineKey: string;
  quarter: number;
  /** null returns the line to the figure the ledgers produce. */
  amount: number | null;
}

/** Manual entry mode (deck item 10): one typed figure, saved where the next read finds it. */
export async function saveManualEntry(input: ManualEntryInput): Promise<void> {
  const response = await fetch(`${BASE}/manual`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const payload = (await response.json().catch(() => null)) as Envelope<unknown> | null;
  if (!payload) {
    throw new WorksheetApiError(`The manual figure could not be saved (HTTP ${response.status}).`);
  }
  unwrap(payload);
}

export interface OpeningUpdateResult {
  updated: number;
  skipped: number;
  reason: string | null;
}

export async function updateOpeningCarryovers(input: {
  companyId: number;
  taxYear: number;
}): Promise<OpeningUpdateResult> {
  const response = await fetch(`${BASE}/carryovers/opening`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const payload = (await response.json().catch(() => null)) as Envelope<OpeningUpdateResult> | null;
  if (!payload) {
    throw new WorksheetApiError(`The carryover openings could not be updated (HTTP ${response.status}).`);
  }
  return unwrap(payload);
}