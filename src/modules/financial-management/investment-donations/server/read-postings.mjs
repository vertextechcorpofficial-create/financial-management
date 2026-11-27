/** Read-only source-record adapter for the no-extension migration. */
export async function latestPostingSnapshot(request) {
  const rows = await request("cgl_postings", { query: { sort: "-state_revision", limit: "1", fields: "id,command_id,state_revision,actor,operation,payload_hash,posting_date,status,snapshot,created_at" } });
  if (!Array.isArray(rows) || rows.length === 0) return null;
  const row = rows[0];
  const snapshot = typeof row.snapshot === "string" ? JSON.parse(row.snapshot) : row.snapshot;
  if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot) || !Array.isArray(snapshot.journal) ||
      !snapshot.registers || typeof snapshot.registers !== "object" || Array.isArray(snapshot.registers)) {
    throw new Error("The latest cgl_postings snapshot is invalid; normalized fallback is unsafe.");
  }
  return { ...snapshot, posting: { id: row.id, commandId: row.command_id, stateRevision: row.state_revision,
    actor: row.actor, operation: row.operation, hash: row.payload_hash, date: row.posting_date, status: row.status, createdAt: row.created_at } };
}
