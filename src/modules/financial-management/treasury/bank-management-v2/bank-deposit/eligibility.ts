import { phtDate, toPhtDateString } from "./pht";
import type { UndepositedAsset } from "./types";

/**
 * The one rule that decides whether a row may go on a slip. The row checkbox, "Select all
 * ready", the detail dialog and the slip form all call this, so the three can never disagree.
 * `asOf` is the date the question is asked: today for the queue, the chosen deposit date on
 * the slip form, where a post-dated check becomes deposit-able on its own check date.
 */
export function isPostDated(asset: UndepositedAsset, asOf: string = phtDate()): boolean {
  if (asset.assetType !== "CHECK" || !asset.chequeDate) return false;
  return asset.chequeDate.slice(0, 10) > asOf.slice(0, 10);
}

export function assetBlockReason(asset: UndepositedAsset, asOf: string = phtDate()): string | null {
  if (asset.isCancelled) return "Voided";
  if (!asset.isPosted) return "Not posted";
  if (!asset.collectionDate) return "No collected date";
  if (isPostDated(asset, asOf)) {
    return `Post-dated to ${toPhtDateString(asset.chequeDate)}`;
  }
  return null;
}

export function isAssetDepositable(asset: UndepositedAsset, asOf: string = phtDate()): boolean {
  return assetBlockReason(asset, asOf) === null;
}
