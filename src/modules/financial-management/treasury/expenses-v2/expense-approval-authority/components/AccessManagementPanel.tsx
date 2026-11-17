"use client";

import { useCallback, useEffect, useState } from "react";
import { ShieldCheck, UserRoundCog } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { authorityApi } from "../services/authorityApi";
import { Notice } from "./shared";

const PAGE_LABELS: Record<string, string> = { overview: "Overview", "authority-matrix": "Authority Matrix", delegations: "Delegations", evaluation: "Evaluate Policy", exceptions: "Exceptions", "audit-history": "Audit History" };
type AccessData = { users: { id: number; name: string; email: string; companyId: number | null }[]; grants: { id: number; user_id: number; page: string; status: string; granted_by: number; grant_reason: string; expires_at: string | null }[] };

export function AccessManagementPanel() {
  const [data, setData] = useState<AccessData | null>(null), [page, setPage] = useState("overview"), [userId, setUserId] = useState(""), [reason, setReason] = useState("");
  const [error, setError] = useState(""), [busy, setBusy] = useState(false);
  const refresh = useCallback(async () => { setData(await authorityApi<AccessData>("access")); }, []);
  useEffect(() => { refresh().catch(e => setError(e.message)); }, [refresh]);
  const mutate = async (body: unknown) => { setBusy(true); setError(""); try { await authorityApi("access", body); await refresh(); setReason(""); } catch (e) { setError((e as Error).message); } finally { setBusy(false); } };
  const activeGrants = data?.grants.filter(grant => grant.status === "active") || [];
  return <div className="space-y-5">
    <div><h2 className="flex items-center gap-2 text-lg font-semibold"><UserRoundCog className="size-5" />Submodule access</h2><p className="mt-1 text-sm text-muted-foreground">Grant or revoke interface visibility for active ERP users. This does not grant policy, evaluation, publication, or exception permissions.</p></div>
    <Card><CardHeader><CardTitle className="text-base">Grant interface access</CardTitle><CardDescription>Users must already have the Expense Approval Authority module grant.</CardDescription></CardHeader><CardContent><form className="grid gap-4 md:grid-cols-2" onSubmit={event => { event.preventDefault(); void mutate({ action: "grant", userId: Number(userId), page, reason }); }}>
      <label className="space-y-1.5 text-sm font-medium">User<select className="h-10 w-full rounded-md border border-input bg-background px-3" required value={userId} onChange={event => setUserId(event.target.value)}><option value="">Select active user…</option>{data?.users.map(user => <option key={user.id} value={user.id}>{user.name}{user.email ? ` · ${user.email}` : ""}</option>)}</select></label>
      <label className="space-y-1.5 text-sm font-medium">Submodule<select className="h-10 w-full rounded-md border border-input bg-background px-3" value={page} onChange={event => setPage(event.target.value)}>{Object.entries(PAGE_LABELS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
      <label className="space-y-1.5 text-sm font-medium md:col-span-2">Reason<Textarea required minLength={5} maxLength={1000} value={reason} onChange={event => setReason(event.target.value)} placeholder="Why should this user have access?" /></label>
      <div className="md:col-span-2"><Button disabled={busy || !userId || reason.trim().length < 5}><ShieldCheck />{busy ? "Saving…" : "Grant access"}</Button></div>
    </form></CardContent></Card>
    {error && <Notice danger>{error}</Notice>}
    <Card><CardHeader><CardTitle className="text-base">Active interface grants</CardTitle><CardDescription>{activeGrants.length} active grant{activeGrants.length === 1 ? "" : "s"}</CardDescription></CardHeader><CardContent className="space-y-2">{!activeGrants.length ? <p className="text-sm text-muted-foreground">No active submodule grants.</p> : activeGrants.map(grant => {
      const user = data?.users.find(item => item.id === grant.user_id);
      return <div key={grant.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3"><div><p className="text-sm font-medium">{user?.name || `User #${grant.user_id}`} · {PAGE_LABELS[grant.page] || grant.page}</p><p className="text-xs text-muted-foreground">Granted by #{grant.granted_by} · {grant.grant_reason}</p></div><Button size="sm" variant="outline" disabled={busy} onClick={() => { const revocationReason = window.prompt("Reason for revoking access (required):"); if (revocationReason && revocationReason.trim().length >= 5) void mutate({ action: "revoke", grantId: grant.id, reason: revocationReason }); }}>Revoke</Button></div>;
    })}</CardContent></Card>
    <p className="text-xs text-muted-foreground">Access changes are limited to submodule visibility and recorded with the acting administrator and reason. Server-side operation permissions remain separately enforced.</p>
  </div>;
}
