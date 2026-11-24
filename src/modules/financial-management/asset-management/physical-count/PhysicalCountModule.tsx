"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { Plus, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SearchableSelect } from "./components/SearchableSelect";
import PhysicalCountKPICards from "./components/PhysicalCountKPICards";
import PhysicalCountTable from "./components/PhysicalCountTable";
import { usePhysicalCount } from "./hooks/usePhysicalCount";
import type { StartCountSessionPayload } from "./types";

interface DepartmentOption {
  department_id: number;
  department_name: string;
}

const DEFAULT_DEPARTMENTS: DepartmentOption[] = [
  { department_id: 1, department_name: "Admin" },
  { department_id: 2, department_name: "Engineering" },
  { department_id: 3, department_name: "Finance" },
  { department_id: 4, department_name: "Human Resources" },
  { department_id: 5, department_name: "IT" },
  { department_id: 6, department_name: "Logistics" },
  { department_id: 7, department_name: "Operations" },
  { department_id: 8, department_name: "Production" },
];

export default function PhysicalCountModule() {
  const router = useRouter();
  const { data, isLoading, startSession } = usePhysicalCount();

  // New Count Session Form State
  const [isNewOpen, setIsNewOpen] = useState(false);
  const [creating, setCreating] = useState(false);

  const [formName, setFormName] = useState(
    `Count — ${format(new Date(), "MMM yyyy")}`
  );
  const [formDate, setFormDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [formLocation, setFormLocation] = useState("");
  const [formMethod, setFormMethod] = useState<
    "RFID reader" | "Manual checklist"
  >("RFID reader");
  const [selectedDepts, setSelectedDepts] = useState<number[]>([]);

  const handleStartCount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName.trim()) {
      toast.error("Please provide a name for the count session");
      return;
    }

    setCreating(true);
    try {
      const payload: StartCountSessionPayload = {
        name: formName,
        count_date: formDate,
        method: formMethod,
        location_filter: formLocation || undefined,
        department_ids: selectedDepts,
      };

      const session = await startSession(payload);
      toast.success("Count session started");
      setIsNewOpen(false);
      router.push(`/fm/asset-management/physical-count/${session.id}`);
    } catch (err: unknown) {
      toast.error(
        err instanceof Error ? err.message : "Failed to start count session"
      );
    } finally {
      setCreating(false);
    }
  };

  const toggleDept = (deptId: number) => {
    setSelectedDepts((prev) =>
      prev.includes(deptId)
        ? prev.filter((id) => id !== deptId)
        : [...prev, deptId]
    );
  };

  if (isLoading) {
    return (
      <div className="flex h-[450px] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Header matching Image 1 & 2 */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black font-serif tracking-tight text-foreground">
            Physical count
          </h1>
          <p className="text-xs text-muted-foreground mt-1">
            Sweep a department with the RFID reader, reconcile reads against the
            register, and resolve every exception.
          </p>
        </div>

        <Button
          onClick={() => setIsNewOpen(true)}
          className="bg-blue-600 hover:bg-blue-700 text-white font-medium text-xs h-9 px-4 shrink-0"
        >
          <Plus className="mr-1.5 h-4 w-4" /> New count
        </Button>
      </div>

      {/* New Count Session Panel (Image 2) */}
      {isNewOpen && (
        <div className="rounded-xl border bg-card p-5 space-y-4 shadow-sm animate-in fade-in duration-200">
          <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
            New count session
          </h3>

          <form onSubmit={handleStartCount} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-foreground">
                  Name <span className="text-destructive">*</span>
                </label>
                <Input
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  className="h-9 text-xs"
                  required
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-foreground">
                  Count date <span className="text-destructive">*</span>
                </label>
                <Input
                  type="date"
                  value={formDate}
                  onChange={(e) => setFormDate(e.target.value)}
                  className="h-9 text-xs font-mono"
                  required
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-foreground">
                  Location contains
                </label>
                <Input
                  placeholder="Optional, e.g. 3F"
                  value={formLocation}
                  onChange={(e) => setFormLocation(e.target.value)}
                  className="h-9 text-xs"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-foreground">
                  Counting method
                </label>
                <SearchableSelect
                  options={[
                    { label: "RFID reader", value: "RFID reader" },
                    { label: "Manual checklist", value: "Manual checklist" },
                  ]}
                  value={formMethod}
                  onChange={(val) =>
                    setFormMethod(val as "RFID reader" | "Manual checklist")
                  }
                  placeholder="Select counting method"
                  searchPlaceholder="Search method..."
                />
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  You can switch at any time during the count
                </p>
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-semibold text-foreground block">
                Departments in scope (none = all)
              </label>
              <div className="flex flex-wrap items-center gap-3 text-xs">
                {DEFAULT_DEPARTMENTS.map((d) => (
                  <label
                    key={d.department_id}
                    className="flex items-center gap-1.5 cursor-pointer text-muted-foreground hover:text-foreground select-none"
                  >
                    <input
                      type="checkbox"
                      checked={selectedDepts.includes(d.department_id)}
                      onChange={() => toggleDept(d.department_id)}
                      className="rounded border-muted-foreground/30 text-blue-600 focus:ring-blue-500 h-3.5 w-3.5"
                    />
                    <span>{d.department_name}</span>
                  </label>
                ))}
              </div>
            </div>

            <div className="flex items-center gap-2 pt-2">
              <Button
                type="submit"
                disabled={creating}
                className="bg-emerald-800 hover:bg-emerald-900 text-white text-xs h-8 px-4 font-medium"
              >
                {creating && (
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                )}
                Start count
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsNewOpen(false)}
                className="text-xs h-8 px-3"
              >
                Cancel
              </Button>
            </div>
          </form>
        </div>
      )}

      {/* KPI Cards Row (Image 1 & 2) */}
      <PhysicalCountKPICards data={data} />

      {/* Count Sessions Table (Image 1 & 2) */}
      <PhysicalCountTable data={data} />
    </div>
  );
}
