"use client";

import { useState } from "react";
import { AlertTriangle, BookOpen, Network, Plus, Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { Panel, Progress, StatusChip } from "../../console/components/ui";
import { type PolicyContext, usePolicyEditor } from "../policy-client";
import { policyValue } from "../policy-labels";
import { accountPurposes, accountSchema, type PolicyAccount } from "../policy-types";
import { PolicyEmpty, PolicyStatusChip } from "./PolicyUi";
import { PolicyDialog, PolicyInput, PolicyPager, PolicySelect } from "./PolicyForm";

const classes = ["ASSET", "LIABILITY", "EQUITY", "INCOME", "EXPENSE"] as const;
type Purpose = typeof accountPurposes[number];
const accountLabel = (account: PolicyAccount) => `${account.code} · ${account.name}`;

function AccountEditor({ context, account, close }: { context: PolicyContext; account: PolicyAccount | null; close: () => void }) {
  const [draft, setDraft] = useState({
    id: account?.id, code: account?.code ?? "", name: account?.name ?? "",
    classification: account?.classification ?? "ASSET", isContra: account?.isContra ?? false, isActive: account?.isActive ?? true,
  });
  const [submitted, setSubmitted] = useState(false);
  const mapped = context.state.mappings.some(row => row.accountId === account?.id);
  const editor = usePolicyEditor(context, latest => latest.accounts.find(row => row.id === account?.id) ?? null);
  const valid = accountSchema.safeParse(draft);
  function errorFor(field: "code" | "name") {
    if (!submitted || valid.success) return undefined;
    const issue = valid.error.issues.find(issue => issue.path[0] === field);
    if (!issue) return undefined;
    if (field === "code") return "Use 1–32 letters, numbers, dots, dashes, or underscores.";
    if (issue.message.includes("Too small")) return "Enter an account name.";
    if (issue.message.includes("Too big")) return "Enter no more than 120 characters.";
    return issue.message;
  }
  return <PolicyDialog title={account ? "Edit GL account" : "Add GL account"}
    description="Accounts belong to the Cooperative chart of accounts." editor={editor} onClose={close}
    onSubmit={event => {
      event.preventDefault();
      setSubmitted(true);
      if (!valid.success) return;
      void editor.save({ section: "account", data: valid.data }).then(saved => { if (saved) close(); });
    }}>
    <PolicyInput label="Account code" value={draft.code} maxLength={32} disabled={mapped} required
      error={errorFor("code")} helper="Letters, numbers, dots, dashes, or underscores."
      onChange={event => setDraft({ ...draft, code: event.target.value })} />
    <PolicyInput label="Account name" value={draft.name} maxLength={120} required error={errorFor("name")}
      onChange={event => setDraft({ ...draft, name: event.target.value })} />
    <PolicySelect label="Classification" value={draft.classification} disabled={mapped}
      onChange={event => setDraft({ ...draft, classification: event.target.value as PolicyAccount["classification"] })}>
      {classes.map(code => <option key={code} value={code}>{policyValue("classification", code)}</option>)}
    </PolicySelect>
    <label className="flex items-center gap-2 text-sm">
      <input type="checkbox" className="accent-primary" checked={draft.isContra} disabled={mapped}
        onChange={event => setDraft({ ...draft, isContra: event.target.checked })} /> Contra account
    </label>
    <label className="flex items-center gap-2 text-sm">
      <input type="checkbox" className="accent-primary" checked={draft.isActive} disabled={mapped}
        onChange={event => setDraft({ ...draft, isActive: event.target.checked })} /> Active
    </label>
    {mapped && <p className="rounded-xl border border-amber-300 bg-amber-50/70 p-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
      This account is mapped to a transaction purpose. Remap it before changing its code, classification, or status.
    </p>}
  </PolicyDialog>;
}

function MappingEditor({ context, definition, close }: { context: PolicyContext; definition: Purpose; close: () => void }) {
  const [purpose, , title, classification, contra = false] = definition;
  const current = context.state.mappings.find(row => row.purpose === purpose);
  const [accountId, setAccountId] = useState(String(current?.accountId ?? ""));
  const [search, setSearch] = useState("");
  const editor = usePolicyEditor(context, latest => {
    const mapping = latest.mappings.find(row => row.purpose === purpose);
    const account = latest.accounts.find(row => row.id === mapping?.accountId);
    return account ? { account: accountLabel(account) } : null;
  });
  const choices = context.state.accounts.filter(account =>
    account.isActive && account.classification === classification && account.isContra === contra);
  const matches = choices.filter(account =>
    account.id === Number(accountId) || accountLabel(account).toLowerCase().includes(search.trim().toLowerCase()));
  return <PolicyDialog title={title}
    description={`Requires an active ${contra ? "contra " : ""}${classification.toLowerCase()} account.`}
    editor={editor} onClose={close} submitDisabled={!accountId}
    onSubmit={event => {
      event.preventDefault();
      void editor.save({ section: "mapping", data: { purpose, accountId: Number(accountId) } })
        .then(saved => { if (saved) close(); });
    }}>
    <PolicyInput label="Search eligible accounts" value={search} onChange={event => setSearch(event.target.value)} />
    <PolicySelect label="Cooperative GL account" required value={accountId} onChange={event => setAccountId(event.target.value)}>
      <option value="">Select an account</option>
      {matches.map(account => <option key={account.id} value={account.id}>{accountLabel(account)}</option>)}
    </PolicySelect>
    {!choices.length && <p className="text-sm text-muted-foreground">Add an eligible account to the chart before mapping this purpose.</p>}
    {choices.length > 0 && !matches.length && <p className="text-sm text-muted-foreground">No eligible accounts match your search.</p>}
  </PolicyDialog>;
}

export function PolicyAccounts({ context }: { context: PolicyContext }) {
  const [account, setAccount] = useState<PolicyAccount | null>();
  const [mapping, setMapping] = useState<Purpose>();
  const [view, setView] = useState<"accounts" | "mappings">("accounts");
  const [search, setSearch] = useState("");
  const [classification, setClassification] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [mappingSearch, setMappingSearch] = useState("");
  const [mappingClass, setMappingClass] = useState("");
  const [unmappedOnly, setUnmappedOnly] = useState(false);
  const { accounts, mappings } = context.state;
  const pageSize = 50;
  const totalPurposes = accountPurposes.length;
  const mappedCount = mappings.length;
  const gaps = Math.max(0, totalPurposes - mappedCount);
  const activeAccounts = accounts.filter(row => row.isActive).length;
  const accountMatches = accounts.filter(row => {
    const matches = accountLabel(row).toLowerCase().includes(search.trim().toLowerCase());
    const classMatches = !classification || row.classification === classification;
    const statusMatches = !status || row.isActive === (status === "active");
    return matches && classMatches && statusMatches;
  });
  const hasAccountFilters = Boolean(search.trim() || classification || status);
  const currentPage = Math.min(page, Math.max(1, Math.ceil(accountMatches.length / pageSize)));
  const accountRows = accountMatches.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const first = accountMatches.length ? (currentPage - 1) * pageSize + 1 : 0;
  const last = first ? first + accountRows.length - 1 : 0;
  const visiblePurposes = accountPurposes.filter(definition => {
    const [purpose, , title, requiredClass] = definition;
    const assigned = accounts.find(row => row.id === mappings.find(mapping => mapping.purpose === purpose)?.accountId);
    const text = `${title} ${assigned ? accountLabel(assigned) : ""}`.toLowerCase();
    return text.includes(mappingSearch.trim().toLowerCase()) &&
      (!mappingClass || requiredClass === mappingClass) &&
      (!unmappedOnly || !assigned);
  });
  const hasMappingFilters = Boolean(mappingSearch.trim() || mappingClass || unmappedOnly);

  function clearAccountFilters() {
    setSearch("");
    setClassification("");
    setStatus("");
    setPage(1);
  }

  function clearMappingFilters() {
    setMappingSearch("");
    setMappingClass("");
    setUnmappedOnly(false);
  }

  return <div className="space-y-4">
    <div className="rounded-xl border bg-muted/20 p-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Mapping completeness</p>
          <p className="mt-1 text-xl font-semibold">{mappedCount} <span className="text-sm font-normal text-muted-foreground">of {totalPurposes} transaction purposes</span></p>
        </div>
        <p className="text-xs text-muted-foreground">{accounts.length} accounts · {activeAccounts} active · {gaps ? `${gaps} gap${gaps === 1 ? "" : "s"}` : "All purposes covered"}</p>
      </div>
      <div className="mt-2"><Progress value={mappedCount} max={totalPurposes} /></div>
    </div>

    <div role="group" aria-label="Account policy view" className="inline-flex w-full max-w-md rounded-lg border bg-muted/40 p-1">
      {([
        ["accounts", "Chart of accounts", BookOpen, accounts.length],
        ["mappings", "Account mappings", Network, totalPurposes],
      ] as const).map(([key, label, Icon, count]) => <button key={key} type="button" aria-pressed={view === key}
        onClick={() => setView(key)}
        className={cn("inline-flex flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/40",
          view === key ? "bg-background shadow-xs" : "text-muted-foreground hover:text-foreground")}>
        <Icon className="size-3.5" /> {label} <Badge variant="outline">{count}</Badge>
      </button>)}
    </div>

    {view === "accounts" ? <Panel title="Chart of accounts" description="Accounts available to Cooperative transactions."
      actions={<Button size="sm" onClick={() => setAccount(null)}><Plus className="size-4" /> Add account</Button>}>
      <div className="rounded-xl border bg-muted/20 p-3">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[2fr_1fr_1fr_auto]">
          <label className="space-y-1.5 text-[11px] font-medium text-muted-foreground">
            Search by code or name
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input className="h-9 pl-8" value={search} placeholder="Code or account name"
                onChange={event => { setSearch(event.target.value); setPage(1); }} />
            </div>
          </label>
          <label className="space-y-1.5 text-[11px] font-medium text-muted-foreground">
            Classification
            <NativeSelect className="h-9 w-full" value={classification} onChange={event => { setClassification(event.target.value); setPage(1); }}>
              <option value="">All classifications</option>
              {classes.map(code => <option key={code} value={code}>{policyValue("classification", code)}</option>)}
            </NativeSelect>
          </label>
          <label className="space-y-1.5 text-[11px] font-medium text-muted-foreground">
            Status
            <NativeSelect className="h-9 w-full" value={status} onChange={event => { setStatus(event.target.value); setPage(1); }}>
              <option value="">All statuses</option><option value="active">Active</option><option value="inactive">Inactive</option>
            </NativeSelect>
          </label>
          <div className="flex items-end">
            <Button type="button" variant="ghost" size="sm" className="h-9" disabled={!hasAccountFilters} onClick={clearAccountFilters}>Clear filters</Button>
          </div>
        </div>
        <p className="mt-3 border-t pt-2.5 text-xs text-muted-foreground">{accountMatches.length} of {accounts.length} accounts</p>
      </div>

      <div className="mt-3 rounded-xl border">
        <Table aria-label="Cooperative chart of accounts">
          <TableHeader><TableRow className="bg-muted/40 hover:bg-muted/40">
            <TableHead scope="col" className="lg:sticky lg:left-0 lg:z-20 bg-muted border-r">Code</TableHead>
            <TableHead scope="col">Account</TableHead>
            <TableHead scope="col" className="hidden md:table-cell">Classification</TableHead>
            <TableHead scope="col" className="hidden sm:table-cell">Status</TableHead>
            <TableHead scope="col" className="hidden md:table-cell">In use</TableHead>
            <TableHead scope="col" className="text-right">Action</TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {!accountRows.length && <TableRow className="hover:bg-transparent"><TableCell colSpan={6}>
              <PolicyEmpty title={accounts.length ? "No accounts match these filters" : "No accounts yet"}
                description={accounts.length ? "Try a different code, name, classification, or status." : "Add an account to the Cooperative chart."}
                action={hasAccountFilters ? <Button variant="outline" size="sm" onClick={clearAccountFilters}>Clear filters</Button> : undefined} />
            </TableCell></TableRow>}
            {accountRows.map(row => {
              const inUse = mappings.some(mapping => mapping.accountId === row.id);
              return <TableRow key={row.id} className="group">
                <TableCell className="whitespace-normal border-r bg-card font-mono font-medium group-hover:bg-muted/50 lg:sticky lg:left-0 lg:z-10">{row.code}</TableCell>
                <TableCell className="whitespace-normal">
                  <p>{row.name}</p>
                  <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground md:hidden">
                    <Badge variant="outline" className="font-normal">{row.isContra && "Contra "}{policyValue("classification", row.classification)}</Badge>
                    <span className="sm:hidden"><PolicyStatusChip active={row.isActive} /></span>
                    <span>{inUse ? "Mapped" : "Unused"}</span>
                  </div>
                </TableCell>
                <TableCell className="hidden md:table-cell"><Badge variant="outline" className="font-normal">{row.isContra && "Contra "}{policyValue("classification", row.classification)}</Badge></TableCell>
                <TableCell className="hidden sm:table-cell"><PolicyStatusChip active={row.isActive} /></TableCell>
                <TableCell className="hidden md:table-cell">{inUse ? <Badge variant="secondary">Mapped</Badge> : <span className="text-sm text-muted-foreground">Unused</span>}</TableCell>
                <TableCell className="text-right"><Button variant="outline" size="sm" onClick={() => setAccount(row)}>Edit</Button></TableCell>
              </TableRow>;
            })}
          </TableBody>
        </Table>
      </div>
      {accountMatches.length > 0 && <div className="mt-3">
        <PolicyPager page={currentPage} more={currentPage * pageSize < accountMatches.length} onPage={setPage}
          from={first} to={last} total={accountMatches.length} noun="accounts" />
      </div>}
    </Panel> : <Panel title="Transaction account mappings" description="Choose the Cooperative account used for each transaction purpose."
      actions={<Badge variant={gaps ? "outline" : "secondary"}>{mappedCount}/{totalPurposes} mapped</Badge>}>
      {gaps > 0 && <div role="status" className="mb-3 flex flex-wrap items-start gap-3 rounded-xl border border-amber-300 bg-amber-50/70 p-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
        <AlertTriangle className="mt-0.5 size-4 shrink-0" />
        <p className="min-w-0 flex-1">{gaps} transaction purpose{gaps === 1 ? "" : "s"} still need an account. Configure them before posting transactions.</p>
        <Button type="button" variant="outline" size="sm" onClick={() => setUnmappedOnly(true)}>Show unmapped</Button>
      </div>}
      <div className="rounded-xl border bg-muted/20 p-3">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[2fr_1fr_auto]">
          <label className="space-y-1.5 text-[11px] font-medium text-muted-foreground">
            Search mapping purposes
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input className="h-9 pl-8" value={mappingSearch} placeholder="Purpose or account"
                onChange={event => setMappingSearch(event.target.value)} />
            </div>
          </label>
          <label className="space-y-1.5 text-[11px] font-medium text-muted-foreground">
            Required classification
            <NativeSelect className="h-9 w-full" value={mappingClass} onChange={event => setMappingClass(event.target.value)}>
              <option value="">All classifications</option>
              {classes.map(code => <option key={code} value={code}>{policyValue("classification", code)}</option>)}
            </NativeSelect>
          </label>
          <div className="flex items-end gap-2">
            <label className="flex h-9 items-center gap-2 text-sm">
              <input type="checkbox" className="accent-primary" checked={unmappedOnly} onChange={event => setUnmappedOnly(event.target.checked)} />
              Unmapped only
            </label>
            <Button type="button" variant="ghost" size="sm" className="h-9" disabled={!hasMappingFilters} onClick={clearMappingFilters}>Clear</Button>
          </div>
        </div>
        <p className="mt-3 border-t pt-2.5 text-xs text-muted-foreground">{visiblePurposes.length} of {totalPurposes} purposes</p>
      </div>

      <div className="mt-3 rounded-xl border">
        <Table aria-label="Transaction account mappings">
          <TableHeader><TableRow className="bg-muted/40 hover:bg-muted/40">
            <TableHead scope="col">Purpose</TableHead>
            <TableHead scope="col" className="hidden lg:table-cell">Required classification</TableHead>
            <TableHead scope="col" className="hidden md:table-cell">Assigned account</TableHead>
            <TableHead scope="col" className="hidden sm:table-cell">Status</TableHead>
            <TableHead scope="col" className="text-right">Action</TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {!visiblePurposes.length && <TableRow className="hover:bg-transparent"><TableCell colSpan={5}>
              <PolicyEmpty title="No purposes match these filters" description="Try a different purpose, account, or classification."
                action={hasMappingFilters ? <Button variant="outline" size="sm" onClick={clearMappingFilters}>Clear filters</Button> : undefined} />
            </TableCell></TableRow>}
            {visiblePurposes.map(definition => {
              const [purpose, , title, requiredClass, contra] = definition;
              const assigned = accounts.find(row => row.id === mappings.find(mapping => mapping.purpose === purpose)?.accountId);
              return <TableRow key={purpose}>
                <TableCell className="whitespace-normal">
                  <p className="font-medium">{title}</p>
                  <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground lg:hidden">
                    <Badge variant="outline" className="font-normal">{contra && "Contra "}{policyValue("classification", requiredClass)}</Badge>
                    <span className="md:hidden">{assigned ? accountLabel(assigned) : <span className="text-amber-700 dark:text-amber-300">Not assigned</span>}</span>
                    <span className="sm:hidden"><StatusChip status={assigned ? "ACTIVE" : "PENDING"} label={assigned ? "Mapped" : "Unmapped"} /></span>
                  </div>
                </TableCell>
                <TableCell className="hidden lg:table-cell"><Badge variant="outline" className="font-normal">{contra && "Contra "}{policyValue("classification", requiredClass)}</Badge></TableCell>
                <TableCell className="hidden whitespace-normal md:table-cell">{assigned ? accountLabel(assigned) : <span className="text-amber-700 dark:text-amber-300">Not assigned</span>}</TableCell>
                <TableCell className="hidden sm:table-cell">{assigned ? <StatusChip status="ACTIVE" label="Mapped" /> : <StatusChip status="PENDING" label="Unmapped" />}</TableCell>
                <TableCell className="text-right"><Button variant="outline" size="sm" onClick={() => setMapping(definition)}>Configure</Button></TableCell>
              </TableRow>;
            })}
          </TableBody>
        </Table>
      </div>
    </Panel>}

    {account !== undefined && <AccountEditor context={context} account={account} close={() => setAccount(undefined)} />}
    {mapping && <MappingEditor context={context} definition={mapping} close={() => setMapping(undefined)} />}
  </div>;
}
