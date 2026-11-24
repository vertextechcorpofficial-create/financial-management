"use client";

import React, { useState } from "react";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { ApprovalEventItem } from "../types";

const formatCurrency = (val?: number | null) => {
  if (val === null || val === undefined) return "—";
  return `₱${val.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
};

interface WaitingApprovalsTableProps {
  items: ApprovalEventItem[];
  onApprove: (id: number) => void;
  onReject: (id: number, reason: string) => void;
  processingId: number | null;
}

export default function WaitingApprovalsTable({
  items,
  onApprove,
  onReject,
  processingId,
}: WaitingApprovalsTableProps) {
  const [rejectReasons, setRejectReasons] = useState<Record<number, string>>({});

  const handleReasonChange = (id: number, val: string) => {
    setRejectReasons((prev) => ({ ...prev, [id]: val }));
  };

  return (
    <div className="bg-card border rounded-xl shadow-2xs overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-xs text-left">
          <thead className="border-b font-semibold text-muted-foreground bg-muted/40">
            <tr>
              <th className="py-3 px-4">Asset</th>
              <th className="py-3 px-4">Entry</th>
              <th className="py-3 px-4 text-right">Impact</th>
              <th className="py-3 px-4">Requested by</th>
              <th className="py-3 px-4 text-right w-[280px]">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/60">
            {items.length > 0 ? (
              items.map((item) => {
                const isProcessing = processingId === item.id;
                const reason = rejectReasons[item.id] || "";

                return (
                  <tr key={item.id} className="hover:bg-muted/15 transition-colors align-top">
                    {/* Col 1: Asset Info */}
                    <td className="py-3.5 px-4">
                      <div>
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <Link
                            href={`/fm/asset-management/registration/${item.asset_id}`}
                            className="font-mono font-bold text-emerald-800 hover:underline"
                          >
                            {item.asset_tag}
                          </Link>
                          <span className="text-muted-foreground">&bull;</span>
                          <span className="font-semibold text-foreground">{item.item_name}</span>
                        </div>
                        <div className="text-[11px] text-muted-foreground mt-0.5">
                          {item.department_name} &bull; {item.entry_source}
                        </div>
                      </div>
                    </td>

                    {/* Col 2: Entry Details */}
                    <td className="py-3.5 px-4">
                      <div className="font-semibold text-foreground">{item.event_type}</div>
                      <div className="text-[11px] text-muted-foreground mt-0.5">
                        {item.event_date} &bull; {item.notes}
                      </div>
                    </td>

                    {/* Col 3: Financial Impact */}
                    <td className="py-3.5 px-4 text-right font-mono font-bold text-foreground">
                      {formatCurrency(item.impact_amount)}
                    </td>

                    {/* Col 4: Requested By */}
                    <td className="py-3.5 px-4">
                      <div className="font-medium text-foreground">{item.requested_by_name}</div>
                      <div className="text-[11px] text-muted-foreground font-mono mt-0.5">
                        {item.requested_at}
                      </div>
                    </td>

                    {/* Col 5: Approve / Reject Controls */}
                    <td className="py-3.5 px-4 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <Button
                          size="sm"
                          disabled={isProcessing}
                          onClick={() => onApprove(item.id)}
                          className="h-8 px-3 text-xs bg-[#1b4332] hover:bg-[#143326] text-white font-medium"
                        >
                          {isProcessing ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            "Approve"
                          )}
                        </Button>

                        <Input
                          placeholder="Reason to reject"
                          value={reason}
                          onChange={(e) => handleReasonChange(item.id, e.target.value)}
                          className="h-8 text-xs w-36 bg-background"
                        />

                        <Button
                          size="sm"
                          variant="outline"
                          disabled={isProcessing}
                          onClick={() => onReject(item.id, reason)}
                          className="h-8 px-2.5 text-xs text-foreground hover:bg-destructive/10 hover:text-destructive"
                        >
                          Reject
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })
            ) : (
              <tr>
                <td colSpan={5} className="py-10 text-center text-muted-foreground italic">
                  No pending entries waiting for approval.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
