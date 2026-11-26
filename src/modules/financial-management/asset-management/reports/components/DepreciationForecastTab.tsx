import React from "react";
import type { ForecastReport } from "../types";

const fmtNum = (val?: number | null) => {
  if (val === null || val === undefined || Math.abs(val) < 0.005) return "—";
  const abs = Math.abs(val).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return val < 0 ? `(${abs})` : abs;
};

interface DepreciationForecastTabProps {
  report: ForecastReport;
}

export default function DepreciationForecastTab({ report }: DepreciationForecastTabProps) {
  return (
    <div className="bg-card border rounded-xl shadow-2xs overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-xs text-left whitespace-nowrap">
          <thead className="border-b font-semibold text-muted-foreground bg-muted/40 uppercase tracking-wider text-[10px]">
            <tr>
              <th className="py-3 px-4">Classification</th>
              {report.years.map((fy) => (
                <th key={fy} className="py-3 px-4 text-right">
                  FY {fy}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border/60">
            {report.rows.length === 0 ? (
              <tr>
                <td colSpan={report.years.length + 1} className="py-10 text-center text-muted-foreground">
                  No depreciable assets found for forecast.
                </td>
              </tr>
            ) : (
              <>
                {report.rows.map((row) => (
                  <tr key={row.classification} className="hover:bg-muted/20 transition-colors">
                    <td className="py-2.5 px-4 font-medium text-foreground">{row.classification}</td>
                    {report.years.map((fy) => (
                      <td key={fy} className="py-2.5 px-4 text-right font-mono text-foreground">
                        {fmtNum(row.years[fy])}
                      </td>
                    ))}
                  </tr>
                ))}

                <tr className="bg-muted/30 font-bold border-t-2 border-border/80">
                  <td className="py-3 px-4 text-foreground">Total depreciation</td>
                  {report.years.map((fy) => (
                    <td key={fy} className="py-3 px-4 text-right font-mono text-foreground">
                      {fmtNum(report.totals[fy])}
                    </td>
                  ))}
                </tr>
              </>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
