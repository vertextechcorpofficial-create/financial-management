import "server-only";

import { cookies } from "next/headers";
import { z } from "zod";
import { proxySpring, refreshedAccessToken } from "@/app/api/fm/financial-statements/adjusting-journal-entries/_spring";
import { COOKIE_NAME, REFRESH_COOKIE_NAME, decodeJwtPayload } from "@/lib/auth-utils";
import {
  GOVERNMENT_LOANS_PARENT,
  GOVERNMENT_LOANS_WORKSPACES,
  type GovernmentLoansWorkspaceKey,
} from "../workspaces";
import { readGovernmentLoansItems } from "./directus";

const ID = z.union([z.number(), z.string().regex(/^[1-9]\d*$/)]).transform(Number)
  .pipe(z.number().int().positive().max(Number.MAX_SAFE_INTEGER));
const Flag = z.union([
  z.boolean(),
  z.literal(0),
  z.literal(1),
  z.literal("0"),
  z.literal("1"),
  z.null(),
  z.object({ type: z.literal("Buffer"), data: z.tuple([z.union([z.literal(0), z.literal(1)])]) }),
]).transform(value => {
  if (value !== null && typeof value === "object") return value.data[0] === 1;
  return value === true || value === 1 || value === "1";
});
const Profile = z.object({
  user_id: ID,
  role: z.string().nullable(),
  isAdmin: Flag,
  is_blocked: Flag,
  is_deleted: Flag,
});
const RegistryRow = z.object({
  id: ID,
  slug: z.string().nullable(),
  base_path: z.string().nullable(),
  parent_module_id: ID.nullable(),
  status: z.string().nullable(),
  sort: z.number().int().nullable(),
});
const Grant = z.object({ module_id: ID });

type AccessStatus = 401 | 403 | 503;
export type GovernmentLoansAccessWorkspace = {
  key: GovernmentLoansWorkspaceKey;
  title: string;
  path: string;
};
type AccessResult =
  | { ok: true; actorId: number; actorRole: string | null; actorName: string; actorEmail: string; workspaces: GovernmentLoansAccessWorkspace[]; setCookies: string[] }
  | { ok: false; status: AccessStatus; message: string; setCookies: string[] };

const messages: Record<AccessStatus, string> = {
  401: "Please sign in again to use Government Loans.",
  403: "You do not have access to this Government Loans workspace.",
  503: "Government Loans access is temporarily unavailable. Please try again.",
};

function denied(status: AccessStatus, setCookies: string[] = []): AccessResult {
  return { ok: false, status, message: messages[status], setCookies };
}

async function readRows<T extends z.ZodType>(
  collection: "user" | "modules" | "user_access_modules",
  fields: string,
  filter: object,
  schema: T,
  limit = "-1",
): Promise<z.output<T>[]> {
  const query = new URLSearchParams({ fields, filter: JSON.stringify(filter), limit });
  return z.object({ data: z.array(schema) }).parse(await readGovernmentLoansItems(collection, query)).data;
}

function activeModule(
  rows: z.output<typeof RegistryRow>[],
  definition: { slug: string; path: string },
  parentId: number | null,
) {
  const matches = rows.filter(row => row.slug === definition.slug || row.base_path === definition.path);
  if (matches.length !== 1) return undefined;
  const row = matches[0];
  return row.slug === definition.slug && row.base_path === definition.path &&
    row.status === "active" && row.parent_module_id === parentId ? row : undefined;
}

export async function getGovernmentLoansAccess(): Promise<AccessResult> {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  if (!token && !cookieStore.get(REFRESH_COOKIE_NAME)?.value) return denied(401);
  if (!process.env.SPRING_API_BASE_URL) return denied(503);

  let setCookies: string[] = [];
  try {
    const session = await proxySpring("/auth/me", undefined, undefined, 10_000);
    setCookies = session.headers.getSetCookie();
    if ([401, 403, 404].includes(session.status)) return denied(401, setCookies);
    if (!session.ok) return denied(503, setCookies);

    const { id: actorId } = z.object({ id: ID }).parse(await session.json());
    const profiles = await readRows("user", "user_id,role,isAdmin,is_blocked,is_deleted", {
      user_id: { _eq: actorId },
    }, Profile, "2");
    if (profiles.length > 1) return denied(503, setCookies);
    const user = profiles[0];
    if (!user || user.user_id !== actorId || user.is_blocked || user.is_deleted) return denied(401, setCookies);

    const isAdmin = user.role === "ADMIN" || user.isAdmin;
    const verifiedToken = refreshedAccessToken(session) ?? token;
    const claims = verifiedToken ? decodeJwtPayload(verifiedToken) : null;
    if (!isAdmin && (!Array.isArray(claims?.subsystems) || !claims.subsystems.includes("fm"))) {
      return denied(403, setCookies);
    }

    const entries = [GOVERNMENT_LOANS_PARENT, ...GOVERNMENT_LOANS_WORKSPACES];
    const modules = await readRows("modules", "id,slug,base_path,parent_module_id,status,sort", {
      subsystem_id: { slug: { _eq: "fm" }, status: { _eq: "active" } },
      _or: [
        { slug: { _in: entries.map(row => row.slug) } },
        { base_path: { _in: entries.map(row => row.path) } },
      ],
    }, RegistryRow);
    const parent = activeModule(modules, GOVERNMENT_LOANS_PARENT, null);
    if (!parent) return denied(403, setCookies);

    const registered = GOVERNMENT_LOANS_WORKSPACES.flatMap(workspace => {
      const row = activeModule(modules, workspace, parent.id);
      return row ? [{ workspace, id: row.id, sort: row.sort ?? workspace.sort }] : [];
    }).sort((left, right) => left.sort - right.sort);
    if (!registered.length) return denied(403, setCookies);

    const allowedIds = isAdmin ? null : new Set((await readRows("user_access_modules", "module_id", {
      user_id: { _eq: actorId },
      module_id: { _in: registered.map(row => row.id) },
    }, Grant)).map(row => row.module_id));
    const workspaces = registered
      .filter(({ id }) => allowedIds === null || allowedIds.has(id))
      .map(({ workspace: { key, title, path } }) => ({ key, title, path }));

    if (!workspaces.length) return denied(403, setCookies);
    const actorName = [claims?.FirstName, claims?.LastName].filter((part): part is string => typeof part === "string")
      .map(part => part.trim()).filter(Boolean).join(" ") || `User ${actorId}`;
    const actorEmail = typeof claims?.email === "string" ? claims.email.trim() : "";
    return { ok: true, actorId, actorRole: user.role ?? (isAdmin ? "ADMIN" : null), actorName, actorEmail, workspaces, setCookies };
  } catch {
    return denied(503, setCookies);
  }
}

export async function requireGovernmentLoansWorkspace(key: GovernmentLoansWorkspaceKey): Promise<AccessResult> {
  const access = await getGovernmentLoansAccess();
  if (!access.ok || access.workspaces.some(workspace => workspace.key === key)) return access;
  return denied(403, access.setCookies);
}
