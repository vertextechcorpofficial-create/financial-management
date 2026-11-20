"use client";

import React from "react";

interface WaterfallItem {
  key: string;
  label: string;
  category: "Balance" | "Operating" | "Investing" | "Financing" | "FX";
  valueFormatted: string;
  isTotal?: boolean;
  delta?: number;
  barStart: number; // 0 to 1 scale for positioning
  barHeight: number; // height proportion
  isPositive?: boolean;
}

export function CFSWaterfallChart() {
  // Exact values from design:
  // Opening: 7.95M
  // Operating: +828.0K
  // Investing: -286.0K
  // Financing: +396.0K
  // FX: +7.0K
  // Closing: 8.89M
  const maxVal = 10000000; // 10M scale

  const items: WaterfallItem[] = [
    {
      key: "opening",
      label: "Opening",
      category: "Balance",
      valueFormatted: "₱7.95M",
      isTotal: true,
      barStart: 0,
      barHeight: 7950000 / maxVal,
    },
    {
      key: "operating",
      label: "Operating",
      category: "Operating",
      valueFormatted: "+₱828.0K",
      delta: 828000,
      isPositive: true,
      barStart: 7950000 / maxVal,
      barHeight: 828000 / maxVal,
    },
    {
      key: "investing",
      label: "Investing",
      category: "Investing",
      valueFormatted: "−₱286.0K",
      delta: -286000,
      isPositive: false,
      barStart: (7950000 + 828000 - 286000) / maxVal,
      barHeight: 286000 / maxVal,
    },
    {
      key: "financing",
      label: "Financing",
      category: "Financing",
      valueFormatted: "+₱396.0K",
      delta: 396000,
      isPositive: true,
      barStart: (7950000 + 828000 - 286000) / maxVal,
      barHeight: 396000 / maxVal,
    },
    {
      key: "fx",
      label: "FX",
      category: "FX",
      valueFormatted: "+₱7.0K",
      delta: 7000,
      isPositive: true,
      barStart: (7950000 + 828000 - 286000 + 396000) / maxVal,
      barHeight: Math.max(7000 / maxVal, 0.008), // minimal visible sliver
    },
    {
      key: "closing",
      label: "Closing",
      category: "Balance",
      valueFormatted: "₱8.89M",
      isTotal: true,
      barStart: 0,
      barHeight: 8891000 / maxVal,
    },
  ];

  const getColor = (item: WaterfallItem) => {
    switch (item.category) {
      case "Operating":
        return "bg-[#2563eb] border-[#3b82f6]"; // Bright Blue
      case "Investing":
        return "bg-[#059669] border-[#10b981]"; // Emerald Green
      case "Financing":
        return "bg-[#ea580c] border-[#f97316]"; // Orange
      case "FX":
        return "bg-[#94a3b8] border-[#cbd5e1]"; // Slate/FX
      case "Balance":
      default:
        return "bg-[#71717a] border-[#a1a1aa]"; // Gray pillars
    }
  };

  return (
    <div className="rounded-xl border border-border/80 bg-card p-6 shadow-sm">
      <div className="flex items-center justify-between pb-3">
        <h3 className="text-sm font-bold text-foreground">
          Movement in cash & cash equivalents
        </h3>
        <span className="text-xs text-muted-foreground">
          Amounts in Philippine Peso (₱)
        </span>
      </div>

      {/* Waterfall Visualization Area */}
      <div className="relative mt-6 h-64 w-full border-b border-border/60 pb-8 flex items-end justify-between px-2 sm:px-6">
        {/* Subtle Guide Line across closing height */}
        <div
          className="absolute left-0 right-0 border-b border-dashed border-muted-foreground/30 z-0 pointer-events-none"
          style={{ bottom: `${(8891000 / maxVal) * 100 * 0.75 + 32}px` }}
        />

        {items.map((item) => {
          const heightPercent = item.barHeight * 75; // scale to fit nicely in 64 container
          const bottomPercent = item.barStart * 75;

          return (
            <div
              key={item.key}
              className="flex-1 flex flex-col items-center justify-end h-full relative z-10 group"
            >
              {/* Value Pill Above Bar */}
              <div
                className="absolute text-center whitespace-nowrap text-[11px] font-bold text-foreground transition-transform duration-150"
                style={{
                  bottom: `${bottomPercent + heightPercent + 38}px`,
                }}
              >
                {item.valueFormatted}
              </div>

              {/* Bar Element */}
              <div
                className="w-16 sm:w-20 md:w-24 rounded-md transition-all duration-200 shadow-sm border"
                style={{
                  height: `${Math.max(heightPercent, 4)}%`,
                  marginBottom: `${bottomPercent}%`,
                }}
              >
                <div className={`w-full h-full rounded-md ${getColor(item)} opacity-90 group-hover:opacity-100`} />
              </div>

              {/* Column Label */}
              <div className="absolute -bottom-6 text-center text-xs font-medium text-muted-foreground">
                {item.label}
              </div>
            </div>
          );
        })}
      </div>

      {/* Bottom Legend & Guidance */}
      <div className="flex flex-wrap items-center justify-between gap-3 pt-6 text-xs text-muted-foreground">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1.5">
            <span className="h-3 w-3 rounded-sm bg-[#2563eb]" />
            <span>Operating</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="h-3 w-3 rounded-sm bg-[#059669]" />
            <span>Investing</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="h-3 w-3 rounded-sm bg-[#ea580c]" />
            <span>Financing</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="h-3 w-3 rounded-sm bg-[#94a3b8]" />
            <span>FX</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="h-3 w-3 rounded-sm bg-[#71717a]" />
            <span>Balance</span>
          </div>
        </div>

        <span className="italic">Hover a bar for values</span>
      </div>
    </div>
  );
}
