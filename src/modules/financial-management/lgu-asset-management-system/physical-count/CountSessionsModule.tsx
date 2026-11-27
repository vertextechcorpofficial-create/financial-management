"use client";

import * as React from "react";
import Link from "next/link";
import { Plus, RefreshCw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { CountSessionInput } from "../types";
import { COUNT_STATUS_LABELS } from "../types";
import { NewSessionDialog } from "./components/NewSessionDialog";
import { useCountSessions } from "./hooks/useCountSessions";

export default function CountSessionsModule() {
  const { data, loading, error, busy, refresh, create } = useCountSessions();
  const [open, setOpen] = React.useState(false);

  const officeName = React.useMemo(() => {
    const map = new Map<number, string>();
    for (const o of data.lookups.offices) map.set(o.id, o.name);
    return map;
  }, [data.lookups.offices]);

  const className = React.useMemo(() => {
    const map = new Map<number, string>();
    for (const c of data.lookups.classes) map.set(c.id, c.name);
    return map;
  }, [data.lookups.classes]);

  async function submit(input: CountSessionInput) {
    await create(input);
  }

  return (
    <div className="flex flex-col gap-4 p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Physical Count</h1>
          <p className="text-sm text-muted-foreground">
            Count sessions. Each one produces the RPCPPE and RPCSP the auditor expects by January 31.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="secondary">{data.sessions.length} sessions</Badge>
          <Button variant="outline" size="icon" onClick={() => void refresh()} aria-label="Refresh">
            <RefreshCw className="h-4 w-4" />
          </Button>
          <Button onClick={() => setOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Start count
          </Button>
        </div>
      </div>

      {error ? (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      ) : null}

      <div className="rounded-lg border">
        {loading ? (
          <div className="p-8 text-sm text-muted-foreground">Loading count sessions...</div>
        ) : data.sessions.length === 0 ? (
          <div className="p-10 text-center">
            <p className="text-sm font-medium">No count sessions yet</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Start a count to snapshot every asset in scope into count lines.
            </p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Count No.</TableHead>
                <TableHead>As of</TableHead>
                <TableHead>Scope</TableHead>
                <TableHead>Progress</TableHead>
                <TableHead>Not found</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Open</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.sessions.map((row) => (
                <TableRow key={row.session.id}>
                  <TableCell className="font-mono text-xs">{row.session.count_no}</TableCell>
                  <TableCell className="text-sm">{row.session.as_of_date ?? "-"}</TableCell>
                  <TableCell className="text-sm">
                    {row.session.office_id ? officeName.get(row.session.office_id) ?? "-" : "All offices"}
                    {" / "}
                    {row.session.class_id ? className.get(row.session.class_id) ?? "-" : "All classes"}
                  </TableCell>
                  <TableCell className="text-sm">
                    {row.counted} of {row.totalLines}
                  </TableCell>
                  <TableCell className="text-sm">{row.notFound}</TableCell>
                  <TableCell>
                    <Badge variant={row.session.session_status === "locked" ? "default" : "secondary"}>
                      {COUNT_STATUS_LABELS[row.session.session_status]}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button asChild variant="outline" size="sm">
                      <Link href={"/fm/lgu-asset-management-system/physical-count/" + row.session.id}>Open</Link>
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      <NewSessionDialog open={open} lookups={data.lookups} busy={busy} onClose={() => setOpen(false)} onSubmit={submit} />
    </div>
  );
}
