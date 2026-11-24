import React from "react";
import Link from "next/link";
import type { RecentAccountingEvent } from "../types";

const formatNumber = (val?: number | null) => {
  if (val === null || val === undefined) return "—";
  return val.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
};

interface RecentAccountingEventsTableProps {
  events: RecentAccountingEvent[];
}

export default function RecentAccountingEventsTable({ events }: RecentAccountingEventsTableProps) {
  return (
    <div className="bg-card border rounded-xl p-5 shadow-2xs space-y-4">
      <h2 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
        Recent Accounting Events
      </h2>

      <div className="overflow-x-auto">
        <table className="w-full text-xs text-left">
          <thead className="border-b font-semibold text-muted-foreground">
            <tr>
              <th className="py-2.5 px-3">DATE</th>
              <th className="py-2.5 px-3">ASSET</th>
              <th className="py-2.5 px-3">EVENT</th>
              <th className="py-2.5 px-3">BASIS</th>
              <th className="py-2.5 px-3 text-right">AMOUNT</th>
            </tr>
          </thead>
          <tbody className="divide-y font-mono">
            {events.map((ev, idx) => (
              <tr key={ev.id ?? idx} className="hover:bg-muted/20 transition-colors">
                <td className="py-3 px-3 font-sans text-muted-foreground whitespace-nowrap">
                  {ev.date}
                </td>
                <td className="py-3 px-3">
                  <Link
                    href={`/fm/asset-management/registration/${ev.assetId}`}
                    className="text-emerald-700 hover:text-emerald-900 underline font-semibold font-mono"
                  >
                    {ev.assetTag}
                  </Link>
                </td>
                <td className="py-3 px-3 font-sans text-foreground">
                  {ev.event}
                </td>
                <td className="py-3 px-3 font-sans text-muted-foreground whitespace-nowrap">
                  {ev.basis}
                </td>
                <td className="py-3 px-3 text-right font-bold text-foreground whitespace-nowrap">
                  {formatNumber(ev.amount)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
