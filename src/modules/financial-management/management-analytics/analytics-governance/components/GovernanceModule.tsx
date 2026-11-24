"use client";

import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";

import { BoardHeader, Panel, PanelHead, Stat } from "@/modules/financial-management/management-analytics/shared/BoardKit";
import { BarList } from "@/modules/financial-management/management-analytics/shared/Charts";
import { useGovernance } from "../hooks/useGovernance";
import { OptionCombobox } from "./OptionCombobox";
import { Notice } from "./Notice";
import { StatusBadge } from "./StatusBadge";
import { TablePager, pageSlice } from "./TablePager";
import { phtDisplayStamp } from "../pht";
import type { AssignmentRow, ChangeRequestRow, GovernancePayload, OrgCompanyRow, RoleRow } from "../types";

const PAGE_SIZE = 10;

/** A stored setting reads as a sentence, not as a column name. */
function settingLabel(label: string): string {
  return label.replace(", PHP M a year", " \u00b7 \u20b1M a year").replace(/, /g, " \u00b7 ");
}

function SettingRows({
  rows,
  draft,
  setDraft,
  busy,
  onSave,
}: {
  rows: GovernancePayload["policies"];
  draft: Record<string, string>;
  setDraft: (next: (prev: Record<string, string>) => Record<string, string>) => void;
  busy: boolean;
  onSave: (key: string, value: string) => void;
}) {
  const shared = rows.length > 1 && rows.every((row) => row.note === rows[0].note) ? rows[0].note : null;
  return (
    <div className="divide-y divide-border/60 px-4">
      {rows.map((row) => {
        const current = draft[row.key] ?? row.value;
        const dirty = current !== row.value;
        const isSwitch = row.value === "on" || row.value === "off";
        return (
          <div key={row.key} className="flex flex-wrap items-center justify-between gap-3 py-3">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">{settingLabel(row.label)}</p>
              {shared ? null : <p className="text-xs text-muted-foreground">{row.note ?? row.key}</p>}
            </div>
            <div className="flex items-center gap-2">
              {isSwitch ? (
                <Switch
                  checked={current === "on"}
                  disabled={busy}
                  aria-label={settingLabel(row.label)}
                  onCheckedChange={(checked) => {
                    const next = checked ? "on" : "off";
                    setDraft((prev) => ({ ...prev, [row.key]: next }));
                    onSave(row.key, next);
                  }}
                />
              ) : (
                <>
                  <Input
                    className="h-9 w-[140px] tabular-nums"
                    value={current}
                    aria-label={settingLabel(row.label)}
                    onChange={(event) =>
                      setDraft((prev) => ({ ...prev, [row.key]: event.target.value }))
                    }
                  />
                  <Button variant="outline" size="sm" className="h-9" disabled={!dirty || busy} onClick={() => onSave(row.key, current)}>
                    Save
                  </Button>
                </>
              )}
            </div>
          </div>
        );
      })}
      {shared ? <p className="pb-3 text-xs text-muted-foreground">{shared}</p> : null}
    </div>
  );
}

function PolicyCard({ data, onSave, busy }: { data: GovernancePayload; busy: boolean; onSave: (key: string, value: string) => void }) {
  const [draft, setDraft] = useState<Record<string, string>>({});
  const baselines = data.policies.filter((row) => row.key.startsWith("baseline_"));
  const policy = data.policies.filter((row) => !row.key.startsWith("baseline_"));

  return (
    <div className="space-y-4">
      <Panel>
        <PanelHead
          title="Variance policy"
          description="These values decide how a reading becomes an exception."
          count={policy.length}
        />
        <SettingRows rows={policy} draft={draft} setDraft={setDraft} busy={busy} onSave={onSave} />
      </Panel>

      <Panel>
        <PanelHead
          title="Scenario baselines"
          description="The planner reads these until the ERP feed is mapped to measures."
          count={baselines.length}
        />
        <SettingRows rows={baselines} draft={draft} setDraft={setDraft} busy={busy} onSave={onSave} />
      </Panel>
    </div>
  );
}

