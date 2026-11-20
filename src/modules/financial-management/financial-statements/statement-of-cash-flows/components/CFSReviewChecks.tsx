"use client";

import React, { useState } from "react";
import { useCashFlowStudio } from "../providers/CashFlowStudioProvider";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Badge } from "@/components/ui/badge";
import { ChevronDown, CheckCircle2, AlertTriangle, XCircle } from "lucide-react";

export function CFSReviewChecks() {
  const { data } = useCashFlowStudio();
  const [isOpen, setIsOpen] = useState(false);

  const checks = data.reviewChecks;
  const passedCount = checks.filter((c) => c.status === "pass").length;
  const failedCount = checks.filter((c) => c.status === "fail").length;
  const warningCount = checks.filter((c) => c.status === "warning").length;

  return (
    <Collapsible
      open={isOpen}
      onOpenChange={setIsOpen}
      className="rounded-lg border border-border/80 bg-card overflow-hidden"
    >
      <CollapsibleTrigger className="flex w-full items-center justify-between p-3.5 text-left hover:bg-muted/30 transition-colors">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            REVIEW CHECKS
          </span>
          <ChevronDown
            className={`h-4 w-4 text-muted-foreground transition-transform duration-200 ${
              isOpen ? "rotate-180" : ""
            }`}
          />
        </div>

        <div className="flex items-center gap-2">
          {failedCount > 0 ? (
            <Badge variant="destructive" className="text-xs font-medium gap-1">
              <XCircle className="h-3.5 w-3.5" />
              {failedCount} failed
            </Badge>
          ) : warningCount > 0 ? (
            <Badge variant="outline" className="text-xs font-medium gap-1 text-amber-500 border-amber-500/30 bg-amber-500/10">
              <AlertTriangle className="h-3.5 w-3.5" />
              {warningCount} warning
            </Badge>
          ) : (
            <Badge variant="outline" className="text-xs font-medium gap-1 text-emerald-500 border-emerald-500/30 bg-emerald-500/10">
              <CheckCircle2 className="h-3.5 w-3.5" />
              {passedCount} passed
            </Badge>
          )}
        </div>
      </CollapsibleTrigger>

      <CollapsibleContent className="border-t border-border/60 bg-muted/10 p-3">
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {checks.map((chk) => (
            <div
              key={chk.id}
              className="flex items-start gap-2.5 rounded-md border border-border/40 bg-card p-2.5 text-xs"
            >
              {chk.status === "pass" ? (
                <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500 mt-0.5" />
              ) : chk.status === "warning" ? (
                <AlertTriangle className="h-4 w-4 shrink-0 text-amber-500 mt-0.5" />
              ) : (
                <XCircle className="h-4 w-4 shrink-0 text-rose-500 mt-0.5" />
              )}
              <div className="flex flex-col">
                <span className="font-semibold text-foreground">{chk.name}</span>
                <span className="text-muted-foreground">{chk.message || chk.description}</span>
              </div>
            </div>
          ))}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
