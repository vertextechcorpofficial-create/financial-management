"use client";

import React, { useState } from "react";
import { useCashFlowStudio } from "../../../providers/CashFlowStudioProvider";
import { Button } from "@/components/ui/button";
import { Copy, Check } from "lucide-react";

export function CFSPolicyNote() {
  const { data } = useCashFlowStudio();
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(data.policyNote);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="rounded-xl border bg-card p-6 shadow-sm overflow-hidden">
      <div className="flex items-center justify-between pb-3 border-b border-muted">
        <h3 className="text-sm font-bold text-foreground">
          Accounting policy note — statement of cash flows
        </h3>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handleCopy}
          className="h-8 text-xs font-medium gap-1.5"
        >
          {copied ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
          {copied ? "Copied!" : "Copy text"}
        </Button>
      </div>

      <div className="mt-4 rounded-lg bg-muted/20 p-4 border border-muted/50 text-xs leading-relaxed text-muted-foreground">
        {data.policyNote}
      </div>
    </div>
  );
}