function GrantDialog({
  data,
  open,
  onOpenChange,
  onSubmit,
  busy,
}: {
  data: GovernancePayload;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (input: { userId: number; roleId: number; companyId: number }) => Promise<boolean>;
  busy: boolean;
}) {
  const [userId, setUserId] = useState("");
  const [roleId, setRoleId] = useState("");
  const [companyId, setCompanyId] = useState("0");
  const [error, setError] = useState<string | null>(null);

  const missing = [userId ? "" : "person", roleId ? "" : "role"].filter(Boolean);

  const submit = async () => {
    if (missing.length > 0) {
      setError(`Still to choose: ${missing.join(", ")}.`);
      return;
    }
    setError(null);
    const ok = await onSubmit({ userId: Number(userId), roleId: Number(roleId), companyId: Number(companyId) });
    if (ok) onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent showCloseButton={false} className="flex max-h-[85vh] w-[95vw] flex-col overflow-hidden rounded-2xl p-0 sm:max-w-[560px]">
        <DialogHeader className="space-y-1 border-b border-border px-6 py-4">
          <DialogTitle className="text-base font-semibold">Grant access</DialogTitle>
          <p className="text-xs text-muted-foreground">A person can hold more than one role, and one role can be granted per company.</p>
        </DialogHeader>
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-6 py-4">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Person</label>
            <OptionCombobox
              value={userId}
              onChange={setUserId}
              placeholder="Choose a person"
              searchPlaceholder="Search people"
              emptyLabel="No person matches."
              options={data.users.map((user) => ({ value: String(user.id), label: user.name, description: user.email }))}
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Role</label>
            <Select value={roleId} onValueChange={setRoleId}>
              <SelectTrigger className="h-9 w-full"><SelectValue placeholder="Choose a role" /></SelectTrigger>
              <SelectContent className="max-h-60 min-w-[200px] [&_[data-slot=select-item]]:whitespace-nowrap">
                {data.roles.map((role) => (
                  <SelectItem key={role.id} value={String(role.id)}>{role.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Company</label>
            <Select value={companyId} onValueChange={setCompanyId}>
              <SelectTrigger className="h-9 w-full"><SelectValue /></SelectTrigger>
              <SelectContent className="max-h-60 min-w-[220px] [&_[data-slot=select-item]]:whitespace-nowrap">
                <SelectItem value="0">Every company</SelectItem>
                {data.companies.filter((row) => row.kind === "OPERATING").map((row) => (
                  <SelectItem key={row.id} value={String(row.id)}>{row.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {error ? <Notice tone="danger" title="Nothing was saved">{error}</Notice> : null}
        </div>
        <DialogFooter className="border-t border-border bg-muted/20 px-6 py-4">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
          <Button onClick={submit} disabled={busy || missing.length > 0} title={missing.length > 0 ? `Still to choose: ${missing.join(", ")}.` : undefined}>
            Grant access
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RemoveAccessDialog({
  row,
  open,
  onOpenChange,
  onConfirm,
  busy,
}: {
  row: AssignmentRow | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (id: number) => Promise<void>;
  busy: boolean;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent showCloseButton={false} className="flex max-h-[85vh] w-[95vw] flex-col overflow-hidden rounded-2xl p-0 sm:max-w-[425px]">
        <DialogHeader className="space-y-1 border-b border-border px-6 py-4">
          <DialogTitle className="text-base font-semibold">Remove access</DialogTitle>
          <p className="text-xs text-muted-foreground">The grant is deleted; the person keeps their other roles.</p>
        </DialogHeader>
        <div className="space-y-2 px-6 py-4 text-sm">
          <p>
            {row ? `${row.name} loses ${row.roleName} for ${row.companyLabel}.` : null}
          </p>
        </div>
        <DialogFooter className="border-t bg-muted/20 px-6 py-4">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          <Button variant="destructive" disabled={busy || !row} onClick={() => row && void onConfirm(row.id)}>
            Remove access
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RaiseChangeDialog({
  data,
  open,
  onOpenChange,
  onSubmit,
  busy,
}: {
  data: GovernancePayload;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (input: { summary: string; kpiId: number | null }) => Promise<boolean>;
  busy: boolean;
}) {
  const [kpiId, setKpiId] = useState("");
  const [summary, setSummary] = useState("");

  const missing = summary.trim().length < 10 ? "what changes, in at least a sentence" : "";

  const submit = async () => {
    if (missing) return;
    const ok = await onSubmit({ summary: summary.trim(), kpiId: kpiId ? Number(kpiId) : null });
    if (ok) {
      setSummary("");
      setKpiId("");
      onOpenChange(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent showCloseButton={false} className="flex max-h-[85vh] w-[95vw] flex-col overflow-hidden rounded-2xl p-0 sm:max-w-[560px]">
        <DialogHeader className="space-y-1 border-b border-border px-6 py-4">
          <DialogTitle className="text-base font-semibold">Raise a change</DialogTitle>
          <p className="text-xs text-muted-foreground">A change of method is approved before it takes effect, and the decision is kept.</p>
        </DialogHeader>
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-6 py-4">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Measure</label>
            <OptionCombobox
              value={kpiId}
              onChange={setKpiId}
              placeholder="Every measure"
              searchPlaceholder="Search measures"
              emptyLabel="No measure matches."
              options={data.kpis.map((kpi) => ({ value: String(kpi.id), label: kpi.label }))}
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">What changes</label>
            <Textarea
              value={summary}
              onChange={(event) => setSummary(event.target.value)}
              rows={4}
              maxLength={500}
              placeholder="Raise the freight threshold from 8% to 9%; the lanes renegotiated the contracts."
              aria-invalid={summary.length > 0 && Boolean(missing)}
            />
            <p className="text-[11px] text-muted-foreground">{summary.trim().length}/500 characters</p>
          </div>
        </div>
        <DialogFooter className="border-t bg-muted/20 px-6 py-4">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
          <span className="inline-flex" title={missing ? `Still to do: ${missing}.` : undefined}>
            <Button disabled={busy || Boolean(missing)} onClick={() => void submit()}>Raise a change</Button>
          </span>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DecisionDialog({
  row,
  open,
  onOpenChange,
  onDecide,
  busy,
}: {
  row: ChangeRequestRow | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDecide: (id: number, status: "APPROVED" | "REJECTED", note: string) => Promise<boolean>;
  busy: boolean;
}) {
  const [note, setNote] = useState("");
  const missing = note.trim() ? [] : ["a reason"];
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent showCloseButton={false} className="flex max-h-[85vh] w-[95vw] flex-col overflow-hidden rounded-2xl p-0 sm:max-w-[550px]">
        <DialogHeader className="space-y-1 border-b border-border px-6 py-4">
          <DialogTitle className="text-base font-semibold">{row?.summary ?? "Decide a change"}</DialogTitle>
          <p className="text-xs text-muted-foreground">{row ? `${row.entity}${row.entityId != null ? ` #${row.entityId}` : ""} · requested ${row.requestedAt ? phtDisplayStamp(row.requestedAt) : "earlier"}` : null}</p>
        </DialogHeader>
        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-6 py-4">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Reason</label>
            <Textarea rows={3} value={note} onChange={(event) => setNote(event.target.value)} placeholder="Why this change is approved or rejected" />
          </div>
        </div>
        <DialogFooter className="border-t border-border bg-muted/20 px-6 py-4">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
          <Button variant="outline" disabled={busy || !row || missing.length > 0} title={missing.length > 0 ? "A reason is required." : undefined} onClick={() => row && void onDecide(row.id, "REJECTED", note).then((ok) => ok && onOpenChange(false))}>
            Reject
          </Button>
          <Button disabled={busy || !row || missing.length > 0} title={missing.length > 0 ? "A reason is required." : undefined} onClick={() => row && void onDecide(row.id, "APPROVED", note).then((ok) => ok && onOpenChange(false))}>
            Approve
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** A role's grants read as companies with their domains, not as one chip per pair. */
function companyLine(role: RoleRow, companies: OrgCompanyRow[]): string {
  const codes = [...new Set(role.grants.map((grant) => grant.companyCode))];
  if (codes.length === 0) return "No company yet";
  if (codes.includes("ALL")) return "Every company";
  const names = codes.map((code) => companies.find((row) => row.code === code)?.name ?? code);
  if (names.length <= 2) return names.join(", ");
  return `${names.slice(0, 2).join(", ")} +${names.length - 2} more`;
}

/** The reference's access matrix: one row per role, one column per domain the grants carry. */
function AccessMatrix({ roles, companies }: { roles: RoleRow[]; companies: OrgCompanyRow[] }) {
  const domains = [...new Set(roles.flatMap((role) => role.grants.map((grant) => grant.domain)))].sort();
  if (roles.length === 0) {
    return <p className="px-4 py-8 text-center text-sm text-muted-foreground">No role is defined yet.</p>;
  }
  return (
    <>
      <div className="hidden min-[980px]:block overflow-x-auto">
      <table className="w-full min-w-[980px] text-sm">
        <thead>
          <tr className="border-b border-border/60 text-left text-xs text-muted-foreground">
            <th className="px-4 py-2.5 font-medium">Role</th>
            <th className="px-4 py-2.5 font-medium">Companies</th>
            {domains.map((domain) => (
              <th key={domain} className="whitespace-nowrap px-3 py-2.5 text-center font-medium">
                {domain}
              </th>
            ))}
            <th className="whitespace-nowrap px-3 py-2.5 text-center font-medium">Transaction detail</th>
            <th className="whitespace-nowrap px-3 py-2.5 text-center font-medium">Sign off changes</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border/50">
          {roles.map((role) => {
            const held = new Set(role.grants.map((grant) => grant.domain));
            const isExec = /exec/i.test(role.name);
            return (
              <tr key={role.id} className="hover:bg-muted/30">
                <td className="px-4 py-2.5">
                  <p className="font-medium">{role.name}</p>
                  <p className="mt-0.5 text-xs uppercase tracking-wide text-muted-foreground">{role.scope}</p>
                </td>
                <td className="px-4 py-2.5 text-xs text-muted-foreground">{companyLine(role, companies)}</td>
                {domains.map((domain) => (
                  <td key={domain} className="px-3 py-2.5 text-center">
                    {held.has(domain) ? (
                      <StatusBadge tone="success">Visible</StatusBadge>
                    ) : (
                      <span className="text-xs text-muted-foreground">Hidden</span>
                    )}
                  </td>
                ))}
                <td className="px-3 py-2.5 text-center text-xs text-muted-foreground">
                  {isExec ? "Aggregated only" : "✓ Drill-down"}
                </td>
                <td className="px-3 py-2.5 text-center text-xs font-medium">
                  {isExec ? "✓" : "—"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      </div>

      <ul className="divide-y divide-border min-[980px]:hidden">
        {roles.map((role) => {
          const visible = [...new Set(role.grants.map((grant) => grant.domain))];
          return (
            <li key={role.id} className="px-4 py-3">
              <p className="text-sm font-medium">{role.name}</p>
              <p className="mt-0.5 text-xs uppercase tracking-wide text-muted-foreground">{role.scope}</p>
              <p className="mt-1 text-xs text-muted-foreground">{companyLine(role, companies)}</p>
              <div className="mt-1.5 flex flex-wrap gap-1">
                {visible.length === 0 ? (
                  <span className="text-xs text-muted-foreground">No domain visible</span>
                ) : (
                  visible.map((domain) => (
                    <span key={domain} className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
                      {domain}
                    </span>
                  ))
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </>
  );
}

const TAB_VALUES = ["access", "organisation", "policy", "changes"] as const;

/** The tab a shared link names, when it names one we have. */
function readTab(): string {
  if (typeof window === "undefined") return "access";
  const wanted = new URLSearchParams(window.location.search).get("tab");
  return wanted && (TAB_VALUES as readonly string[]).includes(wanted) ? wanted : "access";
}

function writeTab(tab: string) {
  const params = new URLSearchParams(window.location.search);
  if (tab === "access") params.delete("tab");
  else params.set("tab", tab);
  const query = params.toString();
  window.history.replaceState(null, "", query ? `${window.location.pathname}?${query}` : window.location.pathname);
}

/** Rows per page is a reader preference, so it survives a reload (QA.md 11). */
const SIZE_KEY = "fm.management-analytics.governance.rows";

function readStoredSize(fallback: number): number {
  if (typeof window === "undefined") return fallback;
  const raw = Number(window.localStorage.getItem(SIZE_KEY));
  return Number.isFinite(raw) && raw > 0 ? raw : fallback;
}

function storeSize(value: number): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(SIZE_KEY, String(value));
}

export function GovernanceModule() {
  const governance = useGovernance();
  const [tab, setTab] = useState(readTab);

  function changeTab(next: string) {
    setTab(next);
    writeTab(next);
  }
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(() => readStoredSize(PAGE_SIZE));
  const [grantOpen, setGrantOpen] = useState(false);
  const [deciding, setDeciding] = useState<ChangeRequestRow | null>(null);
  const [raising, setRaising] = useState(false);
  const [removing, setRemoving] = useState<AssignmentRow | null>(null);

  const data = governance.data;
  const assignments = useMemo(() => data?.assignments ?? [], [data]);
  const changes = data?.changes ?? [];
  const visibleAssignments = useMemo(() => pageSlice(assignments, page, pageSize), [assignments, page, pageSize]);
  const pendingChanges = changes.filter((row) => row.status === "PENDING");

  if (governance.error) {
    return (
      <Notice tone="danger" title="Access and governance could not be read">
        {governance.error}
      </Notice>
    );
  }

  return (
    <div className="space-y-4">
      <BoardHeader
        title="Access and Governance"
        subtitle="Who may see which company and measure, the organisation behind the roll-ups, and the policy in force."
        meta={
          <>
            <span className="rounded-full bg-muted px-2.5 py-1 text-[11px] font-medium tabular-nums text-muted-foreground">
              {(data?.roles.length ?? 0)} roles
            </span>
            <span className="rounded-full bg-muted px-2.5 py-1 text-[11px] font-medium tabular-nums text-muted-foreground">
              {assignments.length} grant{assignments.length === 1 ? "" : "s"}
            </span>
          </>
        }
      />

      {data ? (
        <Panel className="grid gap-4 p-4">
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <Stat
              label="People with access"
              value={String(assignments.length)}
              note={`${new Set(assignments.map((row) => row.userId)).size} distinct people`}
            />
            <Stat
              label="Roles in force"
              value={String(data.roles.length)}
              note={`${data.roles.filter((role) => role.scope === "GROUP").length} group-wide`}
            />
            <Stat
              label="Entities"
              value={String(data.companies.length)}
              note={`${data.companies.filter((row) => row.isActive).length} active`}
            />
            <Stat
              label="Changes pending"
              value={String(pendingChanges.length)}
              tone={pendingChanges.length > 0 ? "warning" : undefined}
              note={`${changes.length} raised in total`}
            />
          </div>
          <div>
            <p className="text-[11px] font-medium uppercase tracking-[0.06em] text-muted-foreground">Grants carried by each role</p>
            <div className="mt-2">
              <BarList
                rows={data.roles.map((role) => ({
                  label: role.name,
                  value: role.grants.length,
                  tone: role.scope === "GROUP" ? ("primary" as const) : ("muted" as const),
                }))}
                dp={0}
                unit=" grants"
              />
            </div>
          </div>
        </Panel>
      ) : null}

      {!data && governance.isLoading ? (
        <div className="overflow-hidden rounded-xl border border-border bg-card">
          <div className="border-b border-border px-4 py-3">
            <div className="h-4 w-40 animate-pulse rounded bg-muted" />
          </div>
          <div className="space-y-3 p-4">
            {Array.from({ length: 6 }).map((_, index) => (
              <div key={index} className="h-10 w-full animate-pulse rounded-md bg-muted" />
            ))}
          </div>
        </div>
      ) : null}

      {/* Nothing is shown until the read returns, so an empty tab cannot be mistaken for a real answer. */}
      {data || !governance.isLoading ? (
      <Tabs value={tab} onValueChange={changeTab} className="space-y-4">
        <TabsList>
          <TabsTrigger className="min-h-11 md:min-h-0" value="access">Roles and access</TabsTrigger>
          <TabsTrigger className="min-h-11 md:min-h-0" value="organisation">Organisation</TabsTrigger>
          <TabsTrigger className="min-h-11 md:min-h-0" value="policy">Policy</TabsTrigger>
          <TabsTrigger className="min-h-11 md:min-h-0" value="changes">Changes</TabsTrigger>
        </TabsList>

        <TabsContent value="access" className="space-y-4">
          <Panel>
            <PanelHead
              title="Access grants"
              description="A role carries the domains; the grant fixes the company."
              count={assignments.length}
              right={
                <Button size="sm" className="h-8" onClick={() => setGrantOpen(true)} disabled={!data || data.users.length === 0}>
                  Grant access
                </Button>
              }
            />
            <div className="hidden overflow-x-auto min-[1300px]:block">
              <table className="w-full min-w-[720px] text-sm">
                <thead>
                  <tr className="border-b border-border/60 text-left text-xs text-muted-foreground">
                    <th className="px-4 py-2.5 font-medium">Person</th>
                    <th className="px-4 py-2.5 font-medium">Role</th>
                    <th className="px-4 py-2.5 font-medium">Company</th>
                    <th className="px-4 py-2.5 text-right font-medium"><span className="sr-only">Remove</span></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/50">
                  {visibleAssignments.map((row) => (
                    <tr key={row.id} className="hover:bg-muted/30">
                      <td className="px-4 py-2.5">
                        <p className="truncate font-medium" title={row.name}>{row.name}</p>
                        <p className="truncate mt-0.5 text-xs text-muted-foreground" title={row.email}>{row.email}</p>
                      </td>
                      <td className="px-4 py-2.5">{row.roleName}</td>
                      <td className="px-4 py-2.5 text-muted-foreground">{row.companyLabel}</td>
                      <td className="px-4 py-2.5 text-right">
                        <Button variant="ghost" size="sm" className="h-8 text-xs text-destructive hover:text-destructive" onClick={() => setRemoving(row)}>
                          Remove
                        </Button>
                      </td>
                    </tr>
                  ))}
                  {visibleAssignments.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="px-4 py-8 text-center text-sm text-muted-foreground">
                        No access has been granted yet. Grant a role to a person to let them see a company.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
            <ul className="divide-y divide-border min-[1300px]:hidden">
              {visibleAssignments.map((row) => (
                <li key={row.id} className="space-y-1.5 px-4 py-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium" title={row.name}>{row.name}</p>
                      <p className="truncate text-xs text-muted-foreground" title={row.email}>{row.email}</p>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 shrink-0 text-xs text-destructive hover:text-destructive"
                      onClick={() => setRemoving(row)}
                    >
                      Remove
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {row.roleName} · {row.companyLabel}
                  </p>
                </li>
              ))}
              {visibleAssignments.length === 0 ? (
                <li className="px-4 py-8 text-center text-sm text-muted-foreground">
                  No access has been granted yet. Grant a role to a person to let them see a company.
                </li>
              ) : null}
            </ul>
            <TablePager
              page={page}
              pageCount={Math.max(1, Math.ceil(assignments.length / pageSize))}
              total={assignments.length}
              pageSize={pageSize}
              onPageChange={setPage}
              onPageSizeChange={(size) => { storeSize(size); setPageSize(size); setPage(1); }}
              className="border-t border-border/50 px-4 py-3"
            />
          </Panel>

          <Panel>
            <PanelHead
              title="Roles and what they reach"
              description="Group roles span every company; company roles stop at their own."
              count={(data?.roles ?? []).length}
            />
            <AccessMatrix roles={data?.roles ?? []} companies={data?.companies ?? []} />
            <p className="border-t border-border/50 px-4 py-2.5 text-xs text-muted-foreground">
              A domain is visible when any grant of that role carries it, for one company or for all of them.
            </p>
          </Panel>
        </TabsContent>

        <TabsContent value="organisation" className="space-y-4">
          <Panel>
            <PanelHead
              title="Companies"
              description="The roll-up adds these, minus intercompany sales."
              count={`${data?.companies.length ?? 0} entities`}
            />
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-sm">
                <thead>
                  <tr className="border-b border-border/60 text-left text-xs text-muted-foreground">
                    <th className="px-4 py-2.5 font-medium">Company</th>
                    <th className="px-4 py-2.5 font-medium">Kind</th>
                    <th className="px-4 py-2.5 text-right font-medium">Revenue weight</th>
                    <th className="px-4 py-2.5 text-right font-medium">Headcount</th>
                    <th className="px-4 py-2.5 text-right font-medium">Units</th>
                    <th className="px-4 py-2.5 font-medium">ERP link</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/50">
                  {(data?.companies ?? []).map((row) => (
                    <tr key={row.id} className="hover:bg-muted/30">
                      <td className="px-4 py-2.5">
                        <p className="font-medium">{row.name}</p>
                        <p className="mt-0.5 text-xs text-muted-foreground">{row.code} · {row.currency}</p>
                      </td>
                      <td className="px-4 py-2.5 capitalize text-muted-foreground">{row.kind.toLowerCase()}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums">{row.revenueWeight}%</td>
                      <td className="px-4 py-2.5 text-right tabular-nums">{row.headcount}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums">{row.units}</td>
                      <td className="px-4 py-2.5 text-muted-foreground">{row.erpCompanyId ? `ERP ${row.erpCompanyId}` : "Not linked"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>
        </TabsContent>

        <TabsContent value="policy" className="space-y-4">
          {data ? <PolicyCard data={data} busy={governance.isSaving} onSave={(key, value) => void governance.setPolicy(key, value)} /> : null}
        </TabsContent>

        <TabsContent value="changes" className="space-y-4">
          <Panel>
            <PanelHead
              title="Changes raised for sign-off"
              description="Every method change is recorded here before it takes effect."
              count={`${pendingChanges.length} pending`}
              right={
                <Button size="sm" className="h-8 text-xs" onClick={() => setRaising(true)} disabled={!data || governance.isSaving}>
                  Raise a change
                </Button>
              }
            />
            <div className="hidden overflow-x-auto min-[1300px]:block">
              <table className="w-full min-w-[720px] text-sm">
                <thead>
                  <tr className="border-b border-border/60 text-left text-xs text-muted-foreground">
                    <th className="px-4 py-2.5 font-medium">#</th>
                    <th className="px-4 py-2.5 font-medium">Change</th>
                    <th className="px-4 py-2.5 font-medium">Requested</th>
                    <th className="px-4 py-2.5 font-medium">Status</th>
                    <th className="px-4 py-2.5 text-right font-medium">Decision</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/50">
                  {changes.map((row) => (
                    <tr key={row.id} className="hover:bg-muted/30">
                      <td className="px-4 py-2.5 font-mono text-xs tabular-nums text-muted-foreground">{row.id}</td>
                      <td className="px-4 py-2.5">
                        <p className="font-medium">{row.summary}</p>
                        <p className="mt-0.5 text-xs text-muted-foreground">{row.entity}{row.entityId != null ? ` #${row.entityId}` : ""}{row.note ? ` · ${row.note}` : ""}</p>
                      </td>
                      <td className="px-4 py-2.5 text-muted-foreground">{row.requestedAt ? phtDisplayStamp(row.requestedAt) : "not recorded"}</td>
                      <td className="px-4 py-2.5">
                        <StatusBadge tone={row.status === "APPROVED" ? "success" : row.status === "REJECTED" ? "danger" : "warning"}>
                          {row.status === "APPROVED" ? "Approved" : row.status === "REJECTED" ? "Rejected" : "Pending"}
                        </StatusBadge>
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        {row.status === "PENDING" ? (
                          <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => setDeciding(row)}>Decide</Button>
                        ) : (
                          <span className="text-xs text-muted-foreground">{row.decidedAt ? phtDisplayStamp(row.decidedAt) : "not decided"}</span>
                        )}
                      </td>
                    </tr>
                  ))}
                  {changes.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-4 py-8 text-center text-sm text-muted-foreground">
                        No change has been raised. Method changes appear here for sign-off.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
            <ul className="divide-y divide-border/50 min-[1300px]:hidden">
              {changes.map((row) => (
                <li key={row.id} className="space-y-2 px-4 py-3">
                  <div className="flex items-start justify-between gap-3">
                    <p className="min-w-0 text-sm font-medium">{row.summary}</p>
                    <StatusBadge tone={row.status === "APPROVED" ? "success" : row.status === "REJECTED" ? "danger" : "warning"}>
                      {row.status === "APPROVED" ? "Approved" : row.status === "REJECTED" ? "Rejected" : "Pending"}
                    </StatusBadge>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    #{row.id} · {row.entity}{row.entityId != null ? ` #${row.entityId}` : ""}
                    {row.requestedAt ? ` · raised ${phtDisplayStamp(row.requestedAt)}` : ""}
                  </p>
                  {row.note ? <p className="text-xs text-muted-foreground">{row.note}</p> : null}
                  {row.status === "PENDING" ? (
                    <Button size="sm" variant="outline" className="h-9 w-full text-xs" onClick={() => setDeciding(row)}>
                      Decide
                    </Button>
                  ) : (
                    <p className="text-xs text-muted-foreground">
                      {row.decidedAt ? `Decided ${phtDisplayStamp(row.decidedAt)}` : "No decision recorded"}
                    </p>
                  )}
                </li>
              ))}
              {changes.length === 0 ? (
                <li className="px-4 py-8 text-center text-sm text-muted-foreground">
                  No change has been raised. Method changes appear here for sign-off.
                </li>
              ) : null}
            </ul>
          </Panel>
        </TabsContent>
      </Tabs>
      ) : null}

      {data ? (
        <GrantDialog
          data={data}
          open={grantOpen}
          onOpenChange={setGrantOpen}
          onSubmit={governance.addAssignment}
          busy={governance.isSaving}
        />
      ) : null}
      {data ? (
        <RaiseChangeDialog
          data={data}
          open={raising}
          onOpenChange={setRaising}
          onSubmit={governance.raise}
          busy={governance.isSaving}
        />
      ) : null}
      <RemoveAccessDialog
        row={removing}
        open={removing !== null}
        onOpenChange={(open) => { if (!open) setRemoving(null); }}
        onConfirm={async (id) => {
          const ok = await governance.removeAssignment(id);
          if (ok) setRemoving(null);
        }}
        busy={governance.isSaving}
      />
      <DecisionDialog
        row={deciding}
        open={deciding !== null}
        onOpenChange={(open) => { if (!open) setDeciding(null); }}
        onDecide={governance.decide}
        busy={governance.isSaving}
      />
    </div>
  );
}
