import React from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { ApprovalEventTypeOption, GeneralSettingsData } from "../types";

interface ApprovalsSettingsCardProps {
  settings: GeneralSettingsData;
  eventTypes: ApprovalEventTypeOption[];
  onUpdateField: <K extends keyof GeneralSettingsData>(
    key: K,
    value: GeneralSettingsData[K]
  ) => void;
  onToggleEventType: (eventTypeId: number, checked: boolean) => void;
}

export default function ApprovalsSettingsCard({
  settings,
  eventTypes,
  onUpdateField,
  onToggleEventType,
}: ApprovalsSettingsCardProps) {
  return (
    <div className="bg-card border rounded-xl p-5 shadow-2xs space-y-5">
      <span className="text-[10px] font-bold tracking-wider text-muted-foreground uppercase block">
        APPROVALS
      </span>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-start">
        {/* Column 1: Enable toggle */}
        <div className="flex items-start gap-2.5 pt-1">
          <Checkbox
            id="approval-enabled"
            checked={settings.approval_enabled}
            onCheckedChange={(c) => onUpdateField("approval_enabled", Boolean(c))}
            className="mt-0.5"
          />
          <Label
            htmlFor="approval-enabled"
            className="text-xs font-medium text-foreground leading-snug cursor-pointer select-none"
          >
            Require a second person to approve entries at or above the threshold
          </Label>
        </div>

        {/* Column 2: Threshold */}
        <div className="space-y-1.5">
          <Label htmlFor="approval-threshold" className="text-xs font-medium text-foreground">
            Threshold (₱ impact)
          </Label>
          <Input
            id="approval-threshold"
            type="number"
            min={0}
            step="1000"
            value={settings.approval_threshold}
            onChange={(e) =>
              onUpdateField(
                "approval_threshold",
                e.target.value === "" ? 0 : Number(e.target.value)
              )
            }
            disabled={!settings.approval_enabled}
            className="h-9 text-xs font-mono bg-background"
          />
          <p className="text-[11px] text-muted-foreground leading-snug">
            Impact = carrying amount derecognised, impairment/revaluation change, or capitalised amount
          </p>
        </div>

        {/* Column 3: Entry types */}
        <div className="space-y-2">
          <Label className="text-xs font-medium text-foreground block">Entry types</Label>
          <div className="space-y-2">
            {eventTypes.map((et) => (
              <div key={et.id} className="flex items-center gap-2">
                <Checkbox
                  id={`ev-type-${et.id}`}
                  checked={et.requires_approval}
                  onCheckedChange={(c) => onToggleEventType(et.id, Boolean(c))}
                  disabled={!settings.approval_enabled}
                />
                <Label
                  htmlFor={`ev-type-${et.id}`}
                  className="text-xs font-normal text-foreground cursor-pointer select-none"
                >
                  {et.name}
                </Label>
              </div>
            ))}
          </div>
        </div>
      </div>

      <p className="text-[11px] text-muted-foreground pt-2 border-t">
        Entries made by a role that cannot post (e.g. a Property Officer&apos;s count write-off) always need approval.
      </p>
    </div>
  );
}
