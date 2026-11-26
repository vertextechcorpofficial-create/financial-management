import React from "react";
import Link from "next/link";
import type { ApprovalEventItem } from "../types";

const formatCurrency = (val?: number | null) => {
  if (val === null || val === undefined) return "—";
  return `₱${val.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
};

interface RecentlyDecidedTableProps {
  items: ApprovalEventItem[];
}

export default function RecentlyDecidedTable({ items }: RecentlyDecidedTableProps) {
  return (
    <div className="space-y-3">
      <h2 className="text-base font-serif font-bold tracking-tight text-foreground">
        Recently decided
      </h2>

      <div className="bg-card border rounded-xl shadow-2xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead className="border-b font-semibold text-muted-foreground bg-muted/40">
              <tr>
                <th className="py-3 px-4">Asset</th>
                <th className="py-3 px-4">Entry</th>
                <th className="py-3 px-4 text-right">Impact</th>
                <th className="py-3 px-4">Requested by</th>
                <th className="py-3 px-4 text-right">Decision</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60 font-mono">
              {items.length > 0 ? (
                items.map((item) => (
                  <tr key={item.id} className="hover:bg-muted/15 transition-colors font-sans">
                    <td className="py-3.5 px-4">
                      <Link
                        href={`/fm/asset-management/registration/${item.asset_id}`}
                        className="font-mono font-bold text-emerald-800 hover:underline"
                      >
                        {item.asset_tag}
                      </Link>{" "}
                      &bull; {item.item_name}
                    </td>
                    <td className="py-3.5 px-4">
                      {item.event_type} &bull; {item.notes}
                    </td>
                    <td className="py-3.5 px-4 text-right font-mono font-bold text-foreground">
                      {formatCurrency(item.impact_amount)}
                    </td>
                    <td className="py-3.5 px-4">{item.requested_by_name}</td>
                    <td className="py-3.5 px-4 text-right">
                      {item.status === "approved" ? (
                        <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-100 text-emerald-800">
                          Approved by {item.decision_by_name || "Admin"}
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-red-100 text-red-800">
                          Rejected: {item.rejection_reason || "Declined"}
                        </span>
                      )}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={5} className="py-10 text-center text-muted-foreground italic font-sans">
                    No decisions yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
