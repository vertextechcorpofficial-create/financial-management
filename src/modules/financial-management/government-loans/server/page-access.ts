import "server-only";

import { redirect } from "next/navigation";
import { getGovernmentLoansAccess, requireGovernmentLoansWorkspace } from "./access";
import { GOVERNMENT_LOANS_PARENT, GOVERNMENT_LOANS_WORKSPACES, type GovernmentLoansWorkspaceKey } from "../workspaces";

export async function requireGovernmentLoansPage(key?: GovernmentLoansWorkspaceKey) {
  const access = key ? await requireGovernmentLoansWorkspace(key) : await getGovernmentLoansAccess();
  if (access.ok) return access;

  if (access.status === 401) {
    const path = GOVERNMENT_LOANS_WORKSPACES.find(workspace => workspace.key === key)?.path ?? GOVERNMENT_LOANS_PARENT.path;
    redirect(`/login?next=${encodeURIComponent(path)}`);
  }
  if (access.status === 503) redirect("/error/service-down?service=Government%20Loans%20Access");
  redirect("/main-dashboard?error=unauthorized_access&module=fm");
}
