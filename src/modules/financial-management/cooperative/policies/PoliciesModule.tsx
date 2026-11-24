"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { BookOpenCheck, FileCheck2, History, Landmark, Network, PiggyBank, RefreshCw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { PolicyKpis, PolicyKpiSkeleton, PolicyTableSkeleton } from "./components/PolicyUi";
import { LoanProducts } from "./components/LoanProducts";
import { SavingsPolicies } from "./components/SavingsPolicies";
import { RequiredDocuments } from "./components/RequiredDocuments";
import { PolicyAccounts } from "./components/PolicyAccounts";
import { PolicyHistory } from "./components/PolicyHistory";
import { policiesApi, policyRequest } from "./policy-client";
import type { PolicyState } from "./policy-types";

const tabTriggerClass = "shrink-0 gap-1.5 whitespace-nowrap data-[state=active]:bg-background";

export default function PoliciesModule() {
  const [state, setState] = useState<PolicyState>();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [retry, setRetry] = useState(0);
  const [tab, setTab] = useState("products");
  const mainRef = useRef<HTMLElement>(null);

  const load = useCallback((signal?: AbortSignal) => {
    return policyRequest<PolicyState>(policiesApi, { signal }).then(latest => {
      if (!signal?.aborted) {
        setState(current => !current || latest.revision >= current.revision ? latest : current);
        setError("");
      }
      return latest;
    }).catch(cause => {
      if (!signal?.aborted) setError(cause instanceof Error ? cause.message : "Unable to load policies.");
      throw cause;
    }).finally(() => {
      if (!signal?.aborted) setLoading(false);
    });
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal).catch(() => undefined);
    return () => controller.abort();
  }, [load, retry]);

  function refresh() {
    setError("");
    setLoading(true);
    setRetry(value => value + 1);
  }

  function selectTab(next: string) {
    setTab(next);
    requestAnimationFrame(() => {
      mainRef.current?.scrollTo({ top: 0 });
      const list = document.querySelector<HTMLElement>('[role="tablist"]');
      const active = document.querySelector<HTMLElement>('[role="tab"][data-state="active"]');
      if (list && active) list.scrollTo({ left: Math.max(0, active.offsetLeft - (list.clientWidth - active.clientWidth) / 2) });
    });
  }

  const context = state ? { state, refresh: load } : null;
  const activeRules = state?.documentRules.filter(rule => rule.isActive).length ?? 0;

  return <main ref={mainRef} className="min-h-0 min-w-0 flex-1 space-y-4 overflow-y-auto p-4 sm:p-6">
    <section className="relative overflow-hidden rounded-xl border bg-card p-4 shadow-xs sm:p-5">
      <div className="pointer-events-none absolute -right-10 -top-16 size-48 rounded-full bg-emerald-500/5 blur-2xl" />
      <div className="relative flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex min-w-0 flex-1 items-start gap-3">
          <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
            <BookOpenCheck className="size-5" />
          </span>
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Cooperative</p>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-semibold tracking-tight">Policies</h1>
              {state && <Badge variant="outline">Revision {state.revision}</Badge>}
            </div>
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
              Configure loan products, savings and membership rules, document requirements, and accounting mappings. Changes are versioned and audited.
            </p>
          </div>
        </div>
        <div className="flex w-full shrink-0 flex-col gap-2 sm:w-auto sm:flex-row sm:flex-wrap sm:items-center lg:justify-end">
          <Button type="button" variant="outline" className="w-full sm:w-auto" onClick={() => selectTab("history")}>
            <History className="size-4" /> Change history
          </Button>
          <Button type="button" variant="outline" className="w-full sm:w-auto" onClick={refresh} disabled={loading}>
            <RefreshCw className={cn("size-4", loading && "animate-spin")} /> Refresh
          </Button>
        </div>
      </div>
    </section>

    {error && <div role="alert" className="flex flex-wrap items-center gap-3 rounded-xl border border-destructive/40 bg-destructive/5 p-3">
      <p className="min-w-0 flex-1 text-sm text-destructive">{error}</p>
      <Button size="sm" variant="outline" onClick={refresh} disabled={loading}>Retry</Button>
    </div>}

    {!state && loading && <div className="space-y-4">
      <PolicyKpiSkeleton />
      <div className="space-y-3 rounded-xl border bg-card p-4" aria-busy="true">
        <div className="h-5 w-40 animate-pulse rounded bg-muted" />
        <div className="h-16 animate-pulse rounded-xl border bg-muted/30" />
        <PolicyTableSkeleton rows={5} columns={6} />
      </div>
    </div>}

    {context && <>
      <PolicyKpis state={context.state} onSelect={selectTab} />
      <Tabs value={tab} onValueChange={selectTab} className="space-y-4">
        <div className="sticky top-0 z-20 -mx-4 border-b bg-background/95 px-4 py-2 backdrop-blur sm:-mx-6 sm:px-6">
          <TabsList aria-label="Policy sections" className="flex h-auto w-full max-w-full min-w-0 justify-start gap-1 overflow-x-auto rounded-lg bg-muted/50 p-1">
            <TabsTrigger value="products" className={tabTriggerClass}>
              <Landmark className="size-3.5" /> Loan products
              <Badge variant="outline" className="ml-1">{context.state.products.length}</Badge>
            </TabsTrigger>
            <TabsTrigger value="settings" className={tabTriggerClass}>
              <PiggyBank className="size-3.5" /> Savings &amp; membership
            </TabsTrigger>
            <TabsTrigger value="documents" className={tabTriggerClass}>
              <FileCheck2 className="size-3.5" /> Required documents
              <Badge variant="outline" className="ml-1">{activeRules}</Badge>
            </TabsTrigger>
            <TabsTrigger value="accounts" className={tabTriggerClass}>
              <Network className="size-3.5" /> Accounts &amp; mappings
              <Badge variant="outline" className="ml-1">{context.state.accounts.length}</Badge>
            </TabsTrigger>
            <TabsTrigger value="history" className={tabTriggerClass}>
              <History className="size-3.5" /> Change history
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="products" className="mt-0"><LoanProducts context={context} /></TabsContent>
        <TabsContent value="settings" className="mt-0"><SavingsPolicies context={context} /></TabsContent>
        <TabsContent value="documents" className="mt-0"><RequiredDocuments context={context} /></TabsContent>
        <TabsContent value="accounts" className="mt-0"><PolicyAccounts context={context} /></TabsContent>
        <TabsContent value="history" className="mt-0"><PolicyHistory /></TabsContent>
      </Tabs>
    </>}
  </main>;
}
