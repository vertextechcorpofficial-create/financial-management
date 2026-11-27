import "server-only";

import { cooperativeDirectus, CooperativeDirectusError } from "./directus";
import { CooperativeDocumentError } from "./document-input";
import { privateCooperativeFolder } from "./document-storage";
import { loanDigest, writeLoanCommand, type LoanActor } from "./loan-commands";
import { LoanError } from "./loans";
import { isActive, readDocumentTypes } from "./policies";

export function loanDocumentScope(id: number, workspace: "loans" | "approvals" = "loans") {
  return {
    workspace,
    async loadOwner(_actor: number, operation: "read" | "upload" | "remove") {
      if (!Number.isSafeInteger(id) || id < 1 || (workspace === "approvals" && operation !== "read")) return null;
      try {
        const response = await cooperativeDirectus("/items/cooperative_loans/" + id + "?fields=id,revision");
        const result = await response.json() as { data?: { id: number; revision: number } };
        return result.data?.id === id ? { type: "LOAN" as const, id, revision: result.data.revision } : null;
      } catch (error) {
        if (error instanceof CooperativeDirectusError && error.status === 404) return null;
        throw error;
      }
    },
    async writeMetadata(
      owner: { id: number; revision?: number }, actor: LoanActor,
      change: { create: Record<string, unknown>[] } | { update: Record<string, unknown>[] },
    ) {
      if (workspace !== "loans" || owner.id !== id || owner.revision === undefined) {
        throw new CooperativeDocumentError(403, "Your access to this loan changed.");
      }
      const upload = "create" in change;
      const first = upload ? change.create[0] : change.update[0];
      const type = upload ? "LOAN_DOCUMENTS_UPLOADED" : "LOAN_DOCUMENT_REMOVED";
      const key = String(upload ? first.batch_key : first.id);
      const hash = loanDigest([id, actor.actorId, key, upload ? first.request_hash : first.removal_reason]);
      try {
        const result = await writeLoanCommand({ loanId: id, type, key, hash }, owner.revision, actor, async () => ({
          changes: { loan_documents: upload ? change : { update: change.update.map(row => ({ ...row, loan_id: id })) } },
          result: { id },
        }));
        if (upload && result.duplicate) throw new CooperativeDocumentError(409, "This upload already completed.");
      } catch (error) {
        if (error instanceof LoanError) throw new CooperativeDocumentError(error.status, error.message);
        throw error;
      }
    },
  };
}

export async function loanDocumentOptions() {
  const [folder, types] = await Promise.allSettled([privateCooperativeFolder(), readDocumentTypes()]);
  return {
    storageReady: folder.status === "fulfilled",
    uploadTypes: types.status === "fulfilled"
      ? types.value.filter(type => isActive(type.is_active)).map(type => ({ id: Number(type.id), name: String(type.name) })) : [],
  };
}
