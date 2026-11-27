"use client";

import { useMemo, useState } from "react";
import { Download, Lock, LockOpen, Loader2 } from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PERIOD_KEYS, PERIOD_LABELS, lockStateLabel } from "../constants";
import { phtDisplayStamp } from "../pht";
import { fetchLockTrail } from "../providers/payments2307Api";
import type { LockTrailEntry, PeriodKey, PeriodLockRow } from "../types";
import { LockDialog } from "./LockDialog";
import { UnlockDialog } from "./UnlockDialog";
import { downloadLocks } from "../utils/exportWorkbook";

const COLUMN_COUNT = 6;

const ACTION_LABELS: Record<string, string> = {
  LOCKED: "Locked",
  UNLOCKED: "Unlocked",
};

interface LocksTabProps {
  locks: PeriodLockRow[];
  isLoading: boolean;
  isSaving: boolean;
  onLock: (periodKey: PeriodKey, reason: string) => Promise<void>;
  onUnlock: (periodKey: PeriodKey, reason: string) => Promise<void>;
}

export function LocksTab({ locks, isLoading, isSaving, onLock, onUnlock }: LocksTabProps) {
  const [alert, setAlert] = useState<string | null>(null);
  const [locking, setLocking] = useState<PeriodKey | null>(null);
  const [unlocking, setUnlocking] = useState<PeriodKey | null>(null);
  const [trailFor, setTrailFor] = useState<{ periodKey: PeriodKey; companyId: number; year: number } | null>(null);
  const [trail, setTrail] = useState<LockTrailEntry[] | null>(null);
  const [trailError, setTrailError] = useState<string | null>(null);

  const latestByPeriod = useMemo(() => {
    const map = new Map<PeriodKey, PeriodLockRow>();
    for (const lock of locks) {
      const current = map.get(lock.periodKey);
      if (!current || lock.lockedAt > current.lockedAt) map.set(lock.periodKey, lock);
    }
    return map;
  }, [locks]);

  const lockedCount = useMemo(
    () =>
      PERIOD_KEYS.filter((periodKey) => {
        const lock = latestByPeriod.get(periodKey);
        return lock !== undefined && lock.unlockedAt === null;
      }).length,
    [latestByPeriod],
  );

  async function lockPeriod(periodKey: PeriodKey, reason: string) {
    setAlert(null);
    try {
      await onLock(periodKey, reason);
    } catch (error) {
      setAlert(error instanceof Error ? error.message : "The period was not locked.");
      throw error;
    }
  }

  async function openTrail(periodKey: PeriodKey, lock: PeriodLockRow | null) {
    if (lock === null) return;
    setTrailFor({ periodKey, companyId: lock.companyId, year: lock.taxYear });
    setTrail(null);
    setTrailError(null);
    try {
      const result = await fetchLockTrail(lock.companyId, lock.taxYear, periodKey);
      setTrail(result.entries);
    } catch (error) {
      setTrailError(error instanceof Error ? error.message : "The trail could not be read.");
    }
  }

  return (
    <section
      aria-label="Period locks"
      className="overflow-hidden rounded-2xl border border-border/50 border-t-[3px] border-t-amber-500/70 bg-card shadow-sm"
    >
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-border/50 px-4 py-3">
        <h2 className="text-sm font-semibold">Period locks</h2>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline" className="tabular-nums text-[11px]">
            {lockedCount} of {PERIOD_KEYS.length} locked
          </Badge>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => downloadLocks(locks)}
            disabled={locks.length === 0}
            title={locks.length === 0 ? "No locks to export" : "Download these rows as a workbook"}
            className="min-h-11 md:min-h-0"
          >
            <Download className="mr-2 size-4" />
            Export Excel
          </Button>
        </div>
      </header>


      {alert ? (
        <div className="px-4 pb-3">
          <Alert variant="destructive">
            <AlertDescription>{alert}</AlertDescription>
          </Alert>
        </div>
      ) : null}

      <div className="hidden overflow-x-auto min-[1300px]:block">
        <Table aria-label="Period locks">
          <TableHeader>
            <TableRow>
              <TableHead>Period</TableHead>
              <TableHead>State</TableHead>
              <TableHead>Locked by</TableHead>
              <TableHead>Locked at</TableHead>
              <TableHead className="min-w-[200px]">Last unlock</TableHead>
              <TableHead className="text-right">Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 3 }).map((_, index) => (
                <TableRow key={`skeleton-${index}`}>
                  <TableCell colSpan={COLUMN_COUNT}>
                    <Skeleton className="h-10 w-full" />
                  </TableCell>
                </TableRow>
              ))
            ) : (
              PERIOD_KEYS.map((periodKey) => {
                const lock = latestByPeriod.get(periodKey) ?? null;
                const isLocked = lock !== null && lock.unlockedAt === null;

                return (
                  <TableRow key={periodKey}>
                    <TableCell className="font-medium">{PERIOD_LABELS[periodKey]}</TableCell>
                    <TableCell>
                      {lock === null ? (
                        <Badge variant="outline" className="text-[11px] font-semibold">
                          {lockStateLabel("NONE")}
                        </Badge>
                      ) : isLocked ? (
                        <Badge
                          variant="outline"
                          className="border-emerald-200 bg-emerald-50 text-[11px] font-semibold text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300"
                        >
                          {lockStateLabel("LOCKED")}
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-[11px] font-semibold">
                          {lockStateLabel("OPEN")}
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="tabular-nums" title={lock?.lockedBy ? `User #${lock.lockedBy}` : ""}>
                      {lock === null ? (
                        "—"
                      ) : isLocked ? (
                        (lock.lockedByName ?? "—")
                      ) : (
                        <span className="text-muted-foreground">was {lock.lockedByName ?? "—"}</span>
                      )}
                    </TableCell>
                    <TableCell className="tabular-nums">
                      {lock === null ? (
                        "—"
                      ) : isLocked ? (
                        phtDisplayStamp(lock.lockedAt)
                      ) : (
                        <span className="text-muted-foreground">was {phtDisplayStamp(lock.lockedAt)}</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {lock?.unlockedAt ? (
                        <div className="max-w-[320px]">
                          <div className="tabular-nums text-xs">
                            {phtDisplayStamp(lock.unlockedAt)}
                            {lock.unlockedByName ? ` · ${lock.unlockedByName}` : ""}
                          </div>
                          <div className="line-clamp-2 text-xs text-muted-foreground" title={lock.unlockReason ?? ""}>
                            {lock.unlockReason ?? "No reason recorded"}
                          </div>
                        </div>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex flex-wrap items-center justify-end gap-1">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => void openTrail(periodKey, lock)}
                          disabled={lock === null}
                          title={
                            lock === null
                              ? "Nothing has been locked yet"
                              : "Every lock and unlock of this period, with the reason as it was typed"
                          }
                          className="min-h-11 md:min-h-0"
                        >
                          View log
                        </Button>
                        {isLocked ? (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => setUnlocking(periodKey)}
                            disabled={isSaving}
                            className="min-h-11 md:min-h-0"
                          >
                            <LockOpen className="mr-2 size-4" />
                            Unlock
                          </Button>
                        ) : (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => setLocking(periodKey)}
                            disabled={isSaving}
                            className="min-h-11 md:min-h-0"
                          >
                            {isSaving ? (
                              <Loader2 className="mr-2 size-4 animate-spin" />
                            ) : (
                              <Lock className="mr-2 size-4" />
                            )}
                            Lock
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      {!isLoading ? (
        <ul className="divide-y min-[1300px]:hidden">
          {PERIOD_KEYS.map((periodKey) => {
            const lock = latestByPeriod.get(periodKey) ?? null;
            const isLocked = lock !== null && lock.unlockedAt === null;
            return (
              <li key={periodKey} className="space-y-2 px-4 py-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-medium">{PERIOD_LABELS[periodKey]}</p>
                    <p className="text-[11px] text-muted-foreground">
                      {lock
                        ? `${isLocked ? "" : "was "}${lock.lockedByName ?? "—"} · ${phtDisplayStamp(lock.lockedAt)}`
                        : lockStateLabel("NONE")}
                    </p>
                    {lock?.unlockedAt ? (
                      <p className="text-[11px] text-muted-foreground">
                        Unlocked {phtDisplayStamp(lock.unlockedAt)}
                        {lock.unlockedByName ? ` by ${lock.unlockedByName}` : ""}
                        {lock.unlockReason ? ` · ${lock.unlockReason}` : ""}
                      </p>
                    ) : null}
                  </div>
                  <Badge variant="outline" className="shrink-0 text-[11px] font-semibold">
                    {lock === null ? lockStateLabel("NONE") : isLocked ? lockStateLabel("LOCKED") : lockStateLabel("OPEN")}
                  </Badge>
                </div>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="min-h-11 flex-1"
                    onClick={() => void openTrail(periodKey, lock)}
                    disabled={lock === null}
                    title={lock === null ? "Nothing has been locked yet" : "Every lock and unlock, with its reason"}
                  >
                    View log
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="min-h-11 flex-1"
                    onClick={() => (isLocked ? setUnlocking(periodKey) : setLocking(periodKey))}
                    disabled={isSaving}
                  >
                    {isLocked ? <LockOpen className="mr-2 size-4" /> : <Lock className="mr-2 size-4" />}
                    {isLocked ? "Unlock" : "Lock"}
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      ) : null}

      <Dialog open={trailFor !== null} onOpenChange={(next) => { if (!next) { setTrailFor(null); setTrail(null); setTrailError(null); } }}>
        <DialogContent className="flex max-h-[85vh] w-[95vw] flex-col gap-0 overflow-hidden rounded-2xl p-0 sm:max-w-[560px]">
          <DialogHeader className="border-b border-border/50 px-6 py-4">
            <DialogTitle>
              Lock trail{trailFor ? ` · ${PERIOD_LABELS[trailFor.periodKey]}` : ""}
            </DialogTitle>
            <DialogDescription>
              Every lock and unlock of this period, newest first, with the reason exactly as it was written.
            </DialogDescription>
          </DialogHeader>
          <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
            {trailError ? (
              <Alert variant="destructive">
                <AlertDescription>{trailError}</AlertDescription>
              </Alert>
            ) : trail === null ? (
              <div className="space-y-2">
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
              </div>
            ) : trail.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Nothing is recorded for this period yet. Locking it writes the first entry.
              </p>
            ) : (
              <ol className="space-y-3">
                {trail.map((entry) => (
                  <li key={entry.id} className="border-l-2 border-border pl-3">
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <span className="text-sm font-medium">
                        {ACTION_LABELS[entry.action] ?? entry.action}
                      </span>
                      <span className="tabular-nums text-xs text-muted-foreground">
                        {phtDisplayStamp(entry.occurredAt)}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground">{entry.actorName ?? "Name not recorded"}</p>
                    <p className="mt-1 whitespace-pre-line break-words text-xs">
                      {entry.reason ?? "No reason was written."}
                    </p>
                  </li>
                ))}
              </ol>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <LockDialog
        periodKey={locking}
        isSaving={isSaving}
        onClose={() => setLocking(null)}
        onSubmit={async (reason: string) => {
          if (locking === null) return;
          await lockPeriod(locking, reason);
        }}
      />

      <UnlockDialog
        periodKey={unlocking}
        isSaving={isSaving}
        onClose={() => setUnlocking(null)}
        onSubmit={async (reason: string) => {
          if (unlocking === null) return;
          await onUnlock(unlocking, reason);
        }}
      />
    </section>
  );
}

