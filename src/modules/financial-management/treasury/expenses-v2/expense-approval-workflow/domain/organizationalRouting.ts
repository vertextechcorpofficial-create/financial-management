import type { AuthorityTier, Delegation } from "../types";

export function resolveOfficer(input: {
  tier: AuthorityTier;
  companyId: number;
  departmentId: number;
  divisionId: number | null;
  departmentHeadId: number | null;
  requesterId: number;
  delegations: Delegation[];
  now: string;
}): number | null {
  if (input.tier === "DEPARTMENT_HEAD") {
    return input.departmentHeadId === input.requesterId ? null : input.departmentHeadId;
  }
  const matches = input.delegations.filter(d =>
    d.companyId === input.companyId && d.tier === input.tier && d.status === "ACTIVE" &&
    d.startsAt <= input.now && (!d.endsAt || input.now < d.endsAt) &&
    (input.tier === "GM"
      ? d.divisionId === null && d.departmentId === null
      : (d.divisionId === null || d.divisionId === input.divisionId) &&
        (d.departmentId === null || d.departmentId === input.departmentId)));
  return matches.length === 1 && matches[0].userId !== input.requesterId ? matches[0].userId : null;
}
