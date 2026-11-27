"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Pencil, Plus, Search } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";

import { BoardHeader, Callout, ErpTags, Panel, PanelHead } from "./BoardKit";
import { ErpOrgRosterPanel } from "./ErpOrgRosterPanel";
import { useGovernance } from "../hooks/useGovernance";
import { OptionCombobox } from "./OptionCombobox";
import { Notice } from "./Notice";
import { StatusBadge } from "./StatusBadge";
import { TablePager, pageSlice } from "./TablePager";
import { phtDisplayStamp } from "../pht";
import type {
  AssignmentRow,
  ChangeRequestRow,
  GovernanceKpiRuleRow,
  GovernancePayload,
  OrgCompanyRow,
  RoleRow,
} from "../types";

const PAGE_SIZE = 10;

const ROLE_CAPABILITIES: Record<string, { detailAccess: string; canSignOff: boolean }> = {
  EXEC: { detailAccess: "Aggregated only", canSignOff: true },
  GROUP_EXEC: { detailAccess: "Aggregated only", canSignOff: true },
  CFO: { detailAccess: "Full drill-down", canSignOff: true },
  ADMIN: { detailAccess: "Full drill-down", canSignOff: true },
  CONTROLLER: { detailAccess: "Full drill-down", canSignOff: true },
};

function resolveRoleCapability(role: RoleRow) {
  const byCode = ROLE_CAPABILITIES[role.code.toUpperCase()];
  if (byCode) return byCode;
  if (role.scope === "GROUP") return { detailAccess: "Aggregated + cross-unit", canSignOff: true };
  return { detailAccess: "Full company drill-down", canSignOff: false };
}

function settingLabel(label: string): string {
  return label.replace(", PHP M a year", " · ₱M a year").replace(/, /g, " · ");
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
        return (
          <div key={row.key} className="flex flex-wrap items-center justify-between gap-3 py-3">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">{settingLabel(row.label)}</p>
              {shared ? null : <p className="text-xs text-muted-foreground">{row.note ?? row.key}</p>}
            </div>
            <div className="flex items-center gap-2">
              <Input
                className="h-9 w-[140px] font-mono tabular-nums"
                value={current}
                aria-label={settingLabel(row.label)}
                onChange={(event) =>
                  setDraft((prev) => ({ ...prev, [row.key]: event.target.value }))
                }
              />
              <Button variant="outline" size="sm" className="h-9" disabled={!dirty || busy} onClick={() => onSave(row.key, current)}>
                Save
              </Button>
            </div>
          </div>
        );
      })}
      {shared ? <p className="pb-3 text-xs text-muted-foreground">{shared}</p> : null}
    </div>
  );
}

