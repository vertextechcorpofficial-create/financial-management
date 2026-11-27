import React from "react";
import Link from "next/link";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { SearchableSelect } from "./SearchableSelect";
import type { ActivityLogRow } from "../types";

function actionBadgeClass(code: string): string {
  switch (code) {
    case "CREATED":
    case "APPROVED":
    case "COUNT_COMPLETED":
    case "EMPLOYEE_CLEARED":
    case "EVENT_POSTED":
      return "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-300 dark:border-emerald-800";
    case "APPROVAL_REQUESTED":
    case "PERIOD_CLOSED":
    case "PERIOD_REOPENED":
      return "bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-950/50 dark:text-amber-300 dark:border-amber-800";
    case "REJECTED":
    case "DEACTIVATED":
    case "EVENT_REMOVED":
    case "REFUSED":
      return "bg-red-50 text-red-700 border-red-200 dark:bg-red-950/50 dark:text-red-300 dark:border-red-800";
    case "COUNT_STARTED":
    case "CLEARANCE_STARTED":
    case "TRANSFERRED":
    case "IMPAIRMENT_REVIEW":
      return "bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-950/50 dark:text-sky-300 dark:border-sky-800";
    default:
      return "bg-muted text-muted-foreground border-border";
  }
}

interface ActivityLogTabProps {
  rows: ActivityLogRow[];
  users: string[];
  actions: { code: string; name: string }[];
  search: string;
  onSearchChange: (val: string) => void;
  selectedUser: string;
  onUserChange: (val: string) => void;
  selectedAction: string;
  onActionChange: (val: string) => void;
}

export default function ActivityLogTab({
  rows,
  users,
  actions,
  search,
  onSearchChange,
  selectedUser,
  onUserChange,
  selectedAction,
  onActionChange,
}: ActivityLogTabProps) {
  const userOptions = [
    { label: "All users", value: "ALL" },
    ...users.map((u) => ({ label: u, value: u })),
  ];

  const actionOptions = [
    { label: "All actions", value: "ALL" },
    ...actions.map((a) => ({ label: a.name, value: a.code })),
  ];

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">
        Every change across the system, newest first &mdash; the same entries shown in each
        asset&apos;s History tab, plus period closes, counts, and settings changes. Entries cannot
        be edited or deleted.
      </p>

      {/* Filter Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative w-full sm:w-64">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder="Search tag, details, field changes..."
              className="h-8 pl-8 text-xs bg-background"
            />
          </div>

          <div className="w-40">
            <SearchableSelect
              options={userOptions}
              value={selectedUser}
              onChange={onUserChange}
              placeholder="All users"
              searchPlaceholder="Search user..."
              className="h-8"
            />
          </div>

          <div className="w-44">
            <SearchableSelect
              options={actionOptions}
              value={selectedAction}
              onChange={onActionChange}
              placeholder="All actions"
              searchPlaceholder="Search action..."
              className="h-8"
            />
          </div>
        </div>

        <span className="text-xs font-mono text-muted-foreground shrink-0">
          {rows.length} {rows.length === 1 ? "entry" : "entries"}
        </span>
      </div>

      {/* Table */}
      <div className="bg-card border rounded-xl shadow-2xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead className="border-b font-semibold text-muted-foreground bg-muted/40 uppercase tracking-wider text-[10px]">
              <tr>
                <th className="py-3 px-4 whitespace-nowrap">When</th>
                <th className="py-3 px-4 whitespace-nowrap">User</th>
                <th className="py-3 px-4 whitespace-nowrap">Action</th>
                <th className="py-3 px-4 whitespace-nowrap">Asset</th>
                <th className="py-3 px-4">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-10 text-center text-muted-foreground">
                    No activity log entries found.
                  </td>
                </tr>
              ) : (
                rows.map((r) => (
                  <tr key={r.id} className="hover:bg-muted/20 transition-colors align-top">
                    <td className="py-2.5 px-4 font-mono text-[11px] text-muted-foreground whitespace-nowrap">
                      {r.whenFormatted}
                    </td>
                    <td className="py-2.5 px-4 whitespace-nowrap">
                      <div className="font-medium text-foreground">{r.userName}</div>
                      {r.roleName && (
                        <div className="text-[10px] text-muted-foreground">{r.roleName}</div>
                      )}
                    </td>
                    <td className="py-2.5 px-4 whitespace-nowrap">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold border ${actionBadgeClass(
                          r.actionCode
                        )}`}
                      >
                        {r.actionName}
                      </span>
                    </td>
                    <td className="py-2.5 px-4 font-mono whitespace-nowrap">
                      {r.assetId && r.assetTag ? (
                        <Link
                          href={`/fm/asset-management/registration/${r.assetId}`}
                          className="text-emerald-700 dark:text-emerald-400 hover:underline font-medium"
                        >
                          {r.assetTag}
                        </Link>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="py-2.5 px-4 text-foreground">
                      <div>{r.details}</div>
                      {r.changes.length > 0 && (
                        <div className="mt-1 space-y-0.5 text-[11px] text-muted-foreground font-mono">
                          {r.changes.map((ch, idx) => (
                            <div key={idx}>
                              <span className="font-semibold text-foreground">{ch.field}:</span>{" "}
                              {ch.from} &rarr; {ch.to}
                            </div>
                          ))}
                        </div>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
