"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { date } from "../members/format";
import { memberFetch } from "../members/client";
import type { RemittanceRuns } from "../server/payroll-remittance-store";

export function PayrollRunSelect({ endpoint, value, onChange, disabled }: {
  endpoint: string;
  value?: number;
  onChange: (id: number | undefined) => void;
  disabled: boolean;
}) {
  const [term, setTerm] = useState("");
  const [query, setQuery] = useState({ search: "", page: 1 });
  const [selected, setSelected] = useState<RemittanceRuns["rows"][number]>();
  const [result, setResult] = useState<{ query: typeof query; data?: RemittanceRuns; error?: string }>();
  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams({ action: "runs", search: query.search, page: String(query.page) });
    memberFetch<RemittanceRuns>(`${endpoint}?${params}`, { signal: controller.signal })
      .then(data => { if (!controller.signal.aborted) setResult({ query, data }); })
      .catch((cause: Error) => { if (!controller.signal.aborted) setResult({ query, error: cause.message }); });
    return () => controller.abort();
  }, [endpoint, query]);
  const current = result?.query === query ? result : undefined;
  const rows = current?.data?.rows ?? [];
  const choices = selected && selected.payroll_run_id === value && !rows.some(row => row.payroll_run_id === value)
    ? [selected, ...rows] : rows;

  return <div className="space-y-2">
    <div className="flex flex-wrap items-end gap-2">
      <label className="block flex-1 space-y-1 text-sm">Search payroll runs
        <Input value={term} onChange={event => setTerm(event.target.value)} placeholder="Run ID or YYYY-MM-DD"
          disabled={disabled} onKeyDown={event => {
            if (event.key === "Enter") { event.preventDefault(); setQuery({ search: term.trim(), page: 1 }); }
          }} />
      </label>
      <Button type="button" variant="outline" disabled={disabled} onClick={() => setQuery({ search: term.trim(), page: 1 })}>Search</Button>
    </div>
    <label className="block space-y-1 text-sm">Posted payroll run
      <NativeSelect value={value ?? ""} disabled={disabled || !current} onChange={event => {
        const row = choices.find(item => item.payroll_run_id === Number(event.target.value));
        setSelected(row);
        onChange(row?.payroll_run_id);
      }}>
        <option value="">{!current ? "Loading payroll runs…" : "Choose a payroll run"}</option>
        {choices.map(row => <option key={row.payroll_run_id} value={row.payroll_run_id}>
          {date(row.cutoff_end)} · Run {row.payroll_run_id}
        </option>)}
      </NativeSelect>
    </label>
    {current?.error && <p role="alert" className="text-xs text-destructive">{current.error}</p>}
    {current?.data && !rows.length && <p className="text-xs text-muted-foreground">No posted payroll runs match.</p>}
    {(query.page > 1 || current?.data?.hasMore) && <div className="flex items-center gap-2 text-xs">
      <Button type="button" size="sm" variant="outline" disabled={disabled || query.page === 1}
        onClick={() => setQuery({ ...query, page: query.page - 1 })}>Previous runs</Button>
      Page {query.page}
      <Button type="button" size="sm" variant="outline" disabled={disabled || !current?.data?.hasMore}
        onClick={() => setQuery({ ...query, page: query.page + 1 })}>Next runs</Button>
    </div>}
  </div>;
}
