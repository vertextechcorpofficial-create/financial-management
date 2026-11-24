"use client";

import React, { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Package, Loader2, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import type { EmployeeClearanceRecord, ClearanceAssetItem } from "./types";
import { fetchEmployeeClearances, processClearanceAction } from "./providers/fetchProvider";
import { SearchableSelect, type SearchableSelectOption } from "./components/SearchableSelect";

const formatCurrency = (val?: number | null) => {
  if (val === null || val === undefined) return "—";
  return `₱${val.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
};

const DEPARTMENT_OPTIONS: SearchableSelectOption[] = [
  { label: "Admin", value: "Admin" },
  { label: "IT", value: "IT" },
  { label: "Logistics", value: "Logistics" },
  { label: "Finance", value: "Finance" },
  { label: "Human Resources", value: "Human Resources" },
  { label: "Engineering", value: "Engineering" },
  { label: "Operations", value: "Operations" },
  { label: "Production", value: "Production" },
];

const HOLD_DEPARTMENT_OPTIONS: SearchableSelectOption[] = [
  { label: "Hold in: Admin", value: "Admin" },
  { label: "Hold in: IT", value: "IT" },
  { label: "Hold in: Logistics", value: "Logistics" },
  { label: "Hold in: Finance", value: "Finance" },
  { label: "Hold in: Human Resources", value: "Human Resources" },
  { label: "Hold in: Engineering", value: "Engineering" },
  { label: "Hold in: Operations", value: "Operations" },
  { label: "Hold in: Production", value: "Production" },
];

const CONDITION_OPTIONS: SearchableSelectOption[] = [
  { label: "New", value: "New" },
  { label: "Good", value: "Good" },
  { label: "Fair", value: "Fair" },
  { label: "Poor", value: "Poor" },
  { label: "Damaged", value: "Damaged" },
];

const ACTION_OPTIONS: SearchableSelectOption[] = [
  { label: "Returned to stock", value: "RETURNED_TO_STOCK", subLabel: "Hold in department stockroom" },
  { label: "Reassigned to employee", value: "REASSIGNED", subLabel: "Transfer custody to another staff member" },
  { label: "Not returned — lost", value: "LOST", subLabel: "Asset derecognition under IAS 16" },
];

interface ItemActionState {
  condition: string;
  action: "RETURNED_TO_STOCK" | "REASSIGNED" | "LOST";
  holdDepartment: string;
  storageLocation: string;
  reassignedTo: string;
}

export default function EmployeeClearanceDetailPage({ employeeId }: { employeeId: string }) {
  const router = useRouter();
  const [record, setRecord] = useState<EmployeeClearanceRecord | null>(null);
  const [allEmployees, setAllEmployees] = useState<EmployeeClearanceRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [globalHoldDept, setGlobalHoldDept] = useState("Admin");

  // State per asset item
  const [itemStates, setItemStates] = useState<Record<number, ItemActionState>>({});

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const res = await fetchEmployeeClearances();
        setAllEmployees(res.employees || []);
        const found = res.employees.find((e: EmployeeClearanceRecord) => String(e.employee_id) === String(employeeId));
        if (found) {
          setRecord(found);
          const initialStates: Record<number, ItemActionState> = {};
          found.assets.forEach((a: ClearanceAssetItem) => {
            initialStates[a.id] = {
              condition: a.condition || "Good",
              action: "RETURNED_TO_STOCK",
              holdDepartment: "Admin",
              storageLocation: "",
              reassignedTo: "",
            };
          });
          setItemStates(initialStates);
        }
      } catch (err: unknown) {
        toast.error(err instanceof Error ? err.message : "Failed to load employee clearance");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [employeeId]);

  // Options for reassignment
  const reassignmentOptions: SearchableSelectOption[] = useMemo(() => {
    return allEmployees
      .filter((e) => String(e.employee_id) !== String(employeeId))
      .map((e) => ({
        label: e.employee_name,
        value: e.employee_name,
        subLabel: e.department_name,
      }));
  }, [allEmployees, employeeId]);

  const updateItemState = (assetId: number, updates: Partial<ItemActionState>) => {
    setItemStates((prev) => ({
      ...prev,
      [assetId]: {
        ...prev[assetId],
        ...updates,
      },
    }));
  };

  const handleGlobalHoldChange = (dept: string) => {
    setGlobalHoldDept(dept);
    // update all items that are returned to stock
    setItemStates((prev) => {
      const updated = { ...prev };
      Object.keys(updated).forEach((idStr) => {
        const id = Number(idStr);
        if (updated[id].action === "RETURNED_TO_STOCK") {
          updated[id].holdDepartment = dept;
        }
      });
      return updated;
    });
  };

  const handleProcessAll = async () => {
    if (!record) return;
    setSubmitting(true);
    try {
      // Process each asset
      for (const asset of record.assets) {
        const state = itemStates[asset.id];
        if (state) {
          await processClearanceAction({
            employeeId: record.employee_id,
            assetId: asset.id,
            action: state.action,
            toLocation: state.storageLocation,
            reason: `Employee clearance for ${record.employee_name}`,
          });
        }
      }

      toast.success(`Processed ${record.assets.length} item(s) for ${record.employee_name}.`);
      router.push("/fm/asset-management/employee-clearance");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to process items");
    } finally {
      setSubmitting(false);
    }
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
      {/* Main Employee Title & Subtitle */}
      <div className="space-y-1">
        <div className="flex items-center gap-2.5">
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
            {record.employee_name}
          </h1>
          {record.status === "In clearance" && (
            <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold bg-[#fef08a] text-[#854d0e] border border-[#fef08a]">
              In clearance
            </span>
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          {record.department_name} &bull; last working day {record.last_day || "Nov 30, 2026"}
        </p>
      </div>

      {/* Returned items are held by control */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-2 text-xs">
        <span className="text-muted-foreground font-medium shrink-0">Returned items are held by</span>
        <div className="w-44">
          <SearchableSelect
            options={DEPARTMENT_OPTIONS}
            value={globalHoldDept}
            onChange={handleGlobalHoldChange}
            placeholder="Select department..."
            searchPlaceholder="Search dept..."
            className="h-8"
          />
        </div>
        <span className="text-muted-foreground">
          until they are reassigned &mdash; depreciation for those months is charged to this department.
        </span>
      </div>

      {/* Main Asset Clearance Table */}
      <div className="bg-card border rounded-xl shadow-2xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead className="border-b font-semibold text-muted-foreground bg-muted/40">
              <tr>
                <th className="py-3 px-4">Asset held</th>
                <th className="py-3 px-4 text-right">Carrying amount</th>
                <th className="py-3 px-4 w-[160px]">Condition</th>
                <th className="py-3 px-4 w-[400px]">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {record.assets.length > 0 ? (
                record.assets.map((asset: ClearanceAssetItem) => {
                  const state = itemStates[asset.id] || {
                    condition: asset.condition || "Good",
                    action: "RETURNED_TO_STOCK",
                    holdDepartment: globalHoldDept,
                    storageLocation: "",
                    reassignedTo: "",
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

                      {/* Col 3: Condition Searchable Select */}
                      <td className="py-3.5 px-4">
                        <SearchableSelect
                          options={CONDITION_OPTIONS}
                          value={state.condition}
                          onChange={(val) => updateItemState(asset.id, { condition: val })}
                          placeholder="Select condition..."
                          searchPlaceholder="Search condition..."
                          className="w-32 h-8"
                        />
                      </td>

                      {/* Col 4: Action & Sub-options */}
                      <td className="py-3.5 px-4 space-y-2">
                        {/* Main Action Searchable Select */}
                        <SearchableSelect
                          options={ACTION_OPTIONS}
                          value={state.action}
                          onChange={(val) =>
                            updateItemState(asset.id, {
                              action: val as "RETURNED_TO_STOCK" | "REASSIGNED" | "LOST",
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
                              options={HOLD_DEPARTMENT_OPTIONS}
                              value={state.holdDepartment}
                              onChange={(val) =>
                                updateItemState(asset.id, { holdDepartment: val })
                              }
                              placeholder="Hold in..."
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

                        {/* Sub-inputs when Reassigned: Searchable Select with employees or manual input */}
                        {state.action === "REASSIGNED" && (
                          <div className="space-y-1.5 pt-0.5">
                            <SearchableSelect
                              options={reassignmentOptions}
                              value={state.reassignedTo}
                              onChange={(val) =>
                                updateItemState(asset.id, { reassignedTo: val })
                              }
                              placeholder="Search employee to reassign..."
                              searchPlaceholder="Search by name or department..."
                              className="w-full h-8"
                            />
                          </div>
                        )}

                        {/* Note when Lost */}
                        {state.action === "LOST" && (
                          <p className="text-[11px] text-destructive italic pt-0.5">
                            Asset will be derecognised under IAS 16 and reported for management review.
                          </p>
                        )}
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={4} className="py-12 text-center text-muted-foreground italic">
                    No active assets held by this employee.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Bottom Footer Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pt-2">
        <p className="text-[11px] text-muted-foreground italic">
          &quot;Lost&quot; posts a write-off (proceeds = amount charged to the employee), subject to approval.
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
    </div>
  );
}
