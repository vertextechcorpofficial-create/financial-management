"use client";

import { useMemo, useState } from "react";
import { Lock, Undo2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatNumber } from "@/lib/utils";

import { ACCENT, LOCK_BLOCKS, SETTINGS_PAGE_SIZE } from "../constants";
import { phtDisplayStamp } from "../pht";
import type { SettingsLock, SettingsValue } from "../types";
import { CloseBooksDialog } from "./CloseBooksDialog";
import { Notice } from "./Notice";
import { ReopenDialog } from "./ReopenDialog";
import { StatusBadge } from "./StatusBadge";
import { TablePager, pageCountFor, pageSlice, usePageSize } from "./TablePager";

type Props = {
  locks: SettingsLock[];
  currentLock: SettingsLock | null;
  values: SettingsValue[];
  isSaving: boolean;
  onCloseBooks: (lockedThrough: string, note: string) => Promise<unknown>;
  onReopen: (id: number, reason: string) => Promise<unknown>;
};

/** Period closing and the stored values nobody reads yet. */
export function PeriodsTab({
  locks,
  currentLock,
  values,
  isSaving,
  onCloseBooks,
  onReopen,
}: Props) {
  const [pageSize, setPageSize] = usePageSize("fm.loan-settings.locks-rows", SETTINGS_PAGE_SIZE);
  const [page, setPage] = useState(1);
  const [closing, setClosing] = useState(false);
  const [reopening, setReopening] = useState<SettingsLock | null>(null);

  const pageCount = pageCountFor(locks.length, pageSize);
  const rows = useMemo(() => pageSlice(locks, page, pageSize), [locks, page, pageSize]);

  return (
    <div className="space-y-3">
      <Notice tone="warning" title="What a lock refuses">
        {LOCK_BLOCKS}
      </Notice>

      <Card className={`border-t-[3px] ${ACCENT}`}>
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
          <div className="min-w-0">
            <h3 className="text-sm font-semibold">Books closed through</h3>
            <p className="text-xs text-muted-foreground">
              {currentLock
                ? `Closed through ${currentLock.lockedThrough}${currentLock.lockedByName ? ` by ${currentLock.lockedByName}` : ""}. Reopen it before posting anything dated on or before that day.`
                : "No period is closed, so every date can be posted."}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {currentLock ? (
              <StatusBadge tone="warning">{currentLock.lockedThrough}</StatusBadge>
            ) : (
              <StatusBadge tone="success">Open</StatusBadge>
            )}
            {currentLock ? (
              <Button
                type="button"
                variant="outline"
                className="min-h-11 md:min-h-0"
                disabled={isSaving}
                onClick={() => setReopening(currentLock)}
              >
                <Undo2 className="mr-1.5 h-4 w-4" aria-hidden />
                Reopen
              </Button>
            ) : null}
            <Button
              type="button"
              className="min-h-11 md:min-h-0"
              disabled={isSaving}
              onClick={() => setClosing(true)}
            >
              <Lock className="mr-1.5 h-4 w-4" aria-hidden />
              Close the books
            </Button>
          </div>
        </div>

        <div className="hidden overflow-x-auto min-[1300px]:block">
          <Table className="table-fixed [&_th:first-child]:pl-4 [&_td:first-child]:pl-4 [&_th:last-child]:pr-4 [&_td:last-child]:pr-4 [&_th]:py-2.5 [&_td]:py-3">
            <TableHeader>
              <TableRow>
                <TableHead className="w-[150px]">Closed through</TableHead>
                <TableHead>Note</TableHead>
                <TableHead className="w-[170px]">Closed by</TableHead>
                <TableHead className="w-[170px]">Closed at</TableHead>
                <TableHead className="w-[150px]">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((lock) => (
                <TableRow key={lock.id}>
                  <TableCell className="tabular-nums">{lock.lockedThrough}</TableCell>
                  <TableCell className="max-w-[320px] truncate text-sm text-muted-foreground" title={lock.note ?? ""}>
                    {lock.note || "—"}
                  </TableCell>
                  <TableCell className="truncate text-sm" title={lock.lockedByName ?? ""}>
                    {lock.lockedByName || "—"}
                  </TableCell>
                  <TableCell className="truncate text-sm tabular-nums text-muted-foreground">
                    {lock.lockedAt ? phtDisplayStamp(lock.lockedAt) : "—"}
                  </TableCell>
                  <TableCell>
                    {lock.reopenedAt ? (
                      <StatusBadge tone="neutral" title={`Reopened ${phtDisplayStamp(lock.reopenedAt)}`}>
                        Reopened
                      </StatusBadge>
                    ) : (
                      <StatusBadge tone="warning">In force</StatusBadge>
                    )}
                  </TableCell>
                </TableRow>
              ))}
              {rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="py-10 text-center text-sm text-muted-foreground">
                    No period has been closed yet.
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
        </div>

        <ul className="divide-y divide-border min-[1300px]:hidden">
          {rows.map((lock) => (
            <li key={lock.id} className="space-y-1 px-4 py-3">
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium tabular-nums">{lock.lockedThrough}</span>
                {lock.reopenedAt ? (
                  <StatusBadge tone="neutral">Reopened</StatusBadge>
                ) : (
                  <StatusBadge tone="warning">In force</StatusBadge>
                )}
              </div>
              <p className="text-xs text-muted-foreground">{lock.note || "No note recorded."}</p>
              <p className="text-xs text-muted-foreground">
                {lock.lockedByName || "Unknown"} · {lock.lockedAt ? phtDisplayStamp(lock.lockedAt) : "—"}
              </p>
            </li>
          ))}
          {rows.length === 0 ? (
            <li className="px-4 py-10 text-center text-sm text-muted-foreground">No period has been closed yet.</li>
          ) : null}
        </ul>

        <TablePager
          page={page}
          pageCount={pageCount}
          total={locks.length}
          pageSize={pageSize}
          onPageChange={setPage}
          onPageSizeChange={(size) => {
            setPageSize(size);
            setPage(1);
          }}
          allowAll={false}
          className="border-t border-border/50 px-4 py-3"
        />
      </Card>

      <Card className={`border-t-[3px] ${ACCENT}`}>
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
          <div className="min-w-0">
            <h3 className="text-sm font-semibold">Stored values</h3>
            <p className="text-xs text-muted-foreground">
              Read-only. These pairs are spare settings kept for future screens; nothing on the loan screens reads
              them yet, so there is nothing to change here.
            </p>
          </div>
        </div>

        {values.length === 0 ? (
          <p className="px-4 py-10 text-center text-sm text-muted-foreground">No stored value is recorded yet.</p>
        ) : (
          <ul className="divide-y divide-border">
            {values.map((value) => (
              <li key={value.settingKey} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
                <div className="min-w-0">
                  <p className="font-mono text-xs text-muted-foreground">{value.settingKey}</p>
                  <p className="truncate text-sm" title={value.settingValue}>
                    {value.settingValue || "—"}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <p className="text-xs text-muted-foreground">
        {formatNumber(locks.filter((lock) => !lock.reopenedAt).length)} lock
        {locks.filter((lock) => !lock.reopenedAt).length === 1 ? "" : "s"} in force.
      </p>

      {closing ? (
        <CloseBooksDialog
          currentLockedThrough={currentLock?.lockedThrough ?? null}
          isSaving={isSaving}
          onClose={() => setClosing(false)}
          onSubmit={onCloseBooks}
        />
      ) : null}

      {reopening ? (
        <ReopenDialog
          lock={reopening}
          isSaving={isSaving}
          onClose={() => setReopening(null)}
          onSubmit={(reason) => onReopen(reopening.id, reason)}
        />
      ) : null}
    </div>
  );
}
