"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { OperationsData } from "@/modules/financial-management/treasury/expenses-v2/expense-approval-workflow/operationsTypes";
import { authorityRoot, availableViews, operationsApi, type AuthorityView as View } from "./views";

const labels = { "my-requests": "My Requests", "my-approvals": "My Approvals" };

export function AuthorityView({ view, children }: {
  view: View;
  children: (data: OperationsData, refresh: () => void) => ReactNode;
}) {
  const router = useRouter();
  const [data, setData] = useState<OperationsData | null>(null);
  const [error, setError] = useState("");
  const [version, setVersion] = useState(0);
  const refresh = () => { setError(""); setVersion(value => value + 1); };

  useEffect(() => {
    const controller = new AbortController();
    fetch(`${operationsApi}?section=approvals`, { cache: "no-store", signal: controller.signal })
      .then(async response => {
        const result = await response.json();
        if (!response.ok) throw Error(result.error || "Unable to load the workspace.");
        if (!controller.signal.aborted) setData(result.data);
      })
      .catch(error => {
        if (!controller.signal.aborted) { setData(null); setError(error.message); }
      });
    return () => controller.abort();
  }, [version]);

  const views = data ? availableViews(data.actor.authorities) : [];
  const denied = !!data && !views.includes(view);
  // The authority landing page defaults to My Requests; CEOs land in their inbox.
  const fallback = denied && view === "my-requests" ? views[0] : undefined;
  useEffect(() => {
    if (fallback) router.replace(`${authorityRoot}/${fallback}`);
  }, [fallback, router]);

  return <section className="mx-auto max-w-[1500px] space-y-6 p-4 sm:p-6">
    <header className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border bg-gradient-to-br from-primary/10 to-card p-5">
      <div><h1 className="text-2xl font-semibold">{labels[view]}</h1>{data && <p className="mt-1 text-sm text-muted-foreground">{data.actor.name}</p>}</div>
      {view === "my-approvals" && <Button variant="outline" onClick={refresh}><RefreshCw aria-hidden="true" />Refresh</Button>}
    </header>
    {error && <div role="alert" className="text-destructive">{error} <Button variant="outline" onClick={refresh}>Retry</Button></div>}
    {!data && !error && <p role="status">Loading workspace…</p>}
    {fallback && <p role="status">Opening {labels[fallback]}…</p>}
    {denied && !fallback && <p role="alert" className="rounded-lg border p-4">You don’t have access to My Approvals.</p>}
    {data && !denied && children(data, refresh)}
  </section>;
}
