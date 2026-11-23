"use client";

import { useState } from "react";
import { CalendarCheck, Check, ClipboardList, Plus } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { DateField } from "./DateField";
import { Notice } from "./Notice";
import { OptionCombobox } from "./OptionCombobox";
import { StatusBadge } from "./StatusBadge";

import { ACCENT, toneClass } from "../constants";
import { useReview } from "../hooks/useReview";
import { phtDisplayStamp, phtToday } from "../pht";
import type { AgendaItem, ReviewDetail } from "../types";

const KIND_LABEL: Record<string, string> = {
  ESCALATED: "Escalated",
  RECURRENCE: "Recurrence",
  OPEN: "Open",
  EARLY: "Early warning",
  MONITORING: "Monitoring",
  DATA: "Data quality",
  SIGN_OFF: "Awaiting sign-off",
};

const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;

function readUrlParam(name: string): string | null {
  if (typeof window === "undefined") return null;
  const value = new URLSearchParams(window.location.search).get(name);
  return value && value.trim() ? value.trim() : null;
}

function readUrlPeriod(): string {
  const fromUrl = readUrlParam("period");
  return fromUrl ?? phtToday().slice(0, 7);
}

function readUrlCompany(): string {
  return readUrlParam("company") ?? "ALL";
}

function writeUrl(period: string, company: string) {
  if (typeof window === "undefined") return;
  const params = new URLSearchParams(window.location.search);
  if (MONTH.test(period)) params.set("period", period);
  else params.delete("period");
  if (company && company !== "ALL") params.set("company", company);
  else params.delete("company");
  const query = params.toString();
  window.history.replaceState(null, "", query ? `?${query}` : window.location.pathname);
}

function AgendaRow({
  item,
  index,
  isSaving,
  onSave,
}: {
  item: AgendaItem;
  index: number;
  isSaving: boolean;
  onSave: (id: number, patch: { notes?: string; decision?: string }) => Promise<void>;
}) {
  const [notes, setNotes] = useState(item.notes ?? "");
  const [decision, setDecision] = useState(item.decision ?? "");

  return (
    <li className="space-y-2 px-4 py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-xs tabular-nums text-muted-foreground">{String(index + 1).padStart(2, "0")}</span>
            <StatusBadge tone={item.kind === "ESCALATED" || item.kind === "RECURRENCE" ? "danger" : item.kind === "DATA" ? "warning" : "info"}>
              {KIND_LABEL[item.kind] ?? item.kind}
            </StatusBadge>
            <span className="text-xs text-muted-foreground tabular-nums">{item.minutes_alloc} min</span>
          </div>
          <p className="mt-1 text-sm font-medium">{item.title}</p>
        </div>
      </div>
      <div className="grid gap-2 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
        <Textarea
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          rows={2}
          placeholder="What was said"
          aria-label={`Notes for ${item.title}`}
          readOnly={isSaving}
          className="min-h-[56px] resize-y text-sm read-only:cursor-not-allowed read-only:opacity-60"
        />
        <Input
          value={decision}
          onChange={(event) => setDecision(event.target.value)}
          placeholder="Decision and owner"
          aria-label={`Decision for ${item.title}`}
          readOnly={isSaving}
          className="h-9 self-start text-sm read-only:cursor-not-allowed read-only:opacity-60"
        />
        <Button
          size="sm"
          variant="outline"
          className="h-9 self-start"
          disabled={isSaving}
          onClick={() => void onSave(item.id, { notes, decision })}
        >
          Save
        </Button>
      </div>
    </li>
  );
}

function PlannedAgenda({ detail }: { detail: ReviewDetail }) {
  const total = detail.planned.reduce((sum, item) => sum + item.minutes_alloc, 0);
  return (
    <Card className={`overflow-hidden p-0 ${ACCENT.rail}`}>
      <div className="flex items-baseline justify-between gap-2 px-4 pt-4">
        <div>
          <h2 className="text-sm font-semibold">Agenda for {detail.period}</h2>
          <p className="text-xs text-muted-foreground">
            {detail.planned.length} item{detail.planned.length === 1 ? "" : "s"} · about {total} minutes
          </p>
        </div>
      </div>
      <ul className="mt-2 divide-y divide-border">
        {detail.planned.map((item, index) => (
          <li key={`${item.kind}-${item.sort}`} className="flex items-center justify-between gap-3 px-4 py-2 text-sm">
            <span className="flex min-w-0 items-center gap-2">
              <span className="text-xs tabular-nums text-muted-foreground">{String(index + 1).padStart(2, "0")}</span>
              <StatusBadge tone={item.kind === "ESCALATED" || item.kind === "RECURRENCE" ? "danger" : item.kind === "DATA" ? "warning" : "info"}>
                {KIND_LABEL[item.kind] ?? item.kind}
              </StatusBadge>
              <span className="min-w-0 truncate">{item.title}</span>
            </span>
            <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{item.minutes_alloc} min</span>
          </li>
        ))}
      </ul>
      <p className="border-t border-border/50 px-4 py-2 text-xs text-muted-foreground">
        Opening the meeting freezes this order, so minutes attach to a list that cannot move under them.
      </p>
    </Card>
  );
}

