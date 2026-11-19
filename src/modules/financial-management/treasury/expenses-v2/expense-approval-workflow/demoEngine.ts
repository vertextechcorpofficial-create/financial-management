import { quickAuthorityCalculation } from "./domain/quickAuthorityCalculation";
export const DEMO_MARKER = "VOS_SYNTHETIC_ONLY_V1";
export const DEMO_ACTORS = ["DEMO_REQUESTER", "DEPARTMENT_HEAD", "GM", "CFO", "CEO_OWNER"] as const;
export type DemoActor = typeof DEMO_ACTORS[number];
export interface DemoRequest {
  marker: typeof DEMO_MARKER; id: string; title: string; category: string; amount: string;
  status: "SUBMITTED" | "RETURNED" | "REJECTED" | "APPROVED";
  evidence: boolean; funds: boolean; requester: "DEMO_REQUESTER";
}
export function demoFixtures(): DemoRequest[] {
  return [
    { marker: DEMO_MARKER, id: "office", title: "DEMO — Office supplies", category: "OFFICE_SUPPLIES", amount: "35000.00", status: "SUBMITTED", evidence: true, funds: true, requester: "DEMO_REQUESTER" },
    { marker: DEMO_MARKER, id: "fuel", title: "DEMO — Fuel, missing evidence", category: "FUEL", amount: "7000.00", status: "SUBMITTED", evidence: false, funds: true, requester: "DEMO_REQUESTER" },
    { marker: DEMO_MARKER, id: "capex", title: "DEMO — CapEx, funds unverified", category: "CAPEX", amount: "60000.00", status: "SUBMITTED", evidence: true, funds: false, requester: "DEMO_REQUESTER" },
  ];
}
export function demoTier(request: DemoRequest) {
  const outcome = quickAuthorityCalculation(request.category, request.amount);
  if (!outcome.ok) throw Error("Invalid synthetic category/amount");
  return outcome.result.requiredTier;
}
export function demoTransition(request: DemoRequest, action: "APPROVE" | "REJECT" | "RETURN" | "RESUBMIT", actor: DemoActor, correction?: { amount: string; evidence: boolean; funds: boolean }): DemoRequest {
  if (request.marker !== DEMO_MARKER) throw Error("Only marked synthetic records may use this demo engine");
  if (action === "RESUBMIT") {
    if (actor !== "DEMO_REQUESTER" || request.status !== "RETURNED" || !correction) throw Error("Only the requester may correct a returned request");
    const next = { ...request, ...correction, status: "SUBMITTED" as const };
    demoTier(next);
    return next;
  }
  if (request.status !== "SUBMITTED") throw Error("This request already has a decision");
  if (actor === "DEMO_REQUESTER" || actor !== demoTier(request)) throw Error("Select the required authority; requesters cannot self-approve");
  if (action === "APPROVE" && (!request.evidence || !request.funds)) throw Error("Documents and funds must pass verification before approval");
  return { ...request, status: action === "APPROVE" ? "APPROVED" : action === "RETURN" ? "RETURNED" : "REJECTED" };
}
