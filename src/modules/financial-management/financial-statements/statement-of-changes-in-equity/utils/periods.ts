import { SCEViewBy } from "../types";

export interface PeriodDateRange {
  startDate: string; // YYYY-MM-DD
  endDate: string;   // YYYY-MM-DD
  daysCount: number;
  label: string;
  isToDate: boolean;
}

export function getDaysCount(startDateStr: string, endDateStr: string): number {
  const start = new Date(startDateStr);
  const end = new Date(endDateStr);
  const diffTime = Math.abs(end.getTime() - start.getTime());
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
}

export function computeDateRange(viewBy: SCEViewBy, baseDateStr: string): PeriodDateRange {
  const d = new Date(baseDateStr);
  const year = d.getFullYear();
  const month = d.getMonth(); // 0-indexed

  if (viewBy === "Monthly") {
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);

    const startStr = firstDay.toISOString().split("T")[0];
    const endStr = lastDay.toISOString().split("T")[0];
    const monthName = firstDay.toLocaleString("en-US", { month: "long" });

    return {
      startDate: startStr,
      endDate: endStr,
      daysCount: getDaysCount(startStr, endStr),
      label: `${monthName} ${year}`,
      isToDate: false,
    };
  }

  if (viewBy === "Quarterly") {
    const quarter = Math.floor(month / 3) + 1; // 1, 2, 3, 4
    const startMonth = (quarter - 1) * 3;
    const firstDay = new Date(year, startMonth, 1);
    const lastDay = new Date(year, startMonth + 3, 0);

    const startStr = firstDay.toISOString().split("T")[0];
    const endStr = lastDay.toISOString().split("T")[0];

    return {
      startDate: startStr,
      endDate: endStr,
      daysCount: getDaysCount(startStr, endStr),
      label: `Q${quarter} ${year}`,
      isToDate: quarter === 4 && year === 2026,
    };
  }

  // Annually
  const startStr = `${year}-01-01`;
  const endStr = `${year}-12-31`;

  return {
    startDate: startStr,
    endDate: endStr,
    daysCount: getDaysCount(startStr, endStr),
    label: `FY ${year}`,
    isToDate: year === 2026,
  };
}

export function stepPeriod(
  viewBy: SCEViewBy,
  currentDateStr: string,
  direction: "prev" | "next"
): string {
  const d = new Date(currentDateStr);
  const delta = direction === "next" ? 1 : -1;

  if (viewBy === "Monthly") {
    d.setMonth(d.getMonth() + delta);
  } else if (viewBy === "Quarterly") {
    d.setMonth(d.getMonth() + delta * 3);
  } else {
    d.setFullYear(d.getFullYear() + delta);
  }

  // Prevent going before 2024
  if (d.getFullYear() < 2024) {
    return "2024-01-31";
  }

  // Cap at latest posted: Oct 31, 2026
  if (d.getFullYear() > 2026 || (d.getFullYear() === 2026 && d.getMonth() > 9)) {
    return "2026-10-31";
  }

  return d.toISOString().split("T")[0];
}

export function getComparisonDateRange(
  startDateStr: string,
  endDateStr: string,
  mode: "previous_period" | "same_period_last_year"
): { startDate: string; endDate: string } {
  const start = new Date(startDateStr);
  const end = new Date(endDateStr);

  if (mode === "same_period_last_year") {
    start.setFullYear(start.getFullYear() - 1);
    end.setFullYear(end.getFullYear() - 1);
    return {
      startDate: start.toISOString().split("T")[0],
      endDate: end.toISOString().split("T")[0],
    };
  }

  // Previous period: shift back by same duration
  const days = getDaysCount(startDateStr, endDateStr);
  const prevEnd = new Date(start);
  prevEnd.setDate(prevEnd.getDate() - 1);
  const prevStart = new Date(prevEnd);
  prevStart.setDate(prevStart.getDate() - days + 1);

  return {
    startDate: prevStart.toISOString().split("T")[0],
    endDate: prevEnd.toISOString().split("T")[0],
  };
}
