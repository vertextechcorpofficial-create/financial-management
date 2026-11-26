import type { WorkspaceKey } from "../workspaces";

export type LedgerRole = "none" | "view" | "prepare" | "approve";
export type LedgerAccess = { id: number; admin: boolean; workspaces: readonly WorkspaceKey[];
  roles?: Partial<Record<WorkspaceKey, LedgerRole>>; rolesAuthoritative?: boolean };

export function workspaceRole(access: LedgerAccess | null, workspace: WorkspaceKey, config = process.env.CGL_WORKSPACE_ROLES): LedgerRole {
  if (!access?.workspaces.includes(workspace)) return "none";
  if (access.rolesAuthoritative === true) {
    const role = access.roles?.[workspace];
    return role === "none" || role === "view" || role === "prepare" || role === "approve" ? role : "none";
  }
  if (config !== undefined) {
    try {
      const roles = JSON.parse(config);
      const user = roles && typeof roles === "object" && Object.hasOwn(roles, String(access.id)) ? roles[String(access.id)] : null;
      const role = user && typeof user === "object" && Object.hasOwn(user, workspace) ? user[workspace] : null;
      if (role === "none" || role === "view" || role === "prepare" || role === "approve") return role;
    } catch {
      // Invalid configuration cannot grant writes.
    }
    return "view";
  }
  const member = (list?: string) => list?.split(",").some(id => id.trim() === String(access.id));
  const explicitLegacyRoles = process.env.CGL_RECON_APPROVER_IDS !== undefined || process.env.CGL_RECON_PREPARER_IDS !== undefined;
  if (access.roles && !explicitLegacyRoles) return access.roles[workspace] ?? "view";
  if (workspace === "monthly-reconciliation" || workspace === "period-close") {
    if (member(process.env.CGL_RECON_APPROVER_IDS)) return "approve";
    return workspace === "monthly-reconciliation" && member(process.env.CGL_RECON_PREPARER_IDS) ? "prepare" : "view";
  }
  // The existing subsystem ACL has membership only; it has no per-module
  // permission-level column. Treat an active child-module grant as Prepare
  // (the least write-capable level) and reserve Approve for administrators.
  // Explicit role maps and legacy settings above still override this default.
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
  "charitable-giving", "tax-compliance", "monthly-reconciliation", "period-close", "annual-review", "policy-targets"];

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
