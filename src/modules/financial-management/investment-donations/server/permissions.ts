import type { WorkspaceKey } from "../workspaces";

export type LedgerRole = "none" | "view" | "prepare" | "approve";
export type LedgerAccess = { id: number; admin: boolean; workspaces: readonly WorkspaceKey[];
  roles?: Partial<Record<WorkspaceKey, LedgerRole>>; rolesAuthoritative?: boolean };

export function workspaceRole(access: LedgerAccess | null, workspace: WorkspaceKey, config = process.env.CGL_WORKSPACE_ROLES): LedgerRole {
  const siblingGrant = (keys: string[]) => access?.workspaces.some(key => keys.includes(key)) ?? false;
  const hasModuleAccess = access?.workspaces.includes(workspace) ||
    (workspace === "annual-review-preparer" && siblingGrant(["annual-review-approver"])) ||
    (workspace === "annual-review-approver" && siblingGrant(["annual-review-preparer"])) ||
    (workspace === "monthly-reconciliation-reconciliator" && siblingGrant(["monthly-reconciliation-approver"])) ||
    (workspace === "monthly-reconciliation-approver" && siblingGrant(["monthly-reconciliation-reconciliator"]));
  if (!hasModuleAccess) return "none";
  const grantRole = (role: LedgerRole): LedgerRole => {
    if (role !== "view") return role;
    if (workspace === "monthly-reconciliation-approver" || workspace === "annual-review-approver") return "approve";
    if (workspace === "monthly-reconciliation-reconciliator" || workspace === "annual-review-preparer") return "prepare";
    if (workspace === "period-close") return "approve";
    return role;
  };
  if (access.rolesAuthoritative === true) {
    const role = access.roles?.[workspace];
    if (role === undefined) return grantRole("view");
    return role === "none" ? "none" : role === "view" || role === "prepare" || role === "approve" ? grantRole(role) : "none";
  }
  if (config !== undefined) {
    try {
      const roles = JSON.parse(config);
      const user = roles && typeof roles === "object" && Object.hasOwn(roles, String(access.id)) ? roles[String(access.id)] : null;
      const role = user && typeof user === "object" && Object.hasOwn(user, workspace) ? user[workspace] : null;
      if (role === "none") return "none";
       if (role === "view" || role === "prepare" || role === "approve") return grantRole(role);
    } catch {
      // Invalid configuration cannot grant writes.
    }
    return grantRole("view");
  }
  const member = (list?: string) => list?.split(",").some(id => id.trim() === String(access.id));
  const explicitLegacyRoles = process.env.CGL_RECON_APPROVER_IDS !== undefined || process.env.CGL_RECON_PREPARER_IDS !== undefined;
  if (access.roles && !explicitLegacyRoles) return grantRole(access.roles[workspace] ?? "view");
  if (workspace === "annual-review-approver") return "approve";
  if (workspace === "annual-review-preparer") return access.admin ? "approve" : "prepare";
  if (workspace === "monthly-reconciliation-approver") return "approve";
  if (workspace === "monthly-reconciliation-reconciliator") return access.admin ? "approve" : "prepare";
  if (workspace === "period-close") {
    if (member(process.env.CGL_RECON_APPROVER_IDS)) return "approve";
    return "approve";
  }
  // The existing subsystem ACL has membership only; it has no per-module
  // permission-level column. Treat an active child-module grant as Prepare
  // (the least write-capable level) and reserve Approve for administrators.
  // Explicit policies above take precedence over membership-only fallbacks.
  return access.admin ? "approve" : "prepare";
}

export const masterWorkspaces: Record<string, WorkspaceKey> = {
  classes: "policy-targets", policy: "policy-targets", corp: "policy-targets", accountMappings: "policy-targets",
  securities: "portfolio-rebalancing", prices: "portfolio-rebalancing", charities: "charitable-giving",
  holders: "capital-stock", calls: "capital-stock", capitalIncreases: "capital-stock",
  debts: "inflows-investing",
};

export function canManageMaster(access: LedgerAccess | null, entity: string) {
  const workspace = Object.hasOwn(masterWorkspaces, entity) ? masterWorkspaces[entity] : undefined;
  return Boolean(workspace && allows(workspaceRole(access, workspace), entity === "prices" ? "prepare" : "approve"));
}

const allWorkspaces: WorkspaceKey[] = ["overview", "transactions", "inflows-investing", "capital-stock", "portfolio-rebalancing",
  "charitable-giving", "tax-compliance", "monthly-reconciliation-reconciliator", "monthly-reconciliation-approver", "period-close", "annual-review-preparer", "annual-review-approver", "policy-targets"];

export function canUseDataTools(access: LedgerAccess | null) {
  return Boolean(access?.admin && allWorkspaces.every(workspace => allows(workspaceRole(access, workspace), "approve")));
}

export function canExportFullLedger(access: LedgerAccess | null) {
  return Boolean(access && allWorkspaces.every(workspace => allows(workspaceRole(access, workspace), "view")));
}

export function allows(role: LedgerRole, required: Exclude<LedgerRole, "none">) {
  const levels: LedgerRole[] = ["none", "view", "prepare", "approve"];
  return levels.indexOf(role) >= levels.indexOf(required);
}
