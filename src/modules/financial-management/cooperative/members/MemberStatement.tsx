"use client";

import { useEffect, useRef, useState } from "react";
import { Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Kv, Panel } from "../console/components/ui";
import { memberFetch } from "./client";
import { copyCooperativeText } from "./copyText";
import { date, isCalendarDate, peso, savingsKindLabel, statusText, todayManila } from "./format";
import { loanActivityChannels, loanStatementColumns, statementPeriods, statementText } from "./statement";
import type { MemberStatement as Statement, StatementPeriod } from "./types";

export function MemberStatement({ userId }: { userId: number }) {
  const periods = statementPeriods(todayManila());
  const [period, setPeriod] = useState<StatementPeriod>(() => ({ from: periods["Last month"].from, to: periods["This month"].to }));
  const [preset, setPreset] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [loaded, setLoaded] = useState<{ query: string; attempt: number; result?: Statement; error?: string }>();
  const [copyFeedback, setCopyFeedback] = useState<{ result: Statement; message: string }>();
  const copyButton = useRef<HTMLButtonElement>(null);
  const copyContainer = useRef<HTMLDivElement>(null);
  const rangeError = !isCalendarDate(period.from) || !isCalendarDate(period.to)
    ? "Enter valid From and To dates."
    : period.from > period.to ? "From must be on or before To." : "";
  const query = rangeError ? null : new URLSearchParams(period).toString();
  const current = query !== null && loaded?.query === query && loaded.attempt === attempt ? loaded : undefined;
  const statement = current?.result;
  const loading = query !== null && !current;

  useEffect(() => {
    if (query === null) return;
    const controller = new AbortController();
    memberFetch<Statement>("/api/fm/cooperative/members/" + userId + "/statement?" + query, { signal: controller.signal })
      .then(result => {
        if (!controller.signal.aborted) setLoaded({ query, attempt, result });
      })
      .catch(cause => {
        if (!controller.signal.aborted) {
          setLoaded({ query, attempt, error: cause instanceof Error ? cause.message : "Unable to load the statement." });
        }
      });
    return () => controller.abort();
  }, [userId, query, attempt]);

  function selectPeriod(next: StatementPeriod, name = "") {
    setPeriod(next);
    setPreset(name);
    setCopyFeedback(undefined);
  }

  async function copy() {
    if (!statement || !copyContainer.current) return;
    const copied = await copyCooperativeText(statementText(statement), copyContainer.current, copyButton.current);
    setCopyFeedback({ result: statement, message: copied ? "Statement copied." : "Unable to copy the statement. Try again." });
  }

  return (
    <Panel title="Statement of account">
      <div ref={copyContainer} className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2 md:flex md:items-end">
          <div className="space-y-1.5">
            <label htmlFor="cooperative-statement-period" className="block text-xs font-medium text-muted-foreground">Period</label>
            <NativeSelect
              id="cooperative-statement-period"
              value={preset}
              className="h-9 w-full"
              onChange={event => {
                const name = event.target.value as keyof typeof periods | "";
                selectPeriod(name ? periods[name] : period, name);
              }}
            >
              <option value="">Custom</option>
              {Object.keys(periods).map(label => <option key={label}>{label}</option>)}
            </NativeSelect>
          </div>
          <label className="space-y-1.5 text-xs font-medium text-muted-foreground">
            From
            <Input type="date" value={period.from} onChange={event => selectPeriod({ ...period, from: event.target.value })} />
          </label>
          <label className="space-y-1.5 text-xs font-medium text-muted-foreground">
            To
            <Input type="date" value={period.to} onChange={event => selectPeriod({ ...period, to: event.target.value })} />
          </label>
          <Button ref={copyButton} type="button" variant="outline" className="md:ml-auto" onClick={() => void copy()} disabled={!statement}>
            <Copy className="size-4" />
            Copy statement
          </Button>
        </div>
        {copyFeedback && copyFeedback.result === statement && <p role="status" className="text-sm text-muted-foreground">{copyFeedback.message}</p>}
        {rangeError && <p role="alert" className="text-sm text-destructive">{rangeError}</p>}
        {current?.error && (
          <div role="alert" className="flex flex-wrap items-center gap-2 text-sm text-destructive">
            <p>{current.error}</p>
            <Button type="button" variant="outline" size="sm" onClick={() => setAttempt(value => value + 1)}>Retry</Button>
          </div>
        )}
        {loading && <StatementSkeleton />}
        {statement && <StatementBody statement={statement} onRetry={() => setAttempt(value => value + 1)} />}
      </div>
    </Panel>
  );
}

