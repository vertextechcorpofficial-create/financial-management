import { enc, get, list, patch, post, text } from "../../shared/api";
import { fetchAsset, recordHistory } from "../../assets/services/brgyAssets";
import type { BrgyTransfer } from "../../types";

type Row = Record<string, unknown>;

function mapTransfer(r: Row): BrgyTransfer {
  return {
    id: Number(r.id), asset_id: Number(r.asset_id),
    direction: (text(r.direction) || "lgu_to_barangay") as BrgyTransfer["direction"],
    from_barangay_id: r.from_barangay_id == null ? null : Number(r.from_barangay_id),
    to_barangay_id: r.to_barangay_id == null ? null : Number(r.to_barangay_id),
    status: (text(r.status) || "for_receiving") as BrgyTransfer["status"],
    remark: (r.remark as string) ?? null, defect: (r.defect as string) ?? null,
    requested_by: (r.requested_by as string) ?? null, decided_by: (r.decided_by as string) ?? null,
    decision_remark: (r.decision_remark as string) ?? null,
  };
}

export async function listTransfers(barangayId: number): Promise<{ incoming: BrgyTransfer[]; outgoing: BrgyTransfer[] }> {
  const [incoming, outgoing] = await Promise.all([
    list<Row>("/items/brgy_transfer?filter=" + enc({ _and: [{ to_barangay_id: { _eq: barangayId } }, { status: { _in: ["for_receiving", "for_return"] } }] }) + "&sort=-id&limit=-1"),
    list<Row>("/items/brgy_transfer?filter=" + enc({ from_barangay_id: { _eq: barangayId } }) + "&sort=-id&limit=-1"),
  ]);
  return { incoming: incoming.data.map(mapTransfer), outgoing: outgoing.data.map(mapTransfer) };
}

/** Section 4.9: the LGU sends an asset, which waits as For Receiving until accepted. */
export async function createIncomingTransfer(input: {
  assetId: number;
  toBarangayId: number;
  remark?: string | null;
  actor?: string | null;
}): Promise<BrgyTransfer> {
  const detail = await fetchAsset(input.assetId);
  if (detail.asset.status === "For Receiving") throw new Error("This asset is already waiting to be received");
  const created = await post<Row>("/items/brgy_transfer", {
    asset_id: input.assetId,
    direction: "lgu_to_barangay",
    from_barangay_id: detail.asset.barangay_id,
    to_barangay_id: input.toBarangayId,
    status: "for_receiving",
    remark: input.remark ?? null,
    requested_by: input.actor ?? null,
  });
  await patch("/items/brgy_asset/" + input.assetId, { status: "For Receiving", barangay_id: input.toBarangayId, owner_type: "lgu", custodian_id: null, office_id: null });
  await recordHistory(input.assetId, "transfer", detail.asset.status, "For Receiving", input.actor ?? null, input.remark ?? null);
  return mapTransfer(created);
}

/** Section 4.9: receive or reject. Reject needs a reason and sends it back to the LGU. */
export async function decideTransfer(input: {
  transferId: number;
  decision: "receive" | "reject" | "confirm_return" | "decline_return";
  remark?: string | null;
  actor?: string | null;
}): Promise<BrgyTransfer> {
  const rows = await get<Row[]>("/items/brgy_transfer?filter=" + enc({ id: { _eq: input.transferId } }) + "&limit=1");
  if (!rows?.length) throw new Error("Transfer " + input.transferId + " not found");
  const transfer = mapTransfer(rows[0]);

  if (input.decision === "receive") {
    if (transfer.status !== "for_receiving") throw new Error("This transfer is " + transfer.status + " and cannot be received");
    await patch("/items/brgy_transfer/" + transfer.id, { status: "received", decided_by: input.actor ?? null, decision_remark: input.remark ?? null });
    await patch("/items/brgy_asset/" + transfer.asset_id, { status: "Unassigned", owner_type: "barangay" });
    await recordHistory(transfer.asset_id, "transfer", "For Receiving", "Unassigned", input.actor ?? null, "Received by barangay");
    return mapTransfer((await get<Row[]>("/items/brgy_transfer?filter=" + enc({ id: { _eq: transfer.id } }) + "&limit=1"))[0]);
  }

  if (input.decision === "reject") {
    if (!input.remark || !input.remark.trim()) throw new Error("Please give a reason for rejecting this transfer");
    await patch("/items/brgy_transfer/" + transfer.id, { status: "rejected", decided_by: input.actor ?? null, decision_remark: input.remark.trim() });
    await patch("/items/brgy_asset/" + transfer.asset_id, { cancelled: true, cancel_reason: "Rejected by barangay: " + input.remark.trim() });
    await recordHistory(transfer.asset_id, "transfer", "For Receiving", "Rejected", input.actor ?? null, input.remark.trim());
    return mapTransfer((await get<Row[]>("/items/brgy_transfer?filter=" + enc({ id: { _eq: transfer.id } }) + "&limit=1"))[0]);
  }

  if (input.decision === "confirm_return") {
    if (transfer.status !== "for_return") throw new Error("This transfer is " + transfer.status + " and cannot be confirmed");
    await patch("/items/brgy_transfer/" + transfer.id, { status: "returned", decided_by: input.actor ?? null, decision_remark: input.remark ?? null });
    await patch("/items/brgy_asset/" + transfer.asset_id, { cancelled: true, cancel_reason: "Returned to the LGU" });
    await recordHistory(transfer.asset_id, "transfer", "For Return", "Returned to LGU", input.actor ?? null, input.remark ?? null);
    return mapTransfer((await get<Row[]>("/items/brgy_transfer?filter=" + enc({ id: { _eq: transfer.id } }) + "&limit=1"))[0]);
  }

  if (!input.remark || !input.remark.trim()) throw new Error("Please give a reason for declining this return");
  await patch("/items/brgy_transfer/" + transfer.id, { status: "declined", decided_by: input.actor ?? null, decision_remark: input.remark.trim() });
  await patch("/items/brgy_asset/" + transfer.asset_id, { status: "Active" });
  await recordHistory(transfer.asset_id, "transfer", "For Return", "Active", input.actor ?? null, "Return declined: " + input.remark.trim());
  return mapTransfer((await get<Row[]>("/items/brgy_transfer?filter=" + enc({ id: { _eq: transfer.id } }) + "&limit=1"))[0]);
}

/** Section 4.10 and rule 15: only an LGU-sourced asset with a reported defect can go back. */
export async function requestReturn(input: { assetId: number; defect: string; actor?: string | null }): Promise<BrgyTransfer> {
  if (!input.defect || !input.defect.trim()) {
    throw new Error("An asset can be returned to the LGU only when a defect is reported. Please describe the defect.");
  }
  const detail = await fetchAsset(input.assetId);
  if (detail.asset.owner_type !== "lgu") {
    throw new Error("This asset was bought by the barangay and cannot be returned to the LGU.");
  }
  const created = await post<Row>("/items/brgy_transfer", {
    asset_id: input.assetId,
    direction: "barangay_to_lgu",
    from_barangay_id: detail.asset.barangay_id,
    to_barangay_id: null,
    status: "for_return",
    defect: input.defect.trim(),
    requested_by: input.actor ?? null,
  });
  await patch("/items/brgy_asset/" + input.assetId, { status: "For Return" });
  await recordHistory(input.assetId, "transfer", detail.asset.status, "For Return", input.actor ?? null, input.defect.trim());
  return mapTransfer(created);
}
