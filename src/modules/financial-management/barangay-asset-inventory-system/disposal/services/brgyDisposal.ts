import { enc, get, list, patch, post, text } from "../../shared/api";
import { fetchAsset, recordHistory } from "../../assets/services/brgyAssets";
import type { BrgyAsset, BrgyDisposal } from "../../types";

type Row = Record<string, unknown>;

export function mapDisposal(r: Row): BrgyDisposal {
  return {
    id: Number(r.id), asset_id: Number(r.asset_id),
    requested_by: (r.requested_by as string) ?? null, reason: text(r.reason),
    status: (text(r.status) || "pending") as BrgyDisposal["status"],
    approved_by: (r.approved_by as string) ?? null, decision_remark: (r.decision_remark as string) ?? null,
    method: (r.method as string) ?? null, disposal_note: (r.disposal_note as string) ?? null,
  };
}

export interface DisposalRow {
  request: BrgyDisposal;
  asset: BrgyAsset | null;
}

export async function listDisposals(barangayId: number): Promise<DisposalRow[]> {
  const requests = await list<Row>("/items/brgy_disposal?sort=-id&limit=-1");
  const assetIds = [...new Set(requests.data.map((r) => Number(r.asset_id)))];
  const assets = assetIds.length
    ? (await list<Row>("/items/brgy_asset?filter=" + enc({ id: { _in: assetIds } }) + "&limit=-1")).data
    : [];
  const byId = new Map(assets.map((a) => [Number(a.id), a] as const));
  const { mapAsset } = await import("../../assets/services/brgyAssets");
  return requests.data
    .map((r) => ({ request: mapDisposal(r), asset: (() => { const a = byId.get(Number(r.asset_id)); return a ? mapAsset(a) : null; })() }))
    .filter((row) => row.asset && row.asset.barangay_id === barangayId);
}

/** Section 4.5: the custodian marks an unserviceable asset For Disposal, with a reason. */
export async function requestDisposal(input: { assetId: number; reason: string; actor?: string | null }): Promise<DisposalRow> {
  if (!input.reason || !input.reason.trim()) throw new Error("Please give a reason before changing the status to For Disposal.");
  const detail = await fetchAsset(input.assetId);
  const allowed: string[] = ["Active", "Under Repair", "Missing"];
  if (!allowed.includes(detail.asset.status)) {
    throw new Error("An asset that is " + detail.asset.status + " cannot be sent for disposal.");
  }
  const created = await post<Row>("/items/brgy_disposal", {
    asset_id: input.assetId,
    requested_by: input.actor ?? null,
    reason: input.reason.trim(),
    status: "pending",
  });
  await patch("/items/brgy_asset/" + input.assetId, { status: "For Disposal", condition: detail.asset.condition === "Unserviceable" ? "Unserviceable" : detail.asset.condition });
  await recordHistory(input.assetId, "status", detail.asset.status, "For Disposal", input.actor ?? null, input.reason.trim());
  return { request: mapDisposal(created), asset: (await fetchAsset(input.assetId)).asset };
}

/** Section 5: only the Barangay Admin approves, and never the person who requested it. */
export async function decideDisposal(input: {
  requestId: number;
  decision: "approve" | "return";
  remark?: string | null;
  actor?: string | null;
  actorRole?: string | null;
}): Promise<DisposalRow> {
  const rows = await get<Row[]>("/items/brgy_disposal?filter=" + enc({ id: { _eq: input.requestId } }) + "&limit=1");
  if (!rows?.length) throw new Error("Disposal request " + input.requestId + " not found");
  const request = mapDisposal(rows[0]);
  if (request.status !== "pending") throw new Error("This disposal request is already " + request.status);
  if (input.actorRole && input.actorRole !== "barangay_admin" && input.actorRole !== "system_admin") {
    throw new Error("Only the Barangay Admin can approve a disposal.");
  }
  if (request.requested_by && input.actor && request.requested_by === input.actor) {
    throw new Error("You requested this disposal, so another person must approve it.");
  }

  if (input.decision === "approve") {
    await patch("/items/brgy_disposal/" + input.requestId, {
      status: "approved", approved_by: input.actor ?? null, decision_remark: input.remark ?? null,
    });
    return { request: { ...request, status: "approved", approved_by: input.actor ?? null, decision_remark: input.remark ?? null }, asset: (await fetchAsset(request.asset_id)).asset };
  }

  if (!input.remark || !input.remark.trim()) throw new Error("A remark is required to return a disposal request");
  await patch("/items/brgy_disposal/" + input.requestId, {
    status: "returned", approved_by: input.actor ?? null, decision_remark: input.remark.trim(),
  });
  await patch("/items/brgy_asset/" + request.asset_id, { status: "Active" });
  await recordHistory(request.asset_id, "status", "For Disposal", "Active", input.actor ?? null, "Disposal returned: " + input.remark.trim());
  return { request: { ...request, status: "returned", approved_by: input.actor ?? null, decision_remark: input.remark.trim() }, asset: (await fetchAsset(request.asset_id)).asset };
}

/** Section 4.5: when the disposal actually happens, the asset becomes Disposed. */
export async function completeDisposal(input: {
  requestId: number;
  method: "sold" | "donated" | "condemned" | "destroyed";
  note?: string | null;
  actor?: string | null;
}): Promise<DisposalRow> {
  const rows = await get<Row[]>("/items/brgy_disposal?filter=" + enc({ id: { _eq: input.requestId } }) + "&limit=1");
  if (!rows?.length) throw new Error("Disposal request " + input.requestId + " not found");
  const request = mapDisposal(rows[0]);
  if (request.status !== "approved") throw new Error("Only an approved request can be completed");
  await patch("/items/brgy_disposal/" + input.requestId, {
    status: "completed", method: input.method, disposal_note: input.note ?? null,
  });
  await patch("/items/brgy_asset/" + request.asset_id, {
    status: "Disposed", custodian_id: null, office_id: null,
  });
  await recordHistory(request.asset_id, "status", "For Disposal", "Disposed", input.actor ?? null, "Disposed: " + input.method + (input.note ? ", " + input.note : ""));
  return { request: { ...request, status: "completed", method: input.method }, asset: (await fetchAsset(request.asset_id)).asset };
}
