import "server-only";
import knex, { type Knex } from "knex";

let pool: Knex | undefined;

export function ledgerDatabase() {
  const uri = process.env.CGL_MYSQL_URL;
  if (!uri) throw new Error("Ledger write database is not configured.");
  return pool ??= knex({
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
