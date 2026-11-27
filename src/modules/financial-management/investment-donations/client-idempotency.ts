export type LedgerCommandResult = { ok: false; message: string; state?: "unknown" | "failed" } |
  { ok: true; number?: number | null; revision?: number; id?: string };
export type LedgerCommandStatus = { ok: boolean; state: "completed" | "failed" | "not-found" | "unknown";
  commandId: string; number?: number | null; revision?: number; id?: string; message?: string };
export type PendingLedgerCommand = { commandId: string; operation: string };
export type LedgerCommandEnvelope = { operation: string; input: unknown; commandId?: string; expectedActor?: number };
type LedgerCommandIdentity = { ok: true; id: number } | { ok: false; message: string };
type Dependencies = {
  storage: () => Pick<Storage, "getItem" | "setItem" | "removeItem" | "length" | "key">;
  crypto: () => Pick<Crypto, "randomUUID" | "getRandomValues" | "subtle">;
};

function browserStorage(): Pick<Storage, "getItem" | "setItem" | "removeItem" | "length" | "key"> {
  if (typeof window === "undefined") throw new Error("Browser storage is unavailable.");

  // Embedded/private contexts can block sessionStorage while allowing the
  // equivalent command receipt data in localStorage.
  for (const name of ["sessionStorage", "localStorage"] as const) {
    try {
      const candidate = window[name];
      const probe = "cgl:storage-probe";
      candidate.setItem(probe, "1");
      candidate.removeItem(probe);
      return candidate;
    } catch {
      // Try the next browser storage implementation.
    }
  }
  throw new Error("Browser storage is unavailable.");
}

function fallbackUuid(crypto: Pick<Crypto, "randomUUID" | "getRandomValues">) {
  const bytes = new Uint8Array(16);
  try { crypto.getRandomValues(bytes); } catch { for (let index = 0; index < bytes.length; index++) bytes[index] = Math.floor(Math.random() * 256); }
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, byte => byte.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

async function digestHex(crypto: Pick<Crypto, "subtle">, value: string) {
  if (crypto.subtle) {
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
    return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
  }
  // Web Crypto is unavailable on some HTTP/embedded origins. This hash only
  // namespaces the local receipt key; the server still validates the command.
  let hash = 2166136261;
  for (const byte of new TextEncoder().encode(value)) hash = Math.imul(hash ^ byte, 16777619);
  const part = (hash >>> 0).toString(16).padStart(8, "0");
  return part.repeat(8);
}
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const operations = new Set(["cash", "reverse", "reconciliation", "period", "donation-document", "trade", "annual-review", "issue-certificate", "giving", "cgt-reconcile", "cgt-filing", "subscribe", "capital", "master", "prices"]);

function canonical(value: unknown): string {
  // Snapshot JSON first, matching the server-action transport's data-only envelope.
  const normalize = (item: unknown): unknown => Array.isArray(item) ? item.map(normalize) :
    item && typeof item === "object" ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([key, child]) => [key, normalize(child)])) : item;
  return JSON.stringify(normalize(JSON.parse(JSON.stringify(value))));
}

