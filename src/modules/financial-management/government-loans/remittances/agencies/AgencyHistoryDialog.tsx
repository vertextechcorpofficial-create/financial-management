"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ListRowsSkeleton } from "../../components/ui";
import { fetchAgencyHistory } from "./agencies-api";
import {
  AGENCY_HISTORY_ACTIONS, AGENCY_HISTORY_FIELDS, AGENCY_TYPES, DEADLINE_RULES, PENALTY_BASES,
  type Agency, type AgencyHistoryEntry, type AgencyHistoryField, type AgencyHistoryPage, type AgencyHistoryValue,
} from "./types";

const fieldLabels = Object.entries(AGENCY_HISTORY_FIELDS) as [AgencyHistoryField, string][];
const enumLabels: Partial<Record<AgencyHistoryField, Readonly<Record<string, string>>>> = {
  agencyType: AGENCY_TYPES,
  deadlineRule: DEADLINE_RULES,
  penaltyBasis: PENALTY_BASES,
};

const historyTimestamp = new Intl.DateTimeFormat("en-PH", {
  timeZone: "Asia/Manila", year: "numeric", month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
});

function displayValue(field: AgencyHistoryField, value: AgencyHistoryValue | undefined) {
  if (value == null) return "—";
  if (Array.isArray(value)) return value.join(", ") || "—";
  if (typeof value === "boolean") return field === "isActive" ? (value ? "Active" : "Inactive") : (value ? "Yes" : "No");
  if (field === "penaltyRatePercent") return `${value}%`;
  return enumLabels[field]?.[String(value)] ?? String(value);
}

function HistoryEntry({ entry }: { entry: AgencyHistoryEntry }) {
  const timestamp = new Date(entry.occurredAt);
  return <article className="space-y-3 rounded-lg border p-3">
    <div>
      <h3 className="text-sm font-semibold">{AGENCY_HISTORY_ACTIONS[entry.action]}</h3>
      <p className="text-xs text-muted-foreground">
        {entry.actorName}{entry.actorRole ? ` · ${entry.actorRole}` : ""} · {Number.isNaN(timestamp.valueOf()) ? entry.occurredAt : `${historyTimestamp.format(timestamp)} PHT`}
      </p>
    </div>
    <div className="overflow-x-auto">
      <table className="w-full min-w-80 border-t text-left text-sm">
        <thead>
          <tr className="text-xs text-muted-foreground">
            <th scope="col" className="w-1/3 py-2 pr-3">Setting</th>
            <th scope="col" className="w-1/3 py-2 pr-3">Previous</th>
            <th scope="col" className="w-1/3 py-2">New</th>
          </tr>
        </thead>
        <tbody>
          {fieldLabels.filter(([field]) => Object.hasOwn(entry.after, field)).map(([field, label]) => <tr key={field} className="border-t align-top">
            <th scope="row" className="py-1.5 pr-3 font-medium">{label}</th>
            <td className="wrap-anywhere py-1.5 pr-3">{displayValue(field, entry.before?.[field])}</td>
            <td className="wrap-anywhere py-1.5">{displayValue(field, entry.after[field])}</td>
          </tr>)}
        </tbody>
      </table>
    </div>
  </article>;
}

type HistoryResult = { key: string; data: AgencyHistoryPage } | { key: string; error: string };

export function AgencyHistoryDialog({ agency, onClose }: { agency: Agency; onClose: () => void }) {
  const [page, setPage] = useState(1);
  const [refresh, setRefresh] = useState(0);
  const [result, setResult] = useState<HistoryResult>();
  const key = `${agency.id}:${page}:${refresh}`;
  const current = result?.key === key ? result : undefined;

  useEffect(() => {
    const controller = new AbortController();
    fetchAgencyHistory(agency.id, page, controller.signal).then(data => {
      if (!controller.signal.aborted) setResult({ key, data });
    }).catch(error => {
      if (!controller.signal.aborted) setResult({ key, error: error instanceof Error ? error.message : "Could not load agency history." });
    });
    return () => controller.abort();
  }, [agency.id, page, key]);

  return <Dialog open onOpenChange={open => { if (!open) onClose(); }}>
    <DialogContent className="flex max-h-[85dvh] min-h-0 flex-col overflow-hidden sm:max-w-3xl">
      <DialogHeader className="shrink-0">
        <DialogTitle>{agency.displayName} history</DialogTitle>
        <DialogDescription>Agency code {agency.shortCode}</DialogDescription>
      </DialogHeader>
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-0.5 pb-1">
        {!current && <ListRowsSkeleton rows={4} />}
        {current && "error" in current && <div className="space-y-2">
          <p role="alert" className="text-sm text-destructive">{current.error}</p>
          <Button type="button" size="sm" variant="outline" onClick={() => setRefresh(value => value + 1)}>Retry</Button>
        </div>}
        {current && "data" in current && <>
          {current.data.entries.length === 0 && <p className="text-sm text-muted-foreground">No changes have been recorded.</p>}
          {current.data.entries.map(entry => <HistoryEntry key={entry.id} entry={entry} />)}
        </>}
      </div>
      {current && "data" in current && (page > 1 || current.data.hasMore) && <DialogFooter className="shrink-0 items-center gap-2">
        <span className="text-sm text-muted-foreground">Page {page}</span>
        <Button type="button" size="sm" variant="outline" disabled={page === 1} onClick={() => setPage(value => value - 1)}>Previous page</Button>
        <Button type="button" size="sm" variant="outline" disabled={!current.data.hasMore} onClick={() => setPage(value => value + 1)}>Next page</Button>
      </DialogFooter>}
    </DialogContent>
  </Dialog>;
}
