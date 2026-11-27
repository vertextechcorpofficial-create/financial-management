import React from "react";
import type { EmployeeClearanceKPIs } from "../types";

interface EmployeeClearanceKPICardsProps {
  kpis: EmployeeClearanceKPIs;
}

export default function EmployeeClearanceKPICards({ kpis }: EmployeeClearanceKPICardsProps) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      {/* 1. EMPLOYEES */}
      <div className="bg-card border rounded-xl p-4 shadow-2xs space-y-1">
        <span className="text-[10px] font-bold tracking-wider text-muted-foreground uppercase block">
          EMPLOYEES
        </span>
        <div className="text-xl sm:text-2xl font-bold font-mono tracking-tight text-foreground">
          {kpis.totalEmployees}
        </div>
      </div>

      {/* 2. IN CLEARANCE - Soft yellow/tan border highlighting active clearance */}
      <div className="bg-[#fef9ee]/70 border border-[#fef08a] rounded-xl p-4 shadow-2xs space-y-1">
        <span className="text-[10px] font-bold tracking-wider text-[#854d0e] uppercase block">
          IN CLEARANCE
        </span>
        <div className="text-xl sm:text-2xl font-bold font-mono tracking-tight text-[#854d0e]">
          {kpis.inClearanceCount}
        </div>
      </div>

      {/* 3. CLEARED */}
      <div className="bg-card border rounded-xl p-4 shadow-2xs space-y-1">
        <span className="text-[10px] font-bold tracking-wider text-muted-foreground uppercase block">
          CLEARED
        </span>
        <div className="text-xl sm:text-2xl font-bold font-mono tracking-tight text-foreground">
          {kpis.clearedCount}
        </div>
      </div>

      {/* 4. ASSETS WITH PEOPLE */}
      <div className="bg-card border rounded-xl p-4 shadow-2xs space-y-1">
        <span className="text-[10px] font-bold tracking-wider text-muted-foreground uppercase block">
          ASSETS WITH PEOPLE
        </span>
        <div className="text-xl sm:text-2xl font-bold font-mono tracking-tight text-foreground">
          {kpis.assetsWithPeople}
        </div>
      </div>
    </div>
  );
}