export function createLedgerCommandClient(send: (command: LedgerCommandEnvelope) => Promise<LedgerCommandResult>,
  dependencies: Dependencies = { storage: browserStorage, crypto: () => window.crypto },
  checkStatus?: (commandId: string, expectedActor?: number) => Promise<LedgerCommandStatus>,
  getIdentity?: () => Promise<LedgerCommandIdentity>) {
  const inFlight = new Map<string, Promise<LedgerCommandResult>>();
  const listeners = new Set<() => void>();
  const notify = () => { for (const listener of listeners) { try { listener(); } catch { /* UI listeners cannot affect posting. */ } } };
  const pendingRecords = (actor?: number) => {
    const storage = dependencies.storage();
    const records: (PendingLedgerCommand & { key: string })[] = [];
    if (!Number.isInteger(storage.length)) throw new Error("Safe retry storage is unavailable.");
    for (let index = 0; index < storage.length; index++) {
      const key = storage.key(index);
      if (!key?.startsWith("cgl:pending:")) continue;
      const parts = /^cgl:pending:(?:(\d+):)?([a-f0-9]{64})$/.exec(key);
      if (!parts) throw new Error("A pending ledger command record could not be verified.");
      if (parts[1] && Number(parts[1]) !== actor) continue;
      const saved = JSON.parse(storage.getItem(key) ?? "null");
      if (!saved || !uuid.test(saved.commandId) || saved.hash !== parts[2] ||
        (saved.operation !== undefined && !operations.has(saved.operation))) throw new Error("A pending ledger command record could not be verified.");
      records.push({ key, commandId: saved.commandId, operation: saved.operation ?? "ledger" });
    }
    return { storage, records };
  };
  const listPendingLedgerCommands = (actor?: number): PendingLedgerCommand[] => pendingRecords(actor).records.map(({ commandId, operation }) => ({ commandId, operation }));
  const subscribePendingLedgerCommands = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
  const checkLedgerCommandStatus = async (commandId: string): Promise<LedgerCommandStatus> => {
    const unknownStatus = (message: string): LedgerCommandStatus => ({ ok: false, state: "unknown", commandId, message });
    if (!uuid.test(commandId) || !checkStatus) return unknownStatus("The command status is unavailable.");
    try {
      const identity = getIdentity ? await getIdentity() : undefined;
      if (identity && (!identity.ok || !Number.isSafeInteger(identity.id) || identity.id < 1)) return unknownStatus("The current ledger user could not be verified.");
      const actor = identity?.ok ? identity.id : undefined;
      // Verify storage access before querying, and clear only this UUID's terminal receipt.
      pendingRecords(actor);
      const result = await checkStatus(commandId, actor);
      if (result.commandId.toLowerCase() !== commandId.toLowerCase()) return unknownStatus("The command status did not match the pending ID.");
      if (result.state === "completed" || result.state === "failed") {
        const { storage, records } = pendingRecords(actor);
        for (const record of records.filter(row => row.commandId.toLowerCase() === commandId.toLowerCase())) {
          storage.removeItem(record.key);
          if (storage.getItem(record.key) !== null) throw new Error();
        }
        notify();
      }
      return result;
    } catch { return unknownStatus("The status or safe retry storage is unavailable. The pending command has not been dismissed."); }
  };
  function execute(input: unknown): Promise<LedgerCommandResult> {
    let snapshot: LedgerCommandEnvelope;
    let fingerprint: string;
    try {
      if (!input || typeof input !== "object") throw new Error();
      const value = input as Record<string, unknown>;
      const operation = typeof value.operation === "string" && "input" in value ? value.operation : value.type;
      if (typeof operation !== "string" || !operations.has(operation)) throw new Error();
      let payload = "input" in value && typeof value.operation === "string" ? value.input : value;
      if ((operation === "master" || operation === "prices") && payload && typeof payload === "object") {
        payload = Object.fromEntries(Object.entries(payload).filter(([key]) => key !== "type"));
      }
      fingerprint = canonical({ operation, input: payload });
      snapshot = JSON.parse(fingerprint);
    } catch { return Promise.resolve({ ok: false, message: "Invalid ledger command." }); }
    const executeForActor = (expectedActor?: number): Promise<LedgerCommandResult> => {
      const flightKey = `${expectedActor ?? "legacy"}:${fingerprint}`;
      const pending = inFlight.get(flightKey);
      if (pending) return pending;
      const task = (async (): Promise<LedgerCommandResult> => {
        let storage: ReturnType<Dependencies["storage"]>;
        let key: string;
        let commandId: string;
        try {
          storage = dependencies.storage();
          const crypto = dependencies.crypto();
           const hash = await digestHex(crypto, fingerprint);
          if (expectedActor !== undefined && storage.getItem(`cgl:pending:${hash}`)) {
            return { ok: false, state: "unknown", message: "An older pending command needs an authorized status check before this form can be sent again." };
          }
          key = `cgl:pending:${expectedActor === undefined ? "" : `${expectedActor}:`}${hash}`;
          const previous = storage.getItem(key);
          const saved = previous ? JSON.parse(previous) : null;
          if (saved && (saved.hash !== hash || !uuid.test(saved.commandId))) throw new Error();
           commandId = saved?.commandId ?? (crypto.randomUUID ? crypto.randomUUID() : fallbackUuid(crypto));
          const record = JSON.stringify({ commandId, hash, operation: snapshot.operation });
          storage.setItem(key, record);
          if (storage.getItem(key) !== record) throw new Error();
          notify();
        } catch {
          return { ok: false, message: "Safe retry storage is unavailable. No command was sent. Enable session storage before saving." };
        }
        try {
          const result = await send({ ...snapshot, commandId, ...(expectedActor === undefined ? {} : { expectedActor }) });
          if (result.ok || result.state !== "unknown") {
            // A cleanup failure leaves the old ID in place, which is safer than a duplicate post.
            try { storage.removeItem(key); notify(); } catch { /* Retain the known command ID. */ }
          }
          return result;
        } catch {
          return { ok: false, state: "unknown", message: "The save could not be confirmed. Retry the same command to check its status; do not create a replacement entry." };
        }
      })();
      inFlight.set(flightKey, task);
      void task.finally(() => inFlight.delete(flightKey));
      return task;
    };
    if (!getIdentity) return executeForActor();
    return Promise.resolve().then(getIdentity).then(identity => identity.ok && Number.isSafeInteger(identity.id) && identity.id > 0 ? executeForActor(identity.id) :
      { ok: false as const, message: "The current ledger user could not be verified. No command was sent." },
    () => ({ ok: false as const, message: "The current ledger user could not be verified. No command was sent." }));
  }
  return Object.assign(execute, { listPendingLedgerCommands, subscribePendingLedgerCommands, checkLedgerCommandStatus });
}
