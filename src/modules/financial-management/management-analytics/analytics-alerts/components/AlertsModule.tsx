"use client";

import { useState } from "react";
import Link from "next/link";
import { BellRing, CheckCheck, ClipboardCopy, Lock, RefreshCw } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
import { BoardHeader, Callout, Panel, PanelHead, Stat } from "./BoardKit";
import { StackBar } from "./Charts";
import { useAlerts } from "../hooks/useAlerts";
import { POLICY_FIELDS, type PolicyField } from "../constants";
import { phtDisplayStamp } from "../pht";
import type { AlertPolicyRow, AlertSeverity, AlertRow, Policy } from "../types";

const SEVERITY_TONE: Record<AlertSeverity, "danger" | "warning" | "neutral"> = {
  HIGH: "danger",
  MEDIUM: "warning",
  INFO: "neutral",
};

const POLICY_ORDER = ["BREACH", "PROVISIONAL", "FORECAST_RISK", "ESCALATION", "CLOSED", "SIGN_OFF", "STALE_DATA"];
const CHANNEL_LABEL: Record<string, string> = { IN_APP: "In app", EMAIL: "Email", CHAT: "Chat" };
const MANDATORY_TYPES = new Set(["BREACH", "ESCALATION"]);

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
  { value: "ALL", label: "All states" },
];

function when(row: AlertRow): string {
  return row.sent_at ? phtDisplayStamp(row.sent_at) : phtDisplayStamp(row.created_at);
}

function subject(row: AlertRow): string {
  return `${row.severity} · ${TYPE_LABEL[row.type] ?? row.type}${row.companyCode ? ` · ${row.companyCode}` : ""}`;
}

function alertDeepLink(row: AlertRow): { href: string; label: string } {
  if (row.type === "STALE_DATA") {
    return { href: "/fm/management-analytics/analytics-data", label: "Inspect feeds →" };
  }
  if (row.type === "SIGN_OFF") {
    return { href: "/fm/management-analytics/analytics-governance?tab=changes", label: "Open Sign-offs →" };
  }
  const company = row.companyCode && row.companyCode !== "Group" ? `?company=${encodeURIComponent(row.companyCode)}` : "";
  return { href: `/fm/management-analytics/analytics-variance${company}`, label: "Open Variance →" };
}

function unpackChannels(policy: AlertPolicyRow): { inApp: boolean; email: boolean; chat: boolean; recipients: string } {
  const raw = policy.recipients ?? "";
  const match = raw.match(/^\[Channels:\s*([^\]]+)\]\s*(.*)$/);
  if (!match) {
    const ch = (policy.channel || "IN_APP").toUpperCase();
    return {
      inApp: ch === "IN_APP" || MANDATORY_TYPES.has(policy.type),
      email: ch === "EMAIL",
      chat: ch === "CHAT",
      recipients: raw,
    };
  }
  const list = new Set(match[1].split(",").map((s) => s.trim().toUpperCase()));
  return {
    inApp: list.has("IN_APP") || MANDATORY_TYPES.has(policy.type),
    email: list.has("EMAIL"),
    chat: list.has("CHAT"),
    recipients: match[2].trim(),
  };
}

function packRecipientsWithChannels(ch: { inApp: boolean; email: boolean; chat: boolean; recipients: string }) {
  const active = [
    ch.inApp ? "IN_APP" : null,
    ch.email ? "EMAIL" : null,
    ch.chat ? "CHAT" : null,
  ].filter(Boolean);
  const tag = active.length > 0 ? `[Channels: ${active.join(",")}]` : "[Channels: IN_APP]";
  return ch.recipients.trim() ? `${tag} ${ch.recipients.trim()}` : tag;
}

function previewEmail(row: AlertRow): string {
  return [
    `Subject: ${subject(row)}`,
    `To: ${row.recipients ?? (CHANNEL_LABEL[row.channel] ?? row.channel)}`,
    "",
    row.message,
    [row.kpiName, when(row)].filter(Boolean).join(" · "),
  ].join("\n");
}

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
    toast.error("This browser blocked clipboard access.");
  }
}

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

function readInitialTab(): string {
  if (typeof window === "undefined") return "inbox";
  return new URLSearchParams(window.location.search).get("tab") === "policy" ? "policy" : "inbox";
}

