import React from "react";
import type { DeptDepReport } from "../types";

const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];

const fmtNum = (val?: number | null) => {
  if (val === null || val === undefined || Math.abs(val) < 0.005) return "—";
  const abs = Math.abs(val).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return val < 0 ? `(${abs})` : abs;
};

interface DepreciationByDeptTabProps {
  report: DeptDepReport;
}

export default function DepreciationByDeptTab({ report }: DepreciationByDeptTabProps) {
  return (
    <div className="bg-card border rounded-xl shadow-2xs overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-xs text-left whitespace-nowrap">
          <thead className="border-b font-semibold text-muted-foreground bg-muted/40 uppercase tracking-wider text-[10px]">
            <tr>
              <th className="py-3 px-4">Department</th>
              {MONTHS.map((m) => (
                <th key={m} className="py-3 px-3 text-right">
                  {m}
                </th>
              ))}
              <th className="py-3 px-4 text-right">Total</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/60">
            {report.rows.length === 0 ? (
              <tr>
                <td colSpan={14} className="py-10 text-center text-muted-foreground">
                  No department depreciation records for FY {report.year}.
                </td>
              </tr>
            ) : (
              <>
                {report.rows.map((row) => (
                  <tr key={row.department} className="hover:bg-muted/20 transition-colors">
                    <td className="py-2.5 px-4 font-medium text-foreground">{row.department}</td>
                    {row.months.map((val, idx) => (
                      <td key={idx} className="py-2.5 px-3 text-right font-mono text-foreground">
                        {fmtNum(val)}
                      </td>
                    ))}
                    <td className="py-2.5 px-4 text-right font-mono font-medium text-foreground">
                      {fmtNum(row.total)}
                    </td>
                  </tr>
                ))}

                <tr className="bg-muted/30 font-bold border-t-2 border-border/80">
                  <td className="py-3 px-4 text-foreground">Total</td>
                  {report.totals.map((val, idx) => (
                    <td key={idx} className="py-3 px-3 text-right font-mono text-foreground">
                      {fmtNum(val)}
                    </td>
                  ))}
                  <td className="py-3 px-4 text-right font-mono text-foreground">
                    {fmtNum(report.grandTotal)}
                  </td>
                </tr>
              </>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
