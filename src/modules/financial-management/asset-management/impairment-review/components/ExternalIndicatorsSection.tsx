"use client";

import React from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";

export interface ExternalIndicatorsState {
  marketMachinery: boolean;
  marketTransportation: boolean;
  marketIT: boolean;
  marketFurniture: boolean;
  interestRatesIncreased: boolean;
  idleMonths: number;
  repairPercent: number;
  showAllAssets: boolean;
}

interface ExternalIndicatorsSectionProps {
  state: ExternalIndicatorsState;
  onChange: (updates: Partial<ExternalIndicatorsState>) => void;
  disabled?: boolean;
}

export default function ExternalIndicatorsSection({
  state,
  onChange,
  disabled = false,
}: ExternalIndicatorsSectionProps) {
  return (
    <div className="bg-card border rounded-xl p-5 shadow-2xs space-y-4">
      <div>
        <h2 className="text-[10px] font-bold tracking-wider text-muted-foreground uppercase">
          EXTERNAL INDICATORS
        </h2>
        <p className="text-xs text-muted-foreground mt-0.5">
          Things the system can&apos;t detect &mdash; tick what applies at the review date.
        </p>
      </div>

      {/* Checkboxes row */}
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2.5 text-xs">
        <label className="flex items-center gap-2 cursor-pointer select-none">
          <Checkbox
            checked={state.marketMachinery}
            onCheckedChange={(c) => onChange({ marketMachinery: !!c })}
            disabled={disabled}
          />
          <span>Significant fall in market value &mdash; Machinery &amp; Equipment</span>
        </label>

        <label className="flex items-center gap-2 cursor-pointer select-none">
          <Checkbox
            checked={state.marketTransportation}
            onCheckedChange={(c) => onChange({ marketTransportation: !!c })}
            disabled={disabled}
          />
          <span>Significant fall in market value &mdash; Transportation Equipment</span>
        </label>

        <label className="flex items-center gap-2 cursor-pointer select-none">
          <Checkbox
            checked={state.marketIT}
            onCheckedChange={(c) => onChange({ marketIT: !!c })}
            disabled={disabled}
          />
          <span>Significant fall in market value &mdash; IT Equipment</span>
        </label>

        <label className="flex items-center gap-2 cursor-pointer select-none">
          <Checkbox
            checked={state.marketFurniture}
            onCheckedChange={(c) => onChange({ marketFurniture: !!c })}
            disabled={disabled}
          />
          <span>Significant fall in market value &mdash; Furniture &amp; Fixtures</span>
        </label>

        <label className="flex items-center gap-2 cursor-pointer select-none">
          <Checkbox
            checked={state.interestRatesIncreased}
            onCheckedChange={(c) => onChange({ interestRatesIncreased: !!c })}
            disabled={disabled}
          />
          <span>Market interest rates increased (affects value in use)</span>
        </label>
      </div>

      {/* Threshold controls and Show all toggle */}
      <div className="flex flex-wrap items-center gap-4 text-xs pt-1 border-t border-border/50">
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground">Flag &quot;idle&quot; after</span>
          <Input
            type="number"
            min={1}
            max={60}
            value={state.idleMonths}
            onChange={(e) => onChange({ idleMonths: Number(e.target.value) || 6 })}
            className="w-14 h-7 text-xs text-center bg-background"
            disabled={disabled}
          />
          <span className="text-muted-foreground">months unassigned</span>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-muted-foreground">Flag repairs above</span>
          <Input
            type="number"
            min={1}
            max={100}
            value={state.repairPercent}
            onChange={(e) => onChange({ repairPercent: Number(e.target.value) || 25 })}
            className="w-14 h-7 text-xs text-center bg-background"
            disabled={disabled}
          />
          <span className="text-muted-foreground">% of carrying amount (12 months)</span>
        </div>

        <div className="ml-auto">
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <Checkbox
              checked={state.showAllAssets}
              onCheckedChange={(c) => onChange({ showAllAssets: !!c })}
            />
            <span className="font-medium">Show all assets</span>
          </label>
        </div>
      </div>
    </div>
  );
}