export function AlertsModule() {
  const alerts = useAlerts();
  const payload = alerts.data;
  const rows = payload?.alerts ?? [];
  const [tab, setTab] = useState(readInitialTab);
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
          toast.error(`Missing settings in store: ${result.missing.join(", ")}.`);
          return;
        }
        toast.success(
          result.changed.length === 0
            ? "No value changed."
            : `${result.changed.length} ${result.changed.length === 1 ? "setting" : "settings"} saved and logged on Governance Sign-off.`,
        );
      })
      .catch((cause: unknown) => toast.error(cause instanceof Error ? cause.message : "Policy could not be saved."));
  }

  function toggleChannel(policy: AlertPolicyRow, target: "inApp" | "email" | "chat") {
    if (target === "inApp" && MANDATORY_TYPES.has(policy.type)) return;
    const state = unpackChannels(policy);
    const next = { ...state, [target]: !state[target] };
    if (!next.inApp && !next.email && !next.chat) next.inApp = true;
    const primary = next.email ? "EMAIL" : next.chat ? "CHAT" : "IN_APP";
    void alerts.updatePolicyRule(policy.id, {
      channel: primary,
      recipients: packRecipientsWithChannels(next),
    });
  }

  const unreadCount = payload?.counts.unread ?? 0;
  const highOpen = payload?.counts.high ?? 0;

  return (
    <div className="space-y-4">
      <BoardHeader
        title="Alerts & Policy"
        subtitle="Triage exception, escalation, and feed alerts in your inbox, or configure variance confirmation thresholds and 3-channel delivery rules."
        meta={
          highOpen > 0 ? (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-destructive/30 bg-destructive/10 px-2.5 py-1 text-[11px] font-semibold text-destructive">
              {highOpen} High &amp; open
            </span>
          ) : null
        }
        right={
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" className="h-9 gap-1.5" onClick={() => alerts.reload()}>
              <RefreshCw className="h-4 w-4" /> Refresh
            </Button>
            {unreadCount > 0 ? (
              <Button
                variant="outline"
                size="sm"
                className="h-9 gap-1.5"
                disabled={alerts.isBusy}
                onClick={() =>
                  void alerts
                    .markAllRead()
                    .then((res) => toast.success(`Marked ${res.updated} alert${res.updated === 1 ? "" : "s"} read.`))
                    .catch((cause: unknown) => toast.error(cause instanceof Error ? cause.message : "Could not mark read."))
                }
              >
                <CheckCheck className="h-4 w-4" /> Mark all read
              </Button>
            ) : null}
            <Button
              size="sm"
              className="h-9 gap-1.5"
              disabled={alerts.isBusy}
              onClick={() =>
                void alerts
                  .generate()
                  .then((result) => {
                    toast.success(
                      result.created === 0
                        ? `Nothing new. ${result.skipped} already on the board.`
                        : `${result.created} new ${result.created === 1 ? "alert" : "alerts"} generated.`,
                    );
                  })
                  .catch((cause: unknown) => toast.error(cause instanceof Error ? cause.message : "The sweep did not run."))
              }
            >
              <BellRing className="h-4 w-4" /> Run sweep
            </Button>
          </div>
        }
      />

      {alerts.error ? (
        <Notice tone="danger" title="The alerts could not be read">
          {alerts.error}
        </Notice>
      ) : null}

      <Tabs value={tab} onValueChange={setTab} className="space-y-4">
        <TabsList>
          <TabsTrigger value="inbox">Alert Inbox ({payload?.total ?? 0})</TabsTrigger>
          <TabsTrigger value="policy">Policy &amp; Delivery</TabsTrigger>
        </TabsList>

        {/* Tab 1: Alert Inbox */}
        <TabsContent value="inbox" className="space-y-4">
          <Panel className="space-y-4 p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="grid flex-1 grid-cols-3 gap-4">
                <Stat label="Unread" value={payload?.counts.unread ?? 0} note="Waiting review" />
                <Stat label="Read" value={payload?.counts.read ?? 0} note="Seen, not owned" />
                <Stat label="Acknowledged" value={payload?.counts.acked ?? 0} note="Owned &amp; active" />
              </div>
              <div
                className={
                  highOpen > 0
                    ? "rounded-lg border border-destructive/30 bg-destructive/10 px-3.5 py-2 text-right"
                    : "rounded-lg border border-border/60 bg-muted/20 px-3.5 py-2 text-right"
                }
              >
                <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">High &amp; open pill</p>
                <p className={highOpen > 0 ? "font-mono text-xl font-semibold text-destructive" : "font-mono text-xl font-semibold"}>
                  {highOpen}
                </p>
              </div>
            </div>
            {/* Mutually exclusive 3-segment breakdown */}
            <StackBar
              height={10}
              legend
              segments={[
                { label: "Unread", value: payload?.counts.unread ?? 0, tone: "warning" },
                { label: "Read", value: payload?.counts.read ?? 0, tone: "info" },
                { label: "Acknowledged", value: payload?.counts.acked ?? 0, tone: "success" },
              ]}
            />
          </Panel>

          <Panel>
            <PanelHead
              title="Inbox"
              description="Exception, forecast, freshness, and governance sign-off notifications, newest first."
              count={`${payload?.total ?? 0} ${(payload?.total ?? 0) === 1 ? "alert" : "alerts"}`}
            />
            <div className="flex flex-wrap items-center gap-2 border-y border-border/60 px-4 py-2.5">
              <Select value={alerts.state} onValueChange={alerts.setState}>
                <SelectTrigger className="h-9 w-[180px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {STATE_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={alerts.type} onValueChange={alerts.setType}>
                <SelectTrigger className="h-9 w-[200px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">Every type</SelectItem>
                  {(payload?.types ?? []).map((type) => (
                    <SelectItem key={type} value={type}>{TYPE_LABEL[type] ?? type}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="divide-y divide-border/50">
              {rows.map((row) => {
                const target = alertDeepLink(row);
                return (
                  <div key={row.id} className="flex flex-wrap items-start justify-between gap-3 px-4 py-3">
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <StatusBadge tone={SEVERITY_TONE[row.severity]}>{row.severity}</StatusBadge>
                        <span className="text-sm font-medium">{TYPE_LABEL[row.type] ?? row.type}</span>
                        {row.companyCode ? <Badge variant="secondary" className="font-mono text-[11px]">{row.companyCode}</Badge> : null}
                        {row.state === "READ" ? <span className="text-xs text-muted-foreground">Read</span> : null}
                        {row.state === "ACKED" ? <StatusBadge tone="success">Acknowledged</StatusBadge> : null}
                      </div>
                      <p className="text-sm">{row.message}</p>
                      <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                        <span>
                          {when(row)} · {(CHANNEL_LABEL[row.channel] ?? row.channel).toLowerCase()}
                          {row.recipients ? ` · ${row.recipients}` : ""}
                        </span>
                        <Link href={target.href} className="font-medium text-primary hover:underline">
                          {target.label}
                        </Link>
                      </div>
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
                      ) : null}
                    </div>
                  </div>
                );
              })}
              {!alerts.isLoading && rows.length === 0 ? (
                <p className="px-4 py-6 text-center text-sm text-muted-foreground">
                  No alerts match this filter. Run the sweep above to evaluate the current month.
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
        </TabsContent>

        {/* Tab 2: Policy & Delivery */}
        <TabsContent value="policy" className="space-y-4">
          <Callout tone="warning" title="Provisional policy notice">
            While <strong className="font-medium">Sustained rule</strong> is active, month-1 over-limit readings generate{" "}
            <strong className="font-medium">Provisional</strong> notices rather than confirmed breaches (unless above the{" "}
            {shownPolicy?.spikeMultiple ?? 2}× spike override). Every policy edit writes an entry to the Governance Change log.
          </Callout>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Panel>
              <PanelHead
                title="Variance confirmation rules"
                description="Six rules read by variance scans and alert sweeps."
              />
              <div className="divide-y divide-border/50 px-4">
                {POLICY_FIELDS.map((field) => (
                  <div key={field.setting} className="flex flex-wrap items-center justify-between gap-3 py-2.5">
                    <div className="min-w-0">
                      <p className="text-sm font-medium">{field.label}</p>
                      <p className="text-xs text-muted-foreground">{field.hint}</p>
                    </div>
                    {field.kind === "switch" ? (
                      <div className="flex min-h-10 items-center gap-2">
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
                        className="h-9 w-24 text-right font-mono tabular-nums"
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
              </div>
              <div className="space-y-2 border-t border-border/50 px-4 py-3">
                <Button size="sm" className="h-9" disabled={!policyDirty || policyProblems.length > 0 || alerts.isBusy} onClick={applyPolicy}>
                  Apply and log change
                </Button>
                <p className="text-xs text-muted-foreground">
                  {policyProblems.length > 0
                    ? `${policyProblems[0]} Nothing is saved until all values validate.`
                    : policyDirty
                      ? "Unsaved draft. Applying updates settings and logs on the change board."
                      : "All rules shown are currently active."}
                </p>
              </div>
            </Panel>

            {/* 3-channel Delivery Matrix */}
            <Panel>
              <PanelHead
                title="3-Channel Delivery Matrix"
                description="Toggle In-app, Email, and Chat per alert rule. Breaches and escalations require In-app."
                count={`${payload?.policies.length ?? 0} rules`}
              />
              <div className="overflow-x-auto border-t border-border/60">
                <table className="w-full min-w-[520px] text-xs">
                  <thead className="bg-muted/35 text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2 text-left font-medium">Alert Type</th>
                      <th className="px-2 py-2 text-center font-medium">Active</th>
                      <th className="px-2 py-2 text-center font-medium">In-app</th>
                      <th className="px-2 py-2 text-center font-medium">Email</th>
                      <th className="px-2 py-2 text-center font-medium">Chat</th>
                      <th className="px-3 py-2 text-right font-medium">Lead</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/50">
                    {[...(payload?.policies ?? [])]
                      .sort((a, b) => POLICY_ORDER.indexOf(a.type) - POLICY_ORDER.indexOf(b.type))
                      .map((policy) => {
                        const ch = unpackChannels(policy);
                        const locked = MANDATORY_TYPES.has(policy.type);
                        return (
                          <tr key={policy.id}>
                            <td className="px-3 py-2.5">
                              <p className="font-medium text-sm">{TYPE_LABEL[policy.type] ?? policy.type}</p>
                              <p className="truncate text-[11px] text-muted-foreground">{ch.recipients || "Role defaults"}</p>
                            </td>
                            <td className="px-2 py-2.5 text-center">
                              <Switch
                                checked={policy.is_enabled}
                                disabled={alerts.isBusy}
                                aria-label={`Enable ${TYPE_LABEL[policy.type] ?? policy.type}`}
                                onCheckedChange={(next) => void alerts.updatePolicyRule(policy.id, { isEnabled: next })}
                              />
                            </td>
                            <td className="px-2 py-2.5 text-center">
                              <button
                                type="button"
                                disabled={locked || alerts.isBusy}
                                onClick={() => toggleChannel(policy, "inApp")}
                                title={locked ? "Mandatory in-app channel" : "Toggle In-app"}
                                className="inline-flex h-6 w-6 items-center justify-center rounded border border-border bg-card text-xs"
                              >
                                {locked ? <Lock className="h-3 w-3 text-primary" /> : ch.inApp ? "✓" : ""}
                              </button>
                            </td>
                            <td className="px-2 py-2.5 text-center">
                              <input
                                type="checkbox"
                                checked={ch.email}
                                disabled={alerts.isBusy}
                                onChange={() => toggleChannel(policy, "email")}
                                aria-label={`Email channel for ${policy.type}`}
                                className="h-4 w-4 accent-primary"
                              />
                            </td>
                            <td className="px-2 py-2.5 text-center">
                              <input
                                type="checkbox"
                                checked={ch.chat}
                                disabled={alerts.isBusy}
                                onChange={() => toggleChannel(policy, "chat")}
                                aria-label={`Chat channel for ${policy.type}`}
                                className="h-4 w-4 accent-primary"
                              />
                            </td>
                            <td className="px-3 py-2.5 text-right font-mono tabular-nums text-muted-foreground">
                              {policy.lead_days > 0 ? `${policy.lead_days}d` : "Immediate"}
                            </td>
                          </tr>
                        );
                      })}
                  </tbody>
                </table>
              </div>
            </Panel>
          </div>

          {/* Full-width Message Preview */}
          <Panel>
            <PanelHead
              title="Message Preview"
              description="Email copy and webhook JSON payload constructed from a live alert record."
              right={
                rows.length > 0 ? (
                  <Select value={String(previewRow?.id ?? "")} onValueChange={(next) => setPreviewId(Number(next))}>
                    <SelectTrigger className="h-9 w-[240px]">
                      <SelectValue placeholder="Pick an alert" />
                    </SelectTrigger>
                    <SelectContent className="max-h-60 min-w-[240px]">
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
              <div className="grid gap-4 border-t border-border/60 px-4 py-4 md:grid-cols-2">
                <div>
                  <div className="mb-1.5 flex items-center justify-between gap-2">
                    <p className="text-xs font-medium uppercase tracking-[0.06em] text-muted-foreground">Email</p>
                    <Button variant="ghost" size="sm" className="h-7 gap-1 px-2 text-xs" onClick={() => void copy(previewEmail(previewRow), "email")}>
                      <ClipboardCopy className="h-3.5 w-3.5" /> Copy
                    </Button>
                  </div>
                  <pre className="max-h-56 overflow-auto whitespace-pre-wrap rounded-lg border border-border/60 bg-muted/40 p-3 text-xs leading-5">
                    {previewEmail(previewRow)}
                  </pre>
                </div>
                <div>
                  <div className="mb-1.5 flex items-center justify-between gap-2">
                    <p className="text-xs font-medium uppercase tracking-[0.06em] text-muted-foreground">Chat webhook payload</p>
                    <Button variant="ghost" size="sm" className="h-7 gap-1 px-2 text-xs" onClick={() => void copy(previewJson(previewRow), "payload")}>
                      <ClipboardCopy className="h-3.5 w-3.5" /> Copy
                    </Button>
                  </div>
                  <pre className="max-h-56 overflow-auto rounded-lg border border-border/60 bg-muted/40 p-3 text-xs leading-5">
                    {previewJson(previewRow)}
                  </pre>
                </div>
              </div>
            ) : (
              <p className="border-t border-border/60 px-4 py-6 text-sm text-muted-foreground">
                No alerts available to preview yet.
              </p>
            )}
          </Panel>
        </TabsContent>
      </Tabs>
    </div>
  );
}