function StatementSkeleton() {
  return <div className="space-y-4 rounded-lg border p-3 sm:p-4" aria-busy="true">
    <div className="flex flex-wrap items-center justify-between gap-2 border-b pb-3">
      <div className="h-4 w-24 animate-pulse rounded bg-muted" />
      <div className="h-4 w-36 animate-pulse rounded bg-muted" />
    </div>
    <div className="grid gap-3 sm:grid-cols-2">
      {Array.from({ length: 4 }, (_, index) => <div key={index} className="h-4 w-full animate-pulse rounded bg-muted/70" />)}
    </div>
    <div className="space-y-2">
      <div className="h-9 w-full animate-pulse rounded bg-muted/60" />
      {Array.from({ length: 6 }, (_, index) => <div key={index} className="h-9 w-full animate-pulse rounded bg-muted/40" />)}
    </div>
    <p role="status" className="sr-only">Loading statement…</p>
  </div>;
}

function StatementBody({ statement, onRetry }: { statement: Statement; onRetry: () => void }) {
  const { member } = statement;
  return (
    <div className="min-w-0 space-y-4 rounded-lg border p-3 sm:p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b pb-3">
        <span className="font-semibold">Cooperative</span>
        <span className="text-sm text-muted-foreground">{date(statement.from)} – {date(statement.to)}</span>
      </div>
      <Kv rows={[
        ["Member", member.name + " · " + member.employeeNumber],
        ["Department", member.department ?? "No department"],
        ["Membership agreement", member.agreementNo ?? "—"],
        ["Status", statusText(member.status)],
      ]} />
      <section className="space-y-2">
        <h3 className="text-sm font-semibold">Savings</h3>
        <div className="overflow-hidden rounded-lg border">
          <Table>
            <TableHeader className="bg-muted/50">
              <TableRow>
                <TableHead>Date</TableHead><TableHead>Particulars</TableHead><TableHead>Reference</TableHead>
                <TableHead className="text-right">Deposits</TableHead><TableHead className="text-right">Withdrawals</TableHead><TableHead className="text-right">Balance</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow className="bg-muted/25">
                <TableCell className="whitespace-nowrap">{date(statement.from)}</TableCell>
                <TableCell colSpan={4} className="font-medium">Opening balance</TableCell>
                <TableCell className="text-right font-mono tabular-nums">{peso(statement.openingBalance)}</TableCell>
              </TableRow>
              {statement.entries.length === 0 && (
                <TableRow><TableCell colSpan={6} className="py-6 text-center text-muted-foreground">No savings activity in this period.</TableCell></TableRow>
              )}
              {statement.entries.map(entry => (
                <TableRow key={entry.id}>
                  <TableCell className="whitespace-nowrap">{date(entry.entryDate)}</TableCell>
                  <TableCell>{savingsKindLabel[entry.kind]}</TableCell>
                  <TableCell className="font-mono text-xs">{entry.reference}</TableCell>
                  <TableCell className="text-right font-mono tabular-nums">{entry.deposit === null ? "" : peso(entry.deposit)}</TableCell>
                  <TableCell className="text-right font-mono tabular-nums">{entry.withdrawal === null ? "" : peso(entry.withdrawal)}</TableCell>
                  <TableCell className="text-right font-mono tabular-nums">{peso(entry.runningBalance)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
            <TableFooter>
              <TableRow>
                <TableCell colSpan={3}>Closing balance</TableCell>
                <TableCell className="text-right font-mono tabular-nums">{peso(statement.deposits)}</TableCell>
                <TableCell className="text-right font-mono tabular-nums">{peso(statement.withdrawals)}</TableCell>
                <TableCell className="text-right font-mono tabular-nums">{peso(statement.closingBalance)}</TableCell>
              </TableRow>
            </TableFooter>
          </Table>
        </div>
      </section>
      <StatementLoans loans={statement.loans} onRetry={onRetry} />
      <p className="text-xs text-muted-foreground">Generated {date(statement.generatedOn)}</p>
    </div>
  );
}

function StatementLoans({ loans, onRetry }: { loans: Statement["loans"]; onRetry: () => void }) {
  return (
    <section className="space-y-2">
      <h3 className="text-sm font-semibold">Loans</h3>
      {loans.state !== "ready" ? (
        <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
          <p role="alert">{loans.message}</p>
          <Button type="button" variant="outline" size="sm" onClick={onRetry}>Retry loan activity</Button>
        </div>
      ) : loans.data.entries.length === 0 ? (
        <p className="text-sm text-muted-foreground">No loans in this period.</p>
      ) : (
        <div className="space-y-4">
          <div className="overflow-hidden rounded-lg border">
            <Table>
              <TableHeader className="bg-muted/50">
                <TableRow>
                  <TableHead>Loan</TableHead>
                  {loanStatementColumns.map(([key, label]) => <TableHead key={key} className="text-right">{label}</TableHead>)}
                </TableRow>
              </TableHeader>
              <TableBody>
                {loans.data.entries.map(entry => (
                  <TableRow key={entry.id}>
                    <TableCell><div className="font-mono">{entry.loanNo}</div><div className="text-xs text-muted-foreground">{entry.productName}</div></TableCell>
                    {loanStatementColumns.map(([key]) => <TableCell key={key} className="text-right font-mono tabular-nums">{peso(entry[key])}</TableCell>)}
                  </TableRow>
                ))}
              </TableBody>
              <TableFooter>
                <TableRow>
                  <TableCell>Total</TableCell>
                  {loanStatementColumns.map(([key]) => <TableCell key={key} className="text-right font-mono tabular-nums">{peso(loans.data.totals[key])}</TableCell>)}
                </TableRow>
              </TableFooter>
            </Table>
          </div>
          {loans.data.activity.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-sm font-semibold">Loan activity</h4>
              <div className="overflow-hidden rounded-lg border">
                <Table>
                  <TableHeader className="bg-muted/50">
                    <TableRow>
                      <TableHead>Date</TableHead><TableHead>Loan</TableHead><TableHead>Activity</TableHead>
                      <TableHead>Reference</TableHead><TableHead>Journal</TableHead><TableHead className="text-right">Amount</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {loans.data.activity.map(item => (
                      <TableRow key={item.key}>
                        <TableCell>{date(item.date)}</TableCell>
                        <TableCell className="font-mono">{item.loanNo}</TableCell>
                        <TableCell>
                          {item.kind}
                          {item.netProceeds !== undefined && <div className="text-xs text-muted-foreground">
                            {peso(item.netProceeds)} paid out · {peso(item.upfrontInterest ?? "0.00")} interest withheld
                          </div>}
                          {item.channel && <div className="text-xs text-muted-foreground">{loanActivityChannels[item.channel]}</div>}
                        </TableCell>
                        <TableCell className="font-mono">{item.reference}</TableCell>
                        <TableCell>
                          <div className="font-mono">{item.journalNo}</div>
                          {item.reversesJournalNo && <div className="text-xs text-muted-foreground">Reverses {item.reversesJournalNo}</div>}
                        </TableCell>
                        <TableCell className="text-right font-mono tabular-nums">{peso(item.amount)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
