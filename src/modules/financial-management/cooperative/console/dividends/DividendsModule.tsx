"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useConsole } from "../provider";
import { ConsoleShell, EmptyState, Kv, Panel, StatusChip, Tile } from "../components/ui";
import { dividendModel, memberName } from "../calculations";
import { money, percent, round2 } from "../format";
import { CONSOLE_TODAY, type DividendSettings } from "../types";

export default function DividendsModule() {
  const { state, actions } = useConsole();
  const model = dividendModel(state);
  const posted = state.dividend.posted;
  const inputs: Array<[keyof Pick<DividendSettings, "surplus" | "reservePercent" | "educationPercent" | "savingsSharePercent">, string, string]> = [
    ["surplus", "Net operating surplus", "₱"],
    ["savingsSharePercent", "Share for interest on savings", "%"],
    ["reservePercent", "Reserve fund", "%"],
    ["educationPercent", "Education & training fund", "%"],
  ];

  return (
    <ConsoleShell
      title="Year-end dividends"
      subtitle="Net surplus after statutory funds, shared as interest on average savings and a patronage refund on loan interest paid."
      actions={<StatusChip status={posted ? "ACTIVE" : "DRAFT"} label={posted ? "Posted to savings" : "Draft allocation"} />}
    >
      <div className="grid gap-3 sm:grid-cols-3">
        <Tile label="Net surplus" value={money(state.dividend.surplus)} detail="Reviewed surplus for FY 2026" />
        <Tile label="Distributable" value={money(model.distributable)} detail={`After ${state.dividend.reservePercent + state.dividend.educationPercent}% statutory funds`} />
        <Tile label="Members" value={model.rows.length} detail="Active members receiving an allocation" />
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.05fr_0.95fr]">
        <Panel title="Allocation" description="Edit the sample allocation. The table updates immediately.">
          <div className="grid gap-3 sm:grid-cols-2">
            {inputs.map(([key, label, suffix]) => (
              <label key={key} className="space-y-1 text-xs font-medium text-muted-foreground">
                {label} {suffix}
                <Input
                  type="number"
                  min={0}
                  step={key === "surplus" ? 1_000 : 1}
                  value={state.dividend[key]}
                  disabled={posted}
                  onChange={event => actions.updateDividend(key, Number(event.target.value))}
                />
              </label>
            ))}
          </div>
          {!posted && (
            <p className="mt-3 text-xs text-muted-foreground">The savings share is applied to the distributable amount after the reserve and education funds.</p>
          )}
          <div className="mt-4">
            <Button disabled={posted || model.rows.length === 0} onClick={actions.postDividends}>
              {posted ? "Already posted" : "Post to member savings"}
            </Button>
          </div>
        </Panel>
        <Panel title="Pools">
          <Kv rows={[
            ["Net surplus", money(state.dividend.surplus)],
            ["Reserve + education funds", `−${money(state.dividend.surplus - model.distributable)}`],
            ["Distributable", money(model.distributable), "total"],
            [`Interest on savings (${state.dividend.savingsSharePercent}%)`, money(model.savingsPool)],
            [`Patronage refund (${100 - state.dividend.savingsSharePercent}%)`, money(model.patronagePool)],
            ["Effective rate on savings", percent(model.savingsRate * 100)],
          ]} />
          {posted && <p className="mt-3 rounded-md bg-emerald-50 p-3 text-sm text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">Posted on {CONSOLE_TODAY}. The amount is now included in each member’s savings balance.</p>}
        </Panel>
      </div>

      <Panel title="Member distribution" description={`${model.rows.length} active members. Rounding differences stay in the pools.`}>
        <div className="max-h-[55dvh] overflow-auto rounded-md border">
          <Table>
            <TableHeader><TableRow><TableHead>Member</TableHead><TableHead className="text-right">Average savings</TableHead><TableHead className="text-right">Interest on savings</TableHead><TableHead className="text-right">Loan interest paid</TableHead><TableHead className="text-right">Patronage refund</TableHead><TableHead className="text-right">Total</TableHead></TableRow></TableHeader>
            <TableBody>
              {!model.rows.length && <TableRow><TableCell colSpan={6}><EmptyState>No active members.</EmptyState></TableCell></TableRow>}
              {model.rows.map(row => {
                const member = state.members.find(entry => entry.id === row.memberId);
                return (
                  <TableRow key={row.memberId}>
                    <TableCell>{member ? memberName(member) : row.memberId}<span className="block text-xs text-muted-foreground">{member?.employeeNumber}</span></TableCell>
                    <TableCell className="text-right font-mono">{money(row.averageSavings)}</TableCell>
                    <TableCell className="text-right font-mono">{money(row.savingsInterest)}</TableCell>
                    <TableCell className="text-right font-mono">{money(row.loanInterestPaid)}</TableCell>
                    <TableCell className="text-right font-mono">{money(row.patronageRefund)}</TableCell>
                    <TableCell className="text-right font-mono font-semibold">{money(row.total)}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
            {model.rows.length > 0 && (
              <tfoot><TableRow>
                <TableCell className="font-semibold">Total</TableCell>
                <TableCell className="text-right font-mono font-semibold">{money(round2(model.rows.reduce((sum, row) => sum + row.averageSavings, 0)))}</TableCell>
                <TableCell className="text-right font-mono font-semibold">{money(round2(model.rows.reduce((sum, row) => sum + row.savingsInterest, 0)))}</TableCell>
                <TableCell className="text-right font-mono font-semibold">{money(round2(model.rows.reduce((sum, row) => sum + row.loanInterestPaid, 0)))}</TableCell>
                <TableCell className="text-right font-mono font-semibold">{money(round2(model.rows.reduce((sum, row) => sum + row.patronageRefund, 0)))}</TableCell>
                <TableCell className="text-right font-mono font-semibold">{money(round2(model.rows.reduce((sum, row) => sum + row.total, 0)))}</TableCell>
              </TableRow></tfoot>
            )}
          </Table>
        </div>
      </Panel>
    </ConsoleShell>
  );
}
