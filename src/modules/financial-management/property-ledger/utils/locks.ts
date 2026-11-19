import type { Portfolio } from "../types";

/** Protect source facts in closed periods, not merely the rendered book values. */
export function assertTransition(previous: Portfolio, next: Portfolio, canManage: boolean) {
  if (!canManage && JSON.stringify(previous.policies) !== JSON.stringify(next.policies)) throw new Error("Only administrators can change accounting policies");
  if (!canManage && JSON.stringify(previous.entities) !== JSON.stringify(next.entities)) throw new Error("Only administrators can change entities");
  const lock = previous.policies.lockThrough;
  if (!lock) return;
  const { lockThrough: oldLock, ...oldPolicies } = previous.policies;
  const { lockThrough: nextLock, ...newPolicies } = next.policies;
  if (JSON.stringify(oldPolicies) !== JSON.stringify(newPolicies)) throw new Error("Unlock periods before changing measurement policies");
  if (oldLock !== nextLock && !canManage) throw new Error("Only administrators can unlock a period");
  const protectedAssets = (p: Portfolio) => p.assets.filter(a => a.acquired <= lock).map(a => ({
    ...a, parts: a.parts.filter(p => p.date <= lock), events: a.events.filter(e => e.date <= lock),
    sale: a.sale && a.sale.date <= lock ? a.sale : null,
  })).sort((a, b) => a.id.localeCompare(b.id));
  if (JSON.stringify(protectedAssets(previous)) !== JSON.stringify(protectedAssets(next))) throw new Error(`Books are locked through ${lock}. Unlock in a separate policy save before changing closed-period facts.`);
}
