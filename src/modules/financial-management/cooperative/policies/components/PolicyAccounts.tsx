"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { type PolicyContext, usePolicyEditor } from "../policy-client";
import { policyValue } from "../policy-labels";
import { accountPurposes, type PolicyAccount } from "../policy-types";
import { PolicyDialog, PolicyInput, PolicyPager, PolicySelect } from "./PolicyForm";

const classes = ["ASSET", "LIABILITY", "EQUITY", "INCOME", "EXPENSE"] as const;
type Purpose = typeof accountPurposes[number];
const accountLabel = (account: PolicyAccount) => `${account.code} · ${account.name}`;

function AccountEditor({ context, account, close }: { context: PolicyContext; account: PolicyAccount | null; close: () => void }) {
  const [draft, setDraft] = useState({
    id: account?.id, code: account?.code ?? "", name: account?.name ?? "",
    classification: account?.classification ?? "ASSET", isContra: account?.isContra ?? false, isActive: account?.isActive ?? true,
  });
  const mapped = context.state.mappings.some(row => row.accountId === account?.id);
  const editor = usePolicyEditor(context, latest => latest.accounts.find(row => row.id === account?.id) ?? null);
  return <PolicyDialog title={account ? "Edit GL account" : "Add GL account"}
    description="Accounts belong to the Cooperative chart of accounts." editor={editor} onClose={close}
    onSubmit={event => {
      event.preventDefault();
      void editor.save({ section: "account", data: draft }).then(saved => { if (saved) close(); });
    }}>
    <PolicyInput label="Account code" value={draft.code} maxLength={32} disabled={mapped}
      onChange={event => setDraft({ ...draft, code: event.target.value })} />
    <PolicyInput label="Account name" value={draft.name} maxLength={120}
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
    {mapped && <p className="text-sm text-muted-foreground">Remap this account before deactivating it or changing its code or classification.</p>}
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
    editor={editor} onClose={close} onSubmit={event => {
      event.preventDefault();
      void editor.save({ section: "mapping", data: { purpose, accountId: Number(accountId) } })
        .then(saved => { if (saved) close(); });
    }}>
    <PolicyInput label="Search eligible accounts" value={search} onChange={event => setSearch(event.target.value)} />
    <PolicySelect label="Cooperative GL account" value={accountId} onChange={event => setAccountId(event.target.value)}>
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
  const [search, setSearch] = useState("");
  const [mappingSearch, setMappingSearch] = useState("");
  const [page, setPage] = useState(1);
  const { accounts, mappings } = context.state;
  const visible = accounts.filter(row => accountLabel(row).toLowerCase().includes(search.trim().toLowerCase()));
  const visiblePurposes = accountPurposes.filter(([, , title]) => title.toLowerCase().includes(mappingSearch.trim().toLowerCase()));
  const currentPage = Math.min(page, Math.max(1, Math.ceil(visible.length / 50)));

  return <div className="space-y-4">
    <section className="space-y-3 rounded-lg border bg-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-semibold">Cooperative chart of accounts</h2>
        <Button size="sm" onClick={() => setAccount(null)}>Add account</Button>
      </div>
      <div className="max-w-sm"><PolicyInput label="Search by code or name" value={search}
        onChange={event => { setSearch(event.target.value); setPage(1); }} /></div>
      {visible.length ? <div className="rounded-md border"><Table>
        <TableHeader><TableRow>
          <TableHead>Code</TableHead><TableHead>Account</TableHead><TableHead>Classification</TableHead>
          <TableHead>Status</TableHead><TableHead className="text-right">Action</TableHead>
        </TableRow></TableHeader>
        <TableBody>{visible.slice((currentPage - 1) * 50, currentPage * 50).map(row => <TableRow key={row.id}>
          <TableCell className="font-medium">{row.code}</TableCell>
          <TableCell className="whitespace-normal">{row.name}</TableCell>
          <TableCell>{row.isContra && "Contra "}{policyValue("classification", row.classification)}</TableCell>
          <TableCell>{row.isActive ? "Active" : "Inactive"}</TableCell>
          <TableCell className="text-right"><Button variant="outline" size="sm" onClick={() => setAccount(row)}>Edit</Button></TableCell>
        </TableRow>)}</TableBody>
      </Table></div> : <p className="text-sm text-muted-foreground">{search ? "No accounts match your search." : "No accounts configured."}</p>}
      <PolicyPager page={currentPage} more={currentPage * 50 < visible.length} onPage={setPage} />
    </section>
    <section className="space-y-3 rounded-lg border bg-card p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-semibold">Transaction account mappings</h2>
        <p className="text-sm text-muted-foreground">{mappings.length} of {accountPurposes.length} mapped</p>
      </div>
      <div className="max-w-sm"><PolicyInput label="Search mapping purposes" value={mappingSearch}
        onChange={event => setMappingSearch(event.target.value)} /></div>
      {visiblePurposes.length ? <div className="rounded-md border"><Table>
        <TableHeader><TableRow>
          <TableHead>Purpose</TableHead><TableHead>Required classification</TableHead><TableHead>Account</TableHead>
          <TableHead className="text-right">Action</TableHead>
        </TableRow></TableHeader>
        <TableBody>{visiblePurposes.map(definition => {
          const [purpose, , title, classification, contra] = definition;
          const id = mappings.find(row => row.purpose === purpose)?.accountId;
          const assigned = accounts.find(row => row.id === id);
          return <TableRow key={purpose}>
            <TableCell className="whitespace-normal font-medium">{title}</TableCell>
            <TableCell>{contra && "Contra "}{policyValue("classification", classification)}</TableCell>
            <TableCell className="whitespace-normal">{assigned ? accountLabel(assigned) : "Unmapped"}</TableCell>
            <TableCell className="text-right"><Button variant="outline" size="sm" onClick={() => setMapping(definition)}>Configure</Button></TableCell>
          </TableRow>;
        })}</TableBody>
      </Table></div> : <p className="text-sm text-muted-foreground">No mapping purposes match your search.</p>}
    </section>
    {account !== undefined && <AccountEditor context={context} account={account} close={() => setAccount(undefined)} />}
    {mapping && <MappingEditor context={context} definition={mapping} close={() => setMapping(undefined)} />}
  </div>;
}
