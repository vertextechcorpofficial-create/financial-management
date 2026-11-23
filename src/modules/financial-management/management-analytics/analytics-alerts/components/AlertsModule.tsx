"use client";

import { BellRing, RefreshCw } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Notice } from "./Notice";
import { TablePager } from "./TablePager";
import { StatusBadge } from "./StatusBadge";
import { useAlerts } from "../hooks/useAlerts";
import { phtDisplayStamp } from "../pht";
import type { AlertSeverity, AlertRow } from "../types";

const SEVERITY_TONE: Record<AlertSeverity, "danger" | "warning" | "neutral"> = {
  HIGH: "danger",
  MEDIUM: "warning",
  INFO: "neutral",
};

/** The rules read in the order an alert travels: raised, confirmed, escalated, closed. */
const POLICY_ORDER = ["BREACH", "PROVISIONAL", "FORECAST_RISK", "ESCALATION", "CLOSED", "SIGN_OFF", "STALE_DATA"];
const CHANNEL_LABEL: Record<string, string> = { IN_APP: "In app", EMAIL: "Email", CHAT: "Chat" };

const TYPE_LABEL: Record<string, string> = {
  BREACH: "Confirmed breach",
  PROVISIONAL: "Provisional breach",
  ESCALATION: "Escalation",
  FORECAST_RISK: "Forecast risk",
  STALE_DATA: "Stale data",
  CLOSED: "Remediation closed",
  SIGN_OFF: "Awaiting sign-off",
};

const STATE_OPTIONS = [
  { value: "UNREAD", label: "Unread" },
  { value: "READ", label: "Read" },
  { value: "ACKED", label: "Acknowledged" },
  { value: "ALL", label: "Everything" },
];

function when(row: AlertRow): string {
  return row.sent_at ? phtDisplayStamp(row.sent_at) : phtDisplayStamp(row.created_at);
}

