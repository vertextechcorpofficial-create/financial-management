"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatNumber } from "@/lib/utils";

import { useSettings } from "../hooks/useSettings";
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
            posting is locked.
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
          {settings.error}
        </Notice>
      ) : null}

      {!settings.isLoading && settings.accounts.filter((row) => row.isActive).length === 0 ? (
        <Notice tone="warning" title="No payment account is active.">
          No payment can be recorded until one is. Add it on Payment accounts.
        </Notice>
      ) : null}

      {settings.currentLock ? (
        <Notice tone="info" title={`Locked through ${settings.currentLock.lockedThrough}.`}>
          Posting dated on or before that day is refused.
        </Notice>
      ) : null}

      <Tabs value={tab} onValueChange={setTab} className="space-y-4">
        <TabsList>
          {TABS.map((entry) => (
            <TabsTrigger key={entry.value} value={entry.value} className="min-h-11 md:min-h-0">
              {entry.label}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="accounts">
          <AccountsTab
            accounts={settings.accounts}
            chartAccounts={settings.chartAccounts}
            isSaving={settings.isSaving}
            onAdd={settings.addAccount}
            onEdit={settings.editAccount}
          />
        </TabsContent>

        <TabsContent value="holidays">
          <HolidaysTab
            holidays={settings.holidays}
            isSaving={settings.isSaving}
            onAdd={settings.addHoliday}
            onEdit={settings.editHoliday}
            onDelete={settings.removeHoliday}
          />
        </TabsContent>

        <TabsContent value="gl">
          <MappingsTab
            mappings={settings.mappings}
            chartAccounts={settings.chartAccounts}
            isSaving={settings.isSaving}
            onChange={settings.mapKey}
          />
        </TabsContent>

        <TabsContent value="periods">
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
    </div>
  );
}
