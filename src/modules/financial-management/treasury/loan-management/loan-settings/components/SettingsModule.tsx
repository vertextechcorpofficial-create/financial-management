"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatNumber } from "@/lib/utils";

import { useSettings } from "../hooks/useSettings";
import { phtDisplayStamp } from "../pht";
import { AccountsTab } from "./AccountsTab";
import { HolidaysTab } from "./HolidaysTab";
import { MappingsTab } from "./MappingsTab";
import { Notice } from "./Notice";
import { PeriodsTab } from "./PeriodsTab";

const TABS = [
  { value: "accounts", label: "Payment accounts" },
  { value: "holidays", label: "Holidays" },
  { value: "gl", label: "GL accounts" },
  { value: "periods", label: "Periods and locks" },
] as const;

/** Loan Management settings: the four tables every loan write depends on. */
export function SettingsModule() {
  const settings = useSettings();
  const [tab, setTab] = useState<string>("accounts");
  const unmapped = settings.unmappedKeys.length;

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 space-y-1">
          <h1 className="text-lg font-semibold">Loan Settings</h1>
          <p className="text-sm text-muted-foreground">
            The accounts money moves through, the days the schedule avoids, the GL accounts every posting needs, and how far the
            books are closed.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {unmapped > 0 ? (
            <Button
              type="button"
              variant="outline"
              className="min-h-11 border-destructive/40 text-destructive md:min-h-0"
              onClick={() => setTab("gl")}
              title={`${unmapped} posting account${unmapped === 1 ? " is" : "s are"} not mapped.`}
            >
              {formatNumber(unmapped)} not mapped
            </Button>
          ) : null}
          <Button type="button" variant="outline" className="min-h-11 md:min-h-0" disabled={settings.isLoading} onClick={() => void settings.reload()}>
            Refresh
          </Button>
        </div>
      </div>

      {settings.error ? (
        <Notice tone="danger" title="The settings could not be read.">
          {settings.error} Nothing on this page can be saved while the tables cannot be read: a change would be written blind.
        </Notice>
      ) : null}

      {!settings.isLoading && settings.accounts.filter((row) => row.isActive).length === 0 ? (
        <Notice tone="warning" title="Payments are blocked.">
          No payment account is active, so the Payments screen cannot record anything. Add one on the Payment accounts tab.
        </Notice>
      ) : null}

      {settings.currentLock ? (
        <Notice tone="info" title={`Books closed through ${settings.currentLock.lockedThrough}.`}>
          Anything dated on or before that day is refused: payments, prepayments, restructures, payoffs, reconciliations and loan
          approvals. Reopen the period on the Periods and locks tab to post one.
        </Notice>
      ) : null}

      <Card className="overflow-hidden rounded-2xl p-0">
        <Tabs value={tab} onValueChange={setTab} className="gap-0">
          <div className="border-b border-border px-4 py-3">
            <TabsList className="h-auto flex-wrap gap-1 bg-transparent p-0">
              {TABS.map((entry) => (
                <TabsTrigger
                  key={entry.value}
                  value={entry.value}
                  className="min-h-11 rounded-md px-3 text-sm md:min-h-0"
                >
                  {entry.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </div>

          <TabsContent value="accounts" className="mt-0 p-4">
            <AccountsTab
              accounts={settings.accounts}
              chartAccounts={settings.chartAccounts}
              isSaving={settings.isSaving}
              onAdd={settings.addAccount}
              onEdit={settings.editAccount}
            />
          </TabsContent>

          <TabsContent value="holidays" className="mt-0 p-4">
            <HolidaysTab
              holidays={settings.holidays}
              isSaving={settings.isSaving}
              onAdd={settings.addHoliday}
              onDelete={settings.removeHoliday}
            />
          </TabsContent>

          <TabsContent value="gl" className="mt-0 p-4">
            <MappingsTab
              mappings={settings.mappings}
              chartAccounts={settings.chartAccounts}
              isSaving={settings.isSaving}
              onChange={settings.mapKey}
            />
          </TabsContent>

          <TabsContent value="periods" className="mt-0 p-4">
            <PeriodsTab
              locks={settings.locks}
              currentLock={settings.currentLock}
              values={settings.values}
              isSaving={settings.isSaving}
              onCloseBooks={settings.lockPeriod}
              onReopen={settings.reopenPeriod}
            />
          </TabsContent>
        </Tabs>
      </Card>

      <p className="text-xs text-muted-foreground">
        {settings.isLoading
          ? "Reading the settings…"
          : `Read at ${phtDisplayStamp(new Date().toISOString())} · ${formatNumber(settings.mappings.length)} GL keys · ${formatNumber(settings.holidays.length)} holidays · ${formatNumber(settings.locks.length)} closings recorded.`}
      </p>
    </div>
  );
}
