import React from "react";
import { Download, FileSpreadsheet } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { PostingRow } from "../types";

const formatCurrency = (val?: number | null) => {
  if (val === null || val === undefined || val === 0) return "—";
  return val.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
};

interface DepreciationPostingTableProps {
  postingYmLabel: string;
  rows: PostingRow[];
}

export default function DepreciationPostingTable({
  postingYmLabel,
  rows,
}: DepreciationPostingTableProps) {
  const handleExportCSV = () => {
    const csvContent =
      "data:text/csv;charset=utf-8," +
      ["Account,Cost Centre,Debit,Credit"]
        .concat(
          rows.map(
            (r) =>
              `"${r.account}","${r.costCentre}",${r.debit || ""},${r.credit || ""}`
          )
        )
        .join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `depreciation_posting_${postingYmLabel.replace(/\s+/g, "_")}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleExportPDF = () => {
    window.print();
  };

  return (
    <div className="space-y-4 pt-4 border-t">
      {/* Section Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-foreground">
            Depreciation posting &mdash; {postingYmLabel}
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Expense by cost centre (department holding the asset that month, from custody history);
            accumulated depreciation by class.
          </p>
        </div>

        {/* Export buttons matching UI */}
        <div className="flex items-center gap-2 shrink-0">
          <Button
            variant="outline"
            size="sm"
            onClick={handleExportCSV}
            className="h-8 text-xs bg-background"
          >
            <FileSpreadsheet className="mr-1.5 h-3.5 w-3.5" />
            Export CSV
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleExportPDF}
            className="h-8 text-xs bg-background"
          >
            <Download className="mr-1.5 h-3.5 w-3.5" />
            Export PDF
          </Button>
        </div>
      </div>

      {/* Main Journal Entry Table */}
      <div className="bg-card border rounded-xl shadow-2xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead className="border-b font-semibold text-muted-foreground bg-muted/40 uppercase tracking-wider text-[11px]">
              <tr>
                <th className="py-3 px-4">ACCOUNT</th>
                <th className="py-3 px-4">COST CENTRE</th>
                <th className="py-3 px-4 text-right">DEBIT</th>
                <th className="py-3 px-4 text-right">CREDIT</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60 font-mono">
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={4} className="py-8 text-center text-muted-foreground font-sans">
                    No depreciation posting entries for this period.
                  </td>
                </tr>
              ) : (
                rows.map((row, idx) => {
                  if (row.isTotal) {
                    return (
                      <tr key={idx} className="bg-muted/30 font-bold border-t-2 border-border/80">
                        <td className="py-3.5 px-4 font-sans font-bold text-foreground">
                          {row.account}
                        </td>
                        <td className="py-3.5 px-4 font-sans text-muted-foreground">
                          {row.costCentre}
                        </td>
                        <td className="py-3.5 px-4 text-right font-bold text-foreground">
                          {row.debit.toLocaleString("en-US", {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          })}
                        </td>
                        <td className="py-3.5 px-4 text-right font-bold text-foreground">
                          {row.credit.toLocaleString("en-US", {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          })}
                        </td>
                      </tr>
                    );
                  }

                  return (
                    <tr key={idx} className="hover:bg-muted/15 transition-colors">
                      <td className="py-3 px-4 font-sans text-foreground">
                        {row.account}
                      </td>
                      <td className="py-3 px-4 font-sans text-muted-foreground">
                        {row.costCentre}
                      </td>
                      <td className="py-3 px-4 text-right text-foreground">
                        {formatCurrency(row.debit)}
                      </td>
                      <td className="py-3 px-4 text-right text-foreground">
                        {formatCurrency(row.credit)}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
