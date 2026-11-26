import React from "react";
import type { FsImpactReport } from "../types";

const fmtNum = (val?: number | null) => {
  if (val === null || val === undefined || Math.abs(val) < 0.005) return "—";
  const abs = Math.abs(val).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return val < 0 ? `(${abs})` : abs;
};

interface FsImpactTabProps {
  report: FsImpactReport;
}

export default function FsImpactTab({ report }: FsImpactTabProps) {
  return (
    <div className="bg-card border rounded-xl shadow-2xs overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-xs text-left">
          <thead className="border-b font-semibold text-muted-foreground bg-muted/40 uppercase tracking-wider text-[10px]">
            <tr>
              <th className="py-3 px-4">Account</th>
              <th className="py-3 px-4 text-right">Dr / (Cr)</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/60">
            {report.rows.length === 0 ? (
              <tr>
                <td colSpan={2} className="py-10 text-center text-muted-foreground">
                  No financial statement movements for FY {report.year}.
                </td>
              </tr>
            ) : (
              report.rows.map((row, idx) => {
                if (row.type === "section") {
                  return (
                    <tr key={idx} className="bg-muted/40">
                      <td
                        colSpan={2}
                        className="py-2 px-4 text-[10px] font-bold tracking-wider uppercase text-muted-foreground"
                      >
                        {row.account}
                      </td>
                    </tr>
                  );
                }

                if (row.type === "muted") {
                  return (
                    <tr key={idx}>
                      <td colSpan={2} className="py-2.5 px-4 text-muted-foreground italic">
                        {row.account}
                      </td>
                    </tr>
                  );
                }

                if (row.type === "total") {
                  return (
                    <tr key={idx} className="bg-muted/30 font-bold border-t-2 border-border/80">
                      <td className="py-3 px-4 text-foreground">{row.account}</td>
                      <td className="py-3 px-4 text-right font-mono text-foreground">
                        {fmtNum(row.amount)}
                      </td>
                    </tr>
                  );
                }

                return (
                  <tr key={idx} className="hover:bg-muted/15 transition-colors">
                    <td className="py-2.5 px-4 text-foreground">{row.account}</td>
                    <td className="py-2.5 px-4 text-right font-mono text-foreground">
                      {fmtNum(row.amount)}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
