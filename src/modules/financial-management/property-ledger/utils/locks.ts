import type { Asset, Portfolio } from "../types";

/** Protect source facts in closed periods, not merely the rendered book values. */
export function assertTransition(previous: Portfolio, next: Portfolio, canManage: boolean, currentMonth = new Date().toISOString().slice(0, 7)) {
  if (!canManage && JSON.stringify(previous.policies) !== JSON.stringify(next.policies)) throw new Error("Only administrators can change accounting policies");
  if (!canManage && JSON.stringify(previous.entities) !== JSON.stringify(next.entities)) throw new Error("Only administrators can change entities");
  const lock = previous.policies.lockThrough;
  const newLock = next.policies.lockThrough;
  if (newLock && newLock !== lock && newLock >= currentMonth) throw new Error("You can only lock months that have ended");
  if (next.policies.buildingModel !== "reval") {
    const existing = new Map(previous.assets.flatMap(a => a.events.filter(e => e.kind === "revaluation").map(e => [e.id, JSON.stringify([a.id, e])] as const)));
    if (next.assets.some(a => a.events.some(e => e.kind === "revaluation" && existing.get(e.id) !== JSON.stringify([a.id, e])))) {
      throw new Error("Switch buildings to the revaluation model in Accounting policies first");
    }
  }
  if (!lock) return;
  if (previous.policies.landModel !== next.policies.landModel || previous.policies.buildingModel !== next.policies.buildingModel) {
    throw new Error("Unlock periods first — changing this recalculates locked months");
  }
  const protectedFacts = (a: Asset | undefined, protectsRegistration: boolean) => a && ({
    registration: protectsRegistration ? [a.kind, a.acquired, a.cost, a.rate, a.growth, a.method] : null,
    parts: a.parts.filter(p => p.date <= lock).sort((a, b) => a.id.localeCompare(b.id)),
    events: a.events.filter(e => e.date <= lock).sort((a, b) => a.id.localeCompare(b.id)),
    sale: a.sale && a.sale.date <= lock ? a.sale : null,
  });
  const before = new Map(previous.assets.map(a => [a.id, a]));
  const after = new Map(next.assets.map(a => [a.id, a]));
  const error = `Books are locked through ${lock}. Unlock in Accounting policies before changing closed-period facts.`;
  for (const id of new Set([...before.keys(), ...after.keys()])) {
    const old = before.get(id), updated = after.get(id);
    const protectsRegistration = !!((old && old.acquired <= lock) || (updated && updated.acquired <= lock));
    if (!old || !updated) {
      if (protectsRegistration) throw new Error(error);
    } else if (JSON.stringify(protectedFacts(old, protectsRegistration)) !== JSON.stringify(protectedFacts(updated, protectsRegistration))) {
      throw new Error(error);
    }
  }
}
