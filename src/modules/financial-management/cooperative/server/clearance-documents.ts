import "server-only";

import { changeClearanceDocuments } from "./clearance-commands";
import { ClearanceError, readClearance } from "./clearance-store";
import { CooperativeDocumentError } from "./document-input";
import type { LoanActor } from "./loan-commands";
import { SavingsCommandError } from "./savings-commands";

export function clearanceDocumentScope(id: number) {
  return {
    workspace: "exit-clearance" as const,
    async loadOwner(_actorId: number, operation: "read" | "upload" | "remove") {
      const row = await readClearance(id).catch(error => {
        if (error instanceof ClearanceError && [400, 404].includes(error.status)) return null;
        throw error;
      });
      if (!row) return null;
      if (operation !== "read" && row.status !== "DRAFT") {
        throw new CooperativeDocumentError(409, "Documents on this clearance are read-only.");
      }
      return { type: "CLEARANCE" as const, id: row.id, revision: row.revision };
    },
    async writeMetadata(
      owner: { id: number; revision?: number }, actor: LoanActor,
      change: Parameters<typeof changeClearanceDocuments>[3],
    ) {
      if (owner.id !== id || owner.revision === undefined) throw new CooperativeDocumentError(403, "This clearance is unavailable.");
      try {
        const result = await changeClearanceDocuments(id, owner.revision, actor, change);
        if (result.duplicate && "create" in change) throw new CooperativeDocumentError(409, "This upload already completed.");
      } catch (error) {
        if (error instanceof ClearanceError || error instanceof SavingsCommandError) {
          throw new CooperativeDocumentError(error.status, error.message);
        }
        throw error;
      }
    },
  };
}
