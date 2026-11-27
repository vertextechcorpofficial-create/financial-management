import "server-only";
import type { Knex } from "knex";
import { assertStorageReady } from "./storage.mjs";
import { remotePostingAvailable } from "./remote-client";
import { ledgerClient } from "./directus-ledger.mjs";

let pool: Knex | undefined;

function loadKnex(): typeof import("knex").default {
  // Keep Knex out of Next's static Server Component dependency graph. Knex
  // registers every optional dialect at module load time, which makes a
  // missing better-sqlite3 appear even though this adapter selects mysql2.
  const nodeRequire = eval("require") as NodeRequire;
  const loaded = nodeRequire("knex") as typeof import("knex") & { default?: typeof import("knex").default };
  return (loaded.default ?? loaded) as typeof import("knex").default;
}

export function ledgerDatabase() {
  const uri = process.env.CGL_MYSQL_URL;
  if (!uri) throw new Error("Ledger write database is not configured.");
  return pool ??= loadKnex()({
    client: "mysql2",
    connection: { uri, dateStrings: true, timezone: "Z", connectTimeout: 5000 },
    pool: { min: 0, max: 4 },
    acquireConnectionTimeout: 5000,
  });
}

export async function postingAvailable() {
  if (!process.env.CGL_MYSQL_URL) {
    try {
      const request = ledgerClient();
      await request("cgl_postings", { query: { limit: "0" } });
      await request("cgl_registers", { query: { limit: "1", "filter[name][_eq]": "policy" } });
      return true;
    } catch {
      // Keep the old endpoint probe as a compatibility path for deployments
      // that have installed the transactional extension instead.
      return remotePostingAvailable();
    }
  }
  try {
    await assertStorageReady(ledgerDatabase());
    await ledgerDatabase()("cgl_ledger_commands").first("command_id");
    const policy = await ledgerDatabase()("cgl_registers").where({ name: "policy" }).first("name");
    return Boolean(policy);
  } catch {
    return false;
  }
}
