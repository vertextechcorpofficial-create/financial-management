"use client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CHANGE_TYPES } from "../master-types";
import { approvalFiltersActive, type ApprovalDateBasis, type ApprovalFilterState, type ApprovalQueue } from "../utils/approvalFilters";
import { Field, NativeSelect } from "./OnboardingCommon";

export function ApprovalFilterBar({ queue, filters, onChange, onClear }: {
  queue: ApprovalQueue;
  filters: ApprovalFilterState;
  onChange: (patch: Partial<ApprovalFilterState>) => void;
  onClear: () => void;
}) {
  const decided = queue === "decided", prefix = `approval-${queue}`, dateLabel = decided && filters.dateBasis === "decided" ? "Decided" : "Requested";
  return <div role="search" aria-label={decided ? "Decided request filters" : "Awaiting approval filters"} className="flex flex-wrap items-end gap-3 rounded-lg border bg-muted/20 p-3">
    <div className="min-w-52 flex-1"><Field label="Search" id={`${prefix}-search`} type="search" value={filters.search} onChange={value => onChange({ search: value })} placeholder={decided ? "Request, fund, requester or approver" : "Request, fund or requester"} /></div>
    <div className="w-full sm:w-40"><NativeSelect label="Type" id={`${prefix}-type`} value={filters.type} onChange={value => onChange({ type: value })}><option value="ALL">All types</option><option value="NEW">New fund</option>{Object.entries(CHANGE_TYPES).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</NativeSelect></div>
    {decided && <div className="w-full sm:w-40"><NativeSelect label="Decision status" id={`${prefix}-status`} value={filters.status} onChange={value => onChange({ status: value })}><option value="ALL">All statuses</option><option value="APPROVED">Approved</option><option value="REJECTED">Rejected</option></NativeSelect></div>}
    {decided && <div className="w-full sm:w-40"><NativeSelect label="Date basis" id={`${prefix}-basis`} value={filters.dateBasis} onChange={value => onChange({ dateBasis: value as ApprovalDateBasis })}><option value="decided">Decision date</option><option value="requested">Requested date</option></NativeSelect></div>}
    <div className="flex w-full gap-3 sm:w-auto">
      <div className="min-w-0 flex-1 space-y-2 sm:w-36 sm:flex-none"><label htmlFor={`${prefix}-from`} className="text-sm font-medium">{dateLabel} from</label><Input id={`${prefix}-from`} type="date" value={filters.from} max={filters.to || undefined} onChange={event => onChange({ from: event.target.value })} /></div>
      <div className="min-w-0 flex-1 space-y-2 sm:w-36 sm:flex-none"><label htmlFor={`${prefix}-to`} className="text-sm font-medium">{dateLabel} to</label><Input id={`${prefix}-to`} type="date" value={filters.to} min={filters.from || undefined} onChange={event => onChange({ to: event.target.value })} /></div>
    </div>
    {approvalFiltersActive(filters, queue) && <Button type="button" variant="ghost" onClick={onClear}>Clear filters</Button>}
  </div>;
}