function BaselinesPanel({ data, onSave, busy }: { data: GovernancePayload; busy: boolean; onSave: (key: string, value: string) => void }) {
  const [draft, setDraft] = useState<Record<string, string>>({});
  const baselines = data.policies.filter((row) => row.key.startsWith("baseline_"));

  return (
    <div className="space-y-4">
      <Callout tone="info" title="Variance & notification rules live on Alerts & Policy">
        To edit confirmation windows, sustained-breach rules, spike overrides, memo deadlines, or channel delivery,
        open{" "}
        <Link href="/fm/management-analytics/analytics-alerts?tab=policy" className="font-medium underline">
          Alerts &amp; Policy → Policy &amp; Delivery
        </Link>
        . Changes logged there automatically enter the Governance Sign-off audit trail.
      </Callout>

      <Panel>
        <PanelHead
          title="Scenario Baselines"
          description="Annual revenue, imported COGS share, and USD share assumptions used by Scenario Planner."
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
          <Button onClick={submit} disabled={busy || missing.length > 0}>Grant access</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EditCompanyDialog({
  row,
  open,
  onOpenChange,
  onSubmit,
  busy,
}: {
  row: OrgCompanyRow | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (id: number, input: { name: string; currency: string }) => Promise<boolean>;
  busy: boolean;
}) {
  const [name, setName] = useState(row?.name ?? "");
  const [currency, setCurrency] = useState(row?.currency ?? "PHP");

  if (!row) return null;

  const valid = name.trim().length >= 2 && /^[A-Za-z]{3}$/.test(currency.trim());
  const save = async () => {
    if (!valid) return;
    const ok = await onSubmit(row.id, { name: name.trim(), currency: currency.trim().toUpperCase() });
    if (ok) onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent showCloseButton={false} className="flex max-h-[85vh] w-[95vw] flex-col overflow-hidden rounded-2xl p-0 sm:max-w-[460px]">
        <DialogHeader className="space-y-1 border-b border-border px-6 py-4">
          <DialogTitle className="text-base font-semibold">Edit Company Registry · {row.code}</DialogTitle>
          <p className="text-xs text-muted-foreground">Updates display name and reporting currency across roll-ups.</p>
        </DialogHeader>
        <div className="space-y-4 px-6 py-4">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Company name</label>
            <Input value={name} onChange={(e) => setName(e.target.value)} className="h-9" />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Reporting currency (ISO 3-letter)</label>
            <Input value={currency} onChange={(e) => setCurrency(e.target.value.toUpperCase())} maxLength={3} className="h-9 w-28 font-mono uppercase" />
          </div>
        </div>
        <DialogFooter className="border-t bg-muted/20 px-6 py-4">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>Cancel</Button>
          <Button disabled={busy || !valid} onClick={() => void save()}>Save company</Button>
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
          <p>{row ? `${row.name} loses ${row.roleName} for ${row.companyLabel}.` : null}</p>
        </div>
        <DialogFooter className="border-t bg-muted/20 px-6 py-4">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>Cancel</Button>
          <Button variant="destructive" disabled={busy || !row} onClick={() => row && void onConfirm(row.id)}>
            Remove access
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const CHANGE_TYPES = [
  { value: "Threshold adjustment", label: "Threshold adjustment" },
  { value: "Target change", label: "Target change" },
  { value: "Formula / source mapping", label: "Formula / source mapping" },
  { value: "Owner position transfer", label: "Owner position transfer" },
  { value: "Policy exception", label: "Policy exception" },
];

function RaiseChangeDialog({
  data,
  initialKpiId,
  open,
  onOpenChange,
  onSubmit,
  busy,
}: {
  data: GovernancePayload;
  initialKpiId?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (input: { summary: string; kpiId: number | null; changeType?: string | null }) => Promise<boolean>;
  busy: boolean;
}) {
  const [kpiId, setKpiId] = useState(initialKpiId ?? "");
  const [changeType, setChangeType] = useState("Threshold adjustment");
  const [summary, setSummary] = useState("");

  const missing = summary.trim().length < 10 ? "what changes, in at least a sentence" : "";

  const submit = async () => {
    if (missing) return;
    const ok = await onSubmit({ summary: summary.trim(), kpiId: kpiId ? Number(kpiId) : null, changeType });
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
            <label className="text-xs font-medium text-muted-foreground">Change type</label>
            <Select value={changeType} onValueChange={setChangeType}>
              <SelectTrigger className="h-9 w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                {CHANGE_TYPES.map((ct) => (
                  <SelectItem key={ct.value} value={ct.value}>{ct.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
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
              maxLength={450}
              placeholder="Raise the freight threshold from 8% to 9%; the lanes renegotiated contracts."
              aria-invalid={summary.length > 0 && Boolean(missing)}
            />
            <p className="text-[11px] text-muted-foreground">{summary.trim().length}/450 characters</p>
          </div>
        </div>
        <DialogFooter className="border-t bg-muted/20 px-6 py-4">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
          <Button disabled={busy || Boolean(missing)} onClick={() => void submit()}>Raise a change</Button>
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
          <p className="text-xs text-muted-foreground">
            {row ? `${row.entity}${row.entityId != null ? ` #${row.entityId}` : ""} · requested ${row.requestedAt ? phtDisplayStamp(row.requestedAt) : "—"}` : null}
          </p>
        </DialogHeader>
        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-6 py-4">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Reason</label>
            <Textarea rows={3} value={note} onChange={(event) => setNote(event.target.value)} placeholder="Why this change is approved or rejected" />
          </div>
        </div>
        <DialogFooter className="border-t border-border bg-muted/20 px-6 py-4">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
          <Button variant="outline" disabled={busy || !row || missing.length > 0} onClick={() => row && void onDecide(row.id, "REJECTED", note).then((ok) => ok && onOpenChange(false))}>
            Reject
          </Button>
          <Button disabled={busy || !row || missing.length > 0} onClick={() => row && void onDecide(row.id, "APPROVED", note).then((ok) => ok && onOpenChange(false))}>
            Approve
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function companyLine(role: RoleRow, companies: OrgCompanyRow[]): string {
  const codes = [...new Set(role.grants.map((grant) => grant.companyCode))];
  if (codes.length === 0) return "No company yet";
  if (codes.includes("ALL")) return "Every company";
  const names = codes.map((code) => companies.find((row) => row.code === code)?.name ?? code);
  if (names.length <= 2) return names.join(", ");
  return `${names.slice(0, 2).join(", ")} +${names.length - 2} more`;
}

function AccessMatrix({ roles, companies }: { roles: RoleRow[]; companies: OrgCompanyRow[] }) {
  const domains = [...new Set(roles.flatMap((role) => role.grants.map((grant) => grant.domain)))].sort();
  if (roles.length === 0) {
    return <p className="px-4 py-8 text-center text-sm text-muted-foreground">No role is defined yet.</p>;
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[820px] text-sm">
        <thead>
          <tr className="border-b border-border/60 text-left text-xs text-muted-foreground">
            <th className="px-4 py-2.5 font-medium">Role</th>
            <th className="px-4 py-2.5 font-medium">Companies</th>
            {domains.map((domain) => (
              <th key={domain} className="whitespace-nowrap px-3 py-2.5 text-center font-medium">
                {domain}
              </th>
            ))}
            <th className="whitespace-nowrap px-3 py-2.5 text-center font-medium">Detail access</th>
            <th className="whitespace-nowrap px-3 py-2.5 text-center font-medium">Sign-off</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border/50">
          {roles.map((role) => {
            const held = new Set(role.grants.map((grant) => grant.domain));
            const cap = resolveRoleCapability(role);
            return (
              <tr key={role.id} className="hover:bg-muted/30">
                <td className="px-4 py-2.5">
                  <p className="font-medium">{role.name}</p>
                  <p className="mt-0.5 font-mono text-[11px] uppercase tracking-wide text-muted-foreground">
                    {role.code} · {role.scope}
                  </p>
                </td>
                <td className="px-4 py-2.5 text-xs text-muted-foreground">{companyLine(role, companies)}</td>
                {domains.map((domain) => (
                  <td key={domain} className="px-3 py-2.5 text-center">
                    {held.has(domain) ? (
                      <StatusBadge tone="success">Visible</StatusBadge>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </td>
                ))}
                <td className="px-3 py-2.5 text-center text-xs text-muted-foreground">{cap.detailAccess}</td>
                <td className="px-3 py-2.5 text-center text-xs font-medium">
                  {cap.canSignOff ? <StatusBadge tone="info">Approver</StatusBadge> : "—"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function formatRule(rule: GovernanceKpiRuleRow): string {
  if (rule.ruleType === "PCT" && rule.threshold !== null) return `±${rule.threshold}% band`;
  if (rule.ruleType === "MAX" && rule.threshold !== null) return `≤ ${rule.threshold}${rule.unit ? ` ${rule.unit}` : ""}`;
  if (rule.ruleType === "MIN" && rule.threshold !== null) return `≥ ${rule.threshold}${rule.unit ? ` ${rule.unit}` : ""}`;
  return rule.ruleType;
}

const TAB_VALUES = ["access", "organisation", "kpi-rules", "policy", "changes"] as const;

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
  const [editingCompany, setEditingCompany] = useState<OrgCompanyRow | null>(null);
  const [deciding, setDeciding] = useState<ChangeRequestRow | null>(null);
  const [raising, setRaising] = useState(false);
  const [raiseKpiId, setRaiseKpiId] = useState<string>("");
  const [removing, setRemoving] = useState<AssignmentRow | null>(null);

  const [kpiSearch, setKpiSearch] = useState("");
  const [kpiCompany, setKpiCompany] = useState("ALL");

  const data = governance.data;
  const assignments = useMemo(() => data?.assignments ?? [], [data]);
  const changes = data?.changes ?? [];
  const visibleAssignments = useMemo(() => pageSlice(assignments, page, pageSize), [assignments, page, pageSize]);
  const pendingChanges = changes.filter((row) => row.status === "PENDING");

  const filteredKpis = useMemo(() => {
    const q = kpiSearch.trim().toLowerCase();
    return (data?.kpis ?? []).filter((row) => {
      if (kpiCompany !== "ALL" && row.companyCode !== kpiCompany) return false;
      if (!q) return true;
      return `${row.kpiKey} ${row.name} ${row.ownerPosition ?? ""} ${row.companyCode}`.toLowerCase().includes(q);
    });
  }, [data?.kpis, kpiCompany, kpiSearch]);

  const positionsByCompany = useMemo(() => {
    const map = new Map<string, { companyCode: string; companyName: string; positions: Map<string, number> }>();
    for (const kpi of data?.kpis ?? []) {
      const entry = map.get(kpi.companyCode) ?? {
        companyCode: kpi.companyCode,
        companyName: kpi.companyName,
        positions: new Map<string, number>(),
      };
      const pos = kpi.ownerPosition?.trim() || "Unassigned";
      entry.positions.set(pos, (entry.positions.get(pos) ?? 0) + 1);
      map.set(kpi.companyCode, entry);
    }
    return [...map.values()].sort((a, b) => a.companyCode.localeCompare(b.companyCode));
  }, [data?.kpis]);

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
        eyebrow="Management Analytics · Controls & Directory"
        title="Access & Governance"
        subtitle="Role access matrix, operating entities and accountability positions, KPI threshold catalog, scenario baselines, and formal change sign-off."
        meta={
          <>
            <span className="rounded-full bg-muted px-2.5 py-1 text-[11px] font-medium tabular-nums text-muted-foreground">
              {data?.roles.length ?? 0} roles · {assignments.length} grants
            </span>
            <span className="rounded-full bg-muted px-2.5 py-1 text-[11px] font-medium tabular-nums text-muted-foreground">
              {data?.companies.length ?? 0} entities
            </span>
            <span className="rounded-full bg-muted px-2.5 py-1 text-[11px] font-medium tabular-nums text-muted-foreground">
              {pendingChanges.length} pending sign-off
            </span>
          </>
        }
      />

      <ErpOrgRosterPanel />

      {!data && governance.isLoading ? (
        <Panel className="p-6">
          <div className="space-y-3">
            {Array.from({ length: 6 }).map((_, index) => (
              <div key={index} className="h-9 w-full animate-pulse rounded-md bg-muted" />
            ))}
          </div>
        </Panel>
      ) : (
        <Tabs value={tab} onValueChange={changeTab} className="space-y-4">
          <TabsList className="flex h-auto flex-wrap justify-start gap-1">
            <TabsTrigger value="access">Roles &amp; Access</TabsTrigger>
            <TabsTrigger value="organisation">Organisation</TabsTrigger>
            <TabsTrigger value="kpi-rules">KPI Catalog &amp; Rules</TabsTrigger>
            <TabsTrigger value="policy">Baselines &amp; Policy</TabsTrigger>
            <TabsTrigger value="changes">
              Changes &amp; Sign-off{pendingChanges.length > 0 ? ` (${pendingChanges.length})` : ""}
            </TabsTrigger>
          </TabsList>

          {/* 1. Roles & Access */}
          <TabsContent value="access" className="space-y-4">
            <Panel>
              <PanelHead
                title="Access grants"
                description="Role determines domain visibility; assignment fixes company scope."
                count={assignments.length}
                right={
                  <Button size="sm" className="h-8 gap-1.5" onClick={() => setGrantOpen(true)} disabled={!data || data.users.length === 0}>
                    <Plus className="h-3.5 w-3.5" /> Grant access
                  </Button>
                }
              />
              <div className="hidden overflow-x-auto border-t border-border/60 md:block">
                <table className="w-full min-w-[680px] text-sm">
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
                          <p className="truncate font-medium">{row.name}</p>
                          <p className="mt-0.5 truncate text-xs text-muted-foreground">{row.email}</p>
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
                          No access grants yet.
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
              <ul className="divide-y divide-border border-t border-border/60 md:hidden">
                {visibleAssignments.map((row) => (
                  <li key={row.id} className="space-y-1 px-4 py-3">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-sm font-medium">{row.name}</p>
                        <p className="text-xs text-muted-foreground">{row.roleName} · {row.companyLabel}</p>
                      </div>
                      <Button variant="ghost" size="sm" className="h-8 text-xs text-destructive" onClick={() => setRemoving(row)}>
                        Remove
                      </Button>
                    </div>
                  </li>
                ))}
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
                title="Role Capabilities & Domain Matrix"
                description="Explicit capabilities by role code and scope."
                count={data?.roles.length ?? 0}
              />
              <AccessMatrix roles={data?.roles ?? []} companies={data?.companies ?? []} />
            </Panel>
          </TabsContent>

          {/* 2. Organisation (Editable Company Registry + Positions per Company) */}
          <TabsContent value="organisation" className="space-y-4">
            <Panel>
              <PanelHead
                title="Company Registry"
                description="Operating and holding entities included in consolidation roll-ups."
                count={`${data?.companies.length ?? 0} entities`}
              />
              <div className="overflow-x-auto border-t border-border/60">
                <table className="w-full min-w-[740px] text-sm">
                  <thead>
                    <tr className="border-b border-border/60 text-left text-xs text-muted-foreground">
                      <th className="px-4 py-2.5 font-medium">Company</th>
                      <th className="px-4 py-2.5 font-medium">Kind</th>
                      <th className="px-4 py-2.5 text-right font-medium">Rev. weight</th>
                      <th className="px-4 py-2.5 text-right font-medium">Headcount</th>
                      <th className="px-4 py-2.5 text-right font-medium">Units</th>
                      <th className="px-4 py-2.5 font-medium">ERP link</th>
                      <th className="px-4 py-2.5 text-right font-medium">Edit</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/50">
                    {(data?.companies ?? []).map((row) => (
                      <tr key={row.id} className="hover:bg-muted/30">
                        <td className="px-4 py-2.5">
                          <p className="font-medium">{row.name}</p>
                          <p className="mt-0.5 font-mono text-xs text-muted-foreground">{row.code} · {row.currency}</p>
                        </td>
                        <td className="px-4 py-2.5 text-xs capitalize text-muted-foreground">{row.kind.toLowerCase()}</td>
                        <td className="px-4 py-2.5 text-right font-mono tabular-nums">{row.revenueWeight}%</td>
                        <td className="px-4 py-2.5 text-right font-mono tabular-nums">{row.headcount}</td>
                        <td className="px-4 py-2.5 text-right font-mono tabular-nums">{row.units}</td>
                        <td className="px-4 py-2.5 text-xs text-muted-foreground">{row.erpCompanyId ? `ERP #${row.erpCompanyId}` : "—"}</td>
                        <td className="px-4 py-2.5 text-right">
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            className="h-8 gap-1 text-xs"
                            onClick={() => setEditingCompany(row)}
                          >
                            <Pencil className="h-3 w-3" /> Edit
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Panel>

            <Panel>
              <PanelHead
                title="Positions per Company"
                description="Accountable KPI owner positions mapped per entity."
                count={`${positionsByCompany.length} entities`}
              />
              <div className="grid gap-3 border-t border-border/60 p-4 sm:grid-cols-2 lg:grid-cols-3">
                {positionsByCompany.map((group) => (
                  <div key={group.companyCode} className="rounded-lg border border-border/60 bg-muted/15 p-3">
                    <div className="flex items-baseline justify-between gap-2 border-b border-border/50 pb-2">
                      <span className="text-sm font-semibold">{group.companyName}</span>
                      <span className="font-mono text-xs text-muted-foreground">{group.companyCode}</span>
                    </div>
                    <ul className="mt-2 space-y-1 text-xs">
                      {[...group.positions.entries()].map(([pos, count]) => (
                        <li key={pos} className="flex items-center justify-between gap-2">
                          <span className="truncate text-muted-foreground">{pos}</span>
                          <span className="font-mono tabular-nums text-foreground">{count} KPI{count === 1 ? "" : "s"}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </Panel>
          </TabsContent>

          {/* 3. KPI Catalog & Threshold Rules */}
          <TabsContent value="kpi-rules" className="space-y-4">
            <Panel>
              <PanelHead
                title="KPI Catalog & Threshold Rules"
                description="Active KPI definitions, thresholds, and owner positions. Raise a governance change request for any threshold or formula edit."
                count={`${filteredKpis.length} measures`}
              />
              <div className="flex flex-wrap items-center gap-2 border-t border-border/60 px-4 py-3">
                <div className="relative w-full sm:w-[260px]">
                  <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={kpiSearch}
                    onChange={(e) => setKpiSearch(e.target.value)}
                    placeholder="Filter key, KPI name, or owner"
                    className="h-9 pl-8 text-xs"
                  />
                </div>
                <Select value={kpiCompany} onValueChange={setKpiCompany}>
                  <SelectTrigger className="h-9 w-[190px] text-xs"><SelectValue placeholder="Every company" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ALL">Every company</SelectItem>
                    {(data?.companies ?? []).map((c) => (
                      <SelectItem key={c.code} value={c.code}>{c.code} · {c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="overflow-x-auto border-t border-border/60">
                <table className="w-full min-w-[820px] text-sm">
                  <thead>
                    <tr className="border-b border-border/60 text-left text-xs text-muted-foreground">
                      <th className="px-4 py-2 font-medium">KPI</th>
                      <th className="px-4 py-2 font-medium">Company</th>
                      <th className="px-4 py-2 font-medium">Domain</th>
                      <th className="px-4 py-2 font-medium">Threshold Rule</th>
                      <th className="px-4 py-2 font-medium">Owner Position</th>
                      <th className="px-4 py-2 text-right font-medium">Governance</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/50">
                    {filteredKpis.map((rule) => (
                      <tr key={rule.id} className="hover:bg-muted/20">
                        <td className="px-4 py-2">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="text-xs font-medium">{rule.name}</span>
                            <ErpTags kpiKey={rule.kpiKey} sourceCodes={rule.sourceCodes} compact />
                          </div>
                          <p className="font-mono text-[11px] text-muted-foreground">{rule.kpiKey}</p>
                        </td>
                        <td className="px-4 py-2 font-mono text-xs text-muted-foreground">{rule.companyCode}</td>
                        <td className="px-4 py-2 text-xs text-muted-foreground">{rule.domain}</td>
                        <td className="px-4 py-2 font-mono text-xs">
                          {formatRule(rule)} · {rule.polarity === "HIGH" ? "Higher ↑" : "Lower ↓"}
                        </td>
                        <td className="px-4 py-2 text-xs text-muted-foreground">{rule.ownerPosition ?? "—"}</td>
                        <td className="px-4 py-2 text-right">
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="h-7 text-xs"
                            onClick={() => {
                              setRaiseKpiId(String(rule.id));
                              setRaising(true);
                            }}
                          >
                            Raise change
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Panel>
          </TabsContent>

          {/* 4. Baselines & Policy */}
          <TabsContent value="policy" className="space-y-4">
            {data ? <BaselinesPanel data={data} busy={governance.isSaving} onSave={(key, value) => void governance.setPolicy(key, value)} /> : null}
          </TabsContent>

          {/* 5. Changes & Sign-off */}
          <TabsContent value="changes" className="space-y-4">
            <Panel>
              <PanelHead
                title="Changes raised for sign-off"
                description="Method, threshold, and policy changes recorded with executive decision audit."
                count={`${pendingChanges.length} pending`}
                right={
                  <Button
                    size="sm"
                    className="h-8 gap-1.5 text-xs"
                    onClick={() => {
                      setRaiseKpiId("");
                      setRaising(true);
                    }}
                    disabled={!data || governance.isSaving}
                  >
                    <Plus className="h-3.5 w-3.5" /> Raise a change
                  </Button>
                }
              />
              <div className="hidden overflow-x-auto border-t border-border/60 md:block">
                <table className="w-full min-w-[680px] text-sm">
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
                          <p className="mt-0.5 text-xs text-muted-foreground">
                            {row.entity}{row.entityId != null ? ` #${row.entityId}` : ""}{row.note ? ` · ${row.note}` : ""}
                          </p>
                        </td>
                        <td className="px-4 py-2.5 font-mono text-xs text-muted-foreground">{row.requestedAt ? phtDisplayStamp(row.requestedAt) : "—"}</td>
                        <td className="px-4 py-2.5">
                          <StatusBadge tone={row.status === "APPROVED" ? "success" : row.status === "REJECTED" ? "danger" : "warning"}>
                            {row.status === "APPROVED" ? "Approved" : row.status === "REJECTED" ? "Rejected" : "Pending"}
                          </StatusBadge>
                        </td>
                        <td className="px-4 py-2.5 text-right">
                          {row.status === "PENDING" ? (
                            <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => setDeciding(row)}>Decide</Button>
                          ) : (
                            <span className="font-mono text-xs text-muted-foreground">{row.decidedAt ? phtDisplayStamp(row.decidedAt) : "—"}</span>
                          )}
                        </td>
                      </tr>
                    ))}
                    {changes.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="px-4 py-8 text-center text-sm text-muted-foreground">
                          No changes raised yet.
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
              <ul className="divide-y divide-border/50 border-t border-border/60 md:hidden">
                {changes.map((row) => (
                  <li key={row.id} className="space-y-2 px-4 py-3">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm font-medium">{row.summary}</p>
                      <StatusBadge tone={row.status === "APPROVED" ? "success" : row.status === "REJECTED" ? "danger" : "warning"}>
                        {row.status === "APPROVED" ? "Approved" : row.status === "REJECTED" ? "Rejected" : "Pending"}
                      </StatusBadge>
                    </div>
                    {row.status === "PENDING" ? (
                      <Button size="sm" variant="outline" className="h-8 w-full text-xs" onClick={() => setDeciding(row)}>Decide</Button>
                    ) : null}
                  </li>
                ))}
              </ul>
            </Panel>
          </TabsContent>
        </Tabs>
      )}

      {data ? (
        <GrantDialog
          data={data}
          open={grantOpen}
          onOpenChange={setGrantOpen}
          onSubmit={governance.addAssignment}
          busy={governance.isSaving}
        />
      ) : null}
      <EditCompanyDialog
        key={editingCompany?.id ?? "none"}
        row={editingCompany}
        open={editingCompany !== null}
        onOpenChange={(open) => { if (!open) setEditingCompany(null); }}
        onSubmit={governance.saveCompany}
        busy={governance.isSaving}
      />
      {data ? (
        <RaiseChangeDialog
          key={`${raiseKpiId}-${raising}`}
          data={data}
          initialKpiId={raiseKpiId}
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
