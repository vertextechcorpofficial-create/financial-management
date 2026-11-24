"use client";

import React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { Calendar as CalendarIcon } from "lucide-react";
import type { PhysicalCountOverviewData } from "../types";

interface PhysicalCountTableProps {
  data: PhysicalCountOverviewData | null;
}

export default function PhysicalCountTable({ data }: PhysicalCountTableProps) {
  const router = useRouter();

  return (
    <div className="space-y-3">
      <div className="border rounded-xl bg-card overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead className="bg-muted/40 border-b font-semibold text-muted-foreground">
              <tr>
                <th className="py-3 px-4">Count</th>
                <th className="py-3 px-3">Date</th>
                <th className="py-3 px-3">Scope</th>
                <th className="py-3 px-3">Counted by</th>
                <th className="py-3 px-2">Method</th>
                <th className="py-3 px-3 text-right">Expected</th>
                <th className="py-3 px-3 text-right">Found</th>
                <th className="py-3 px-3 text-right">Missing</th>
                <th className="py-3 px-3 text-right">Exceptions</th>
                <th className="py-3 px-3 text-right">Accuracy</th>
                <th className="py-3 px-4 text-center">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {data?.sessions.map((s) => (
                <tr
                  key={s.id}
                  onClick={() =>
                    router.push(`/fm/asset-management/physical-count/${s.id}`)
                  }
                  className="hover:bg-muted/30 cursor-pointer transition-colors"
                >
                  <td className="py-3 px-4 font-semibold text-foreground hover:underline">
                    {s.name}
                  </td>
                  <td className="py-3 px-3 font-mono text-muted-foreground whitespace-nowrap">
                    <span className="flex items-center gap-1.5">
                      <CalendarIcon className="h-3.5 w-3.5 opacity-60" />
                      {format(new Date(s.count_date), "MMM dd, yyyy")}
                    </span>
                  </td>
                  <td className="py-3 px-3 text-muted-foreground">
                    {s.departments.join(", ")}
                  </td>
                  <td className="py-3 px-3 text-muted-foreground">
                    {s.counted_by_name}
                  </td>
                  <td className="py-3 px-2">
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-50 text-blue-600 dark:bg-blue-950 dark:text-blue-300 border border-blue-200">
                      {s.method_name}
                    </span>
                  </td>
                  <td className="py-3 px-3 text-right font-mono text-muted-foreground">
                    {s.expected_count}
                  </td>
                  <td className="py-3 px-3 text-right font-mono text-muted-foreground">
                    {s.found_count}
                  </td>
                  <td className="py-3 px-3 text-right font-mono">
                    {s.missing_count > 0 ? (
                      <span className="text-rose-600 font-semibold">
                        {s.missing_count}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">0</span>
                    )}
                  </td>
                  <td className="py-3 px-3 text-right font-mono">
                    {s.misplaced_count + s.unknown_count > 0 ? (
                      <span className="text-amber-600 font-semibold">
                        {s.misplaced_count + s.unknown_count}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">0</span>
                    )}
                  </td>
                  <td className="py-3 px-3 text-right font-mono font-semibold">
                    {s.accuracy_percent}%
                  </td>
                  <td className="py-3 px-4 text-center">
                    <span
                      className={`px-2.5 py-1 rounded-full text-[10px] font-semibold border ${
                        s.status === "In progress"
                          ? "bg-blue-50 text-blue-600 border-blue-200 dark:bg-blue-950/40 dark:border-blue-800"
                          : "bg-emerald-50 text-emerald-600 border-emerald-200 dark:bg-emerald-950/40 dark:border-emerald-800"
                      }`}
                    >
                      {s.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Footer warning bar: Not physically verified in the last 12 months */}
      {data && data.notVerifiedAssets.length > 0 && (
        <div className="text-[11px] text-muted-foreground leading-relaxed pt-1">
          Not physically verified in the last 12 months:{" "}
          {data.notVerifiedAssets.slice(0, 10).map((a, idx) => (
            <React.Fragment key={a.id}>
              <Link
                href={`/fm/asset-management/registration/${a.id}`}
                className="text-emerald-700 dark:text-emerald-400 font-mono underline hover:text-emerald-800"
              >
                {a.asset_tag}
              </Link>
              {idx < Math.min(data.notVerifiedAssets.length, 10) - 1 ? ", " : ""}
            </React.Fragment>
          ))}
          {data.notVerifiedAssets.length > 10 && (
            <span> and {data.notVerifiedAssets.length - 10} more.</span>
          )}
        </div>
      )}
    </div>
  );
}
