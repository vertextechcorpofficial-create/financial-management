import "server-only";
import type { Knex } from "knex";

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
  try {
    const policy = await ledgerDatabase()("cgl_registers").where({ name: "policy" }).first("name");
    return Boolean(policy);
  } catch {
    return false;
  }
}
