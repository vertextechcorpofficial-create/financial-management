import React from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SearchableSelect } from "./SearchableSelect";
import type { GeneralSettingsData, LookupOption } from "../types";

interface GeneralSettingsCardProps {
  settings: GeneralSettingsData;
  conventions: LookupOption[];
  hasClosedPeriod: boolean;
  onUpdateField: <K extends keyof GeneralSettingsData>(
    key: K,
    value: GeneralSettingsData[K]
  ) => void;
}

const SURPLUS_OPTIONS = [
  {
    value: "true",
    label: "Transfer to RE as asset is used (IAS 16.41)",
  },
  {
    value: "false",
    label: "Transfer to RE on derecognition only (IAS 16.41)",
  },
];

export default function GeneralSettingsCard({
  settings,
  conventions,
  hasClosedPeriod,
  onUpdateField,
}: GeneralSettingsCardProps) {
  const conventionOptions = conventions.map((c) => ({
    value: String(c.id),
    label:
      c.code === "MID"
        ? "Mid-month (≤15th → that month)"
        : c.code === "NEXT"
        ? "Next month (always following month)"
        : c.code === "FULL"
        ? "Full month (available-for-use month)"
        : c.name,
    subLabel: c.description || undefined,
  }));

  return (
    <div className="bg-card border rounded-xl p-5 shadow-2xs space-y-4">
      <span className="text-[10px] font-bold tracking-wider text-muted-foreground uppercase block">
        GENERAL
      </span>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        {/* 1. Capitalisation threshold */}
        <div className="space-y-1.5">
          <Label htmlFor="cap-threshold" className="text-xs font-medium text-foreground">
            Capitalisation threshold
          </Label>
          <Input
            id="cap-threshold"
            type="number"
            min={0}
            step="100"
            value={settings.capitalisation_threshold}
            onChange={(e) =>
              onUpdateField(
                "capitalisation_threshold",
                e.target.value === "" ? 0 : Number(e.target.value)
              )
            }
            className="h-9 text-xs font-mono bg-background"
          />
          <p className="text-[11px] text-muted-foreground">
            Materiality policy; items below are expensed
          </p>
        </div>

        {/* 2. Depreciation start convention */}
        <div className="space-y-1.5">
          <Label className="text-xs font-medium text-foreground">
            Depreciation start convention
          </Label>
          <SearchableSelect
            options={conventionOptions}
            value={String(settings.depreciation_convention_id)}
            onChange={(val) => onUpdateField("depreciation_convention_id", Number(val))}
            placeholder="Select convention..."
            searchPlaceholder="Search convention..."
            disabled={hasClosedPeriod}
          />
          {hasClosedPeriod && (
            <p className="text-[11px] text-muted-foreground">
              Locked while a period is closed.
            </p>
          )}
        </div>

        {/* 3. Revaluation surplus */}
        <div className="space-y-1.5">
          <Label className="text-xs font-medium text-foreground">
            Revaluation surplus
          </Label>
          <SearchableSelect
            options={SURPLUS_OPTIONS}
            value={String(settings.transfer_revaluation_surplus)}
            onChange={(val) => onUpdateField("transfer_revaluation_surplus", val === "true")}
            placeholder="Select surplus policy..."
            searchPlaceholder="Search policy..."
            disabled={hasClosedPeriod}
          />
          {hasClosedPeriod && (
            <p className="text-[11px] text-muted-foreground">
              Locked while a period is closed.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
