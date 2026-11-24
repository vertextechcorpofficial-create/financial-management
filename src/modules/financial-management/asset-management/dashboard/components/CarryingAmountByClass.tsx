import React from "react";
import type { ClassCarryingAmount } from "../types";

const formatNumber = (val?: number | null) => {
  if (val === null || val === undefined) return "—";
  return val.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
};

interface CarryingAmountByClassProps {
  data: ClassCarryingAmount[];
}

export default function CarryingAmountByClass({ data }: CarryingAmountByClassProps) {
  return (
    <div className="bg-card border rounded-xl p-5 shadow-2xs space-y-5">
      <h2 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
        Carrying Amount by Class
      </h2>

      <div className="space-y-4">
        {data.map((item, idx) => (
          <div key={idx} className="space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-foreground">{item.className}</span>
              <span className="font-mono text-foreground">{formatNumber(item.carryingAmount)}</span>
            </div>
            {/* Horizontal progress bar matching green tone in image */}
            <div className="h-2 w-full bg-[#e8e4dc] rounded-full overflow-hidden">
              <div
                className="h-full bg-[#1b4332] rounded-full transition-all duration-300"
                style={{ width: `${Math.min(100, Math.max(8, item.percentage))}%` }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
