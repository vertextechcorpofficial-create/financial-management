"use client";

import React, { useState, useEffect, useMemo, useCallback } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Package,
  Loader2,
  CheckCircle2,
  Download,
  UserCheck,
  PlayCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import type {
  ClearanceActionCode,
  ClearanceAssetItem,
  ClearanceLookupCondition,
  ClearanceLookupDepartment,
  ClearanceLookupUser,
  EmployeeClearanceRecord,
} from "./types";
import {
  fetchEmployeeClearances,
  issueClearance,
  processClearanceAction,
  startClearance,
} from "./providers/fetchProvider";
import { SearchableSelect, type SearchableSelectOption } from "./components/SearchableSelect";

const formatCurrency = (val?: number | null) => {
  if (val === null || val === undefined) return "—";
  return `₱${val.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
};

const ACTION_OPTIONS: SearchableSelectOption[] = [
  { label: "Returned to stock", value: "RETURNED_TO_STOCK", subLabel: "Hold in department stockroom" },
  { label: "Reassigned to employee", value: "REASSIGNED", subLabel: "Transfer custody to another active staff member" },
  { label: "Not returned — lost", value: "LOST", subLabel: "Transfer to Unassigned + disposal write-off (IAS 16)" },
];

interface ItemActionState {
  conditionId: string;
  conditionName: string;
  action: ClearanceActionCode;
  holdDepartmentId: string;
  storageLocation: string;
  reassignedToUserId: string;
  amountCharged: string;
}

export default function EmployeeClearanceDetailPage({ employeeId }: { employeeId: string }) {
  const [record, setRecord] = useState<EmployeeClearanceRecord | null>(null);
  const [departments, setDepartments] = useState<ClearanceLookupDepartment[]>([]);
  const [conditions, setConditions] = useState<ClearanceLookupCondition[]>([]);
  const [activeUsers, setActiveUsers] = useState<ClearanceLookupUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [issuing, setIssuing] = useState(false);
  const [globalHoldDeptId, setGlobalHoldDeptId] = useState("");

  // Start clearance modal state
  const [startModalOpen, setStartModalOpen] = useState(false);
  const [startLastDay, setStartLastDay] = useState(new Date().toISOString().split("T")[0]);
  const [startReason, setStartReason] = useState("");
  const [startingClearance, setStartingClearance] = useState(false);

  // State per asset item
  const [itemStates, setItemStates] = useState<Record<number, ItemActionState>>({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetchEmployeeClearances();
      const deptList = res.departments || [];
      const condList = res.conditions || [];
      const userList = res.activeUsers || [];

      setDepartments(deptList);
      setConditions(condList);
      setActiveUsers(userList);

      // Default bulk holding department: Admin (per PDF §16) or first department
      const adminDept = deptList.find((d) => d.department_name.toLowerCase().includes("admin"));
      const defaultHoldId = String(adminDept?.department_id ?? deptList[0]?.department_id ?? "");
      setGlobalHoldDeptId(defaultHoldId);

      const found = res.employees.find(
        (e: EmployeeClearanceRecord) => String(e.employee_id) === String(employeeId)
      );
      if (found) {
        setRecord(found);
        const initialStates: Record<number, ItemActionState> = {};
        found.assets.forEach((a: ClearanceAssetItem) => {
          const matchedCond =
            condList.find((c) => c.id === a.condition_id) ||
            condList.find((c) => c.condition_name.toLowerCase() === (a.condition || "Good").toLowerCase()) ||
            condList[0];

          initialStates[a.id] = {
            conditionId: matchedCond ? String(matchedCond.id) : "",
            conditionName: matchedCond?.condition_name || a.condition || "Good",
            action: "RETURNED_TO_STOCK",
            holdDepartmentId: defaultHoldId,
            storageLocation: "",
            reassignedToUserId: "",
            amountCharged: "",
          };
        });
        setItemStates(initialStates);
      } else {
        setRecord(null);
      }
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to load employee clearance");
    } finally {
      setLoading(false);
    }
  }, [employeeId]);

  useEffect(() => {
    load();
  }, [load]);

  const departmentOptions: SearchableSelectOption[] = useMemo(
    () =>
      departments.map((d) => ({
        label: d.department_name,
        value: String(d.department_id),
      })),
    [departments]
  );

  const holdDepartmentOptions: SearchableSelectOption[] = useMemo(
    () =>
      departments.map((d) => ({
        label: `Hold in: ${d.department_name}`,
        value: String(d.department_id),
      })),
    [departments]
  );

  const conditionOptions: SearchableSelectOption[] = useMemo(
    () =>
      conditions.map((c) => ({
        label: c.condition_name,
        value: String(c.id),
      })),
    [conditions]
  );

  // PDF §16: Active employees only (never employees In clearance or Cleared)
  const reassignmentOptions: SearchableSelectOption[] = useMemo(
    () =>
      activeUsers
        .filter((u) => String(u.user_id) !== String(employeeId))
        .map((u) => ({
          label: u.user_name,
          value: String(u.user_id),
          subLabel: u.department_name,
        })),
    [activeUsers, employeeId]
  );

  const updateItemState = (assetId: number, updates: Partial<ItemActionState>) => {
    setItemStates((prev) => ({
      ...prev,
      [assetId]: {
        ...prev[assetId],
        ...updates,
      },
    }));
  };

  const handleGlobalHoldChange = (deptId: string) => {
    setGlobalHoldDeptId(deptId);
    setItemStates((prev) => {
      const updated = { ...prev };
      Object.keys(updated).forEach((idStr) => {
        const id = Number(idStr);
        if (updated[id]?.action === "RETURNED_TO_STOCK") {
          updated[id] = { ...updated[id], holdDepartmentId: deptId };
        }
      });
      return updated;
    });
  };

  const handleStartClearance = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!record) return;
    if (!startLastDay) {
      toast.error("Please select the employee's last working day.");
      return;
    }
    if (!startReason.trim()) {
      toast.error("Please enter a reason for clearance.");
      return;
    }
    setStartingClearance(true);
    try {
      await startClearance({
        employeeId: record.employee_id,
        lastDay: startLastDay,
        reason: startReason.trim(),
      });
      toast.success(`Clearance started for ${record.employee_name}.`);
      setStartModalOpen(false);
      setStartReason("");
      await load();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to start clearance.");
    } finally {
      setStartingClearance(false);
    }
  };

  const handleProcessAll = async () => {
    if (!record || record.assets.length === 0) return;

    // Validate all rows before sending to DB
    for (const asset of record.assets) {
      const state = itemStates[asset.id];
      if (!state) continue;
      if (state.action === "RETURNED_TO_STOCK" && !state.holdDepartmentId) {
        toast.error(`Please select a holding department for ${asset.asset_tag}.`);
        return;
      }
      if (state.action === "REASSIGNED" && !state.reassignedToUserId) {
        toast.error(`Please select an active employee to reassign ${asset.asset_tag}.`);
        return;
      }
      if (state.action === "LOST" && state.amountCharged && Number(state.amountCharged) < 0) {
        toast.error(`Amount charged for ${asset.asset_tag} cannot be negative.`);
        return;
      }
    }

    setSubmitting(true);
    try {
      let processedCount = 0;
      for (const asset of record.assets) {
        const state = itemStates[asset.id];
        if (!state) continue;

        let toDepartmentId: number | null = null;
        let toUserId: number | null = null;

        if (state.action === "RETURNED_TO_STOCK") {
          toDepartmentId = Number(state.holdDepartmentId);
        } else if (state.action === "REASSIGNED") {
          toUserId = Number(state.reassignedToUserId);
          const targetUser = activeUsers.find((u) => u.user_id === toUserId);
          toDepartmentId = targetUser?.department_id ?? asset.department_id ?? null;
        } else if (state.action === "LOST") {
          toDepartmentId = asset.department_id ?? Number(globalHoldDeptId || 1);
        }

        await processClearanceAction({
          employeeId: record.employee_id,
          clearanceRequestId: record.clearance_request_id ?? null,
          assetId: asset.id,
          action: state.action,
          conditionId: state.conditionId ? Number(state.conditionId) : null,
          conditionName: state.conditionName,
          toDepartmentId,
          toUserId,
          toLocation: state.storageLocation.trim() || undefined,
          amountCharged:
            state.action === "LOST" && state.amountCharged.trim() !== ""
              ? Number(state.amountCharged)
              : 0,
          reason: `Employee clearance for ${record.employee_name}`,
        });
        processedCount++;
      }

      toast.success(`Saved ${processedCount} clearance action(s) to database.`);
      await load();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to process clearance items.");
      await load();
    } finally {
      setSubmitting(false);
    }
  };

  const handleIssueClearance = async () => {
    if (!record) return;
    setIssuing(true);
    try {
      await issueClearance({
        employeeId: record.employee_id,
        clearanceRequestId: record.clearance_request_id ?? null,
      });
      toast.success(`Clearance issued! ${record.employee_name} is now Cleared.`);
      await load();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to issue clearance.");
    } finally {
      setIssuing(false);
    }
  };

  // PDF §19: CSV export (UTF-8 with BOM, 4 header lines)
  const handleExportCsv = () => {
    if (!record) return;
    const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const rows: string[] = [
      esc(`Employee Clearance Record — ${record.employee_name}`),
      esc(`Department: ${record.department_name} | Status: ${record.status} | Last Working Day: ${record.last_day || "—"}`),
      esc("Asset Management System"),
      "",
      [
        "Asset Tag",
        "Item Name",
        "Condition",
        "Action",
        "To Department",
        "To Holder",
        "Location",
        "Amount Charged (PHP)",
        "Processed At",
        "Remarks",
      ]
        .map(esc)
        .join(","),
    ];

    record.processed_lines.forEach((line) => {
      rows.push(
        [
          line.asset_tag,
          line.item_name,
          line.condition_name,
          line.action_label,
          line.to_department_name,
          line.to_user_name,
          line.to_location || "",
          line.amount_charged !== null ? line.amount_charged.toFixed(2) : "",
          line.processed_at || "",
          line.remarks || "",
        ]
          .map(esc)
          .join(",")
      );
    });

    const blob = new Blob(["\uFEFF" + rows.join("\r\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `clearance-${record.employee_name.toLowerCase().replace(/\s+/g, "-")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center p-20 space-y-3">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="text-xs text-muted-foreground">Loading employee clearance records...</p>
      </div>
    );
  }

  if (!record) {
    return (
      <div className="p-8 text-center space-y-4">
        <p className="text-sm font-semibold text-destructive">Employee clearance record not found.</p>
        <Link href="/fm/asset-management/employee-clearance">
          <Button variant="outline" size="sm">
            <ArrowLeft className="mr-2 h-4 w-4" /> Back to Employee clearance
          </Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="p-6 md:p-8 space-y-6 max-w-[1200px] mx-auto min-h-screen">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Link
          href="/fm/asset-management/employee-clearance"
          className="inline-flex items-center gap-1 hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Employee clearance
        </Link>
        <span>/</span>
        <span className="text-foreground font-medium">{record.employee_name}</span>
      </div>

      {/* Main Employee Title, Status Badge, and Lifecycle Action Buttons */}
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2.5 flex-wrap">
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
              {record.employee_name}
            </h1>
            {record.status === "In clearance" && (
              <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold bg-[#fef08a] text-[#854d0e] border border-[#fef08a]">
                In clearance
              </span>
            )}
            {record.status === "Cleared" && (
              <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold bg-emerald-100 text-emerald-800 border border-emerald-200">
                Cleared
              </span>
            )}
            {record.status === "Active" && (
              <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-muted text-muted-foreground">
                Active
              </span>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            {record.department_name}
            {record.last_day ? ` • last working day ${record.last_day}` : ""}
            {record.clearance_reason ? ` • ${record.clearance_reason}` : ""}
          </p>
        </div>

        <div className="flex items-center gap-2">
          {record.status === "Active" && (
            <Button
              size="sm"
              onClick={() => setStartModalOpen(true)}
              className="bg-amber-600 hover:bg-amber-700 text-white text-xs h-9"
            >
              <PlayCircle className="h-4 w-4 mr-1.5" />
              Start clearance
            </Button>
          )}

          {record.status === "In clearance" && record.assets.length === 0 && (
            <Button
              size="sm"
              onClick={handleIssueClearance}
              disabled={issuing}
              className="bg-[#1b4332] hover:bg-[#143326] text-white text-xs h-9"
            >
              {issuing ? (
                <Loader2 className="h-4 w-4 animate-spin mr-1.5" />
              ) : (
                <UserCheck className="h-4 w-4 mr-1.5" />
              )}
              Issue clearance
            </Button>
          )}

          {(record.processed_lines.length > 0 || record.status === "Cleared") && (
            <Button variant="outline" size="sm" onClick={handleExportCsv} className="text-xs h-9">
              <Download className="h-3.5 w-3.5 mr-1.5" />
              Export CSV
            </Button>
          )}
        </div>
      </div>

      {/* Returned items are held by control (shown when employee holds active assets) */}
      {record.assets.length > 0 && (
        <div className="flex flex-col sm:flex-row sm:items-center gap-2 text-xs">
          <span className="text-muted-foreground font-medium shrink-0">
            Returned items are held by
          </span>
          <div className="w-48">
            <SearchableSelect
              options={departmentOptions}
              value={globalHoldDeptId}
              onChange={handleGlobalHoldChange}
              placeholder="Select department..."
              searchPlaceholder="Search dept..."
              className="h-8"
            />
          </div>
          <span className="text-muted-foreground">
            until they are reassigned &mdash; depreciation for those months is charged to this
            department.
          </span>
        </div>
      )}

      {/* Main Asset Clearance Table (Assets currently held) */}
      <div className="bg-card border rounded-xl shadow-2xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead className="border-b font-semibold text-muted-foreground bg-muted/40">
              <tr>
                <th className="py-3 px-4">Asset held</th>
                <th className="py-3 px-4 text-right">Carrying amount</th>
                <th className="py-3 px-4 w-[170px]">Condition</th>
                <th className="py-3 px-4 w-[420px]">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {record.assets.length > 0 ? (
                record.assets.map((asset: ClearanceAssetItem) => {
                  const state = itemStates[asset.id] || {
                    conditionId: "",
                    conditionName: asset.condition || "Good",
                    action: "RETURNED_TO_STOCK" as ClearanceActionCode,
                    holdDepartmentId: globalHoldDeptId,
                    storageLocation: "",
                    reassignedToUserId: "",
                    amountCharged: "",
                  };

                  return (
                    <tr key={asset.id} className="hover:bg-muted/15 transition-colors align-top">
                      {/* Col 1: Asset Info */}
                      <td className="py-3.5 px-4">
                        <div className="flex items-start gap-2.5">
                          <div className="h-7 w-7 rounded-md bg-muted/70 flex items-center justify-center shrink-0 mt-0.5">
                            <Package className="h-4 w-4 text-muted-foreground" />
                          </div>
                          <div>
                            <div className="flex items-center gap-1.5">
                              <Link
                                href={`/fm/asset-management/registration/${asset.id}`}
                                className="font-mono font-bold text-emerald-800 hover:underline"
                              >
                                {asset.asset_tag}
                              </Link>
                              <span className="text-muted-foreground">&bull;</span>
                              <span className="font-semibold text-foreground">{asset.item_name}</span>
                            </div>
                            <div className="text-[11px] font-mono text-muted-foreground mt-0.5">
                              RFID {asset.rfid_code} {asset.serial ? `· S/N ${asset.serial}` : ""}
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Col 2: Carrying Amount */}
                      <td className="py-3.5 px-4 text-right font-mono font-bold text-foreground">
                        {formatCurrency(asset.carrying_amount)}
                      </td>

                      {/* Col 3: Live Condition Searchable Select */}
                      <td className="py-3.5 px-4">
                        <SearchableSelect
                          options={conditionOptions}
                          value={state.conditionId}
                          onChange={(val) => {
                            const found = conditions.find((c) => String(c.id) === val);
                            updateItemState(asset.id, {
                              conditionId: val,
                              conditionName: found?.condition_name || state.conditionName,
                            });
                          }}
                          placeholder="Select condition..."
                          searchPlaceholder="Search condition..."
                          className="w-36 h-8"
                        />
                      </td>

                      {/* Col 4: Action & Sub-options */}
                      <td className="py-3.5 px-4 space-y-2">
                        <SearchableSelect
                          options={ACTION_OPTIONS}
                          value={state.action}
                          onChange={(val) =>
                            updateItemState(asset.id, {
                              action: val as ClearanceActionCode,
                            })
                          }
                          placeholder="Select action..."
                          searchPlaceholder="Search action..."
                          className="w-full h-8 border-[#1b4332]/40 focus:ring-[#1b4332]"
                        />

                        {/* Sub-inputs when Returned to Stock */}
                        {state.action === "RETURNED_TO_STOCK" && (
                          <div className="space-y-1.5 pt-0.5">
                            <SearchableSelect
                              options={holdDepartmentOptions}
                              value={state.holdDepartmentId}
                              onChange={(val) =>
                                updateItemState(asset.id, { holdDepartmentId: val })
                              }
                              placeholder="Hold in department..."
                              searchPlaceholder="Search hold department..."
                              className="w-full h-8"
                            />

                            <Input
                              placeholder="Storage location, e.g. Admin stockroom"
                              value={state.storageLocation}
                              onChange={(e) =>
                                updateItemState(asset.id, { storageLocation: e.target.value })
                              }
                              className="h-8 text-xs bg-background"
                            />
                          </div>
                        )}

                        {/* Sub-inputs when Reassigned (Active employees only) */}
                        {state.action === "REASSIGNED" && (
                          <div className="space-y-1.5 pt-0.5">
                            <SearchableSelect
                              options={reassignmentOptions}
                              value={state.reassignedToUserId}
                              onChange={(val) =>
                                updateItemState(asset.id, { reassignedToUserId: val })
                              }
                              placeholder="Select active employee..."
                              searchPlaceholder="Search by name or department..."
                              className="w-full h-8"
                            />
                          </div>
                        )}

                        {/* Sub-inputs when Lost: optional amount charged to employee */}
                        {state.action === "LOST" && (
                          <div className="space-y-1.5 pt-0.5">
                            <Input
                              type="number"
                              min="0"
                              step="0.01"
                              placeholder="Amount charged to employee (₱, optional — defaults to 0)"
                              value={state.amountCharged}
                              onChange={(e) =>
                                updateItemState(asset.id, { amountCharged: e.target.value })
                              }
                              className="h-8 text-xs font-mono bg-background"
                            />
                            <p className="text-[11px] text-destructive italic">
                              Transfers to Unassigned and posts a disposal write-off (proceeds =
                              amount charged), subject to approval.
                            </p>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={4} className="py-12 text-center text-muted-foreground italic">
                    No active assets held by this employee.
                    {record.status === "In clearance"
                      ? ' Click "Issue clearance" above to finalize.'
                      : ""}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Bottom Footer Actions */}
      {record.assets.length > 0 && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pt-2">
          <p className="text-[11px] text-muted-foreground italic">
            &quot;Lost&quot; posts a write-off (proceeds = amount charged to the employee), subject
            to approval.
          </p>

          <Button
            onClick={handleProcessAll}
            disabled={submitting || record.assets.length === 0}
            className="bg-[#1b4332] hover:bg-[#143326] text-white font-medium px-5 h-9 text-xs"
          >
            {submitting ? (
              <Loader2 className="h-4 w-4 animate-spin mr-1.5" />
            ) : (
              <CheckCircle2 className="h-4 w-4 mr-1.5" />
            )}
            Process {record.assets.length} item(s)
          </Button>
        </div>
      )}

      {/* Processed Clearance Lines History (from asset_clearance_lines) */}
      {record.processed_lines.length > 0 && (
        <div className="space-y-2 pt-4">
          <h2 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
            Processed Clearance Items ({record.processed_lines.length})
          </h2>
          <div className="bg-card border rounded-xl shadow-2xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead className="border-b font-semibold text-muted-foreground bg-muted/40">
                  <tr>
                    <th className="py-2.5 px-4">Asset</th>
                    <th className="py-2.5 px-4">Condition</th>
                    <th className="py-2.5 px-4">Action</th>
                    <th className="py-2.5 px-4">Destination</th>
                    <th className="py-2.5 px-4 text-right">Amount Charged</th>
                    <th className="py-2.5 px-4">Processed At</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {record.processed_lines.map((line) => (
                    <tr key={line.id} className="hover:bg-muted/15">
                      <td className="py-2.5 px-4">
                        <Link
                          href={`/fm/asset-management/registration/${line.asset_id}`}
                          className="font-mono font-bold text-emerald-800 hover:underline"
                        >
                          {line.asset_tag}
                        </Link>
                        <span className="text-muted-foreground"> &bull; </span>
                        <span className="font-medium text-foreground">{line.item_name}</span>
                      </td>
                      <td className="py-2.5 px-4">{line.condition_name}</td>
                      <td className="py-2.5 px-4 font-medium">{line.action_label}</td>
                      <td className="py-2.5 px-4 text-muted-foreground">
                        {line.to_department_name}
                        {line.to_user_name !== "Unassigned" ? ` · ${line.to_user_name}` : ""}
                        {line.to_location ? ` (${line.to_location})` : ""}
                      </td>
                      <td className="py-2.5 px-4 text-right font-mono">
                        {line.amount_charged !== null ? formatCurrency(line.amount_charged) : "—"}
                      </td>
                      <td className="py-2.5 px-4 font-mono text-[11px] text-muted-foreground">
                        {line.processed_at ? line.processed_at.split("T")[0] : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Start Clearance Dialog */}
      <Dialog open={startModalOpen} onOpenChange={setStartModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base font-bold">
              Start clearance — {record.employee_name}
            </DialogTitle>
            <DialogDescription className="text-xs">
              Once in clearance, this employee can no longer be assigned new assets anywhere in the
              system.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleStartClearance} className="space-y-4 pt-2">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground">
                Last working day <span className="text-destructive">*</span>
              </label>
              <Input
                type="date"
                value={startLastDay}
                onChange={(e) => setStartLastDay(e.target.value)}
                required
                className="h-9 text-xs"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground">
                Reason <span className="text-destructive">*</span>
              </label>
              <Input
                placeholder="e.g. Resignation, End of contract, Retirement"
                value={startReason}
                onChange={(e) => setStartReason(e.target.value)}
                required
                className="h-9 text-xs"
              />
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setStartModalOpen(false)}
                disabled={startingClearance}
                className="text-xs"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                size="sm"
                disabled={startingClearance}
                className="bg-amber-600 hover:bg-amber-700 text-white text-xs"
              >
                {startingClearance && <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />}
                Confirm start clearance
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
