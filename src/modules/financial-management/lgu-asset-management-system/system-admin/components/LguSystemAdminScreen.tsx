"use client";

import * as React from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/**
 * The LGU asset management system's own administration. Section 2 of the guide gives the System
 * Admin the lists a module runs on, so this screen owns the LGU reference data only: asset
 * classes, conditions and offices. No barangay data appears here.
 *
 * Table 5 keeps this with the System Admin, so the page behind it refuses everyone else.
 */

const API = "/api/fm/lgu-asset-management-system/system-admin";
const JSON_HEADERS = { "Content-Type": "application/json" };

type Kind = "class" | "condition" | "office";

interface Row {
  id: number;
  values: Record<string, string>;
}

interface ListsPayload {
  classes: Row[];
  conditions: Row[];
  offices: Row[];
}

interface AccountRow {
  email: string;
  name: string;
  blocked: boolean;
}

interface RoleRow {
  id: number;
  email: string;
  role: string;
  status: string;
}

interface AccountsPayload {
  accounts: AccountRow[];
  roles: RoleRow[];
}

const LGU_ROLES = [
  { value: "municipal", label: "Municipal" },
  { value: "system_admin", label: "System Admin" },
];

interface Column {
  field: string;
  label: string;
  kind: "text" | "select";
  options?: { value: string; label: string }[];
}

const YES_NO = [
  { value: "1", label: "Yes" },
  { value: "0", label: "No" },
];

