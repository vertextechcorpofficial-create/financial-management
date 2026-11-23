import type { WorkspaceKey } from "../workspaces";

export type LedgerRole = "none" | "view" | "prepare" | "approve";
type Access = { id: number; admin: boolean; workspaces: readonly WorkspaceKey[] };

export function workspaceRole(access: Access | null, workspace: WorkspaceKey, config = process.env.CGL_WORKSPACE_ROLES): LedgerRole {
  if (!access?.workspaces.includes(workspace)) return "none";
  if (config !== undefined) {
    try {
      const roles = JSON.parse(config);
      const role = roles[String(access.id)]?.[workspace];
      if (role === "none" || role === "view" || role === "prepare" || role === "approve") return role;
    } catch {
      // Invalid configuration cannot grant writes.
    }
    return "view";
  }
  const member = (list?: string) => list?.split(",").some(id => id.trim() === String(access.id));
  if (workspace === "monthly-reconciliation" || workspace === "period-close") {
    if (member(process.env.CGL_RECON_APPROVER_IDS)) return "approve";
    return workspace === "monthly-reconciliation" && member(process.env.CGL_RECON_PREPARER_IDS) ? "prepare" : "view";
  }
  return access.admin ? "approve" : "view";
}

export function allows(role: LedgerRole, required: Exclude<LedgerRole, "none">) {
  const levels: LedgerRole[] = ["none", "view", "prepare", "approve"];
  return levels.indexOf(role) >= levels.indexOf(required);
}
