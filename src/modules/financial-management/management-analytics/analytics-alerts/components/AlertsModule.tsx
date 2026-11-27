"use client";

import { useState } from "react";
import { BellRing, ClipboardCopy, RefreshCw } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
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
import { BoardHeader, Panel, PanelHead, Stat } from "@/modules/financial-management/management-analytics/shared/BoardKit";
import { StackBar } from "@/modules/financial-management/management-analytics/shared/Charts";
import { useAlerts } from "../hooks/useAlerts";
import { POLICY_FIELDS, type PolicyField } from "../constants";
import { phtDisplayStamp } from "../pht";
import type { AlertSeverity, AlertRow, Policy } from "../types";

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

function subject(row: AlertRow): string {
  return `${row.severity} · ${TYPE_LABEL[row.type] ?? row.type}${row.companyCode ? ` · ${row.companyCode}` : ""}`;
}

/** The email the delivery rule would send, built from the alert's own record. */
function previewEmail(row: AlertRow): string {
  return [
    `Subject: ${subject(row)}`,
    `To: ${row.recipients ?? (CHANNEL_LABEL[row.channel] ?? row.channel)}`,
    "",
    row.message,
    [row.kpiName, when(row)].filter(Boolean).join(" · "),
  ].join("\n");
}

/** The same alert as the webhook body it would post. */
function previewJson(row: AlertRow): string {
  return JSON.stringify(
    {
      type: row.type,
      severity: row.severity,
      company: row.companyCode,
      kpi: row.kpiName,
      state: row.state,
      channel: row.channel,
      recipients: row.recipients,
      sent_at: row.sent_at,
      message: row.message,
    },
    null,
    2,
  );
}

async function copy(text: string, what: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(`The ${what} is on the clipboard.`);
  } catch {
    // A browser can refuse the clipboard; saying so is better than a silent no-op.
    toast.error("This browser will not let the page copy to the clipboard.");
  }
}

/** The bounds the write route enforces, checked here so a bad value is named before it is sent. */
function policyError(field: PolicyField, value: unknown): string | null {
  if (field.kind === "switch") return typeof value === "boolean" ? null : `${field.label} is either on or off.`;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return `${field.label} takes a number.`;
  if (parsed < field.min || parsed > field.max) return `${field.label} is between ${field.min} and ${field.max}.`;
  if (field.step && !Number.isInteger(Number((parsed / field.step).toFixed(6)))) {
    return `${field.label} moves in steps of ${field.step}.`;
  }
  return null;
}

