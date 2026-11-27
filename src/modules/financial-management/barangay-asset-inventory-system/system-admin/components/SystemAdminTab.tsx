"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { call } from "../../shared/ui";
import { Pager } from "../../shared/Pager";
import { BARANGAY_ROLES, JSON_HEADERS, keyOf, messageOf, ROLE_LABEL, ROLES } from "../../admin/shared/adminCommon";

/**
 * System admin submodule. Section 2 and Table 5: only the System Admin gives a user a role and a
 * barangay, and that pair decides what the person sees. Rule 18 lets one person hold several
 * roles, so saving adds a role and the x on a chip turns one off without deleting the row.
 *
 * The people listed here come from the platform user table, collection "user", because that is
 * where the logins live. A login that is missing there can still be granted a role by email.
 */

interface AdminUserRow {
  id: string;
  email: string;
  name: string;
  status: string | null;
}

interface AdminRoleRow {
  id: number;
  user_email: string | null;
  barangay_id: number | null;
  role: string;
  status: string;
}

interface BarangayRow {
  id: number;
  code: string;
  name: string;
}

interface RoleDraft {
  role: string;
  barangayId: string;
}

export function SystemAdminTab({
  setError,
  setNotice,
  onRoleChanged,
}: {
  setError: (v: string | null) => void;
  setNotice: (v: string | null) => void;
  onRoleChanged?: () => Promise<void> | void;
}) {
  const [users, setUsers] = React.useState<AdminUserRow[]>([]);
  const [roles, setRoles] = React.useState<AdminRoleRow[]>([]);
  const [barangays, setBarangays] = React.useState<BarangayRow[]>([]);
  const [drafts, setDrafts] = React.useState<Record<string, RoleDraft>>({});
  const [query, setQuery] = React.useState("");
  const [roleFilter, setRoleFilter] = React.useState("");
  const [barangayFilter, setBarangayFilter] = React.useState("");
  const [page, setPage] = React.useState(1);
  const PAGE_SIZE = 25;
  const [busyKey, setBusyKey] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(true);

  const load = React.useCallback(async () => {
    const [roleData, listData] = (await Promise.all([call("/admin/roles"), call("/admin/lists")])) as [
      { users: AdminUserRow[]; roles: AdminRoleRow[] },
      { barangays: BarangayRow[] },
    ];
    setUsers(roleData.users ?? []);
    setRoles(roleData.roles ?? []);
    setBarangays(listData.barangays ?? []);
  }, []);

  React.useEffect(() => {
    void (async () => {
      try {
        await load();
      } catch (err) {
        setError(messageOf(err));
      } finally {
        setLoading(false);
      }
    })();
  }, [load, setError]);

  const heldByUser = React.useMemo(() => {
    const map = new Map<string, AdminRoleRow[]>();
    for (const row of roles) {
      const key = keyOf(row.user_email ?? "");
      if (!key || row.status !== "active") continue;
      const list = map.get(key) ?? [];
      list.push(row);
      map.set(key, list);
    }
    return map;
  }, [roles]);

  const filteredUsers = React.useMemo(() => {
    const needle = query.trim().toLowerCase();
    return users.filter((user) => {
      if (needle && !(user.name + " " + user.email).toLowerCase().includes(needle)) return false;
      const held = heldByUser.get(keyOf(user.email)) ?? [];
      if (roleFilter === "none" && held.length) return false;
      if (roleFilter && roleFilter !== "none" && !held.some((row) => row.role === roleFilter)) return false;
      if (barangayFilter === "none" && held.some((row) => row.barangay_id != null)) return false;
      if (barangayFilter && barangayFilter !== "none" && !held.some((row) => String(row.barangay_id) === barangayFilter)) return false;
      return true;
    });
  }, [users, query, roleFilter, barangayFilter, heldByUser]);

  // a new filter starts again at the first page
  React.useEffect(() => {
    setPage(1);
  }, [query, roleFilter, barangayFilter]);

  const visibleUsers = React.useMemo(() => {
    const start = (page - 1) * PAGE_SIZE;
    return filteredUsers.slice(start, start + PAGE_SIZE);
  }, [filteredUsers, page]);

  function draftFor(user: AdminUserRow): RoleDraft {
    const stored = drafts[keyOf(user.email)];
    return stored ? { ...stored } : { role: "", barangayId: "" };
  }

  function setDraft(user: AdminUserRow, patch: Partial<RoleDraft>) {
    const key = keyOf(user.email);
    setDrafts((prev) => ({ ...prev, [key]: { ...(prev[key] ?? { role: "", barangayId: "" }), ...patch } }));
  }

  async function saveRole(email: string, draft: RoleDraft) {
    const needsBarangay = BARANGAY_ROLES.includes(draft.role);
    if (needsBarangay && !draft.barangayId) {
      setError("Choose the barangay for " + ROLE_LABEL[draft.role] + ", every barangay role is pinned to one.");
      return;
    }
    setBusyKey(keyOf(email));
    setError(null);
    try {
      await call("/admin/roles", {
        method: "POST",
        headers: JSON_HEADERS,
        body: JSON.stringify({
          email,
          role: draft.role,
          barangayId: needsBarangay && draft.barangayId ? Number(draft.barangayId) : null,
        }),
      });
      setNotice("Role saved for " + email + ".");
      await load();
      if (onRoleChanged) await onRoleChanged();
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setBusyKey(null);
    }
  }

  async function saveUser(user: AdminUserRow) {
    const draft = draftFor(user);
    if (!draft.role) {
      setError("Choose a role for " + user.email + " first.");
      return;
    }
    await saveRole(user.email, draft);
    setDrafts((prev) => {
      const next = { ...prev };
      delete next[keyOf(user.email)];
      return next;
    });
  }

  async function deactivate(user: AdminUserRow, row: AdminRoleRow) {
    setBusyKey(keyOf(user.email));
    setError(null);
    try {
      await call("/admin/roles", { method: "PATCH", headers: JSON_HEADERS, body: JSON.stringify({ id: row.id }) });
      setNotice("That role is now inactive for " + user.email + ". The row is kept for audit.");
      await load();
      if (onRoleChanged) await onRoleChanged();
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setBusyKey(null);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-md border p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="text-sm font-medium">Users and roles</div>
          <Button size="sm" variant="outline" disabled={busyKey !== null || loading} onClick={() => void load()}>
            Refresh
          </Button>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          Give a person a role, and the barangay it covers when the role belongs to one barangay. One person may hold more than one
          role. Turning a role off keeps it on record for audit. Every account that can sign in is listed here.
        </p>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter by name or email"
            className="max-w-xs"
          />
          <select
            className="h-9 rounded-md border bg-background px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value)}
          >
            <option value="">any role</option>
            <option value="none">no role yet</option>
            {ROLES.map((role) => (
              <option key={role.value} value={role.value}>
                {role.label}
              </option>
            ))}
          </select>
          <select
            className="h-9 rounded-md border bg-background px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
            value={barangayFilter}
            onChange={(e) => setBarangayFilter(e.target.value)}
          >
            <option value="">any barangay</option>
            <option value="none">not pinned to a barangay</option>
            {barangays.map((b) => (
              <option key={b.id} value={b.id}>
                {b.code} {b.name}
              </option>
            ))}
          </select>
          <Button
            size="sm"
            variant="ghost"
            disabled={!query && !roleFilter && !barangayFilter}
            onClick={() => {
              setQuery("");
              setRoleFilter("");
              setBarangayFilter("");
            }}
          >
            Clear
          </Button>
          <span className="text-xs text-muted-foreground">
            {filteredUsers.length} of {users.length} account(s)
          </span>
        </div>

        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-10 bg-background">
              <tr className="border-b text-left">
                <th className="p-2">Name</th>
                <th className="p-2">Email</th>
                <th className="p-2">Roles held</th>
                <th className="p-2">Add a role</th>
                <th className="p-2" />
              </tr>
            </thead>
            <tbody>
              {visibleUsers.map((user) => {
                const key = keyOf(user.email);
                const draft = draftFor(user);
                const held = heldByUser.get(key) ?? [];
                const rowBusy = busyKey === key;
                return (
                  <tr key={key || user.id} className="border-b last:border-0">
                    <td className="p-2 align-top">
                      <div>{user.name || "(no name)"}</div>
                      {user.status ? <div className="text-xs text-muted-foreground">{user.status}</div> : null}
                    </td>
                    <td className="p-2 align-top">{user.email || <span className="text-muted-foreground">no email</span>}</td>
                    <td className="p-2 align-top">
                      <div className="flex flex-wrap gap-1">
                        {held.map((row) => {
                          const barangay = barangays.find((b) => b.id === row.barangay_id);
                          return (
                            <span key={row.id} className="inline-flex items-center gap-1 rounded border px-2 py-0.5 text-xs">
                              {ROLE_LABEL[row.role] ?? row.role}
                              {barangay ? " at " + barangay.code : ""}
                              <button
                                type="button"
                                aria-label={"Turn off the " + (ROLE_LABEL[row.role] ?? row.role) + " role for " + user.email}
                                className="inline-flex size-6 items-center justify-center rounded text-muted-foreground outline-none transition-colors hover:bg-destructive/10 hover:text-destructive focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:opacity-50"
                                disabled={busyKey !== null}
                                title="Turn this role off, the row is kept for audit"
                                onClick={() => void deactivate(user, row)}
                              >
                                <span aria-hidden="true">x</span>
                              </button>
                            </span>
                          );
                        })}
                        {held.length ? null : <span className="text-xs text-muted-foreground">no role yet</span>}
                      </div>
                    </td>
                    <td className="p-2 align-top">
                      <div className="flex flex-wrap gap-1">
                        <select
                          className="h-9 rounded-md border bg-background px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
                          value={draft.role}
                          disabled={!user.email}
                          onChange={(e) =>
                            setDraft(user, {
                              role: e.target.value,
                              barangayId: BARANGAY_ROLES.includes(e.target.value) ? draft.barangayId : "",
                            })
                          }
                        >
                          <option value="">add a role</option>
                          {ROLES.map((role) => (
                            <option key={role.value} value={role.value}>
                              {role.label}
                            </option>
                          ))}
                        </select>
                        <select
                          className="h-9 rounded-md border bg-background px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
                          value={draft.barangayId}
                          disabled={!user.email || !BARANGAY_ROLES.includes(draft.role)}
                          onChange={(e) => setDraft(user, { barangayId: e.target.value })}
                        >
                          <option value="">not pinned to one barangay</option>
                          {barangays.map((b) => (
                            <option key={b.id} value={b.id}>
                              {b.code} {b.name}
                            </option>
                          ))}
                        </select>
                      </div>
                    </td>
                    <td className="p-2 text-right align-top">
                      <Button size="sm" disabled={busyKey !== null || !user.email || !draft.role} onClick={() => void saveUser(user)}>
                        {rowBusy ? "Saving..." : "Save"}
                      </Button>
                    </td>
                  </tr>
                );
              })}
              {visibleUsers.length === 0 ? (
                <tr>
                  <td colSpan={5} className="p-4 text-center text-sm text-muted-foreground">
                    {loading ? "Loading users..." : users.length ? "No user matches that filter." : "No platform user could be read."}
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
        <div className="mt-2">
          <Pager page={page} pageSize={PAGE_SIZE} total={filteredUsers.length} onChange={setPage} noun="account" />
        </div>
      </div>
    </div>
  );
}
