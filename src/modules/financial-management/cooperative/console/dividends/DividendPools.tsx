"use client";

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { centsToAmount } from "../../loans/loan-schedule";
import { peso } from "../../members/format";
import { Kv, Panel, Progress, StatusChip } from "../components/ui";
import type { DividendPreview } from "./allocation";

export function DividendPools({ preview, pending, unsaved, revision, posted, basisMembers, creditedMembers }: {
  preview?: DividendPreview;
  pending: string;
  unsaved: boolean;
  revision?: number;
  posted: boolean;
  basisMembers?: number;
  creditedMembers?: number;
}) {
  const status = posted ? "Posted" : unsaved ? "Unsaved preview" : `Saved revision ${revision}`;
  const format = (value: bigint) => peso(centsToAmount(value));
  const progress = (available: bigint, allocated: bigint) =>
    available > 0n ? Math.min(100, Math.round(Number((allocated * 100n) / available))) : 0;

  return <Panel title="Pools" actions={preview && <div role="status">
    <StatusChip status={posted ? "POSTED" : unsaved ? "DRAFT" : "READY"} label={status} />
  </div>}>
    {!preview ? <p role="status" className="rounded-xl border bg-muted/20 p-3 text-sm text-muted-foreground">{pending}</p> :
      <div className="space-y-4">
        <Kv rows={[
          ["Net surplus", format(preview.netSurplus)],
          ["Reserve fund", format(preview.reserve)],
          ["Education & training fund", format(preview.education)],
          ["Distributable", format(preview.distributable), "total"],
          ["Effective savings rate", preview.effectiveSavingsRate ?? "—"],
        ]} />
        <div className="overflow-x-auto rounded-xl border">
          <Table aria-label="Pool totals">
            <TableHeader><TableRow className="bg-muted/40 hover:bg-muted/40">
              <TableHead scope="col">Pool</TableHead>
              <TableHead scope="col" className="text-right">Available</TableHead>
              <TableHead scope="col" className="text-right">Allocated</TableHead>
              <TableHead scope="col" className="text-right">Retained</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {([["Interest on savings", preview.savings], ["Patronage refund", preview.patronage]] as const).map(([label, pool]) =>
                <TableRow key={label}>
                  <TableCell>{label}</TableCell>
                  <TableCell className="text-right font-mono tabular-nums">{format(pool.available)}</TableCell>
                  <TableCell className="text-right font-mono tabular-nums">{format(pool.allocated)}</TableCell>
                  <TableCell className="text-right font-mono tabular-nums">{format(pool.retained)}</TableCell>
                </TableRow>)}
            </TableBody>
          </Table>
        </div>
        <div className="space-y-2">
          {([["Interest on savings", preview.savings], ["Patronage refund", preview.patronage]] as const).map(([label, pool]) => {
            const percent = progress(pool.available, pool.allocated);
            return <div key={label}>
              <div className="mb-1 flex items-center justify-between gap-2 text-xs text-muted-foreground">
                <span>{label}</span><span>{percent}% allocated</span>
              </div>
              <Progress value={percent} max={100} />
            </div>;
          })}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-3">
          <Kv rows={[["Undivided surplus", format(preview.undividedSurplus), "total"]]} />
          {creditedMembers !== undefined && basisMembers !== undefined && <p className="text-xs text-muted-foreground">
            {creditedMembers} of {basisMembers} members receive a credit
          </p>}
        </div>
      </div>}
  </Panel>;
}
