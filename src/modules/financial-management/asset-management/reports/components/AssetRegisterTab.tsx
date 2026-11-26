import React from "react";
import Link from "next/link";
import type { AssetRegisterReport } from "../types";

const fmtNum = (val?: number | null) => {
  if (val === null || val === undefined || Math.abs(val) < 0.005) return "—";
  const abs = Math.abs(val).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return val < 0 ? `(${abs})` : abs;
};

interface AssetRegisterTabProps {
  report: AssetRegisterReport;
}

export default function AssetRegisterTab({ report }: AssetRegisterTabProps) {
  return (
    <div className="bg-card border rounded-xl shadow-2xs overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-xs text-left whitespace-nowrap">
          <thead className="border-b font-semibold text-muted-foreground bg-muted/40 uppercase tracking-wider text-[10px]">
            <tr>
              <th className="py-3 px-3">Asset Tag</th>
              <th className="py-3 px-3">RFID</th>
              <th className="py-3 px-3">Asset</th>
              <th className="py-3 px-3">Item Type</th>
              <th className="py-3 px-3">Classification</th>
              <th className="py-3 px-3">Department</th>
              <th className="py-3 px-3">Assigned To</th>
              <th className="py-3 px-3">Condition</th>
              <th className="py-3 px-3">Acquired</th>
              <th className="py-3 px-3 text-right">Cost</th>
              <th className="py-3 px-3 text-right">Accum. Dep.</th>
              <th className="py-3 px-3 text-right">Accum. Imp.</th>
              <th className="py-3 px-3 text-right">Projected Value</th>
              <th className="py-3 px-3">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/60">
            {report.rows.length === 0 ? (
              <tr>
                <td colSpan={14} className="py-10 text-center text-muted-foreground">
                  No assets found in the database.
                </td>
              </tr>
            ) : (
              <>
                {report.rows.map((r) => (
                  <tr key={r.id} className="hover:bg-muted/20 transition-colors">
                    <td className="py-2.5 px-3 font-mono font-medium">
                      <Link
                        href={`/fm/asset-management/registration/${r.id}`}
                        className="text-emerald-700 dark:text-emerald-400 hover:underline"
                      >
                        {r.assetTag}
                      </Link>
                    </td>
                    <td className="py-2.5 px-3 font-mono text-[11px] text-muted-foreground">
                      {r.rfid}
                    </td>
                    <td className="py-2.5 px-3 font-medium text-foreground">{r.assetName}</td>
                    <td className="py-2.5 px-3 text-muted-foreground">{r.itemType}</td>
                    <td className="py-2.5 px-3 text-muted-foreground">{r.classification}</td>
                    <td className="py-2.5 px-3 text-foreground">{r.department}</td>
                    <td className="py-2.5 px-3 text-foreground">{r.assignedTo}</td>
                    <td className="py-2.5 px-3 text-foreground">{r.condition}</td>
                    <td className="py-2.5 px-3 font-mono text-muted-foreground">{r.acquired}</td>
                    <td className="py-2.5 px-3 text-right font-mono text-foreground">
                      {fmtNum(r.cost)}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono text-foreground">
                      {fmtNum(r.accumDep)}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono text-foreground">
                      {fmtNum(r.accumImp)}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono font-medium text-foreground">
                      {fmtNum(r.projectedValue)}
                    </td>
                    <td className="py-2.5 px-3 text-foreground">{r.status}</td>
                  </tr>
                ))}

                {/* Total (in use) footer row */}
                <tr className="bg-muted/30 font-bold border-t-2 border-border/80">
                  <td colSpan={9} className="py-3 px-3 text-foreground">
                    Total (in use)
                  </td>
                  <td className="py-3 px-3 text-right font-mono text-foreground">
                    {fmtNum(report.totals.cost)}
                  </td>
                  <td className="py-3 px-3 text-right font-mono text-foreground">
                    {fmtNum(report.totals.accumDep)}
                  </td>
                  <td className="py-3 px-3 text-right font-mono text-foreground">
                    {fmtNum(report.totals.accumImp)}
                  </td>
                  <td className="py-3 px-3 text-right font-mono text-foreground">
                    {fmtNum(report.totals.projectedValue)}
                  </td>
                  <td className="py-3 px-3"></td>
                </tr>
              </>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
