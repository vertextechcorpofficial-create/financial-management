import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { centsToAmount } from "../../loans/loan-schedule";
import { peso } from "../../members/format";
import { Kv, Panel, StatusChip } from "../components/ui";
import type { DividendPreview } from "./allocation";

export function DividendPools({ preview, pending, unsaved, revision, posted }: {
  preview?: DividendPreview;
  pending: string;
  unsaved: boolean;
  revision?: number;
  posted: boolean;
}) {
  const status = posted ? "Posted" : unsaved ? "Unsaved preview" : `Saved revision ${revision}`;
  const format = (value: bigint) => peso(centsToAmount(value));
  return <Panel title="Pools" actions={preview && <div role="status">
    <StatusChip status={posted ? "POSTED" : unsaved ? "DRAFT" : "READY"} label={status} />
  </div>}>
    {!preview ? <p role="status" className="text-sm text-muted-foreground">{pending}</p> :
      <div className="space-y-3">
        <Kv rows={[
          ["Net surplus", format(preview.netSurplus)],
          ["Reserve fund", format(preview.reserve)],
          ["Education & training fund", format(preview.education)],
          ["Distributable", format(preview.distributable), "total"],
          ["Effective savings rate", preview.effectiveSavingsRate ?? "—"],
        ]} />
        <div className="rounded-md border">
          <Table aria-label="Pool totals">
            <TableHeader><TableRow>
              <TableHead scope="col">Pool</TableHead>
              <TableHead scope="col" className="text-right">Available</TableHead>
              <TableHead scope="col" className="text-right">Allocated</TableHead>
              <TableHead scope="col" className="text-right">Retained</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {([["Interest on savings", preview.savings], ["Patronage refund", preview.patronage]] as const).map(([label, pool]) =>
                <TableRow key={label}>
                  <TableCell>{label}</TableCell>
                  <TableCell className="text-right tabular-nums">{format(pool.available)}</TableCell>
                  <TableCell className="text-right tabular-nums">{format(pool.allocated)}</TableCell>
                  <TableCell className="text-right tabular-nums">{format(pool.retained)}</TableCell>
                </TableRow>)}
            </TableBody>
          </Table>
        </div>
        <Kv rows={[["Undivided surplus", format(preview.undividedSurplus), "total"]]} />
      </div>}
  </Panel>;
}
