/** Pure lifecycle rules for dedicated requests; no legacy expense status mapping. */
export type IsolatedStatus = "SUBMITTED" | "RETURNED" | "REJECTED";
export type IsolatedAction = "CREATE" | "RESUBMIT" | "RETURN" | "REJECT" | "APPROVE";
export function transitionProblem(input: {
  action: IsolatedAction; current: { revision: number; requesterId: number; status: IsolatedStatus } | null;
  expectedRevision?: number; actorId: number; uniqueAssignedOfficer: boolean;
}): { status: number; message: string } | null {
  if (input.action === "APPROVE") return { status: 422, message: "Approval requires authoritative budget, evidence and payment-separation verification." };
  if (input.action === "CREATE") return input.current || input.expectedRevision !== undefined ? { status: 400, message: "Create cannot target an existing revision." } : null;
  if (!input.current || input.current.revision !== input.expectedRevision) return { status: 409, message: "Request changed or is outside your scope. Refresh before retrying." };
  if (input.action === "RESUBMIT") return input.current.status === "RETURNED" && input.current.requesterId === input.actorId ? null : { status: 403, message: "Only the requester may resubmit a returned request." };
  if (input.current.status !== "SUBMITTED") return { status: 409, message: "This request is no longer awaiting a decision." };
  if (input.current.requesterId === input.actorId) return { status: 403, message: "Requesters cannot decide their own requests." };
  return input.uniqueAssignedOfficer ? null : { status: 403, message: "A unique current officer assignment is required." };
}

/** Append key is also the cross-process concurrency guard (unique Directus PK). */
export function isolatedRevisionKey(caseId: string, revision: number) {
  if (!/^[0-9a-f-]{36}$/i.test(caseId) || !Number.isSafeInteger(revision) || revision <= 0) throw new Error("Invalid event identity");
  return `${caseId}:${revision}`;
}
