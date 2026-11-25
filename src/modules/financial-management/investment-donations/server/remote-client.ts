import "server-only";
import { ledgerConnectionBase } from "./connection-url.mjs";
import { z } from "zod";
import type { LedgerRole } from "./permissions";
import { INVESTMENT_DONATIONS_WORKSPACES, type WorkspaceKey } from "../workspaces";
import type { LedgerCommandStatus } from "../client-idempotency";
import { validateBackup } from "./data-tools.mjs";

export type RemoteCommandResult = { ok: true; number?: number | null; revision?: number; id?: string } |
  { ok: false; message: string; state?: "unknown" };
const resultSchema = z.discriminatedUnion("ok", [
  z.object({ ok: z.literal(true), number: z.number().nullable().optional(), revision: z.number().optional(), id: z.string().optional() }),
  z.object({ ok: z.literal(false), message: z.string().max(1000), state: z.enum(["unknown", "failed"]).optional() }),
]);
const unknown = (): RemoteCommandResult => ({ ok: false, state: "unknown",
  message: "The save could not be confirmed. Retry the same command to check its status; do not create a replacement entry." });

function endpoint(path: string) {
  const base = ledgerConnectionBase(process.env.NEXT_PUBLIC_API_BASE_URL);
  return `${base}/cgl-ledger${path}`;
}

async function request(path: string, userToken?: string, body?: unknown) {
  const token = process.env.DIRECTUS_STATIC_TOKEN;
  if (!token) throw new Error("Ledger service is not configured.");
  return fetch(endpoint(path), {
    method: body === undefined ? "GET" : "POST", cache: "no-store", redirect: "error",
    signal: AbortSignal.timeout(10000),
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json",
      ...(userToken ? { "x-cgl-user-token": userToken } : {}),
      ...(body === undefined ? {} : { "Content-Type": "application/json" }) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

export async function remotePostingAvailable() {
  try {
    const response = await request("/health");
    return response.ok && z.object({ available: z.literal(true), schemaVersion: z.literal(1) }).safeParse(await response.json()).success;
  } catch { return false; }
}

/** GET /cgl-ledger/backup returns { ok: true, data: backupObject }, never a download URL. */
export async function remoteLedgerBackup(userToken: string) {
  if (!userToken) throw new Error("A verified session is required to export a backup.");
  const response = await request("/backup", userToken);
  if (!response.ok) throw new Error("The authenticated ledger backup endpoint is unavailable.");
  const envelope = z.object({ ok: z.literal(true), data: z.unknown() }).strict().parse(await response.json());
  validateBackup(envelope.data);
  return envelope.data as ReturnType<typeof validateBackup>;
}

export async function remoteLedgerRoles(userToken: string, verifiedId: number): Promise<Partial<Record<WorkspaceKey, LedgerRole>>> {
  try {
    const response = await request("/access", userToken);
    if (!response.ok) return {};
    const access = z.object({ id: z.number().int().positive(), roles: z.record(z.string(), z.enum(["none", "view", "prepare", "approve"])) }).parse(await response.json());
    if (access.id !== verifiedId) return {};
    return Object.fromEntries(INVESTMENT_DONATIONS_WORKSPACES.map(({ key }) => [key, access.roles[key] ?? "none"]));
  } catch { return {}; }
}

async function confirmed(response: Response): Promise<RemoteCommandResult> {
  // The endpoint persists rejected domain commands and returns their receipt as 422.
  if (!response.ok && response.status !== 422) return unknown();
  const parsed = resultSchema.safeParse(await response.json());
  if (!parsed.success) return unknown();
  if (parsed.data.ok) return parsed.data;
  return { ok: false, message: parsed.data.message, ...(parsed.data.state === "unknown" ? { state: "unknown" as const } : {}) };
}

export async function postRemoteLedgerCommand(userToken: string, command: { commandId: string; operation: string; input: unknown }): Promise<RemoteCommandResult> {
  if (!z.string().uuid().safeParse(command.commandId).success || !userToken) {
    return { ok: false, message: "A verified session and valid command ID are required." };
  }
  try {
    const response = await request("/post", userToken, { commandId: command.commandId, operation: command.operation, input: command.input });
    // A retry may follow an earlier commit. Permission/service failures cannot
    // establish whether that command committed, so retain its pending ID.
    if ([401, 403, 404].includes(response.status)) return { ok: false, state: "unknown",
      message: response.status === 404 ? "Ledger posting is unavailable. This workspace is read-only." : "Ledger permission could not be verified. Sign in again before saving." };
    if (response.status === 409) return { ok: false, state: "unknown",
      message: "This command ID conflicts with an earlier command. No replacement was sent. Review the ledger before proceeding." };
    const result = await confirmed(response);
    if (result.ok || result.state !== "unknown") return result;
  } catch { /* A timeout can occur after commit; reconcile with the same ID. */ }
  try { return await confirmed(await request(`/commands/${encodeURIComponent(command.commandId)}`, userToken)); }
  catch { return unknown(); }
}

export async function checkRemoteLedgerCommandStatus(userToken: string, commandId: string): Promise<LedgerCommandStatus> {
  const unknownStatus = (): LedgerCommandStatus => ({ ok: false, state: "unknown", commandId,
    message: "The command status could not be verified. Its pending ID has been retained." });
  if (!userToken || !z.string().uuid().safeParse(commandId).success) return unknownStatus();
  try {
    const response = await request(`/commands/${encodeURIComponent(commandId)}`, userToken);
    if (!response.ok && response.status !== 404) return unknownStatus();
    const parsed = z.object({ ok: z.boolean(), state: z.enum(["completed", "failed", "not-found", "unknown"]),
      commandId: z.string().uuid(), number: z.number().nullable().optional(), revision: z.number().optional(),
      id: z.string().optional(), message: z.string().max(1000).optional() }).safeParse(await response.json());
    if (!parsed.success || parsed.data.commandId.toLowerCase() !== commandId.toLowerCase()) return unknownStatus();
    if (response.status === 404 && parsed.data.state !== "not-found") return unknownStatus();
    if (parsed.data.ok !== (parsed.data.state === "completed")) return unknownStatus();
    return parsed.data;
  } catch { return unknownStatus(); }
}