export function ReviewModule() {
  // The month and the company travel in the address bar, so a copied link opens the meeting it names.
  const [period, setPeriodState] = useState(readUrlPeriod);
  const [company, setCompanyState] = useState(readUrlCompany);
  const setPeriod = (next: string) => {
    setPeriodState(next);
    writeUrl(next, company);
  };
  const setCompany = (next: string) => {
    setCompanyState(next);
    writeUrl(period, next);
  };
  const review = useReview(period, company);
  const detail = review.detail;
  const [attendance, setAttendance] = useState("");
  const [minutes, setMinutes] = useState("");
  const [actionTitle, setActionTitle] = useState("");
  const [actionDue, setActionDue] = useState("");

  const total = detail?.items.reduce((sum, item) => sum + item.minutes_alloc, 0) ?? 0;
  const spent = detail?.items.length ?? 0;
  const frozen = detail?.review?.status === "FINAL";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-lg font-semibold">Monthly Review</h1>
          <p className="text-sm text-muted-foreground">
            The agenda the exceptions produce, the minutes that come out of it, and the actions left behind.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Input
            value={period}
            aria-invalid={!review.validPeriod}
            onChange={(event) => setPeriod(event.target.value)}
            placeholder="2026-11"
            aria-label="Review month"
            title="Review month"
            className="h-9 w-[118px] font-mono"
          />
          <OptionCombobox
            value={company}
            onChange={setCompany}
            placeholder="Every company"
            searchPlaceholder="Search companies"
            emptyLabel="No company matches."
            className="h-9 w-full justify-between font-normal sm:w-[210px]"
            options={[
              { value: "ALL", label: "Every company" },
              ...(detail?.companies ?? []).map((row) => ({ value: row.code, label: `${row.code} · ${row.name}` })),
            ]}
          />
        </div>
      </div>

      {!review.validPeriod ? (
        <Notice tone="warning" title="That month is not a date">
          Use a month like 2026-11. Nothing is read until the month is complete.
        </Notice>
      ) : null}

      {review.error ? <Card className={`px-4 py-3 text-sm ${toneClass("danger")}`}>{review.error}</Card> : null}

      {review.validPeriod && review.isLoading && !detail ? (
        <Card className="px-4 py-10 text-center text-sm text-muted-foreground">Reading the month…</Card>
      ) : null}

      {review.validPeriod && detail && !detail.review ? (
        <>
          {detail.planned.length === 0 ? (
            <Card className="px-4 py-10 text-center text-sm text-muted-foreground">
              Nothing to review for {detail.period}: no open exception and no stale source.
            </Card>
          ) : (
            <>
              <PlannedAgenda detail={detail} />
              <div className="flex justify-end">
                <Button className="min-h-11 gap-2 md:min-h-0" onClick={() => void review.open()} disabled={review.isSaving}>
                  <ClipboardList className="h-4 w-4" />
                  Open the meeting
                </Button>
              </div>
            </>
          )}
        </>
      ) : null}

      {review.validPeriod && detail?.review ? (
        <>

          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {[
              { label: "State", value: detail.review.status === "FINAL" ? "Final" : "Draft" },
              { label: "Agenda", value: `${spent} ${spent === 1 ? "item" : "items"} · ${total} ${total === 1 ? "min" : "min"}` },
              { label: "Open actions", value: String(detail.actions.filter((row) => row.status !== "DONE").length) },
              { label: "Held", value: detail.review.held_at ? detail.review.held_at.slice(0, 10) : "Not yet" },
            ].map((tile) => (
              <Card key={tile.label} className="rounded-lg border border-border/60 bg-card px-4 py-3">
                <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{tile.label}</p>
                <p className="mt-1 text-xl font-semibold tabular-nums">{tile.value}</p>
              </Card>
            ))}
          </div>

          <Card className={`overflow-hidden p-0 ${ACCENT.rail}`}>
            <h2 className="px-4 pt-4 text-sm font-semibold">Agenda and minutes</h2>
            {frozen ? (
              <p className="px-4 pt-1 text-xs text-muted-foreground">
                Final since {detail.review.held_at ? phtDisplayStamp(detail.review.held_at) : "the meeting closed"}, so the minutes are locked.
              </p>
            ) : null}
            <ul className="mt-2 divide-y divide-border">
              {detail.items.map((item, index) => (
                <AgendaRow key={item.id} item={item} index={index} isSaving={review.isSaving || frozen} onSave={review.saveItem} />
              ))}
            </ul>
          </Card>

          <Card className="space-y-3 p-4">
            <h2 className="text-sm font-semibold">Minutes and attendance</h2>
            <Input
              value={attendance || detail.review.attendees || ""}
              onChange={(event) => setAttendance(event.target.value)}
              placeholder="Attendees: names, separated by commas"
              aria-label="Attendees"
              readOnly={frozen}
              className="h-9 read-only:cursor-not-allowed read-only:opacity-60"
            />
            <Textarea
              value={minutes || detail.review.minutes || ""}
              onChange={(event) => setMinutes(event.target.value)}
              rows={4}
              placeholder="The record of the meeting: what was decided, who owns it, what the dates are."
              aria-label="Meeting minutes"
              readOnly={frozen}
              className="min-h-[100px] resize-y read-only:cursor-not-allowed read-only:opacity-60"
            />
            <div className="flex flex-wrap items-center justify-end gap-2">
              <span
                className="inline-flex"
                title={frozen ? "This meeting is final, so the minutes are locked." : undefined}
              >
                <Button
                  variant="outline"
                  className="min-h-11 md:min-h-0"
                  onClick={() => void review.saveMeeting({ attendees: attendance, minutes })}
                  disabled={review.isSaving || frozen}
                >
                  Save draft
                </Button>
              </span>
              <span
                className="inline-flex"
                title={frozen ? "This meeting is final, so the minutes are locked." : undefined}
              >
                <Button
                  className="min-h-11 gap-2 md:min-h-0"
                  onClick={async () => {
                    await review.saveMeeting({ attendees: attendance, minutes, status: "FINAL" });
                    toast.success("The meeting is final.");
                  }}
                  disabled={review.isSaving || frozen}
                >
                  <CalendarCheck className="h-4 w-4" />
                  {frozen ? "Meeting closed" : "Close the meeting"}
                </Button>
              </span>
            </div>
          </Card>

          <Card className={`overflow-hidden p-0 ${ACCENT.rail}`}>
            <h2 className="px-4 pt-4 text-sm font-semibold">Actions out of this meeting</h2>
            {detail.actions.length === 0 ? (
              <p className="px-4 py-3 text-sm text-muted-foreground">No action recorded yet.</p>
            ) : (
              <ul className="mt-2 divide-y divide-border">
                {detail.actions.map((action) => (
                  <li key={action.id} className="flex items-center justify-between gap-3 px-4 py-2 text-sm">
                    <span className="min-w-0">
                      <span
                      className={action.status === "DONE" ? "block truncate text-muted-foreground line-through" : "block truncate"}
                      title={action.title}
                    >
                        {action.title}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        Due {action.due_date ?? "—"}
                        {action.done_at ? ` · done ${action.done_at.slice(0, 10)}` : ""}
                      </span>
                    </span>
                    {action.status === "DONE" ? (
                      <StatusBadge tone="success">Done</StatusBadge>
                    ) : (
                      <Button size="sm" variant="outline" className="h-8 gap-1" onClick={() => void review.closeAction(action.id)} disabled={review.isSaving}>
                        <Check className="h-3.5 w-3.5" />
                        Done
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
            )}
            <div className="flex flex-wrap items-end gap-2 border-t border-border/50 px-4 py-3">
              <label className="flex min-w-0 flex-1 flex-col gap-1">
                <span className="text-xs text-muted-foreground">New action</span>
                <Input
                  value={actionTitle}
                  onChange={(event) => setActionTitle(event.target.value)}
                  placeholder="What will be done, by whom"
                  className="h-9"
                  aria-label="Action title"
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-xs text-muted-foreground">Due</span>
                <div className="w-[150px]">
                  <DateField
                    value={actionDue}
                    onChange={setActionDue}
                    placeholder="Pick a date"
                    aria-label="Action due date"
                  />
                </div>
              </label>
              <Button
                size="sm"
                variant="outline"
                className="h-9 gap-1"
                disabled={review.isSaving || actionTitle.trim().length < 3}
                onClick={async () => {
                  await review.addAction({ title: actionTitle.trim(), dueDate: actionDue || undefined });
                  setActionTitle("");
                  setActionDue("");
                }}
              >
                <Plus className="h-3.5 w-3.5" />
                Add action
              </Button>
            </div>
          </Card>
        </>
      ) : null}
    </div>
  );
}
