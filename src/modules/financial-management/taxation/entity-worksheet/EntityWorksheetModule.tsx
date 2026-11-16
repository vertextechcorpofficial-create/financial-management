"use client";

import { AlertTriangle, RefreshCw } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

import { BasisComparison } from "./components/BasisComparison";
import { DeductionBreakdown } from "./components/DeductionBreakdown";
import { OptionCombobox } from "./components/OptionCombobox";
import { ProfileCard } from "./components/ProfileCard";
import { WorksheetTable } from "./components/WorksheetTable";
import { CarryoverLotsPanel } from "./components/CarryoverLotsPanel";
import { useWorksheet } from "./hooks/useWorksheet";
import { REGIME_LABELS, TAX_YEARS } from "./constants";
import type { EntityProfile } from "./types";

/** Reasons arrive as clauses ("refused the connection"), so they need a full stop before the next sentence. */
function terminated(reason: string) {
  const trimmed = reason.trim();
  return /[.!?]$/.test(trimmed) ? trimmed : `${trimmed}.`;
}

/** Profile facts a person has stated, i.e. moved off the default. */
function statedFields(profile: EntityProfile): number {
  return [
    profile.withholdingAgent,
    profile.hasTopWithholdingStatus,
    profile.vatRegistered,
    profile.ownsRealProperty,
    profile.assetsExcludingLand > 0,
    profile.taxAgentFeeRate > 0,
    profile.priorYearExcessCredit > 0,
    profile.efpsGroup !== "NONE",
    Boolean(profile.notes?.trim()),
  ].filter(Boolean).length;
}

