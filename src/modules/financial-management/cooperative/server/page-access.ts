import "server-only";

import { redirect } from "next/navigation";
import { getCooperativeAccess, requireCooperativeWorkspace } from "./access";
import { COOPERATIVE_PARENT, COOPERATIVE_WORKSPACES, type CooperativeWorkspaceKey } from "../workspaces";

export async function requireCooperativePage(key?: CooperativeWorkspaceKey) {
  const access = key ? await requireCooperativeWorkspace(key) : await getCooperativeAccess();
  if (access.ok) return access;

  if (access.status === 401) {
    const path = COOPERATIVE_WORKSPACES.find(workspace => workspace.key === key)?.path ?? COOPERATIVE_PARENT.path;
    redirect(`/login?next=${encodeURIComponent(path)}`);
  }
  if (access.status === 503) redirect("/error/service-down?service=Cooperative%20Access");
  redirect("/main-dashboard?error=unauthorized_access&module=fm");
}
