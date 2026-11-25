import { EndpointError, commandStatus, runCommand } from "./command-runner.mjs";
import { endpointAccess, endpointSettings } from "./identity.mjs";

export function registerLedgerEndpoint(router, { database }, engine) {
  const handler = (action, signedIn = true) => async (request, response) => {
    response.setHeader("Cache-Control", "no-store");
    try {
      const settings = await endpointSettings(database, request);
      const version = await database("cgl_storage_state").where({ id: 1 }).first();
      if (Number(version?.schema_version) !== 1) throw new EndpointError(503, "Apply the normalized ledger migration first.", "unavailable");
      await database("cgl_ledger_commands").first("command_id");
      const access = signedIn ? await endpointAccess(database, request, settings) : null;
      return await action(request, response, access);
    } catch (error) {
      if (error instanceof EndpointError) return response.status(error.status).json({ ok: false, state: error.state, message: error.message });
      if (engine.isDomainError(error)) return response.status(400).json({ ok: false, state: "failed", message: error.message });
      return response.status(503).json({ ok: false, state: "unknown", message: "The ledger outcome could not be confirmed. Reuse the same command ID when checking or retrying." });
    }
  };
  router.get("/health", handler(async (_request, response) => response.json({ available: true, schemaVersion: 1 }), false));
  router.get("/access", handler(async (_request, response, access) => response.json({ id: access.id, roles: access.roles })));
  // Read-only contract: { ok: true, data: backupObject }; no caller-provided URL or body.
  router.get("/backup", handler(async (_request, response, access) =>
    response.json({ ok: true, data: await engine.readBackup(database, access) })));
  router.post("/post", handler(async (request, response, access) => {
    if (request.headers?.["content-type"]?.split(";")[0].trim().toLowerCase() !== "application/json") throw new EndpointError(415, "Send a JSON ledger command.");
    const result = await runCommand(database, request.body, access, engine);
    return response.status(result.ok ? 200 : 422).json(result);
  }));
  router.get("/commands/:commandId", handler(async (request, response, access) => {
    const result = await commandStatus(database, request.params.commandId, access, engine.prepare);
    return response.status(result.state === "not-found" ? 404 : 200).json(result);
  }));
}
