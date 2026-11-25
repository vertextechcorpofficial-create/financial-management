"use client";

import React from "react";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { ReviewLineItem, UpdateLinePayload } from "../types";
import { SearchableSelect, type SearchableSelectOption } from "./SearchableSelect";

const formatCurrency = (val?: number | null) => {
  if (val === null || val === undefined) return "—";
  return `₱${val.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
};

interface ImpairmentReviewTableProps {
  lines: ReviewLineItem[];
  conclusions: Array<{ id: number; code: string; name: string }>;
  onUpdateLine: (lineId: number, payload: UpdateLinePayload) => void;
  onToggleObsolete: (lineId: number, isObsolete: boolean) => void;
  onPostEntries: () => Promise<void>;
  onSignOff: () => Promise<void>;
  isPosting: boolean;
  isSigningOff: boolean;
  isSignedOff: boolean;
  reviewDate: string;
}

export default function ImpairmentReviewTable({
  lines,
  conclusions,
  onUpdateLine,
  onToggleObsolete,
  onPostEntries,
  onSignOff,
  isPosting,
  isSigningOff,
  isSignedOff,
  reviewDate,
}: ImpairmentReviewTableProps) {
  const conclusionOptions: SearchableSelectOption[] = conclusions.map((c) => ({
    label: c.name,
    value: String(c.id),
  }));

  const unconcludedCount = lines.filter((l) => !l.conclusion_id).length;

  return (
    <div className="space-y-4">
      {/* Main Table */}
      <div className="bg-card border rounded-xl shadow-2xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead className="border-b font-semibold text-muted-foreground bg-muted/40">
              <tr>
                <th className="py-3 px-4">Asset</th>
                <th className="py-3 px-4 text-right">Carrying amount</th>
                <th className="py-3 px-4 w-[280px]">Indicators found</th>
                <th className="py-3 px-4 w-[420px]">Conclusion</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {lines.length > 0 ? (
                lines.map((line) => {
                  const matchedConclusion = conclusions.find((c) => c.id === line.conclusion_id);
                  const code = matchedConclusion?.code || line.conclusion_code;

                  return (
                    <tr key={line.id} className="hover:bg-muted/15 transition-colors align-top">
                      {/* Col 1: Asset Details */}
                      <td className="py-3.5 px-4 space-y-2">
                        <div>
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <Link
                              href={`/fm/asset-management/registration/${line.asset_id}`}
                              className="font-mono font-bold text-emerald-800 hover:underline"
                            >
                              {line.asset_tag}
                            </Link>
                            <span className="text-muted-foreground">&bull;</span>
                            <span className="font-semibold text-foreground">{line.item_name}</span>
                          </div>
                          <div className="text-[11px] text-muted-foreground mt-0.5">
                            {line.classification_name} &bull; {line.department_name} &bull;{" "}
                            {line.condition_name}
                          </div>
                        </div>

                        {/* Callout box if pending approval exists */}
                        {line.pending_approval_notice && (
                          <div className="bg-[#fef9ee] border border-[#fef08a] rounded-lg p-2.5 text-[11px] text-[#854d0e] leading-snug">
                            {line.pending_approval_notice}
                          </div>
                        )}
                      </td>

                      {/* Col 2: Carrying Amount */}
                      <td className="py-3.5 px-4 text-right font-mono font-bold text-foreground">
                        {formatCurrency(line.carrying_amount)}
                      </td>

                      {/* Col 3: Indicators Found */}
                      <td className="py-3.5 px-4 space-y-2">
                        <div className="flex flex-wrap gap-1.5">
                          {line.indicators.map((ind) => {
                            if (ind.type === "condition") {
                              return (
                                <span
                                  key={ind.id}
                                  className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-red-50 text-red-700 border border-red-200"
                                >
                                  {ind.label}
                                </span>
                              );
                            }
                            if (ind.type === "idle") {
                              return (
                                <span
                                  key={ind.id}
                                  className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-amber-50 text-amber-800 border border-amber-200"
                                >
                                  {ind.label}
                                </span>
                              );
                            }
                            if (ind.type === "previously_impaired") {
                              return (
                                <span
                                  key={ind.id}
                                  className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-blue-50 text-blue-700 border border-blue-200"
                                >
                                  {ind.label}
                                </span>
                              );
                            }
                            if (ind.type === "obsolete") {
                              return (
                                <span
                                  key={ind.id}
                                  className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-amber-100 text-amber-900 border border-amber-300"
                                >
                                  {ind.label}
                                </span>
                              );
                            }
                            return (
                              <span
                                key={ind.id}
                                className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-muted text-muted-foreground border"
                              >
                                {ind.label}
                              </span>
                            );
                          })}
                        </div>

                        {/* Obsolete flag toggle link */}
                        {!isSignedOff && (
                          <div>
                            {line.is_obsolete ? (
                              <button
                                type="button"
                                onClick={() => onToggleObsolete(line.id, false)}
                                className="text-[11px] text-blue-600 hover:underline font-medium"
                              >
                                Remove obsolete flag
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={() => onToggleObsolete(line.id, true)}
                                className="text-[11px] text-blue-600 hover:underline font-medium"
                              >
                                + Flag obsolete
                              </button>
                            )}
                          </div>
                        )}
                      </td>

                      {/* Col 4: Conclusion Dropdown + Contextual Forms (Screenshots 1-8) */}
                      <td className="py-3.5 px-4 space-y-2.5">
                        <SearchableSelect
                          options={conclusionOptions}
                          value={line.conclusion_id ? String(line.conclusion_id) : ""}
                          onChange={(val) => {
                            const newId = val ? Number(val) : null;
                            onUpdateLine(line.id, { conclusion_id: newId });
                          }}
                          placeholder="— Conclude —"
                          searchPlaceholder="Search conclusion..."
                          disabled={isSignedOff}
                          className="h-8 w-full"
                        />

                        {/* 1. TEST: estimate recoverable amount (Image 2) */}
                        {code === "TEST" && (
                          <div className="space-y-1.5 pt-1 text-[11px]">
                            <div className="text-muted-foreground font-mono">IAS 36.18&ndash;59</div>
                            <div className="grid grid-cols-2 gap-2">
                              <div>
                                <span className="text-[10px] text-muted-foreground block mb-0.5">
                                  Fair value less costs of disposal
                                </span>
                                <div className="relative">
                                  <span className="absolute left-2.5 top-2 text-muted-foreground">₱</span>
                                  <Input
                                    type="number"
                                    placeholder="0.00"
                                    value={line.fvlcd ?? ""}
                                    onChange={(e) =>
                                      onUpdateLine(line.id, {
                                        fvlcd: e.target.value ? Number(e.target.value) : null,
                                      })
                                    }
                                    disabled={isSignedOff}
                                    className="h-8 pl-6 text-xs bg-background"
                                  />
                                </div>
                              </div>
                              <div>
                                <span className="text-[10px] text-muted-foreground block mb-0.5">
                                  Value in use
                                </span>
                                <div className="relative">
                                  <span className="absolute left-2.5 top-2 text-muted-foreground">₱</span>
                                  <Input
                                    type="number"
                                    placeholder="0.00"
                                    value={line.viu ?? ""}
                                    onChange={(e) =>
                                      onUpdateLine(line.id, {
                                        viu: e.target.value ? Number(e.target.value) : null,
                                      })
                                    }
                                    disabled={isSignedOff}
                                    className="h-8 pl-6 text-xs bg-background"
                                  />
                                </div>
                              </div>
                            </div>
                            <div className="text-[10px] text-muted-foreground">
                              Enter at least one amount<br />
                              Posts when you click &quot;Post entries&quot;
                            </div>
                          </div>
                        )}

                        {/* 2. NOT_SIGNIFICANT (Image 3) */}
                        {code === "NOT_SIGNIFICANT" && (
                          <div className="space-y-1.5 pt-1 text-[11px]">
                            <div className="text-muted-foreground font-mono">IAS 36.15&ndash;16</div>
                            <Input
                              placeholder="Why the indicator is not significant, e.g. repaired and back in service"
                              value={line.notes ?? ""}
                              onChange={(e) => onUpdateLine(line.id, { notes: e.target.value })}
                              disabled={isSignedOff}
                              className="h-8 text-xs bg-background"
                            />
                          </div>
                        )}

                        {/* 3. AMPLE_HEADROOM (Image 4) */}
                        {code === "AMPLE_HEADROOM" && (
                          <div className="space-y-1.5 pt-1 text-[11px]">
                            <div className="text-muted-foreground font-mono">IAS 36.15</div>
                            <Input
                              placeholder="Which earlier calculation, and why it still holds (required)"
                              value={line.notes ?? ""}
                              onChange={(e) => onUpdateLine(line.id, { notes: e.target.value })}
                              disabled={isSignedOff}
                              className="h-8 text-xs bg-background"
                            />
                          </div>
                        )}

                        {/* 4. CGU_NO_IMPAIRMENT (Image 5) */}
                        {code === "CGU_NO_IMPAIRMENT" && (
                          <div className="space-y-1.5 pt-1 text-[11px]">
                            <div className="text-muted-foreground font-mono">IAS 36.22, 36.66&ndash;67</div>
                            <Input
                              placeholder="Cash-generating unit, e.g. Plant 1 production line"
                              value={line.cgu_name ?? ""}
                              onChange={(e) => onUpdateLine(line.id, { cgu_name: e.target.value })}
                              disabled={isSignedOff}
                              className="h-8 text-xs bg-background"
                            />
                            <Input
                              placeholder="Result of the unit-level test (required)"
                              value={line.notes ?? ""}
                              onChange={(e) => onUpdateLine(line.id, { notes: e.target.value })}
                              disabled={isSignedOff}
                              className="h-8 text-xs bg-background"
                            />
                          </div>
                        )}

                        {/* 5. NO_REVERSAL */}
                        {code === "NO_REVERSAL" && (
                          <div className="space-y-1.5 pt-1 text-[11px]">
                            <div className="text-muted-foreground font-mono">IAS 36.110&ndash;112</div>
                            <Input
                              placeholder="Reason no reversal indicated (required)"
                              value={line.notes ?? ""}
                              onChange={(e) => onUpdateLine(line.id, { notes: e.target.value })}
                              disabled={isSignedOff}
                              className="h-8 text-xs bg-background"
                            />
                          </div>
                        )}

                        {/* 6. REVISE_ESTIMATE (Image 6) */}
                        {code === "REVISE_ESTIMATE" && (
                          <div className="space-y-1.5 pt-1 text-[11px]">
                            <div className="text-muted-foreground font-mono">IAS 36.17 &bull; IAS 8.36</div>
                            <div className="grid grid-cols-2 gap-2">
                              <div>
                                <span className="text-[10px] text-muted-foreground block mb-0.5">
                                  New remaining life (months)
                                </span>
                                <Input
                                  type="number"
                                  placeholder="months"
                                  value={line.new_remaining_months ?? ""}
                                  onChange={(e) =>
                                    onUpdateLine(line.id, {
                                      new_remaining_months: e.target.value ? Number(e.target.value) : null,
                                    })
                                  }
                                  disabled={isSignedOff}
                                  className="h-8 text-xs bg-background"
                                />
                              </div>
                              <div>
                                <span className="text-[10px] text-muted-foreground block mb-0.5">
                                  New residual value (optional)
                                </span>
                                <div className="relative">
                                  <span className="absolute left-2.5 top-2 text-muted-foreground">₱</span>
                                  <Input
                                    type="number"
                                    placeholder="0.00"
                                    value={line.new_residual_value ?? ""}
                                    onChange={(e) =>
                                      onUpdateLine(line.id, {
                                        new_residual_value: e.target.value ? Number(e.target.value) : null,
                                      })
                                    }
                                    disabled={isSignedOff}
                                    className="h-8 pl-6 text-xs bg-background"
                                  />
                                </div>
                              </div>
                            </div>
                            <div className="text-[10px] text-muted-foreground">
                              Enter the new remaining life<br />
                              Posts when you click &quot;Post entries&quot;
                            </div>
                          </div>
                        )}

                        {/* 7. HELD_FOR_SALE (Image 7) */}
                        {code === "HELD_FOR_SALE" && (
                          <div className="space-y-1.5 pt-1 text-[11px]">
                            <div className="text-muted-foreground font-mono">IFRS 5.6&ndash;15</div>
                            <div>
                              <span className="text-[10px] text-muted-foreground block mb-0.5">
                                Fair value less costs to sell
                              </span>
                              <div className="relative">
                                <span className="absolute left-2.5 top-2 text-muted-foreground">₱</span>
                                <Input
                                  type="number"
                                  placeholder="0.00"
                                  value={line.fvlcts ?? ""}
                                  onChange={(e) =>
                                    onUpdateLine(line.id, {
                                      fvlcts: e.target.value ? Number(e.target.value) : null,
                                    })
                                  }
                                  disabled={isSignedOff}
                                  className="h-8 pl-6 text-xs bg-background"
                                />
                              </div>
                            </div>
                            <div className="text-[10px] text-muted-foreground">
                              Enter fair value less costs to sell<br />
                              Posts when you click &quot;Post entries&quot;
                            </div>
                          </div>
                        )}

                        {/* 8. WRITE_OFF (Image 8) */}
                        {code === "WRITE_OFF" && (
                          <div className="space-y-1.5 pt-1 text-[11px]">
                            <div className="text-muted-foreground font-mono">IAS 16.67(b), 16.71</div>
                            <Input
                              placeholder="What happened, e.g. destroyed, beyond economic repair"
                              value={line.notes ?? ""}
                              onChange={(e) => onUpdateLine(line.id, { notes: e.target.value })}
                              disabled={isSignedOff}
                              className="h-8 text-xs bg-background"
                            />
                            <div className="text-[11px] text-red-600 font-medium">
                              Derecognised &mdash; loss of {formatCurrency(line.carrying_amount)} in profit or loss
                            </div>
                            <div className="text-[10px] text-muted-foreground">
                              Posts when you click &quot;Post entries&quot;
                            </div>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={4} className="py-10 text-center text-muted-foreground italic">
                    No flagged assets found with impairment indicators.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Footer controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pt-2">
        <div>
          {unconcludedCount > 0 ? (
            <span className="text-xs text-red-600 font-medium">
              {unconcludedCount} flagged asset(s) still need a conclusion (entries must be posted, notes filled in)
            </span>
          ) : (
            <span className="text-xs text-emerald-600 font-medium">
              All flagged assets have been concluded.
            </span>
          )}
        </div>

        <div className="flex items-center gap-2.5">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onPostEntries}
            disabled={isPosting || isSignedOff || unconcludedCount > 0}
            className="h-8 text-xs font-medium shadow-2xs"
          >
            {isPosting ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : null}
            Post entries
          </Button>

          <Button
            type="button"
            size="sm"
            onClick={onSignOff}
            disabled={isSigningOff || isSignedOff || unconcludedCount > 0}
            className="h-8 text-xs font-medium bg-[#85a3d0] hover:bg-[#7292c0] text-white shadow-2xs"
          >
            {isSigningOff ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : null}
            {isSignedOff ? "Review signed off" : "Sign off review"}
          </Button>
        </div>
      </div>

      {/* Bottom explanatory note */}
      <p className="text-[11px] text-muted-foreground">
        &quot;Post entries&quot; creates the entry each conclusion needs &mdash; impairment, useful-life change, held-for-sale or write-off &mdash; dated {reviewDate}. Amounts &ge; &#8369;50,000.00 go to Approvals. Signing off freezes the review as evidence for the auditor.
      </p>
    </div>
  );
}