export function AlertsModule() {
  const alerts = useAlerts();
  const payload = alerts.data;
  const rows = payload?.alerts ?? [];
  const [previewId, setPreviewId] = useState<number | null>(null);
  const [draft, setDraft] = useState<Policy | null>(null);

  const previewRow = rows.find((row) => row.id === previewId) ?? rows[0] ?? null;

  const savedPolicy = payload?.policy ?? null;
  const shownPolicy = draft ?? savedPolicy;
  const policyProblems = shownPolicy
    ? POLICY_FIELDS.map((field) => policyError(field, shownPolicy[field.key])).filter((item): item is string => item !== null)
    : [];
  const policyDirty =
    draft !== null && savedPolicy !== null && POLICY_FIELDS.some((field) => draft[field.key] !== savedPolicy[field.key]);

  function setPolicyValue(field: PolicyField, next: boolean | number) {
    if (!shownPolicy) return;
    setDraft({ ...shownPolicy, [field.key]: next } as Policy);
  }

  function applyPolicy() {
    if (!draft) return;
    void alerts
      .applyPolicy(draft)
      .then((result) => {
        setDraft(null);
        if (result.missing.length > 0) {
          toast.error(`Nothing is stored under ${result.missing.join(", ")}, so those settings were left alone.`);
          return;
        }
        toast.success(
          result.changed.length === 0
            ? "No value changed, so nothing was logged."
            : `${result.changed.length} ${result.changed.length === 1 ? "setting" : "settings"} saved and logged on the change board.`,
        );
      })
      .catch((cause: unknown) => toast.error(cause instanceof Error ? cause.message : "The policy was not saved."));
  }

  return (
    <div className="space-y-4">
      <BoardHeader
        title="Alerts & Policy"
        subtitle="Set which alerts go where, and see the message each rule would send. In-app alerts are live; email and chat delivery is recorded, not sent."
        right={
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
        }
      />

      {alerts.error ? (
        <Notice
          tone="danger"
          title={rows.length > 0 ? "This list is from the last read that worked" : "The alerts could not be read"}
        >
          {alerts.error}
          {rows.length > 0 ? " Nothing above has changed since then, and the counts may be out of date." : null}
        </Notice>
      ) : null}

      <Panel className="space-y-4 p-4">
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {[
            { label: "Unread", value: payload?.counts.unread ?? 0, hint: "Not looked at yet" },
            { label: "Read", value: payload?.counts.read ?? 0, hint: "Seen, not acted on" },
            { label: "Acknowledged", value: payload?.counts.acked ?? 0, hint: "Someone owns it" },
            {
              label: "High and open",
              value: payload?.counts.high ?? 0,
              hint: (payload?.counts.high ?? 0) > 0 ? "Needs action today" : "Nothing urgent",
              tone: (payload?.counts.high ?? 0) > 0 ? ("danger" as const) : undefined,
            },
          ].map((tile) => (
            <Stat key={tile.label} label={tile.label} value={tile.value} note={tile.hint} tone={tile.tone} />
          ))}
        </div>
        <StackBar
          height={10}
          legend
          segments={[
            { label: "Unread", value: payload?.counts.unread ?? 0, tone: "warning" },
            { label: "Read", value: payload?.counts.read ?? 0, tone: "info" },
            { label: "Acknowledged", value: payload?.counts.acked ?? 0, tone: "success" },
            { label: "High and open", value: payload?.counts.high ?? 0, tone: "danger" },
          ]}
        />
      </Panel>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <Panel>
          <PanelHead
            title="Variance policy"
            description="The six settings the sweep reads. Applying a change writes it and logs one row on the change board."
          />
          <div className="divide-y divide-border/50 px-4">
            {POLICY_FIELDS.map((field) => (
              <div key={field.setting} className="flex flex-wrap items-center justify-between gap-3 py-2.5">
                <div className="min-w-0">
                  <p className="text-sm font-medium">{field.label}</p>
                  <p className="text-xs text-muted-foreground">{field.hint}</p>
                </div>
                {field.kind === "switch" ? (
                  <div className="flex min-h-11 items-center gap-2">
                    <span className="text-xs text-muted-foreground">{shownPolicy?.[field.key] ? "On" : "Off"}</span>
                    <Switch
                      checked={Boolean(shownPolicy?.[field.key])}
                      disabled={!shownPolicy || alerts.isBusy}
                      aria-label={field.label}
                      onCheckedChange={(next) => setPolicyValue(field, next)}
                    />
                  </div>
                ) : (
                  <Input
                    type="number"
                    inputMode="decimal"
                    className="h-9 w-24 text-right tabular-nums"
                    aria-label={field.label}
                    min={field.min}
                    max={field.max}
                    step={field.step ?? 1}
                    disabled={
                      !shownPolicy ||
                      alerts.isBusy ||
                      ((field.key === "confirmPeriods" || field.key === "spikeMultiple") && !shownPolicy.sustainedRule)
                    }
                    value={Number.isFinite(Number(shownPolicy?.[field.key])) ? String(shownPolicy?.[field.key]) : ""}
                    onChange={(event) =>
                      setPolicyValue(field, event.target.value === "" ? Number.NaN : Number(event.target.value))
                    }
                  />
                )}
              </div>
            ))}
            {!shownPolicy ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                {alerts.error ? "The policy could not be read, so the settings are not shown." : "Reading the policy."}
              </p>
            ) : null}
          </div>
          <div className="space-y-2 border-t border-border/50 px-4 py-3">
            <Button
              size="sm"
              className="h-9"
              disabled={!policyDirty || policyProblems.length > 0 || alerts.isBusy}
              onClick={applyPolicy}
            >
              Apply and log change
            </Button>
            <p className="text-xs text-muted-foreground">
              {policyProblems.length > 0
                ? `${policyProblems[0]} Nothing is written until every value is valid.`
                : policyDirty
                  ? "Unsaved change. Applying writes the six settings and logs one row on the change board."
                  : "Every value shown is the one in force."}
            </p>
          </div>
        </Panel>

        <Panel>
          <PanelHead
            title="Delivery rules"
            description="A type that is off is not generated at all. Email and chat are recorded on the alert."
            count={`${payload?.policies.length ?? 0} ${(payload?.policies.length ?? 0) === 1 ? "rule" : "rules"}`}
          />
          <div className="divide-y divide-border/50 px-4">
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
            {payload && payload.policies.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">No delivery rule is set yet.</p>
            ) : null}
          </div>
        </Panel>

        <Panel className="lg:col-span-2">
          <PanelHead
            title="Message preview"
            description="Built from the alert's own record, so what is shown is what would be sent."
            right={
              rows.length > 0 ? (
                <Select value={String(previewRow?.id ?? "")} onValueChange={(next) => setPreviewId(Number(next))}>
                  <SelectTrigger className="h-9 w-[210px]">
                    <SelectValue placeholder="Pick an alert" />
                  </SelectTrigger>
                  <SelectContent className="max-h-60 min-w-[210px]">
                    {rows.map((row) => (
                      <SelectItem key={row.id} value={String(row.id)}>
                        {subject(row)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : null
            }
          />
          {previewRow ? (
            <div className="grid gap-3 px-4 py-3 md:grid-cols-2">
              <div>
                <div className="mb-1 flex items-center justify-between gap-2">
                  <p className="text-xs font-medium uppercase tracking-[0.06em] text-muted-foreground">Email</p>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 gap-1.5 px-2 text-xs"
                    onClick={() => void copy(previewEmail(previewRow), "email")}
                  >
                    <ClipboardCopy className="h-3.5 w-3.5" /> Copy
                  </Button>
                </div>
                <pre className="max-h-52 overflow-auto whitespace-pre-wrap rounded-lg border border-border/60 bg-muted/40 p-3 text-xs leading-5">
                  {previewEmail(previewRow)}
                </pre>
              </div>
              <div>
                <div className="mb-1 flex items-center justify-between gap-2">
                  <p className="text-xs font-medium uppercase tracking-[0.06em] text-muted-foreground">Chat webhook payload</p>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 gap-1.5 px-2 text-xs"
                    onClick={() => void copy(previewJson(previewRow), "payload")}
                  >
                    <ClipboardCopy className="h-3.5 w-3.5" /> Copy
                  </Button>
                </div>
                <pre className="max-h-52 overflow-auto rounded-lg border border-border/60 bg-muted/40 p-3 text-xs leading-5">
                  {previewJson(previewRow)}
                </pre>
              </div>
            </div>
          ) : (
            <p className="px-4 py-6 text-sm text-muted-foreground">
              Nothing to preview yet. Run the sweep to generate alerts from the current month.
            </p>
          )}
        </Panel>
      </div>

      <Panel>
        <PanelHead
          title="Alerts"
          description="Raised by the sweep, newest first."
          count={`${payload?.total ?? 0} ${(payload?.total ?? 0) === 1 ? "alert" : "alerts"}`}
        />
        <div className="flex flex-wrap items-center gap-2 border-b border-border/60 px-4 py-2.5">
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
        <div className="divide-y divide-border/50">
          {rows.map((row) => (
            <div key={row.id} className="flex flex-wrap items-start justify-between gap-3 px-4 py-3">
              <div className="min-w-0 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <StatusBadge tone={SEVERITY_TONE[row.severity]}>{row.severity}</StatusBadge>
                  <span className="text-sm font-medium">{TYPE_LABEL[row.type] ?? row.type}</span>
                  {row.companyCode ? <Badge variant="secondary">{row.companyCode}</Badge> : null}
                  {row.state === "READ" ? <span className="text-xs text-muted-foreground">Read</span> : null}
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
      </Panel>
    </div>
  );
}
