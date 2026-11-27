"use client";

import { Calendar, Users } from "lucide-react";

import { Panel, SampleBadge } from "./BoardKit";
import { useErpEndpoint } from "./useErpEndpoint";

interface HolidaysPayload {
  sample?: boolean;
  holidays?: Array<{ date: string; name: string; type: string }>;
}

interface PositionsPayload {
  sample?: boolean;
  positions?: Array<{ positionCode: string; title: string; isVacant?: boolean }>;
}

export function ErpSlaContextStrip({ period }: { period: string }) {
  const year = period.slice(0, 4);
  const holidays = useErpEndpoint<HolidaysPayload>("calendar/holidays", { year, country: "PH" });
  const positions = useErpEndpoint<PositionsPayload>("org/positions");

  if (!holidays.available && !positions.available) return null;
  if (holidays.loading && positions.loading) return null;

  const upcomingHolidays = (holidays.data?.holidays ?? []).filter((h) => h.date >= `${period}-01`).slice(0, 3);
  const vacantCount = (positions.data?.positions ?? []).filter((p) => p.isVacant).length;
  const totalPositions = positions.data?.positions?.length ?? 0;

  return (
    <Panel className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5 text-xs">
      <div className="flex flex-wrap items-center gap-4">
        <span className="inline-flex items-center gap-1.5 text-muted-foreground">
          <Calendar className="h-3.5 w-3.5 text-teal-700 dark:text-teal-400" aria-hidden />
          <strong className="font-medium text-foreground">SLA Calendar ({year}):</strong>{" "}
          {upcomingHolidays.length > 0
            ? upcomingHolidays.map((h) => `${h.date} ${h.name}`).join(" · ")
            : `${holidays.data?.holidays?.length ?? 0} non-working days loaded`}
        </span>
        {totalPositions > 0 ? (
          <span className="inline-flex items-center gap-1.5 text-muted-foreground">
            <Users className="h-3.5 w-3.5 text-teal-700 dark:text-teal-400" aria-hidden />
            <strong className="font-medium text-foreground">HR Positions:</strong>{" "}
            {totalPositions - vacantCount}/{totalPositions} filled
            {vacantCount > 0 ? ` (${vacantCount} GM fallback)` : ""}
          </span>
        ) : null}
      </div>
      {holidays.sample || positions.sample ? <SampleBadge /> : null}
    </Panel>
  );
}