export function AlertsModule() {
  const alerts = useAlerts();
  const payload = alerts.data;
  const rows = payload?.alerts ?? [];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-lg font-semibold">Alerts &amp; Policy</h1>
          <p className="text-sm text-muted-foreground">
            Generated from KPI status, exceptions, data health and the change log.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" className="h-9 gap-1.5" onClick={() => alerts.reload()}>
            <RefreshCw className="h-4 w-4" /> Refresh
          </Button>
          <Button
            size="sm"
            className="h-9 gap-1.5"
            disabled={alerts.isBusy}
            onClick={() =>
              void alerts
                .generate()
                .then((result) => {
                  // A sweep that finds nothing has to say so, or the button looks dead.
                  toast.success(
                    result.created === 0
                      ? `Nothing new this time. ${result.skipped} ${result.skipped === 1 ? "alert" : "alerts"} already on the board.`
                      : `${result.created} new ${result.created === 1 ? "alert" : "alerts"}, ${result.skipped} already on the board.`,
                  );
                })
                .catch((cause: unknown) => toast.error(cause instanceof Error ? cause.message : "The sweep did not run."))
            }
          >
            <BellRing className="h-4 w-4" /> Run the sweep
          </Button>
        </div>
      </div>

      {alerts.error ? (
        <Notice tone="danger" title={rows.length > 0 ? "This list is from the last read that worked" : "The alerts could not be read"}>
          {alerts.error}
          {rows.length > 0 ? " Nothing above has changed since then, and the counts may be out of date." : null}
        </Notice>
      ) : null}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          { label: "Unread", value: payload?.counts.unread ?? 0, hint: "Not looked at yet" },
          { label: "Read", value: payload?.counts.read ?? 0, hint: "Seen, not acted on" },
          { label: "Acknowledged", value: payload?.counts.acked ?? 0, hint: "Someone owns it" },
          {
            label: "High and open",
            value: payload?.counts.high ?? 0,
            hint: (payload?.counts.high ?? 0) > 0 ? "Needs action today" : "Nothing urgent",
          },
        ].map((tile) => (
          <div key={tile.label} className="rounded-lg border border-border/60 bg-card px-4 py-3">
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{tile.label}</p>
            <p className="mt-1 text-xl font-semibold tabular-nums">{tile.value}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">{tile.hint}</p>
          </div>
        ))}
      </div>

      <Card className="border-t-[3px] border-t-primary/40">
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 space-y-0 border-b border-border/60 px-4 py-3">
          <div>
            <CardTitle className="text-sm font-semibold">Alerts</CardTitle>
            <p className="text-xs text-muted-foreground">Raised by the sweep, newest first.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-md border border-border bg-muted/60 px-2 py-0.5 text-[11px] font-medium tabular-nums text-muted-foreground">
              {`${payload?.total ?? 0} ${(payload?.total ?? 0) === 1 ? "alert" : "alerts"}`}
            </span>
            <Select value={alerts.state} onValueChange={alerts.setState}>
              <SelectTrigger className="h-9 w-[190px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="max-h-60 min-w-[200px]">
                {STATE_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={alerts.type} onValueChange={alerts.setType}>
              <SelectTrigger className="h-9 w-[200px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="max-h-60 min-w-[200px]">
                <SelectItem value="ALL">Every type</SelectItem>
                {(payload?.types ?? []).map((type) => (
                  <SelectItem key={type} value={type}>
                    {TYPE_LABEL[type] ?? type}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <div className="divide-y divide-border/50">
          {rows.map((row) => (
            <div key={row.id} className="flex flex-wrap items-start justify-between gap-3 px-4 py-3">
              <div className="min-w-0 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <StatusBadge tone={SEVERITY_TONE[row.severity]}>{row.severity}</StatusBadge>
                  <span className="text-sm font-medium">{TYPE_LABEL[row.type] ?? row.type}</span>
                  {row.companyCode ? <Badge variant="secondary">{row.companyCode}</Badge> : null}
                  {row.state === "READ" ? (
                    <span className="text-xs text-muted-foreground">Read</span>
                  ) : null}
                </div>
                <p className="text-sm">{row.message}</p>
                <p className="text-xs text-muted-foreground">
                  {when(row)} · {(CHANNEL_LABEL[row.channel] ?? row.channel).toLowerCase()}
                  {row.recipients ? ` · ${row.recipients}` : ""}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {row.state === "UNREAD" ? (
                  <Button variant="outline" size="sm" className="h-8" disabled={alerts.isBusy} onClick={() => alerts.mark(row.id, "READ")}>
                    Mark read
                  </Button>
                ) : null}
                {row.state !== "ACKED" ? (
                  <Button variant="outline" size="sm" className="h-8" disabled={alerts.isBusy} onClick={() => alerts.mark(row.id, "ACKED")}>
                    Acknowledge
                  </Button>
                ) : (
                  <span className="text-xs text-muted-foreground">Acknowledged</span>
                )}
              </div>
            </div>
          ))}
          {alerts.isLoading && rows.length === 0
            ? Array.from({ length: 4 }).map((_, index) => (
                <div key={`loading-${index}`} className="border-b border-border/50 px-4 py-3 last:border-0">
                  <div className="h-4 w-full animate-pulse rounded bg-muted" />
                </div>
              ))
            : null}
          {!alerts.isLoading && rows.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-muted-foreground">
              Nothing on this view. Run the sweep to generate alerts from the current month.
            </p>
          ) : null}
        </div>
        <TablePager
          page={payload?.page ?? 1}
          pageCount={payload?.pageCount ?? 1}
          total={payload?.total ?? 0}
          pageSize={payload?.size ?? 10}
          onPageChange={alerts.setPage}
          onPageSizeChange={alerts.setSize}
          allowAll={false}
          isLoading={alerts.isLoading}
          className="border-t border-border/50 px-4 py-3"
        />
      </Card>

      <Card className="border-border/60">
        <CardHeader className="border-b border-border/60 px-4 py-3">
          <CardTitle className="text-sm font-semibold">Delivery rules</CardTitle>
          <p className="text-xs text-muted-foreground">
            A type that is off is not generated at all. Email and chat delivery is recorded on the alert, not sent.
          </p>
        </CardHeader>
        <CardContent className="divide-y divide-border/50 px-4 py-1">
          {[...(payload?.policies ?? [])]
            .sort((a, b) => POLICY_ORDER.indexOf(a.type) - POLICY_ORDER.indexOf(b.type))
            .map((policy) => (
            <div key={policy.id} className="flex flex-wrap items-center justify-between gap-3 py-2.5">
              <div className="min-w-0">
                <p className="text-sm font-medium">{TYPE_LABEL[policy.type] ?? policy.type}</p>
                <p className="text-xs text-muted-foreground">
                  {CHANNEL_LABEL[policy.channel] ?? policy.channel}
                  {policy.recipients ? ` · ${policy.recipients}` : ""}
                  {policy.lead_days > 0 ? ` · ${policy.lead_days} days ahead` : ""}
                </p>
              </div>
              <div
                onClick={() => {
                  if (!alerts.isBusy) alerts.togglePolicy(policy.id, !policy.is_enabled);
                }}
                className="flex min-h-11 cursor-pointer items-center gap-2"
              >
                <span className="text-xs text-muted-foreground">{policy.is_enabled ? "On" : "Off"}</span>
                <Switch
                  checked={policy.is_enabled}
                  disabled={alerts.isBusy}
                  aria-label={TYPE_LABEL[policy.type] ?? policy.type}
                  onClick={(event) => event.stopPropagation()}
                  onCheckedChange={(next) => alerts.togglePolicy(policy.id, next)}
                />
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
