"use client";

import { useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatNumber } from "@/lib/utils";

import { ACCENT, HOLIDAY_DERIVED_NOTE, HOLIDAY_KIND_LABEL, HOLIDAY_KIND_TONE, SETTINGS_PAGE_SIZE } from "../constants";
import { phtDate } from "../pht";
import type { HolidayBody } from "../schemas";
import type { SettingsHoliday } from "../types";
import { HolidayDialog } from "./HolidayDialog";
import { Notice } from "./Notice";
import { StatusBadge } from "./StatusBadge";
import { TablePager, pageCountFor, pageSlice, usePageSize } from "./TablePager";

type Props = {
  holidays: SettingsHoliday[];
  isSaving: boolean;
  onAdd: (body: HolidayBody) => Promise<unknown>;
  onDelete: (id: number) => Promise<unknown>;
};

/** Holiday rows the schedule engine moves a due date off. */
export function HolidaysTab({ holidays, isSaving, onAdd, onDelete }: Props) {
  const [pageSize, setPageSize] = usePageSize("fm.loan-settings.holidays-rows", SETTINGS_PAGE_SIZE);
  const [page, setPage] = useState(1);
  const [dialogOpen, setDialogOpen] = useState(false);
  const pageCount = pageCountFor(holidays.length, pageSize);
  const rows = useMemo(() => pageSlice(holidays, page, pageSize), [holidays, page, pageSize]);
  const upcoming = holidays.filter((row) => row.holidayDate >= phtDate()).length;

  return (
    <div className="space-y-3">
      <Notice tone="info" title="What this controls">
        A due date that lands on a weekend or on one of these dates moves to the next business day. {HOLIDAY_DERIVED_NOTE}
      </Notice>

      <Card className={`border-t-[3px] ${ACCENT}`}>
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
          <div className="min-w-0">
            <h3 className="text-sm font-semibold">Holidays</h3>
            <p className="text-xs text-muted-foreground">
              {formatNumber(holidays.length)} rows · {formatNumber(upcoming)} still ahead this year.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-medium tabular-nums text-muted-foreground">
              {formatNumber(holidays.length)} holidays
            </span>
            <Button type="button" className="min-h-11 md:min-h-0" disabled={isSaving} onClick={() => setDialogOpen(true)}>
              <Plus className="mr-1.5 h-4 w-4" aria-hidden />
              Add holiday
            </Button>
          </div>
        </div>

        <ul className="divide-y divide-border min-[1300px]:hidden">
          {rows.map((holiday) => (
            <li key={holiday.id} className="flex items-start justify-between gap-3 px-4 py-3">
              <div className="min-w-0 space-y-1">
                <p className="truncate font-medium" title={holiday.name}>
                  {holiday.name}
                </p>
                <p className="text-xs tabular-nums text-muted-foreground">{holiday.holidayDate}</p>
                <StatusBadge tone={HOLIDAY_KIND_TONE[holiday.kind]}>{HOLIDAY_KIND_LABEL[holiday.kind]}</StatusBadge>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-11 w-11 shrink-0"
                aria-label={`Remove ${holiday.name}`}
                title={`Remove ${holiday.name}`}
                disabled={isSaving}
                onClick={() => void onDelete(holiday.id)}
              >
                <Trash2 className="h-4 w-4" aria-hidden />
              </Button>
            </li>
          ))}
          {rows.length === 0 ? (
            <li className="px-4 py-10 text-center text-sm text-muted-foreground">No holiday is recorded yet.</li>
          ) : null}
        </ul>

        <div className="hidden overflow-x-auto min-[1300px]:block">
          <Table className="table-fixed [&_th:first-child]:pl-4 [&_td:first-child]:pl-4 [&_th:last-child]:pr-4 [&_td:last-child]:pr-4 [&_th]:py-2.5 [&_td]:py-3">
            <TableHeader>
              <TableRow>
                <TableHead>Holiday</TableHead>
                <TableHead className="w-[140px]">Date</TableHead>
                <TableHead className="w-[190px]">Kind</TableHead>
                <TableHead className="w-[76px] text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((holiday) => (
                <TableRow key={holiday.id}>
                  <TableCell className="max-w-[420px] truncate font-medium" title={holiday.name}>
                    {holiday.name}
                  </TableCell>
                  <TableCell className="tabular-nums">{holiday.holidayDate}</TableCell>
                  <TableCell>
                    <StatusBadge tone={HOLIDAY_KIND_TONE[holiday.kind]}>{HOLIDAY_KIND_LABEL[holiday.kind]}</StatusBadge>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      aria-label={`Remove ${holiday.name}`}
                      title={`Remove ${holiday.name}`}
                      disabled={isSaving}
                      onClick={() => void onDelete(holiday.id)}
                    >
                      <Trash2 className="h-4 w-4" aria-hidden />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="py-10 text-center text-sm text-muted-foreground">
                    No holiday is recorded yet.
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
        </div>

        <TablePager
          page={page}
          pageCount={pageCount}
          total={holidays.length}
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

      {dialogOpen ? (
        <HolidayDialog holiday={null} isSaving={isSaving} onClose={() => setDialogOpen(false)} onSubmit={onAdd} />
      ) : null}
    </div>
  );
}
