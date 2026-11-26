import React from "react";
import type { PpeMovementReport } from "../types";

const fmtNum = (val?: number | null) => {
  if (val === null || val === undefined || Math.abs(val) < 0.005) return "—";
  const abs = Math.abs(val).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return val < 0 ? `(${abs})` : abs;
};

interface PpeMovementTabProps {
  report: PpeMovementReport;
}

export default function PpeMovementTab({ report }: PpeMovementTabProps) {
  const colSpan = report.classifications.length + 2;

  return (
    <div className="space-y-3">
      <div className="bg-card border rounded-xl shadow-2xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left whitespace-nowrap">
            <thead className="border-b font-semibold text-muted-foreground bg-muted/40 uppercase tracking-wider text-[10px]">
              <tr>
                <th className="py-3 px-4">Particulars</th>
                {report.classifications.map((cls) => (
                  <th key={cls} className="py-3 px-4 text-right">
                    {cls}
                  </th>
                ))}
                <th className="py-3 px-4 text-right">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {report.rows.length === 0 ? (
                <tr>
                  <td colSpan={colSpan} className="py-10 text-center text-muted-foreground">
                    No PPE movement records for FY {report.year}.
                  </td>
                </tr>
              ) : (
                report.rows.map((row, idx) => {
                  if (row.type === "section") {
                    return (
                      <tr key={idx} className="bg-muted/40">
                        <td
                          colSpan={colSpan}
                          className="py-2 px-4 text-[10px] font-bold tracking-wider uppercase text-muted-foreground"
                        >
                          {row.particulars}
                        </td>
                      </tr>
                    );
                  }

                  const isSubtotal = row.type === "subtotal";
                  const isGrand = row.type === "grand";

                  return (
                    <tr
                      key={idx}
                      className={
                        isGrand
                          ? "bg-emerald-50/80 dark:bg-emerald-950/30 font-bold border-t-2 border-border"
                          : isSubtotal
                          ? "bg-muted/20 font-bold border-t border-border/80"
                          : "hover:bg-muted/15 transition-colors"
                      }
                    >
                      <td className="py-2.5 px-4 text-foreground">{row.particulars}</td>
                      {report.classifications.map((cls) => (
                        <td key={cls} className="py-2.5 px-4 text-right font-mono text-foreground">
                          {fmtNum(row.values[cls])}
                        </td>
                      ))}
                      <td className="py-2.5 px-4 text-right font-mono text-foreground">
                        {fmtNum(row.total)}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      <p className="text-[11px] text-muted-foreground">
        Reconciliation required by IAS 16.73(e), built from posted movements so it agrees with the register.
      </p>
    </div>
  );
}
