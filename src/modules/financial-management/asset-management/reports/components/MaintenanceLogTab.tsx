import React from "react";
import Link from "next/link";
import type { MaintenanceLogReport } from "../types";

const fmtNum = (val?: number | null) => {
  if (val === null || val === undefined || Math.abs(val) < 0.005) return "—";
  return Math.abs(val).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
};

const fmtPeso = (val: number) =>
  `₱${val.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

interface MaintenanceLogTabProps {
  report: MaintenanceLogReport;
}

export default function MaintenanceLogTab({ report }: MaintenanceLogTabProps) {
  return (
    <div className="bg-card border rounded-xl shadow-2xs overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-xs text-left whitespace-nowrap">
          <thead className="border-b font-semibold text-muted-foreground bg-muted/40 uppercase tracking-wider text-[10px]">
            <tr>
              <th className="py-3 px-3">Date</th>
              <th className="py-3 px-3">Tag</th>
              <th className="py-3 px-3">Asset</th>
              <th className="py-3 px-3">Department</th>
              <th className="py-3 px-3">Type</th>
              <th className="py-3 px-3">Description</th>
              <th className="py-3 px-3">Vendor</th>
              <th className="py-3 px-3 text-right">Downtime (d)</th>
              <th className="py-3 px-3 text-right">Cost</th>
              <th className="py-3 px-3">Treatment</th>
              <th className="py-3 px-3">Next Due</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/60">
            {report.rows.length === 0 ? (
              <tr>
                <td colSpan={11} className="py-10 text-center text-muted-foreground">
                  No maintenance log records found.
                </td>
              </tr>
            ) : (
              <>
                {report.rows.map((r) => (
                  <tr key={r.id} className="hover:bg-muted/20 transition-colors">
                    <td className="py-2.5 px-3 font-mono text-muted-foreground">{r.date}</td>
                    <td className="py-2.5 px-3 font-mono font-medium">
                      {r.assetId ? (
                        <Link
                          href={`/fm/asset-management/registration/${r.assetId}`}
                          className="text-emerald-700 dark:text-emerald-400 hover:underline"
                        >
                          {r.assetTag}
                        </Link>
                      ) : (
                        r.assetTag
                      )}
                    </td>
                    <td className="py-2.5 px-3 font-medium text-foreground">{r.assetName}</td>
                    <td className="py-2.5 px-3 text-foreground">{r.department}</td>
                    <td className="py-2.5 px-3 text-foreground">{r.type}</td>
                    <td className="py-2.5 px-3 text-foreground max-w-[260px] truncate" title={r.description}>
                      {r.description}
                    </td>
                    <td className="py-2.5 px-3 text-muted-foreground">{r.vendor}</td>
                    <td className="py-2.5 px-3 text-right font-mono text-foreground">
                      {r.downtimeDays !== null ? r.downtimeDays : "—"}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono text-foreground">
                      {fmtNum(r.cost)}
                    </td>
                    <td className="py-2.5 px-3 text-foreground">{r.treatment}</td>
                    <td className="py-2.5 px-3 font-mono text-muted-foreground">{r.nextDue}</td>
                  </tr>
                ))}

                <tr className="bg-muted/30 font-bold border-t-2 border-border/80">
                  <td colSpan={5} className="py-3 px-3 text-foreground">
                    Total
                  </td>
                  <td colSpan={3} className="py-3 px-3 text-foreground">
                    Expensed {fmtPeso(report.expensedTotal)} &middot; Capitalised{" "}
                    {fmtPeso(report.capitalisedTotal)}
                  </td>
                  <td className="py-3 px-3 text-right font-mono text-foreground">
                    {fmtNum(report.totalCost)}
                  </td>
                  <td colSpan={2} className="py-3 px-3"></td>
                </tr>
              </>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
