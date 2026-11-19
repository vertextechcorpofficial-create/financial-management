export const COOPERATIVE_PARENT = {
  title: "Cooperative",
  slug: "cooperative",
  path: "/fm/cooperative",
  iconName: "Users",
} as const;

export const COOPERATIVE_POLICIES = {
  key: "policies",
  title: "Policies",
  slug: "cooperative-policies",
  path: "/fm/cooperative/policies",
  iconName: "Settings",
  sort: 1,
} as const;

export const COOPERATIVE_WORKSPACES = [COOPERATIVE_POLICIES] as const;

export type CooperativeWorkspaceKey = (typeof COOPERATIVE_WORKSPACES)[number]["key"];
export type CooperativeWorkspace = Pick<(typeof COOPERATIVE_WORKSPACES)[number], "key" | "title" | "path">;
