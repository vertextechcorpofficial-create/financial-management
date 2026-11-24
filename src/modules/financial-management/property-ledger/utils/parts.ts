import type { Asset, Policies } from "../types";
import { cents, pesos } from "./money";
import { newLedgerId } from "./id";

/** Guide §9: each share is rounded, and the first part receives the remainder. */
export function typicalParts(total: number, date: string, split: Policies["componentSplit"]) {
  const amount = cents(total);
  const costs = split.map(row => Math.round(amount * row.share / 100));
  costs[0] += amount - costs.reduce((sum, cost) => sum + cost, 0);
  return split.map((row, i) => ({ id: newLedgerId(), name: row.name, date, cost: pesos(costs[i]), life: row.life, salvage: row.salvage }));
}
export const defaultCapitalize = (amount: number, policies: Policies) => amount >= policies.capThreshold;

export function withRepair(asset: Asset, repair: { id: string; date: string; amount: number; note: string; vendor: string }, capitalize: boolean, life: number, salvage: number): Asset {
  const previous = asset.events.find(e => e.id === repair.id);
  const improvementId = capitalize ? previous?.improvementId ?? newLedgerId() : undefined;
  const event = { ...repair, kind: "repair" as const, improvementId };
  return {
    ...asset,
    parts: [...asset.parts.filter(p => p.id !== previous?.improvementId), ...(improvementId ? [{ id: improvementId, name: repair.note.slice(0, 120), date: repair.date, cost: repair.amount, life, salvage }] : [])],
    events: [...asset.events.filter(e => e.id !== repair.id), event],
  };
}
