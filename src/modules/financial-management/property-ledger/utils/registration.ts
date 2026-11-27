import { z } from "zod";
import { assetSchema, type Asset, type Portfolio } from "../types";

/** 1st QA pp.4/7 overrides the original guide's optional core registration fields. */
export const registrationSchema = assetSchema.superRefine((asset, ctx) => {
  const issue = (path: (string | number)[], message: string) => ctx.addIssue({ code: "custom", path, message });
  if (!asset.location.trim()) issue(["location"], "Location is required.");
  if (asset.kind === "land" && asset.cost <= 0) issue(["cost"], "Acquisition cost must be greater than zero.");
  if (asset.kind === "building") {
    if (!asset.parts.length) issue(["parts"], "At least one valid component is required.");
    asset.parts.forEach((part, index) => {
      if (part.cost <= 0) issue(["parts", index, "cost"], "Component cost must be greater than zero.");
      if (part.date < asset.acquired) issue(["parts", index, "date"], "In-service month cannot precede acquisition.");
    });
  }
  const numericDetails = asset.kind === "land"
    ? [["area", "Lot area"], ["zonal", "Zonal value"], ["assessed", "Assessed value"]] as const
    : [["floorArea", "Floor area"], ["storeys", "Storeys"], ["yearBuilt", "Year built"]] as const;
  for (const [key, label] of numericDetails) {
    const text = asset.details[key]?.trim();
    const value = Number(text);
    const required = !["zonal", "assessed"].includes(key);
    if (!text) { if (required) issue(["details", key], `${label} is required.`); continue; }
    if (!Number.isFinite(value) || (required ? value <= 0 : value < 0)) issue(["details", key], required ? `${label} must be greater than zero.` : `${label} must be non-negative.`);
    else if (key === "storeys" && !Number.isInteger(value)) issue(["details", key], "Storeys must be a whole number.");
    else if (key === "yearBuilt" && (!Number.isInteger(value) || value < 1800 || value > new Date().getFullYear() + 5))
      issue(["details", key], "Enter a valid four-digit year built.");
  }
});

export function registrationFacts(asset: Asset) {
  return JSON.stringify([asset.kind, asset.name, asset.entityId, asset.landId, asset.location, asset.acquired,
    asset.cost, asset.rate, asset.growth, asset.method, asset.parts, asset.details]);
}

/** Validate only new/edited registrations, not untouched legacy assets or policy-only saves. */
export function assertRegistrations(previous: Portfolio, next: Portfolio) {
  for (const asset of next.assets) {
    const old = previous.assets.find(row => row.id === asset.id);
    if (!old || registrationFacts(old) !== registrationFacts(asset)) {
      const result = registrationSchema.safeParse(asset);
      if (!result.success) throw new z.ZodError(result.error.issues.map(issue => ({
        ...issue, message: `${asset.name || "Property"}: ${issue.message}`,
      })));
    }
  }
}
