"use client";


import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

import { AgingTab } from "./AgingTab";
import { Notice } from "./Notice";
import { ScheduleTab } from "./ScheduleTab";
import { useSchedules } from "../hooks/useSchedules";

export function SchedulesModule() {
  const schedules = useSchedules();

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold">Loan Schedules</h1>
        <p className="text-xs text-muted-foreground">
          Every installment of every borrowing, what has been paid on it, and how much principal falls due inside the
          year.
        </p>
      </div>

      {schedules.error ? (
        <Notice tone="danger" title="The schedule could not be read.">
          {schedules.error}
        </Notice>
      ) : null}

      <Tabs defaultValue="schedule" className="space-y-4">
        <TabsList>
          <TabsTrigger value="schedule" className="min-h-11 md:min-h-0">
            Loan schedule
          </TabsTrigger>
          <TabsTrigger value="aging" className="min-h-11 md:min-h-0">
            Aging &amp; current portion
          </TabsTrigger>
        </TabsList>

        <TabsContent value="schedule">
          <ScheduleTab schedules={schedules} />
        </TabsContent>

        <TabsContent value="aging">
          <AgingTab schedules={schedules} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
