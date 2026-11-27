import { INVESTMENT_DONATIONS_PARENT, INVESTMENT_DONATIONS_WORKSPACES } from "../../workspaces.ts";
import { workspaceRole } from "../permissions.ts";
import { EndpointError } from "./command-runner.mjs";
import { trustedLedgerUrl } from "../connection-url.mjs";

const json = value => typeof value === "string" ? JSON.parse(value) : value;
const active = flag => flag === false || flag === 0 || flag === "0" || flag === null ||
  (Buffer.isBuffer(flag) && flag.length === 1 && flag[0] === 0) ||
  (flag?.type === "Buffer" && flag.data?.length === 1 && flag.data[0] === 0);

export async function endpointSettings(database, request) {
  const user = request.accountability?.user;
  if (!user) throw new EndpointError(403, "An authenticated Directus service user is required.");
  const settings = await database("cgl_endpoint_settings").where({ id: 1 }).first();
  if (!settings || ![true, 1, "1"].includes(settings.enabled)) throw new EndpointError(503, "Ledger posting endpoint is not enabled.", "unavailable");
  if (typeof settings.service_user !== "string" || settings.service_user.toLowerCase() !== String(user).toLowerCase()) {
    throw new EndpointError(403, "This Directus identity is not allowed to submit ledger commands.");
  }
  const url = new URL(settings.auth_me_url);
  if (!trustedLedgerUrl(url) || !url.pathname.endsWith("/auth/me")) {
    throw new EndpointError(503, "The trusted sign-in verification endpoint is not configured securely.", "unavailable");
  }
  const roles = json(settings.workspace_roles);
  if (!roles || Array.isArray(roles) || typeof roles !== "object") throw new EndpointError(503, "Ledger roles are not configured.", "unavailable");
  return { ...settings, auth_me_url: url.href, workspace_roles: roles };
}

export async function endpointAccess(database, request, settings, fetchIdentity = fetch) {
  const token = request.headers?.["x-cgl-user-token"];
  if (typeof token !== "string" || token.length > 16384 || !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(token)) {
    throw new EndpointError(401, "Forward a valid signed-in application session.");
  }
  let identity;
  try {
    const response = await fetchIdentity(settings.auth_me_url, { method: "GET", headers: { Authorization: `Bearer ${token}` },
      redirect: "error", signal: AbortSignal.timeout(10000), cache: "no-store" });
    if ([401, 403].includes(response.status)) throw new EndpointError(401, "Your application session has expired.");
    if (!response.ok) throw new EndpointError(503, "Sign-in verification is unavailable.", "unknown");
    identity = await response.json();
  } catch (error) {
    if (error instanceof EndpointError) throw error;
    throw new EndpointError(503, "Sign-in verification is unavailable.", "unknown");
  }
  if (!(typeof identity?.id === "number" || (typeof identity?.id === "string" && /^[1-9]\d*$/.test(identity.id)))) throw new EndpointError(401, "The verified session has no valid application user.");
  const id = Number(identity.id);
  if (!Number.isSafeInteger(id) || id <= 0) throw new EndpointError(401, "The verified session has no valid application user.");
  const profiles = await database("user").where({ user_id: id }).select("user_id", "role", "is_blocked", "is_deleted");
  if (profiles.length !== 1 || !active(profiles[0].is_blocked) || !active(profiles[0].is_deleted)) throw new EndpointError(403, "This application user is not active.");
  const admin = profiles[0].role === "ADMIN";
  const subsystems = await database("subsystems").where({ slug: "fm", status: "active" }).select("id");
  const definitions = [INVESTMENT_DONATIONS_PARENT, ...INVESTMENT_DONATIONS_WORKSPACES];
  const registry = await database("modules").where({ status: "active" }).whereIn("subsystem_id", subsystems.map(row => row.id))
    .whereIn("slug", definitions.map(row => row.slug)).select("id", "slug", "base_path", "parent_module_id");
  const find = (definition, parentId) => {
    const matches = registry.filter(row => row.slug === definition.slug);
    return matches.length === 1 && matches[0].base_path === definition.path &&
      (matches[0].parent_module_id == null ? null : Number(matches[0].parent_module_id)) === parentId ? matches[0] : undefined;
  };
  const parent = find(INVESTMENT_DONATIONS_PARENT, null);
  if (!parent) throw new EndpointError(403, "The ledger module registration is invalid.");
  const grants = admin ? null : new Set((await database("user_access_modules").where({ user_id: id }).select("module_id")).map(row => Number(row.module_id)));
  const workspaces = INVESTMENT_DONATIONS_WORKSPACES.filter(definition => {
    const row = find(definition, Number(parent.id));
    return row && (!grants || grants.has(Number(row.id)));
  }).map(row => row.key);
  const access = { id, admin, workspaces };
  // Database-controlled policy, not client-supplied roles or a static token's admin flag.
  const config = JSON.stringify(settings.workspace_roles);
  return { ...access, rolesAuthoritative: true,
    roles: Object.fromEntries(INVESTMENT_DONATIONS_WORKSPACES.map(row => [row.key, workspaceRole(access, row.key, config)])) };
}
