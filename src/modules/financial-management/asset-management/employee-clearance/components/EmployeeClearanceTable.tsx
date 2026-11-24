import React from "react";
import Link from "next/link";
import type { EmployeeClearanceRecord } from "../types";

const formatCurrency = (val?: number | null) => {
  if (val === null || val === undefined) return "—";
  return `₱${val.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
};

interface EmployeeClearanceTableProps {
  employees: EmployeeClearanceRecord[];
}

export default function EmployeeClearanceTable({
  employees,
}: EmployeeClearanceTableProps) {
  return (
    <div className="bg-card border rounded-xl shadow-2xs overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-xs text-left">
          <thead className="border-b font-semibold text-muted-foreground bg-muted/40">
            <tr>
              <th className="py-3 px-4">Employee</th>
              <th className="py-3 px-4">Department</th>
              <th className="py-3 px-3 text-center">Assets held</th>
              <th className="py-3 px-4 text-right">Carrying amount</th>
              <th className="py-3 px-4">Status</th>
              <th className="py-3 px-4 text-right">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/60">
            {employees.length > 0 ? (
              employees.map((emp) => {
                const isInClearance = emp.status === "In clearance";

                return (
                  <tr
                    key={emp.employee_id}
                    className="hover:bg-muted/30 transition-colors"
                  >
                    <td className="py-3.5 px-4 font-semibold text-foreground">
                      <Link
                        href={`/fm/asset-management/employee-clearance/${emp.employee_id}`}
                        className="hover:underline hover:text-emerald-800"
                      >
                        {emp.employee_name}
                      </Link>
                    </td>
                    <td className="py-3.5 px-4 text-muted-foreground">
                      {emp.department_name}
                    </td>
                    <td className="py-3.5 px-3 text-center font-mono font-medium text-foreground">
                      {emp.assets_held_count}
                    </td>
                    <td className="py-3.5 px-4 text-right font-mono font-bold text-foreground">
                      {formatCurrency(emp.total_carrying_amount)}
                    </td>
                    <td className="py-3.5 px-4">
                      {isInClearance ? (
                        <div>
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold bg-[#fef08a] text-[#854d0e] border border-[#fef08a]">
                            In clearance
                          </span>
                          {emp.last_day && (
                            <span className="block text-[10px] font-mono text-muted-foreground mt-0.5">
                              last day {emp.last_day}
                            </span>
                          )}
                        </div>
                      ) : (
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-muted text-muted-foreground">
                          {emp.status}
                        </span>
                      )}
                    </td>
                    <td className="py-3.5 px-4 text-right">
                      <Link
                        href={`/fm/asset-management/employee-clearance/${emp.employee_id}`}
                        className="text-blue-600 hover:text-blue-800 font-medium inline-flex items-center gap-0.5 hover:underline"
                        onClick={(e) => e.stopPropagation()}
                      >
                        Open &rarr;
                      </Link>
                    </td>
                  </tr>
                );
              })
            ) : (
              <tr>
                <td colSpan={6} className="py-12 text-center text-muted-foreground italic">
                  No employee clearance records found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
