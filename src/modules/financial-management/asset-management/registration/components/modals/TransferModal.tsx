"use client";

import React, { useEffect, useState, useMemo } from "react";
import { format } from "date-fns";
import { CalendarIcon, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { SearchableSelect } from "../SearchableSelect";
import { assetService } from "../../services/assetService";
import {
  AssetTableData,
  Department,
  User,
  AssetCondition,
} from "../../types";

interface TransferModalProps {
  asset: AssetTableData | null;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  onLocalUpdate: (updated: Partial<AssetTableData> & { id: number }) => void;
}

export default function TransferModal({
  asset,
  isOpen,
  onClose,
  onSuccess,
  onLocalUpdate,
}: TransferModalProps) {
  const [loading, setLoading] = useState(false);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [conditions, setConditions] = useState<AssetCondition[]>([]);

  // Popover calendar state
  const [effectiveDateOpen, setEffectiveDateOpen] = useState(false);

  // Transfer form state
  const [effectiveDate, setEffectiveDate] = useState<Date>(new Date());
  const [toDepartment, setToDepartment] = useState<number>(0);
  const [toPerson, setToPerson] = useState<number | null>(null);
  const [toLocation, setToLocation] = useState<string>("");
  const [conditionOnHandover, setConditionOnHandover] = useState<string>("Good");
  const [reason, setReason] = useState<string>("");

  useEffect(() => {
    if (isOpen && asset) {
      setEffectiveDate(new Date());
      setToDepartment(asset.department || 0);
      setToPerson(asset.employee || null);
      setToLocation(asset.location || "");
      setConditionOnHandover(asset.condition || "Good");
      setReason("");

      // Fetch dropdowns
      const loadOptions = async () => {
        try {
          const [depData, userData, condData] = await Promise.all([
            assetService.getDepartments(),
            assetService.getUsers(),
            assetService.getConditions(),
          ]);
          setDepartments(Array.isArray(depData) ? depData : []);
          setUsers(Array.isArray(userData) ? userData : []);
          setConditions(Array.isArray(condData) ? condData : []);
        } catch (err) {
          console.warn("Failed loading transfer options:", err);
        }
      };
      loadOptions();
    }
  }, [isOpen, asset]);

  // Filter users based on selected department (only active employees of that department)
  const departmentUsers = useMemo(() => {
    if (!toDepartment) return users;
    return users.filter((u) => !u.department_id || u.department_id === toDepartment);
  }, [users, toDepartment]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!asset) return;

    if (!toDepartment) {
      toast.error("Please select a target Department.");
      return;
    }

    if (!reason.trim()) {
      toast.error("Please enter a Reason for the transfer.");
      return;
    }

    // Validation: effectiveDate >= acquisition_date
    if (new Date(effectiveDate) < new Date(asset.date_acquired)) {
      toast.error("Effective date cannot be earlier than the asset's acquisition date.");
      return;
    }

    // Check if something changed
    const deptChanged = asset.department !== toDepartment;
    const userChanged = asset.employee !== toPerson;
    const locChanged = (asset.location || "") !== toLocation;
    const condChanged = asset.condition !== conditionOnHandover;

    if (!deptChanged && !userChanged && !locChanged && !condChanged) {
      toast.error("No changes detected. A transfer must change department, holder, location, or condition.");
      return;
    }

    setLoading(true);
    try {
      const payload = {
        asset_id: asset.id,
        effective_date: format(effectiveDate, "yyyy-MM-dd"),
        to_department_id: toDepartment,
        to_user_id: toPerson,
        to_location: toLocation,
        condition_on_handover: conditionOnHandover,
        reason: reason.trim(),
      };

      const res = await assetService.recordTransfer(payload);

      const targetDeptObj = departments.find((d) => d.department_id === toDepartment);
      const targetUserObj = users.find((u) => u.user_id === toPerson);

      toast.success("Custody transfer recorded successfully");
      onLocalUpdate({
        id: asset.id,
        department: toDepartment,
        department_name: targetDeptObj?.department_name || "Unassigned",
        employee: toPerson,
        assigned_to_name: targetUserObj
          ? `${targetUserObj.user_fname} ${targetUserObj.user_lname}`.trim()
          : "Unassigned",
        location: toLocation,
        condition: conditionOnHandover,
      });

      onSuccess();
      onClose();
    } catch (err: any) {
      toast.error(err.message || "Failed to record transfer");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-2xl w-full p-0 gap-0 overflow-hidden">
        <DialogHeader className="p-6 pb-2">
          <DialogTitle className="text-xl font-bold flex items-center gap-2">
            Transfer {asset?.asset_tag || "ITE-0007"}
          </DialogTitle>
          <p className="text-xs text-muted-foreground">
            {asset?.item_name || "Asset"} · currently{" "}
            <span className="font-semibold text-foreground">
              {asset?.department_name || "Unassigned"}
            </span>{" "}
            / {asset?.assigned_to_name || "Unassigned"}
          </p>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="p-6 pt-4 space-y-4">
          {/* Row 1: Effective Date & To Department */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-xs font-semibold text-foreground">
                Effective Date <span className="text-destructive">*</span>
              </label>
              <Popover open={effectiveDateOpen} onOpenChange={setEffectiveDateOpen}>
                <PopoverTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full h-10 px-3 justify-between text-left font-normal text-sm"
                  >
                    {format(effectiveDate, "MM/dd/yyyy")}
                    <CalendarIcon className="h-4 w-4 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={effectiveDate}
                    onSelect={(d) => {
                      if (d) setEffectiveDate(d);
                      setEffectiveDateOpen(false);
                    }}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold text-foreground">
                To Department <span className="text-destructive">*</span>
              </label>
              <SearchableSelect
                options={departments.map((d) => ({
                  label: d.department_name,
                  value: String(d.department_id),
                }))}
                value={toDepartment ? String(toDepartment) : ""}
                onChange={(val: string) => {
                  setToDepartment(Number(val));
                  // Auto reset person if not in department
                  setToPerson(null);
                }}
                placeholder="Select department"
                searchPlaceholder="Search department..."
              />
            </div>
          </div>

          {/* Row 2: To Person & To Location */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-xs font-semibold text-foreground">To Person</label>
              <SearchableSelect
                options={[
                  { label: "Unassigned", value: "unassigned" },
                  ...departmentUsers.map((u) => ({
                    label: `${u.user_fname} ${u.user_lname}`.trim(),
                    value: String(u.user_id),
                  })),
                ]}
                value={toPerson ? String(toPerson) : "unassigned"}
                onChange={(val: string) => setToPerson(val === "unassigned" ? null : Number(val))}
                placeholder="Unassigned"
                searchPlaceholder="Search person..."
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold text-foreground">To Location</label>
              <Input
                value={toLocation}
                onChange={(e) => setToLocation(e.target.value)}
                placeholder="e.g. 3F Data room"
                className="h-10 text-sm"
              />
            </div>
          </div>

          {/* Row 3: Condition on Handover & Reason */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-xs font-semibold text-foreground">
                Condition on Handover
              </label>
              <SearchableSelect
                options={
                  conditions.length > 0
                    ? conditions.map((c) => ({
                        label: c.condition_name,
                        value: c.condition_name,
                      }))
                    : [
                        { label: "New", value: "New" },
                        { label: "Good", value: "Good" },
                        { label: "Under Maintenance", value: "Under Maintenance" },
                        { label: "Poor", value: "Poor" },
                        { label: "Damaged", value: "Damaged" },
                        { label: "For repair", value: "For repair" },
                      ]
                }
                value={conditionOnHandover}
                onChange={(val: string) => setConditionOnHandover(val)}
                placeholder="Select condition"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold text-foreground">
                Reason <span className="text-destructive">*</span>
              </label>
              <Input
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="e.g. Reassignment, new hire, return to stock"
                className="h-10 text-sm"
                required
              />
            </div>
          </div>

          {/* Footer Actions */}
          <div className="pt-4 border-t flex items-center justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={loading}
              className="h-10 text-xs px-5"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={loading}
              className="h-10 text-xs px-6 bg-blue-600 hover:bg-blue-700 text-white font-medium"
            >
              {loading && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}
              Record Transfer
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
