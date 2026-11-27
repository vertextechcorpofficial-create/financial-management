"use client";

import * as React from "react";
import type { Brgy, BrgyClassification, BrgyCustodian, BrgyItemType, BrgyOffice, BrgySettings } from "../types";

export const API = "/api/fm/barangay-asset-inventory-system";

export const peso = (n: number) => "PHP " + n.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
/** Dense tables drop the currency word, which costs four characters in every numeric column. */
export const money = (n: number) => n.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
import { officeDate } from "./dates";

export { officeDate };
export const today = () => officeDate();

export interface Lookups {
  barangays: Brgy[];
  classifications: BrgyClassification[];
  itemTypes: BrgyItemType[];
  offices: BrgyOffice[];
  custodians: BrgyCustodian[];
  settings: BrgySettings | null;
}

export async function call(path: string, init?: RequestInit) {
  const res = await fetch(API + path, init);
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new Error((body && body.message) || "Request failed");
  return body;
}

export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="grid gap-1 text-sm">
      <span className="text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}