function AccountsCard({ setNotice, setError }: { setNotice: (v: string | null) => void; setError: (v: string | null) => void }) {
  const [data, setData] = React.useState<AccountsPayload | null>(null);
  const [query, setQuery] = React.useState("");
  const [roleFilter, setRoleFilter] = React.useState("");
  const [drafts, setDrafts] = React.useState<Record<string, string>>({});
  const [busy, setBusy] = React.useState(false);

  const load = React.useCallback(async () => {
    setData((await call("?view=accounts")) as AccountsPayload);
  }, []);

  React.useEffect(() => {
    void load().catch((err) => setError(err instanceof Error ? err.message : String(err)));
  }, [load, setError]);

  const heldBy = React.useMemo(() => {
    const map = new Map<string, RoleRow[]>();
    for (const row of data?.roles ?? []) {
      const key = row.email.toLowerCase();
      map.set(key, [...(map.get(key) ?? []), row]);
    }
    return map;
  }, [data]);

  const rows = React.useMemo(() => {
    const needle = query.trim().toLowerCase();
    return (data?.accounts ?? []).filter((account) => {
      if (needle && !(account.name + " " + account.email).toLowerCase().includes(needle)) return false;
      const held = heldBy.get(account.email.toLowerCase()) ?? [];
      if (roleFilter === "none" && held.length) return false;
      if (roleFilter && roleFilter !== "none" && !held.some((row) => row.role === roleFilter)) return false;
      return true;
    });
  }, [data, query, roleFilter, heldBy]);

  async function save(email: string) {
    const role = drafts[email] ?? "";
    if (!role) {
      setError("Choose a role for " + email + " first.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await call("", { method: "POST", headers: JSON_HEADERS, body: JSON.stringify({ kind: "role", email, role }) });
      setNotice(email + " now holds " + role.replace(/_/g, " ") + ".");
      setDrafts((prev) => {
        const next = { ...prev };
        delete next[email];
        return next;
      });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function revoke(id: number) {
    setBusy(true);
    setError(null);
    try {
      await call("", { method: "POST", headers: JSON_HEADERS, body: JSON.stringify({ kind: "role-off", id }) });
      setNotice("That role is now inactive. The row is kept for audit.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-md border p-4">
      <div className="text-sm font-medium">Accounts and roles</div>
      <div className="mt-1 text-sm text-muted-foreground">
        The two roles that may use this module, Municipal and System Admin. Turning a role off keeps it on record for audit.
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Input className="max-w-xs" placeholder="Filter by name or email" value={query} onChange={(e) => setQuery(e.target.value)} />
        <select
          className="cursor-pointer h-9 rounded-md border bg-background px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
          value={roleFilter}
          onChange={(e) => setRoleFilter(e.target.value)}
        >
          <option value="">any role</option>
          <option value="none">no role yet</option>
          {LGU_ROLES.map((role) => (
            <option key={role.value} value={role.value}>
              {role.label}
            </option>
          ))}
        </select>
        <Button
          size="sm"
          variant="ghost"
          disabled={!query && !roleFilter}
          onClick={() => {
            setQuery("");
            setRoleFilter("");
          }}
        >
          Clear
        </Button>
        <span className="text-xs text-muted-foreground">{rows.length} account(s)</span>
      </div>

      <div className="mt-3 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0 z-10 bg-background">
            <tr className="border-b text-left">
              <th className="p-2">Name</th>
              <th className="p-2">Email</th>
              <th className="p-2">Roles held here</th>
              <th className="p-2">Give a role</th>
              <th className="p-2" />
            </tr>
          </thead>
          <tbody>
            {rows.slice(0, 50).map((account) => {
              const held = heldBy.get(account.email.toLowerCase()) ?? [];
              return (
                <tr key={account.email} className="border-b last:border-0">
                  <td className="p-2">
                    {account.name}
                    {account.blocked ? <span className="ml-2 text-xs text-destructive">blocked</span> : null}
                  </td>
                  <td className="p-2 text-muted-foreground">{account.email}</td>
                  <td className="p-2">
                    <span className="flex flex-wrap gap-1">
                      {held.map((row) => (
                        <span key={row.id} className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs">
                          {row.role.replace(/_/g, " ")}
                          <button
                            type="button"
                            aria-label={"Turn off the " + row.role.replace(/_/g, " ") + " role for " + row.email}
                            className="inline-flex size-6 items-center justify-center rounded text-muted-foreground outline-none transition-colors hover:bg-destructive/10 hover:text-destructive focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:opacity-50"
                            disabled={busy}
                            onClick={() => void revoke(row.id)}
                          >
                            <span aria-hidden="true">x</span>
                          </button>
                        </span>
                      ))}
                      {held.length === 0 ? <span className="text-xs text-muted-foreground">no role yet</span> : null}
                    </span>
                  </td>
                  <td className="p-2">
                    <select
                      className="cursor-pointer h-9 rounded-md border bg-background px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
                      value={drafts[account.email] ?? ""}
                      onChange={(e) => setDrafts({ ...drafts, [account.email]: e.target.value })}
                    >
                      <option value="">add a role</option>
                      {LGU_ROLES.map((role) => (
                        <option key={role.value} value={role.value}>
                          {role.label}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="p-2 text-right">
                    <Button size="sm" disabled={busy} onClick={() => void save(account.email)}>
                      Save
                    </Button>
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 ? (
              <tr>
                <td colSpan={5} className="p-4 text-center text-sm text-muted-foreground">
                  No account matches.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
      {rows.length > 50 ? <div className="mt-2 text-xs text-muted-foreground">Showing the first 50 of {rows.length}. Use the filter to narrow it.</div> : null}
    </div>
  );
}

async function call(path: string, init?: RequestInit) {
  const res = await fetch(API + path, init);
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new Error((body && body.message) || "Request failed");
  return body;
}

function valueOf(values: Record<string, string>, field: string): string {
  return values[field] ?? "";
}

function ListCard({
  kind,
  title,
  hint,
  columns,
  rows,
  onSaved,
  setError,
  setNotice,
}: {
  kind: Kind;
  title: string;
  hint: string;
  columns: Column[];
  rows: Row[];
  onSaved: () => Promise<void>;
  setError: (v: string | null) => void;
  setNotice: (v: string | null) => void;
}) {
  const [edits, setEdits] = React.useState<Record<number, Record<string, string>>>({});
  const [fresh, setFresh] = React.useState<Record<string, string>>({});
  const [busy, setBusy] = React.useState(false);

  async function save(id: number | null) {
    const values = id === null ? fresh : edits[id] ?? {};
    setBusy(true);
    setError(null);
    try {
      await call("", { method: "POST", headers: JSON_HEADERS, body: JSON.stringify({ kind, id, values }) });
      setNotice(title + (id === null ? ": row added." : ": row saved."));
      if (id === null) setFresh({});
      else
        setEdits((prev) => {
          const next = { ...prev };
          delete next[id];
          return next;
        });
      await onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-md border p-4">
      <div className="text-sm font-medium">{title}</div>
      <div className="mt-1 text-sm text-muted-foreground">{hint}</div>

      <div className="mt-3 flex flex-wrap items-end gap-2 rounded-md border bg-muted/20 p-2">
        {columns.map((column) => (
          <div key={column.field} className="min-w-[160px] flex-1">
            <label className="grid gap-1 text-sm">
              <span className="text-muted-foreground">{column.label}</span>
              {column.kind === "select" ? (
                <select
                  className="cursor-pointer h-9 w-full rounded-md border bg-background px-2 text-sm"
                  value={valueOf(fresh, column.field)}
                  onChange={(e) => setFresh({ ...fresh, [column.field]: e.target.value })}
                >
                  <option value="">choose</option>
                  {(column.options ?? []).map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              ) : (
                <Input
                  placeholder={"new " + column.label.toLowerCase()}
                  value={valueOf(fresh, column.field)}
                  onChange={(e) => setFresh({ ...fresh, [column.field]: e.target.value })}
                />
              )}
            </label>
          </div>
        ))}
        <Button size="sm" variant="outline" disabled={busy} onClick={() => void save(null)}>
          Add
        </Button>
      </div>

      <div className="mt-3 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0 z-10 bg-background">
            <tr className="border-b text-left">
              {columns.map((column) => (
                <th key={column.field} className="p-2">
                  {column.label}
                </th>
              ))}
              <th className="p-2" />
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const values = { ...row.values, ...(edits[row.id] ?? {}) };
              return (
                <tr key={row.id} className="border-b last:border-0">
                  {columns.map((column) => (
                    <td key={column.field} className="p-2 align-top">
                      {column.kind === "select" ? (
                        <select
                          className="cursor-pointer h-9 rounded-md border bg-background px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
                          value={valueOf(values, column.field)}
                          onChange={(e) => setEdits({ ...edits, [row.id]: { ...(edits[row.id] ?? {}), [column.field]: e.target.value } })}
                        >
                          <option value="">choose</option>
                          {(column.options ?? []).map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <Input
                          value={valueOf(values, column.field)}
                          onChange={(e) => setEdits({ ...edits, [row.id]: { ...(edits[row.id] ?? {}), [column.field]: e.target.value } })}
                        />
                      )}
                    </td>
                  ))}
                  <td className="p-2 text-right align-top">
                    <Button size="sm" disabled={busy} onClick={() => void save(row.id)}>
                      Save
                    </Button>
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 ? (
              <tr>
                <td colSpan={columns.length + 1} className="p-4 text-center text-sm text-muted-foreground">
                  Nothing here yet. Add the first row above.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function LguSystemAdminScreen({ email }: { email: string | null }) {
  const [lists, setLists] = React.useState<ListsPayload | null>(null);
  const [tab, setTab] = React.useState<Kind | "accounts">("accounts");
  const [error, setError] = React.useState<string | null>(null);
  const [notice, setNotice] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    setLists((await call("")) as ListsPayload);
  }, []);

  React.useEffect(() => {
    void load().catch((err) => setError(err instanceof Error ? err.message : String(err)));
  }, [load]);

  const specs: { kind: Kind; title: string; hint: string; columns: Column[]; rows: Row[] }[] = [
    {
      kind: "class",
      title: "Asset classes",
      hint: "The class code and the property prefix are printed on the LGU property number, so change them with care.",
      columns: [
        { field: "code", label: "Code", kind: "text" },
        { field: "name", label: "Name", kind: "text" },
        { field: "property_prefix", label: "Property prefix", kind: "text" },
        { field: "default_life_months", label: "Default life months", kind: "text" },
        { field: "depreciable", label: "Depreciable", kind: "select", options: YES_NO },
      ],
      rows: lists?.classes ?? [],
    },
    {
      kind: "condition",
      title: "Conditions",
      hint: "What an asset's condition can be. Serviceable decides whether the asset counts as usable.",
      columns: [
        { field: "name", label: "Condition", kind: "text" },
        { field: "is_serviceable", label: "Serviceable", kind: "select", options: YES_NO },
      ],
      rows: lists?.conditions ?? [],
    },
    {
      kind: "office",
      title: "Offices",
      hint: "The municipal offices that can hold an LGU asset.",
      columns: [
        { field: "code", label: "Code", kind: "text" },
        { field: "name", label: "Office", kind: "text" },
      ],
      rows: lists?.offices ?? [],
    },
  ];

  const active = specs.find((spec) => spec.kind === tab) ?? specs[0];

  return (
    <div className="flex h-full min-h-0 flex-col gap-4 overflow-y-auto p-6">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">LGU Asset Management, System Admin</h1>
        <Badge variant="outline">System Admin</Badge>
        {email ? <span className="text-sm text-muted-foreground">{email}</span> : null}
      </div>
      <p className="text-sm text-muted-foreground">
        The lists this module runs on: asset classes, conditions and offices.
      </p>

      <div className="flex flex-wrap items-center gap-1 rounded-md border bg-muted/20 p-2">
        <Button size="sm" variant={tab === "accounts" ? "secondary" : "ghost"} onClick={() => setTab("accounts")}>
          Accounts and roles
        </Button>
        {specs.map((spec) => (
          <Button key={spec.kind} size="sm" variant={tab === spec.kind ? "secondary" : "ghost"} onClick={() => setTab(spec.kind)}>
            {spec.title}
            <span className="ml-1.5 text-xs opacity-70">{spec.rows.length}</span>
          </Button>
        ))}
      </div>

      {error ? <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">{error}</div> : null}
      {notice ? <div className="rounded-md border bg-muted/40 p-3 text-sm">{notice}</div> : null}

      {tab === "accounts" ? (
        <AccountsCard setError={setError} setNotice={setNotice} />
      ) : (
      <ListCard
        key={active.kind}
        kind={active.kind}
        title={active.title}
        hint={active.hint}
        columns={active.columns}
        rows={active.rows}
        onSaved={load}
        setError={setError}
        setNotice={setNotice}
      />
      )}
    </div>
  );
}
