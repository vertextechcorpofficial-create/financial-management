"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { LoanProducts } from "./components/LoanProducts";
import { SavingsPolicies } from "./components/SavingsPolicies";
import { RequiredDocuments } from "./components/RequiredDocuments";
import { PolicyAccounts } from "./components/PolicyAccounts";
import { PolicyHistory } from "./components/PolicyHistory";
import { policiesApi, policyRequest } from "./policy-client";
import type { PolicyState } from "./policy-types";

const tabs = [
  ["products", "Loan products"], ["settings", "Savings & membership"], ["documents", "Required documents"],
  ["accounts", "Chart of accounts & mappings"], ["history", "Change history"],
] as const;

export default function PoliciesModule() {
  const [state, setState] = useState<PolicyState>();
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);

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
    });
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal).catch(() => undefined);
    return () => controller.abort();
  }, [load, retry]);

  const context = state ? { state, refresh: load } : null;
  return <main className="min-h-0 min-w-0 flex-1 space-y-4 overflow-y-auto p-4 sm:p-6">
    <h1 className="text-2xl font-semibold tracking-tight">Policies</h1>
    {error && <div role="alert" className="flex flex-wrap items-center gap-3 rounded-md border border-destructive/40 bg-destructive/5 p-3">
      <p className="text-sm text-destructive">{error}</p>
      <Button size="sm" variant="outline" onClick={() => { setError(""); setRetry(value => value + 1); }}>Retry</Button>
    </div>}
    {!context && !error && <p role="status" className="text-sm text-muted-foreground">Loading policies…</p>}
    {context && <Tabs defaultValue="products" className="gap-4">
      <div className="overflow-x-auto"><TabsList aria-label="Policy sections">
        {tabs.map(([value, label]) => <TabsTrigger key={value} value={value}>{label}</TabsTrigger>)}
      </TabsList></div>
      <TabsContent value="products"><LoanProducts context={context} /></TabsContent>
      <TabsContent value="settings"><SavingsPolicies context={context} /></TabsContent>
      <TabsContent value="documents"><RequiredDocuments context={context} /></TabsContent>
      <TabsContent value="accounts"><PolicyAccounts context={context} /></TabsContent>
      <TabsContent value="history"><PolicyHistory /></TabsContent>
    </Tabs>}
  </main>;
}