/** Entity worksheet − one company, one tax year, 1702Q basis. */
export function EntityWorksheetModule() {
  const worksheet = useWorksheet(new Date().getFullYear());
  const { snapshot, isLoading, isSaving, error, companies, companyOptions } = worksheet;

  const current = snapshot?.company ?? companies.find((company) => company.companyId === worksheet.companyId);

  /**
   * The hook keeps the previous payload while the next one loads, which is right for a refresh
   * and wrong for a different company or year: Men2's worksheet under RC2's name is a lie.
   */
  const stale =
    snapshot != null &&
    (snapshot.company.companyId !== worksheet.companyId || snapshot.profile.taxYear !== worksheet.year);

  // W5: when the fresh read refused, show the last figures that did read, not an empty page.
  const refused = snapshot != null && !snapshot.figuresAvailable && !stale;
  const fallback = refused ? worksheet.lastGood : null;
  const view = fallback ? fallback.snapshot : snapshot;

  return (
    <div className="mx-auto w-full max-w-[1600px] space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold sm:text-2xl">Entity Worksheet</h1>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
            Quarterly 1702Q income tax built from one company&apos;s own ledgers − estimates for review, not filings.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="w-[280px] max-w-full">
            <OptionCombobox
              options={companyOptions}
              value={worksheet.companyId ? String(worksheet.companyId) : ""}
              onChange={(value) => value && worksheet.selectCompany(Number(value))}
              placeholder="Choose a company"
              searchPlaceholder="Search companies…"
              emptyLabel={
                // An empty list is usually a failed mount read, not an empty search: the company
                // register is the first thing the page fetches, and a source that times out
                // leaves the picker with nothing while the alert below explains why.
                isLoading ? "Loading companies…" : error ? "Companies could not be read." : "No company matches."
              }
              aria-label="Company"
            />
          </div>

          <Select value={String(worksheet.year)} onValueChange={(value) => worksheet.selectYear(Number(value))}>
            <SelectTrigger className="w-[120px]" aria-label="Tax year">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="max-h-60">
              {TAX_YEARS.map((year) => (
                <SelectItem key={year} value={String(year)}>
                  {year}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Button
            type="button"
            variant="outline"
            onClick={() => void worksheet.refetch()}
            disabled={isLoading || !worksheet.companyId}
          >
            <RefreshCw className={isLoading ? "mr-2 h-4 w-4 animate-spin" : "mr-2 h-4 w-4"} />
            Refresh
          </Button>
        </div>
      </div>

      {error ? (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Could not build the worksheet</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      {!error && current && !current.reachable ? (
        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>{current.code} is not reachable</AlertTitle>
          <AlertDescription>
            {terminated(current.unreachableReason ?? "No answer from its Directus endpoint")} Figures are not
            shown until the endpoint answers.
          </AlertDescription>
        </Alert>
      ) : null}

      {refused ? (
        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>
            {fallback
              ? `Showing the figures read at ${new Date(fallback.at).toLocaleTimeString("en-PH", { hour: "2-digit", minute: "2-digit" })}`
              : `No figures for ${current?.name ?? "this company"} in ${worksheet.year}`}
          </AlertTitle>
          <AlertDescription className="flex flex-wrap items-center justify-between gap-3">
            <span>
              The {snapshot?.failedSources.join(" and ")} could not be read just now, so the worksheet is unknown rather
              than zero.
              {fallback ? " The last readable figures stay on screen until the source answers." : " Nothing is shown until the source answers."}
            </span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void worksheet.refetch()}
              disabled={isLoading}
              className="shrink-0"
            >
              <RefreshCw className={isLoading ? "mr-2 h-3.5 w-3.5 animate-spin" : "mr-2 h-3.5 w-3.5"} />
              Retry
            </Button>
          </AlertDescription>
        </Alert>
      ) : null}

      {stale ? (
        <div className="space-y-4">
          <Skeleton className="h-20 w-full rounded-2xl" />
          <Skeleton className="h-96 w-full rounded-2xl" />
        </div>
      ) : null}

      {isLoading && !snapshot ? (
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Reading the company&apos;s registers. A first read walks its sales, purchases, expenses and disbursements, so
            it can take a minute; a rebuild within ten minutes comes from the cache.
          </p>
          <Skeleton className="h-20 w-full rounded-2xl" />
          <Skeleton className="h-96 w-full rounded-2xl" />
        </div>
      ) : null}

      {!isLoading && !snapshot && !error ? (
        <p className="rounded-2xl border border-dashed border-border/60 bg-card px-4 py-10 text-center text-sm text-muted-foreground">
          Choose a company to build its worksheet.
        </p>
      ) : null}

      {view && !stale && !error && view.company.reachable && view.figuresAvailable ? (
        <>
          <Tabs defaultValue="worksheet" className="space-y-4">
            <div className="-mx-1 flex items-center gap-3 overflow-x-auto px-1">
              <TabsList>
                <TabsTrigger value="worksheet" className="min-h-11 md:min-h-0">
                  Worksheet
                </TabsTrigger>
                <TabsTrigger value="profile" className="min-h-11 md:min-h-0">
                  Company profile ({statedFields(view.profile)} fields set)
                </TabsTrigger>
                {view.notices.length > 0 ? (
                  <TabsTrigger value="notices" className="min-h-11 md:min-h-0">
                    Notices ({view.notices.length})
                  </TabsTrigger>
                ) : null}
              </TabsList>
              <Badge variant="outline" className="shrink-0 text-[11px] font-medium">
                {REGIME_LABELS[view.profile.regime]}
              </Badge>
            </div>

            <TabsContent value="worksheet" className="space-y-4">
              <WorksheetTable
                lines={view.lines}
                total={view.lines.length}
                basisLabel={view.computation.scenarios[0]?.label ?? "product standard cost"}
              />
              <CarryoverLotsPanel
                panel={view.carryovers}
                companyId={view.company.companyId}
                taxYear={view.profile.taxYear}
                isSaving={isSaving}
                onRecord={worksheet.saveCarryoverLot}
                onUpdateUsed={worksheet.saveCarryoverUsed}
                onUpdateOpenings={worksheet.updateOpenings}
              />
              <BasisComparison scenarios={view.computation.scenarios} year={view.profile.taxYear} />
              <DeductionBreakdown breakdown={view.expenseBreakdown} year={view.profile.taxYear} />
            </TabsContent>

            <TabsContent value="profile">
              <ProfileCard
                key={`${view.company.companyId}-${view.profile.taxYear}-${worksheet.profileRev}`}
                profile={view.profile}
                isSaving={isSaving}
                onSave={worksheet.saveProfile}
              />
            </TabsContent>

            {view.notices.length > 0 ? (
              <TabsContent value="notices">
                <Alert className="rounded-2xl border-border/50 bg-card shadow-sm">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertTitle>What this worksheet cannot see</AlertTitle>
                  <AlertDescription>
                    <ul className="list-disc space-y-1 pl-4">
                      {view.notices.map((notice) => (
                        <li key={notice} className="break-words">
                          {notice}
                        </li>
                      ))}
                    </ul>
                  </AlertDescription>
                </Alert>
              </TabsContent>
            ) : null}
          </Tabs>
        </>
      ) : null}
    </div>
  );
}


