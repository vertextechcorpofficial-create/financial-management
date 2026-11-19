import { requireCooperativePage } from "../server/page-access";
import { COOPERATIVE_WORKSPACES, type CooperativeWorkspaceKey } from "../workspaces";

export async function CooperativeWorkspacePage({ workspace }: { workspace: CooperativeWorkspaceKey }) {
  await requireCooperativePage(workspace);
  const title = COOPERATIVE_WORKSPACES.find(entry => entry.key === workspace)?.title;

  return (
    <main className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6">
      <p className="text-sm text-muted-foreground">Cooperative</p>
      <h1 className="mt-1 text-2xl font-semibold tracking-tight">{title}</h1>
    </main>
  );
}
