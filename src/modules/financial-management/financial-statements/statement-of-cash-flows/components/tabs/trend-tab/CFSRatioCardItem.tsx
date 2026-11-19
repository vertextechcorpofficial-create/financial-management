"use client";

import React from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowUp, ArrowDown } from "lucide-react";

interface RatioCardProps {
  title: string;
  value: string;
  changeValue: string;
  changeDirection: "up" | "down";
  changeIsPositiveForBusiness: boolean;
  comparisonPeriod: string;
  status: "Strong" | "Watch" | "Weak";
  sparklinePoints: number[];
  dateStart: string;
  dateEnd: string;
  mainMeaning: string;
  formula: string;
}

export function CFSRatioCardItem({
  title,
  value,
  changeValue,
  changeDirection,
  changeIsPositiveForBusiness,
  comparisonPeriod,
  status,
  sparklinePoints,
  dateStart,
  dateEnd,
  mainMeaning,
  formula,
}: RatioCardProps) {
  // SVG Sparkline calculation
  const min = Math.min(...sparklinePoints);
  const max = Math.max(...sparklinePoints);
  const range = max - min || 1;
  const width = 280;
  const height = 48;

  const points = sparklinePoints
    .map((pt, i) => {
      const x = (i / (sparklinePoints.length - 1)) * width;
      const y = height - ((pt - min) / range) * (height - 12) - 6;
      return `${x},${y}`;
    })
    .join(" ");

  const lastPoint = sparklinePoints[sparklinePoints.length - 1];
  const lastX = width;
  const lastY = height - ((lastPoint - min) / range) * (height - 12) - 6;

  return (
    <Card className="rounded-xl border border-border/80 bg-card p-5 shadow-sm flex flex-col justify-between hover:border-primary/40 transition-colors">
      <div>
        {/* Top Title & Status Badge */}
        <div className="flex items-center justify-between pb-1">
          <span className="text-xs font-bold text-foreground">{title}</span>
          <Badge
            variant="outline"
            className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
              status === "Strong"
                ? "text-emerald-500 border-emerald-500/30 bg-emerald-500/10"
                : status === "Watch"
                ? "text-amber-500 border-amber-500/30 bg-amber-500/10"
                : "text-rose-500 border-rose-500/30 bg-rose-500/10"
            }`}
          >
            {status === "Strong" ? "✓ Strong" : status === "Watch" ? "! Watch" : "✕ Weak"}
          </Badge>
        </div>

        {/* Big Metric Value */}
        <div className="mt-1 text-2xl font-black tracking-tight text-foreground">
          {value}
        </div>

        {/* Delta Line vs. Comparison */}
        <div className="mt-1 flex items-center gap-1 text-xs">
          <span
            className={`inline-flex items-center font-bold ${
              changeIsPositiveForBusiness ? "text-emerald-500" : "text-amber-500"
            }`}
          >
            {changeDirection === "up" ? (
              <span className="mr-0.5">▲</span>
            ) : (
              <span className="mr-0.5">▼</span>
            )}
            {changeValue}
          </span>
          <span className="text-muted-foreground">{comparisonPeriod}</span>
        </div>

        {/* Sparkline Wave */}
        <div className="mt-3 relative h-12 w-full">
          <svg
            viewBox={`0 0 ${width} ${height}`}
            className="w-full h-full overflow-visible"
            preserveAspectRatio="none"
          >
            <polyline
              fill="none"
              stroke="#38bdf8"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              points={points}
            />
            {/* End Point Glow */}
            <circle cx={lastX} cy={lastY} r="3.5" fill="#38bdf8" />
          </svg>
        </div>

        {/* Sparkline Axis Dates */}
        <div className="flex justify-between text-[10px] text-muted-foreground mt-0.5">
          <span>{dateStart}</span>
          <span>{dateEnd}</span>
        </div>
      </div>

      {/* Meaning & Formula Footer */}
      <div className="mt-4 pt-3 border-t border-muted/70">
        <div className="text-xs font-bold text-foreground">{mainMeaning}</div>
        <div className="text-[11px] text-muted-foreground mt-0.5 leading-tight">
          {formula}
        </div>
      </div>
    </Card>
  );
}
