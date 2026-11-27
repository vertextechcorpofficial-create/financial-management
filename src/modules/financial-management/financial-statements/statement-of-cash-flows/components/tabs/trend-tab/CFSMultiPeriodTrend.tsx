"use client";

import React from "react";
import { formatPHP } from "../../../utils/cfs-format";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface MonthlyRow {
  month: string;
  operating: number;
  investing: number;
  financing: number;
  netChange: number;
  closing: number;
  isSelected?: boolean;
}

export function CFSMultiPeriodTrend() {
  // 20 monthly rows matching design
  const monthlyData: MonthlyRow[] = [
    {
      month: "Sep 2026",
      operating: 828000,
      investing: -286000,
      financing: 396000,
      netChange: 938000,
      closing: 8891000,
      isSelected: true,
    },
    {
      month: "Aug 2026",
      operating: 604000,
      investing: -349000,
      financing: 496000,
      netChange: 751000,
      closing: 7946000,
    },
    {
      month: "Jul 2026",
      operating: 615000,
      investing: -277000,
      financing: 368000,
      netChange: 706000,
      closing: 7189000,
    },
    {
      month: "Jun 2026",
      operating: 279000,
      investing: -531000,
      financing: -347000,
      netChange: -599000,
      closing: 6478000,
    },
    {
      month: "May 2026",
      operating: 377000,
      investing: -618000,
      financing: -384000,
      netChange: -625000,
      closing: 7074000,
    },
    {
      month: "Apr 2026",
      operating: 332000,
      investing: -561000,
      financing: -364000,
      netChange: -593000,
      closing: 7696000,
    },
    {
      month: "Mar 2026",
      operating: 280000,
      investing: -422000,
      financing: 324000,
      netChange: 182000,
      closing: 8286000,
    },
    {
      month: "Feb 2026",
      operating: 420000,
      investing: -430000,
      financing: 319000,
      netChange: 309000,
      closing: 8107000,
    },
    {
      month: "Jan 2026",
      operating: 393000,
      investing: -349000,
      financing: 198000,
      netChange: 242000,
      closing: 7803000,
    },
    {
      month: "Dec 2025",
      operating: 1043000,
      investing: -707000,
      financing: -228000,
      netChange: 108000,
      closing: 7565000,
    },
    {
      month: "Nov 2025",
      operating: 879000,
      investing: -611000,
      financing: -195000,
      netChange: 73000,
      closing: 7457000,
    },
    {
      month: "Oct 2025",
      operating: 916000,
      investing: -676000,
      financing: -203000,
      netChange: 37000,
      closing: 7385000,
    },
    {
      month: "Sep 2025",
      operating: 602000,
      investing: -487000,
      financing: 550000,
      netChange: 665000,
      closing: 7348000,
    },
    {
      month: "Aug 2025",
      operating: 290000,
      investing: -409000,
      financing: 454000,
      netChange: 335000,
      closing: 6677000,
    },
    {
      month: "Jul 2025",
      operating: 530000,
      investing: -462000,
      financing: 536000,
      netChange: 604000,
      closing: 6337000,
    },
    {
      month: "Jun 2025",
      operating: 156000,
      investing: -585000,
      financing: -357000,
      netChange: -786000,
      closing: 5727000,
    },
    {
      month: "May 2025",
      operating: 142000,
      investing: -557000,
      financing: -400000,
      netChange: -815000,
      closing: 6517000,
    },
    {
      month: "Apr 2025",
      operating: 82000,
      investing: -528000,
      financing: -322000,
      netChange: -768000,
      closing: 7335000,
    },
    {
      month: "Mar 2025",
      operating: 539000,
      investing: -448000,
      financing: 328000,
      netChange: 419000,
      closing: 8105000,
    },
    {
      month: "Feb 2025",
      operating: 756000,
      investing: -483000,
      financing: 378000,
      netChange: 651000,
      closing: 7682000,
    },
  ];

  // SVG Chart Dimensions
  const chartWidth = 900;
  const chartHeight = 220;
  const chartPaddingTop = 20;
  const chartPaddingBottom = 30;

  // Chart range: -500K to 1M
  const minVal = -500000;
  const maxVal = 1000000;
  const range = maxVal - minVal;

  const getY = (val: number) => {
    const usableH = chartHeight - chartPaddingTop - chartPaddingBottom;
    return chartHeight - chartPaddingBottom - ((val - minVal) / range) * usableH;
  };

  const getX = (idx: number, total: number) => {
    return 60 + (idx / (total - 1)) * (chartWidth - 100);
  };

  // Reverse chronological array for left-to-right time series (Feb 2025 -> Sep 2026)
  const timeSeries = [...monthlyData].reverse();

  const operatingPoints = timeSeries.map((d, i) => `${getX(i, timeSeries.length)},${getY(d.operating)}`).join(" ");
  const investingPoints = timeSeries.map((d, i) => `${getX(i, timeSeries.length)},${getY(d.investing)}`).join(" ");
  const financingPoints = timeSeries.map((d, i) => `${getX(i, timeSeries.length)},${getY(d.financing)}`).join(" ");

  const latestIdx = timeSeries.length - 1;
  const latestX = getX(latestIdx, timeSeries.length);

  return (
    <div className="rounded-xl border border-border/80 bg-card p-6 shadow-sm overflow-hidden">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between pb-3 border-b border-muted">
        <div>
          <h3 className="text-sm font-bold text-foreground">Monthly cash flow trend</h3>
        </div>
        <div className="text-xs text-muted-foreground">
          STC Group (consolidated) · Oct 2024 – Sep 2026
        </div>
      </div>

      {/* SVG Multi-Line Chart with Shaded Selected Area */}
      <div className="relative mt-4 w-full overflow-x-auto">
        <svg
          viewBox={`0 0 ${chartWidth} ${chartHeight}`}
          className="w-full min-w-[700px] h-[220px] select-none"
        >
          {/* Shaded Area for selected period (Sep 2026) */}
          <rect
            x={latestX - 24}
            y={chartPaddingTop}
            width={38}
            height={chartHeight - chartPaddingTop - chartPaddingBottom}
            fill="#38bdf8"
            fillOpacity="0.08"
            rx="4"
          />

          {/* Grid lines: 1M, 500K, 0, -500K */}
          {[1000000, 500000, 0, -500000].map((level) => {
            const y = getY(level);
            return (
              <g key={level}>
                <line
                  x1={50}
                  y1={y}
                  x2={chartWidth - 20}
                  y2={y}
                  stroke="#3f3f46"
                  strokeDasharray={level === 0 ? "none" : "3,3"}
                  strokeWidth={level === 0 ? "1.5" : "1"}
                  strokeOpacity={level === 0 ? "0.6" : "0.3"}
                />
                <text
                  x={45}
                  y={y + 4}
                  fill="#a1a1aa"
                  fontSize="10"
                  textAnchor="end"
                  fontFamily="monospace"
                >
                  {level === 1000000
                    ? "₱1.00M"
                    : level === 500000
                    ? "₱500.0K"
                    : level === 0
                    ? "₱0"
                    : "−₱500.0K"}
                </text>
              </g>
            );
          })}

          {/* Lines */}
          <polyline
            fill="none"
            stroke="#2563eb"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            points={operatingPoints}
          />
          <polyline
            fill="none"
            stroke="#059669"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            points={investingPoints}
          />
          <polyline
            fill="none"
            stroke="#ea580c"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            points={financingPoints}
          />

          {/* Dots on all series */}
          {timeSeries.map((d, i) => (
            <g key={d.month}>
              <circle cx={getX(i, timeSeries.length)} cy={getY(d.operating)} r="3" fill="#2563eb" />
              <circle cx={getX(i, timeSeries.length)} cy={getY(d.investing)} r="3" fill="#059669" />
              <circle cx={getX(i, timeSeries.length)} cy={getY(d.financing)} r="3" fill="#ea580c" />
            </g>
          ))}

          {/* Right End Callout Pills for the latest selected period */}
          <g>
            {/* Operating */}
            <circle cx={latestX} cy={getY(828000)} r="4.5" fill="#2563eb" />
            <text x={latestX + 10} y={getY(828000) + 4} fill="#60a5fa" fontSize="11" fontWeight="bold">
              ● Operating ₱828.0K
            </text>

            {/* Financing */}
            <circle cx={latestX} cy={getY(396000)} r="4.5" fill="#ea580c" />
            <text x={latestX + 10} y={getY(396000) + 4} fill="#fb923c" fontSize="11" fontWeight="bold">
              ● Financing ₱396.0K
            </text>

            {/* Investing */}
            <circle cx={latestX} cy={getY(-286000)} r="4.5" fill="#059669" />
            <text x={latestX + 10} y={getY(-286000) + 4} fill="#34d399" fontSize="11" fontWeight="bold">
              ● Investing −₱286.0K
            </text>
          </g>

          {/* X Axis Labels */}
          {timeSeries.map((d, i) => {
            if (i % 2 !== 0 && i !== timeSeries.length - 1) return null;
            return (
              <text
                key={d.month}
                x={getX(i, timeSeries.length)}
                y={chartHeight - 8}
                fill="#a1a1aa"
                fontSize="10"
                textAnchor="middle"
              >
                {d.month}
              </text>
            );
          })}
        </svg>
      </div>

      {/* Legend & Note */}
      <div className="flex flex-wrap items-center justify-between gap-3 mt-3 text-xs text-muted-foreground">
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
        </div>

        <span className="italic">
          Ends at the selected period · shaded area = selected range · hover for values
        </span>
      </div>

      {/* Multi-Period Table */}
      <div className="overflow-x-auto mt-6">
        <Table>
          <TableHeader>
            <TableRow className="border-b border-border/80">
              <TableHead className="text-xs font-bold uppercase text-muted-foreground w-[120px]">
                MONTH
              </TableHead>
              <TableHead className="text-right text-xs font-bold uppercase text-muted-foreground">
                OPERATING
              </TableHead>
              <TableHead className="text-right text-xs font-bold uppercase text-muted-foreground">
                INVESTING
              </TableHead>
              <TableHead className="text-right text-xs font-bold uppercase text-muted-foreground">
                FINANCING
              </TableHead>
              <TableHead className="text-right text-xs font-bold uppercase text-muted-foreground">
                NET CHANGE
              </TableHead>
              <TableHead className="text-right text-xs font-bold uppercase text-foreground">
                CLOSING CASH & EQUIVALENTS
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {monthlyData.map((row) => (
              <TableRow
                key={row.month}
                className={`border-b border-border/40 text-xs transition-colors ${
                  row.isSelected ? "bg-primary/10 hover:bg-primary/15 font-semibold" : "hover:bg-muted/20"
                }`}
              >
                <TableCell className="font-medium text-foreground py-2 pl-2">
                  {row.month}
                </TableCell>
                <TableCell className="text-right font-mono py-2">
                  {formatPHP(row.operating)}
                </TableCell>
                <TableCell className="text-right font-mono py-2 text-rose-400">
                  {formatPHP(row.investing)}
                </TableCell>
                <TableCell className="text-right font-mono py-2">
                  {formatPHP(row.financing)}
                </TableCell>
                <TableCell className="text-right font-mono py-2">
                  {formatPHP(row.netChange)}
                </TableCell>
                <TableCell className="text-right font-mono font-bold text-foreground py-2">
                  {formatPHP(row.closing)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
