"use client";

import React from "react";
import { Search, Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { useEmployeeClearance } from "./hooks/useEmployeeClearance";
import EmployeeClearanceKPICards from "./components/EmployeeClearanceKPICards";
import EmployeeClearanceTable from "./components/EmployeeClearanceTable";

export default function EmployeeClearanceModule() {
  const {
    data,
    filteredEmployees,
    isLoading,
    error,
    searchQuery,
    setSearchQuery,
  } = useEmployeeClearance();

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center p-20 space-y-3">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="text-xs text-muted-foreground">Loading employee clearance status...</p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="p-8 text-center space-y-4">
        <div className="p-4 rounded-xl bg-destructive/10 text-destructive border border-destructive/20 inline-block max-w-md">
          <p className="font-semibold text-sm">{error || "Failed to load employee clearance."}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 md:p-8 space-y-6 max-w-[1400px] mx-auto min-h-screen">
      {/* Title & Description */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-foreground">
          Employee clearance
        </h1>
        <p className="text-xs text-muted-foreground mt-1">
          Before an employee leaves, every asset they hold must be returned, reassigned, or reported lost.
        </p>
      </div>

      {/* Top 4 KPI Metric Cards */}
      <EmployeeClearanceKPICards kpis={data.kpis} />

      {/* Search Toolbar */}
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search employee, department, or status..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-9 h-9 text-xs bg-background"
        />
      </div>

      {/* Main Table */}
      <EmployeeClearanceTable employees={filteredEmployees} />
    </div>
  );
}
