import { createHash } from "node:crypto";

export class EndpointError extends Error {
  constructor(status, message, state = "failed") { super(message); this.status = status; this.state = state; }
}
const json = value => typeof value === "string" ? JSON.parse(value) : value;
const stamp = () => new Date().toISOString().replace("T", " ").slice(0, 23);

export function commandEnvelope(value) {
  if (!value || typeof value !== "object" || Array.isArray(value) ||
    Object.keys(value).some(key => !["commandId", "operation", "input"].includes(key)) ||
    typeof value.commandId !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value.commandId) ||
    typeof value.operation !== "string" || !/^[a-z][a-z-]{0,39}$/.test(value.operation) || !Object.hasOwn(value, "input")) {
    throw new EndpointError(400, "Send a valid command ID, operation and input.");
  }
  const sort = (item, depth = 0) => {
    if (depth > 30) throw new EndpointError(400, "The command is too deeply nested.");
    if (item === null || typeof item === "string" || typeof item === "boolean") return item;
    if (typeof item === "number" && Number.isFinite(item)) return item;
    if (Array.isArray(item)) return item.map(value => sort(value, depth + 1));
    if (item && typeof item === "object" && [null, Object.prototype].includes(Object.getPrototypeOf(item))) {
      return Object.fromEntries(Object.keys(item).sort().map(key => [key, sort(item[key], depth + 1)]));
    }
    throw new EndpointError(400, "Commands must contain JSON values only.");
  };
  const input = sort(value.input);
  const canonical = JSON.stringify({ operation: value.operation, input });
  if (Buffer.byteLength(canonical) > 1_000_000) throw new EndpointError(413, "The ledger command is too large.");
  return { commandId: value.commandId.toLowerCase(), operation: value.operation, input,
    hash: createHash("sha256").update(canonical).digest("hex") };
}

function receipt(row, command) {
  if (row.payload_hash !== command.hash) throw new EndpointError(409, "This command ID was already used for different input.");
  if (!["completed", "failed"].includes(row.state) || !row.result) throw new EndpointError(503, "The command outcome is not yet confirmed. Retry the same command ID.", "unknown");
  return { ...json(row.result), commandId: command.commandId, state: row.state, replayed: true };
}

/** The engine's transaction callbacks are deliberately bound to this outer trx.
 * No inner callback can commit independently from the durable command receipt. */
export async function runCommand(database, body, access, { prepare, execute, isDomainError }) {
  const command = commandEnvelope(body);
  const prepared = prepare(command.operation, command.input, access);
  const key = { actor: access.id, command_id: command.commandId };
  const lock = async trx => {
    if (!await trx("cgl_registers").where({ name: "policy" }).forUpdate().first()) throw new Error("Policy lock unavailable");
    return trx("cgl_ledger_commands").where(key).forUpdate().first();
  };
  const initial = { ...key, operation: command.operation, request_data: JSON.stringify(command.input), payload_hash: command.hash,
    state: "processing", result: null, created_at: stamp(), completed_at: null };
  const finish = async (trx, result, state) => {
    await trx("cgl_ledger_commands").where(key).update({ result: JSON.stringify(result), state, completed_at: stamp() });
    return { ...result, commandId: command.commandId, state, replayed: false };
  };
  try {
    return await database.transaction(async trx => {
      const existing = await lock(trx);
      if (existing) return receipt(existing, command);
      await trx("cgl_ledger_commands").insert(initial);
      const result = await execute({ transaction: callback => callback(trx) }, prepared);
      if (!result || result.ok !== true) throw new Error("Engine returned an unconfirmed outcome");
      return finish(trx, result, "completed");
    });
  } catch (error) {
    if (error instanceof EndpointError) throw error;
    // Business-rule failures rolled back all money/register/audit writes. Store
    // their rejection in a fresh transaction; never overwrite a concurrent receipt.
    if (isDomainError(error)) {
      return database.transaction(async trx => {
        const existing = await lock(trx);
        if (existing) return receipt(existing, command);
        await trx("cgl_ledger_commands").insert(initial);
        return finish(trx, { ok: false, message: error.message }, "failed");
      });
    }
    // A lost connection during COMMIT is ambiguous, not evidence of rollback.
    throw new EndpointError(503, "Posting could not be confirmed. Check status or retry using the same command ID.", "unknown");
  }
}

export async function commandStatus(database, commandId, access, prepare) {
  if (!/^[0-9a-f-]{36}$/i.test(commandId)) throw new EndpointError(400, "Invalid command ID.");
  const row = await database("cgl_ledger_commands").where({ actor: access.id, command_id: commandId.toLowerCase() }).first();
  if (!row) return { ok: false, state: "not-found", commandId, message: "No committed receipt is visible. Only retry this same command ID." };
  prepare(row.operation, json(row.request_data), access);
  return receipt(row, { commandId: commandId.toLowerCase(), hash: row.payload_hash });
}
