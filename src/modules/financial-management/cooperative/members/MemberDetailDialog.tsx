"use client";

import { useEffect, useState } from "react";
import {
  AlertTriangle, Banknote, Calculator, FileText, FolderClosed, HandCoins, Landmark, LayoutDashboard, Wallet,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { NativeSelect } from "@/components/ui/native-select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ConsoleDialog, EmptyState, Kv, Panel, StatusChip } from "../console/components/ui";
import { CooperativeDocuments } from "./MemberDocuments";
import { MemberLoans } from "./MemberLoans";
import { MemberStatement } from "./MemberStatement";
import { MetricCard, PersonAvatar } from "./components";
import { memberFetch } from "./client";
import {
  date, feeChannelLabel, isSavingsOutflow, MEMBER_STATUS_CHIP, MEMBER_STATUS_LABEL, peso, savingsKindLabel,
} from "./format";
import type { MemberDetail, SavingsEntry } from "./types";

const tabTriggerClass = "shrink-0 gap-1.5 whitespace-nowrap data-[state=active]:bg-background";
const amountLabel = (value: string | null) => value === null ? "Unavailable" : peso(value);

export function MemberDetailDialog({ userId, onClose, onDocumentsChanged }: {
  userId: number;
  onClose: () => void;
  onDocumentsChanged: () => void;
}) {
  const [detail, setDetail] = useState<MemberDetail>();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    const refreshOnFocus = () => setAttempt(value => value + 1);
    window.addEventListener("focus", refreshOnFocus);
    memberFetch<MemberDetail>(`/api/fm/cooperative/members/${userId}`, { signal: controller.signal })
      .then(payload => {
        if (controller.signal.aborted) return;
        setDetail(payload);
        setError("");
      })
      .catch(cause => {
        if (!controller.signal.aborted && !(cause instanceof DOMException && cause.name === "AbortError")) {
          setError(cause instanceof Error ? cause.message : "Unable to load this member.");
        }
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => {
      window.removeEventListener("focus", refreshOnFocus);
      controller.abort();
    };
  }, [userId, attempt]);

  const item = detail?.item;
  const current = detail?.current;
  const loanAccount = detail?.loans?.state === "ready" ? detail.loans.data : null;
  const withdrawals = detail?.withdrawals;
  const withdrawalBalance = !error && withdrawals?.state === "ready" ? withdrawals.data : null;
  const withdrawalPlaceholder = !current ? "—" : !error && withdrawals?.state === "pending_rollout" ? "Pending rollout" : "Unavailable";
  const postedSavings = current ? peso(current.savingsBalance) : "—";
  const maintainingBalance = current ? peso(withdrawalBalance?.maintainingBalance ?? detail.policy.maintainingBalance) : "—";
  const pendingWithdrawals = withdrawalBalance ? peso(withdrawalBalance.pendingAmount) : withdrawalPlaceholder;
  const availableSavings = current?.status === "SEPARATED" || withdrawalBalance?.availableSavings === null
    ? "Closed"
    : withdrawalBalance ? peso(withdrawalBalance.availableSavings) : withdrawalPlaceholder;
  const retry = () => setAttempt(value => value + 1);

  return (
    <ConsoleDialog
      open
      onOpenChange={open => { if (!open) onClose(); }}
      title={(
        <span className="flex min-w-0 items-center gap-3">
          <PersonAvatar name={item?.employeeName ?? `Employee ${userId}`} size="lg" />
          <span className="min-w-0">
            <span className="flex min-w-0 flex-wrap items-center gap-2">
              <span className="min-w-0 truncate">{item?.employeeName ?? `Employee ${userId}`}</span>
              {item && <StatusChip status={MEMBER_STATUS_CHIP[item.membershipStatus]} label={MEMBER_STATUS_LABEL[item.membershipStatus]} />}
            </span>
            <span className="mt-0.5 block truncate text-xs font-normal text-muted-foreground">
              {item ? `${item.employeeNumber} / ${item.departmentName ?? "No department"}` : "Loading member..."}
            </span>
          </span>
        </span>
      )}
      description={current ? <span className="block text-left">Member since {date(current.joinedAt)}</span> : item ? <span className="block text-left">Not yet a Cooperative member</span> : undefined}
      wide
      footerClassName="sticky bottom-0 z-20 -mx-6 -mb-6 mt-4 border-t bg-background/95 px-6 py-3 backdrop-blur"
      footer={<Button variant="outline" onClick={onClose}>Close</Button>}
    >
      {loading && <DetailSkeleton />}
      {error && (
        <div role="alert" className="flex flex-wrap items-center gap-2 rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <p className="flex-1">{error}</p>
          <Button type="button" variant="outline" size="sm" onClick={retry}>Retry member details</Button>
        </div>
      )}
      {detail && item && (
        <Tabs defaultValue="summary" className="w-full min-w-0">
          <TabsList className="flex h-auto w-full max-w-full min-w-0 justify-start gap-1 overflow-x-auto rounded-lg bg-muted/50 p-1">
            <TabsTrigger value="summary" className={tabTriggerClass}><LayoutDashboard className="size-3.5" /> Summary</TabsTrigger>
            {current && <TabsTrigger value="statement" className={tabTriggerClass}><FileText className="size-3.5" /> Statement</TabsTrigger>}
            {current && <TabsTrigger value="savings" className={tabTriggerClass}><Wallet className="size-3.5" /> Savings</TabsTrigger>}
            {current && <TabsTrigger value="documents" className={tabTriggerClass}><FolderClosed className="size-3.5" /> Documents</TabsTrigger>}
            <TabsTrigger value="loans" className={tabTriggerClass}><HandCoins className="size-3.5" /> Loans</TabsTrigger>
            {current && <TabsTrigger value="takehome" className={tabTriggerClass}><Calculator className="size-3.5" /> Take-home</TabsTrigger>}
          </TabsList>

          <TabsContent value="summary" className="mt-4 space-y-4">
            <div className="grid gap-3 sm:grid-cols-3">
              <MetricCard
                icon={Wallet}
                label="Posted savings"
                value={postedSavings}
                detail={current ? `${peso(current.savingsPerCutoff)} per cutoff` : "No membership"}
                tone="emerald"
              />
              <MetricCard
                icon={Landmark} label="Loan balance" value={current ? amountLabel(item.loanBalance) : "—"}
                detail={item.pastDue === null ? undefined : peso(item.pastDue) + " past due"} tone="slate"
              />
              <MetricCard icon={Banknote} label="Available to withdraw" value={availableSavings} tone="slate" />
            </div>
            {!error && <WithdrawalNotice source={withdrawals} onRetry={retry} />}

            <div className="grid gap-4 md:grid-cols-2">
              <Panel title="Membership agreement">
                {current ? (
                  <Kv rows={[
                    ["Agreement no.", <span key="agreement" className="rounded-md border bg-muted/40 px-1.5 py-0.5 font-mono text-xs">{detail.agreement?.agreementNo ?? "-"}</span>],
                    ["Signed", date(detail.agreement?.signedAt ?? current.joinedAt)],
                    ["Membership fee", peso(current.membershipFee)],
                    ["Fee channel", feeChannelLabel(current.feeChannel)],
                    ["Savings per cutoff", peso(current.savingsPerCutoff)],
                    ["Opening deposit", peso(current.openingDeposit)],
                    ["Beneficiary", current.beneficiary || "-"],
                    ["Policy revision", current.policyRevision],
                    ["Journal entry", <span key="journal" className="font-mono text-xs">{current.journalNo ?? "-"}</span>],
                    ["Official receipt", <span key="receipt" className="font-mono text-xs">{current.orNo ?? "No counter receipt"}</span>],
                  ]} />
                ) : (
                  <EmptyState>This employee has not joined the Cooperative yet.</EmptyState>
                )}
              </Panel>

              <Panel title="Account summary">
                <Kv rows={[
                  ["HR employee number", item.employeeNumber],
                  ["Department", item.departmentName ?? "No department"],
                  ["Posted savings", postedSavings],
                  ["Maintaining balance", maintainingBalance],
                  ["Pending withdrawals", pendingWithdrawals],
                  ["Available to withdraw", availableSavings],
                    ...(item.documents ? [["Required documents", item.documents.onFile + " of " + item.documents.required + " on file"] satisfies [string, string]] : []),
                  ["Loan balance", current ? amountLabel(item.loanBalance) : "—"],
                  ["Past due", current ? amountLabel(item.pastDue) : "—"],
                  ["Penalties due", current ? amountLabel(loanAccount?.penalties ?? null) : "—"],
                  ["Salary loan available", loanAccount?.salaryRoom.state === "ready" ? peso(loanAccount.salaryRoom.amount)
                    : loanAccount?.salaryRoom.state === "unlimited" ? "No product limit"
                      : loanAccount?.salaryRoom.message ?? (current ? "Unavailable" : "—")],
                  ["Take-home headroom", current ? amountLabel(detail.takeHome.headroom) : "—"],
                ]} />
              </Panel>
            </div>

            {detail.payroll.state === "verified" ? (
              <Panel
                title="Posted VOS payroll"
                actions={<span className="rounded-md border bg-muted/40 px-2 py-1 text-xs">{date(detail.payroll.cutoffDate)}</span>}
              >
                <div className="grid gap-4 sm:grid-cols-3">
                  <div>
                    <p className="text-xs text-muted-foreground">Gross pay</p>
                    <p className="mt-1 font-mono text-lg font-semibold">{peso(detail.payroll.grossPay)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Total deductions</p>
                    <p className="mt-1 font-mono text-lg font-semibold">{peso(detail.payroll.totalDeductions)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Net pay</p>
                    <p className="mt-1 font-mono text-lg font-semibold text-emerald-700 dark:text-emerald-300">{peso(detail.payroll.netPay)}</p>
                  </div>
                </div>
              </Panel>
            ) : (
              <div role="status" className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
                <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                {detail.payroll.message}
              </div>
            )}
          </TabsContent>

          <TabsContent value="statement" className="mt-4">
            {current && <MemberStatement userId={item.userId} />}
          </TabsContent>

          <TabsContent value="savings" className="mt-4 space-y-4">
            <Panel
              title="Savings ledger"
              description="Posted savings movement for this membership."
              actions={<span className="font-mono text-lg font-semibold">{postedSavings}</span>}
            >
              {current && <SavingsLedger entries={detail.savingsEntries} />}
            </Panel>
            {current && (
              <Panel title="Savings policy">
                <dl className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  {[
                    ["Maintaining balance", maintainingBalance],
                    ["Minimum savings per cutoff", peso(detail.policy.minimumSavings)],
                    ["Pending withdrawals", pendingWithdrawals],
                    ["Available to withdraw", availableSavings],
                  ].map(([label, value]) => (
                    <div key={label} className="rounded-lg border bg-muted/20 p-3">
                      <dt className="text-xs text-muted-foreground">{label}</dt>
                      <dd className="mt-1 font-mono text-sm font-semibold">{value}</dd>
                    </div>
                  ))}
                </dl>
                {!error && <WithdrawalNotice source={withdrawals} onRetry={retry} />}
              </Panel>
            )}
          </TabsContent>

          <TabsContent value="documents" className="mt-4">
            {current ? (
              <CooperativeDocuments
                endpoint={"/api/fm/cooperative/members/" + item.userId + "/documents"}
                required={detail.requiredDocuments}
                storageReady={detail.documentStorageReady}
                canEdit={current.status === "ACTIVE"}
                onChanged={() => {
                  setAttempt(value => value + 1);
                  onDocumentsChanged();
                }}
              />
            ) : (
              <EmptyState>Documents apply to current memberships.</EmptyState>
            )}
          </TabsContent>

          <TabsContent value="loans" className="mt-4">
            <MemberLoans userId={userId} loans={detail.loans} onRetry={() => setAttempt(value => value + 1)} />
          </TabsContent>

          <TabsContent value="takehome" className="mt-4 space-y-4">
            <div className="grid gap-3 sm:grid-cols-3">
              <MetricCard
                icon={Wallet}
                label="Net pay"
                value={detail.payroll.state === "verified" ? peso(detail.payroll.netPay) : "Unavailable"}
                detail={detail.payroll.state === "verified" ? `Posted cutoff ${date(detail.payroll.cutoffDate)}` : "Posted VOS payroll unavailable"}
                tone="emerald"
              />
              <MetricCard
                icon={Calculator}
                label="Take-home floor"
                value={detail.takeHome.floor ? peso(detail.takeHome.floor) : "Unavailable"}
                detail={detail.policy.floorMode === "FIXED" ? "Fixed policy floor" : `${detail.policy.floorPercent ?? "0"}% of gross pay`}
                tone="sky"
              />
              <MetricCard
                icon={HandCoins}
                label="Headroom"
                value={amountLabel(detail.takeHome.headroom)}
                detail={detail.takeHome.assessmentCutoff ? "For cutoff " + date(detail.takeHome.assessmentCutoff) : undefined}
                tone={detail.takeHome.headroom?.startsWith("-") ? "rose" : "emerald"}
                alert={Boolean(detail.takeHome.headroom?.startsWith("-"))}
              />
            </div>
            <Panel title="Payroll deduction">
              {detail.payroll.state === "verified" ? (
                <>
                  <Kv rows={[
                    ["Gross pay", peso(detail.payroll.grossPay)],
                    ["Total deductions", peso(detail.payroll.totalDeductions)],
                    ["Net pay", peso(detail.payroll.netPay)],
                    ["Savings per cutoff", amountLabel(detail.takeHome.savingsPerCutoff)],
                    ["Loan deductions", amountLabel(detail.takeHome.loanDeduction)],
                    ["Total Cooperative commitments", amountLabel(detail.takeHome.payrollDeduction)],
                    ["Already included in posted net pay", amountLabel(detail.takeHome.includedInNetPay)],
                    ["Headroom", amountLabel(detail.takeHome.headroom), "total"],
                  ]} />
                  <p className="mt-3 text-xs text-muted-foreground">
                    Posted payroll reference {date(detail.payroll.cutoffDate)}
                  </p>
                  {detail.takeHome.headroomMessage && <p role="status" className="mt-2 text-sm text-muted-foreground">{detail.takeHome.headroomMessage}</p>}
                </>
              ) : (
                <p className="text-sm text-amber-700 dark:text-amber-300">{detail.payroll.message}</p>
              )}
            </Panel>
          </TabsContent>
        </Tabs>
      )}
    </ConsoleDialog>
  );
}

function WithdrawalNotice({ source, onRetry }: {
  source: MemberDetail["withdrawals"] | undefined;
  onRetry: () => void;
}) {
  if (!source || source.state === "ready") return null;
  return (
    <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
      <p role={source.state === "unavailable" ? "alert" : "status"}>{source.message}</p>
      {source.state === "unavailable" && (
        <Button type="button" variant="outline" size="sm" onClick={onRetry}>Retry withdrawal data</Button>
      )}
    </div>
  );
}

function DetailSkeleton() {
  return (
    <div className="space-y-4" aria-busy="true">
      <div className="grid gap-3 sm:grid-cols-3">
        {Array.from({ length: 3 }, (_, index) => <div key={index} className="h-24 animate-pulse rounded-xl border bg-muted/40" />)}
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <div className="h-64 animate-pulse rounded-xl border bg-muted/30" />
        <div className="h-64 animate-pulse rounded-xl border bg-muted/30" />
      </div>
    </div>
  );
}

function SavingsLedger({ entries }: { entries: SavingsEntry[] }) {
  const [filter, setFilter] = useState("");
  const matching = entries.filter(entry => filter === "DEPOSITS" ? !isSavingsOutflow(entry.kind) : !filter || entry.kind === filter);
  const recent = matching.slice(-12).reverse();
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div className="space-y-1.5">
          <label htmlFor="cooperative-savings-entry-type" className="block text-xs font-medium text-muted-foreground">Entry type</label>
          <NativeSelect id="cooperative-savings-entry-type" value={filter} onChange={event => setFilter(event.target.value)} className="h-9">
            <option value="">All entries</option>
            <option value="DEPOSITS">Deposits</option>
            <option value="WITHDRAWAL">Withdrawals</option>
            <option value="OFFSET">Offsets</option>
          </NativeSelect>
        </div>
        <span className="text-sm text-muted-foreground">{matching.length} matching {matching.length === 1 ? "entry" : "entries"}</span>
      </div>
      <div className="max-h-[48dvh] overflow-auto rounded-lg border">
        <Table>
          <TableHeader className="sticky top-0 z-10 bg-muted/80 backdrop-blur">
            <TableRow className="hover:bg-transparent">
              <TableHead>Date</TableHead><TableHead>Entry</TableHead><TableHead>Reference</TableHead>
              <TableHead className="text-right">Amount</TableHead><TableHead className="text-right">Balance</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {recent.length === 0 && (
              <TableRow><TableCell colSpan={5}><EmptyState>{filter ? "No entries match this type." : "No savings entries have been posted."}</EmptyState></TableCell></TableRow>
            )}
            {recent.map(entry => (
              <TableRow key={entry.id} className="hover:bg-muted/30">
                <TableCell className="whitespace-nowrap">{date(entry.entryDate)}</TableCell>
                <TableCell>
                  <span className="inline-flex items-center rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
                    {savingsKindLabel[entry.kind]}
                  </span>
                </TableCell>
                <TableCell className="font-mono text-xs">{entry.reference}</TableCell>
                <TableCell className="text-right font-mono tabular-nums">{isSavingsOutflow(entry.kind) ? peso("-" + entry.amount) : "+" + peso(entry.amount)}</TableCell>
                <TableCell className="text-right font-mono font-medium tabular-nums">{peso(entry.balanceAfter)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      {matching.length > recent.length && <p className="text-xs text-muted-foreground">Showing the latest {recent.length}. Open Statement for the full period.</p>}
    </div>
  );
}
