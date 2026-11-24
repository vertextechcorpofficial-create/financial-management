import type { Asset, Portfolio } from "../types";

export type LedgerChange = { action: string; assetId?: string; entityId?: string; item: string; detail: string; before: unknown; after: unknown };
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
export function ledgerChanges(before: Portfolio, after: Portfolio): LedgerChange[] {
  const changes: LedgerChange[] = [];
  for (const asset of after.assets) {
    const old = before.assets.find(a => a.id === asset.id);
    const add = (action: string, detail: string, from: unknown, to: unknown) => changes.push({ action, assetId: asset.id, entityId: asset.entityId, item: asset.name, detail: `${action}: ${asset.name}${detail ? ` · ${detail}` : ""}`, before: from, after: to });
    if (!old) add(`Registered ${asset.kind}`, `${asset.acquired}`, null, asset);
    else {
      const registration = (a: Asset) => ({ ...a, version: undefined, parts: undefined, events: undefined, sale: undefined });
      if (!same(registration(old), registration(asset))) add(`Edited ${asset.kind}`, "Registration details changed", registration(old), registration(asset));
      for (const [key, label] of [["parts", "component / improvement"], ["events", "event"]] as const) {
        for (const item of asset[key]) {
          const previous = old[key].find(p => p.id === item.id);
          if (same(previous, item)) continue;
          const type = "kind" in item ? item.kind : label;
          add(`${previous ? "Edited" : "Added"} ${type}`, `${item.date} · ${"amount" in item ? item.amount : item.cost}${"note" in item ? ` · ${item.note}` : ` · ${item.name}`}`, previous ?? null, item);
        }
        for (const item of old[key]) if (!asset[key].some(p => p.id === item.id)) add(`Removed ${"kind" in item ? item.kind : label}`, item.date, item, null);
      }
      if (!same(old.sale, asset.sale)) add(asset.sale ? old.sale ? "Edited sale" : "Recorded sale" : "Removed sale", asset.sale ? `${asset.sale.date} · ${asset.sale.price}` : "", old.sale, asset.sale);
    }
  }
  for (const asset of before.assets) if (!after.assets.some(a => a.id === asset.id)) changes.push({ action: `Deleted ${asset.kind}`, assetId: asset.id, entityId: asset.entityId, item: asset.name, detail: `Deleted ${asset.kind}: ${asset.name}`, before: asset, after: null });
  for (const key of Object.keys(after.policies) as (keyof Portfolio["policies"])[]) {
    if (!same(before.policies[key], after.policies[key])) changes.push({ action: key === "lockThrough" ? after.policies.lockThrough ? "Locked period" : "Unlocked periods" : "Changed policy", item: key, detail: `${key}: ${JSON.stringify(before.policies[key])} → ${JSON.stringify(after.policies[key])}`, before: before.policies[key], after: after.policies[key] });
  }
  if (!same(before.entities, after.entities)) changes.push({ action: "Changed entities", item: "Entities", detail: "Changed entities", before: before.entities, after: after.entities });
  return changes;
}
export const describeChange = (before: Portfolio, after: Portfolio) => ledgerChanges(before, after).map(c => c.detail).join("; ").slice(0, 2000) || "No changes";

/** New rows contain their own scope; historical rows contain whole-asset snapshots. */
export function visibleAudit(value: unknown, entities: string[]) {
  return !!value && typeof value === "object" && "entityId" in value && entities.includes(String(value.entityId));
}
