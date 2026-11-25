import React from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SearchableSelect } from "./SearchableSelect";
import type { AssetClassRow, LookupOption } from "../types";

interface AssetClassesCardProps {
  classes: AssetClassRow[];
  measurementModels: LookupOption[];
  depreciationMethods: LookupOption[];
  hasClosedPeriod: boolean;
  onAddClass: () => void;
  onUpdateClass: (index: number, patch: Partial<AssetClassRow>) => void;
  onRemoveClass: (index: number) => void;
}

export default function AssetClassesCard({
  classes,
  measurementModels,
  depreciationMethods,
  hasClosedPeriod,
  onAddClass,
  onUpdateClass,
  onRemoveClass,
}: AssetClassesCardProps) {
  const modelOptions = measurementModels.map((m) => ({
    value: String(m.id),
    label: m.name,
    subLabel: m.description || undefined,
  }));

  const methodOptions = depreciationMethods.map((m) => ({
    value: String(m.id),
    label: m.name,
    subLabel: m.description || undefined,
  }));

  return (
    <div className="bg-card border rounded-xl shadow-2xs overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-xs text-left">
          <thead className="border-b font-semibold text-muted-foreground bg-muted/40 uppercase tracking-wider text-[10px]">
            <tr>
              <th className="py-3 px-4 min-w-[200px]">Asset Class</th>
              <th className="py-3 px-3 min-w-[200px]">Measurement Model (IAS 16.29)</th>
              <th className="py-3 px-3 min-w-[210px]">Default Method</th>
              <th className="py-3 px-3 w-36">Useful Life (Yrs)</th>
              <th className="py-3 px-3 w-36">Residual %</th>
              <th className="py-3 px-4 text-right w-24"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/60">
            {classes.length === 0 ? (
              <tr>
                <td colSpan={6} className="py-8 text-center text-muted-foreground">
                  No asset classes configured yet. Click &ldquo;+ Add class&rdquo; to create one.
                </td>
              </tr>
            ) : (
              classes.map((cls, idx) => (
                <tr key={cls.id ?? cls.tempId ?? idx} className="hover:bg-muted/15 transition-colors">
                  <td className="py-2.5 px-4">
                    <Input
                      value={cls.name}
                      onChange={(e) => onUpdateClass(idx, { name: e.target.value })}
                      placeholder="Class name"
                      className="h-9 text-xs bg-background"
                    />
                  </td>
                  <td className="py-2.5 px-3">
                    <SearchableSelect
                      options={modelOptions}
                      value={String(cls.measurement_model_id)}
                      onChange={(val) =>
                        onUpdateClass(idx, { measurement_model_id: Number(val) })
                      }
                      placeholder="Select model..."
                      searchPlaceholder="Search model..."
                      disabled={hasClosedPeriod && cls.id !== null}
                    />
                  </td>
                  <td className="py-2.5 px-3">
                    <SearchableSelect
                      options={methodOptions}
                      value={String(cls.depreciation_method_id)}
                      onChange={(val) =>
                        onUpdateClass(idx, { depreciation_method_id: Number(val) })
                      }
                      placeholder="Select method..."
                      searchPlaceholder="Search method..."
                    />
                  </td>
                  <td className="py-2.5 px-3">
                    <Input
                      type="number"
                      min={0}
                      step="1"
                      value={cls.useful_life_years}
                      onChange={(e) =>
                        onUpdateClass(idx, {
                          useful_life_years: e.target.value === "" ? 0 : Number(e.target.value),
                        })
                      }
                      className="h-9 text-xs font-mono bg-background"
                    />
                  </td>
                  <td className="py-2.5 px-3">
                    <Input
                      type="number"
                      min={0}
                      max={100}
                      step="0.5"
                      value={cls.residual_percent}
                      onChange={(e) =>
                        onUpdateClass(idx, {
                          residual_percent: e.target.value === "" ? 0 : Number(e.target.value),
                        })
                      }
                      className="h-9 text-xs font-mono bg-background"
                    />
                  </td>
                  <td className="py-2.5 px-4 text-right whitespace-nowrap">
                    {cls.in_use ? (
                      <span className="text-[11px] font-mono text-muted-foreground">
                        in use
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => onRemoveClass(idx)}
                        className="text-xs font-medium text-destructive hover:underline"
                      >
                        Remove
                      </button>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="p-4 border-t bg-muted/10">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onAddClass}
          className="h-8 text-xs gap-1.5 bg-background"
        >
          <Plus className="h-3.5 w-3.5" />
          Add class
        </Button>
      </div>
    </div>
  );
}
