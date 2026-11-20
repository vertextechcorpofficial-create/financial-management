"use client";

import { useEffect, useState } from "react";
import {
  AlertTriangle, Banknote, Calculator, FileText, FolderClosed, HandCoins, Landmark, LayoutDashboard, ReceiptText, Wallet,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ConsoleDialog, EmptyState, Kv, Panel, StatusChip } from "../console/components/ui";
import { MemberDocuments } from "./MemberDocuments";
import { MetricCard, PersonAvatar } from "./components";
import { memberFetch } from "./client";
import {
  date, feeChannelLabel, MEMBER_STATUS_CHIP, MEMBER_STATUS_LABEL, peso, savingsKindLabel,
} from "./format";
import type { MemberDetail } from "./types";

const tabTriggerClass = "shrink-0 gap-1.5 whitespace-nowrap data-[state=active]:bg-background";

export function MemberDetailDialog({ userId, onClose }: { userId: number; onClose: () => void }) {
  const [detail, setDetail] = useState<MemberDetail>();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const controller = new AbortController();
    memberFetch<MemberDetail>(`/api/fm/cooperative/members/${userId}`, { signal: controller.signal })
      .then(payload => { if (!controller.signal.aborted) setDetail(payload); })
      .catch(cause => {
        if (!controller.signal.aborted && !(cause instanceof DOMException && cause.name === "AbortError")) {
          setError(cause instanceof Error ? cause.message : "Unable to load this member.");
        }
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [userId]);

  const item = detail?.item;
  const current = detail?.current;

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
        <div role="alert" className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <p>{error}</p>
        </div>
      )}
      {detail && item && (
        <Tabs defaultValue="summary" className="w-full min-w-0">
          <TabsList className="flex h-auto w-full max-w-full min-w-0 justify-start gap-1 overflow-x-auto rounded-lg bg-muted/50 p-1">
            <TabsTrigger value="summary" className={tabTriggerClass}><LayoutDashboard className="size-3.5" /> Summary</TabsTrigger>
            {current && <TabsTrigger value="statement" className={tabTriggerClass}><FileText className="size-3.5" /> Statement</TabsTrigger>}
            {current && <TabsTrigger value="savings" className={tabTriggerClass}><Wallet className="size-3.5" /> Savings</TabsTrigger>}
            {current && <TabsTrigger value="documents" className={tabTriggerClass}><FolderClosed className="size-3.5" /> Documents</TabsTrigger>}
            <TabsTrigger value="loans" className={tabTriggerClass}><HandCoins className="size-3.5" /> Loans &amp; withdrawals</TabsTrigger>
            {current && <TabsTrigger value="takehome" className={tabTriggerClass}><Calculator className="size-3.5" /> Take-home</TabsTrigger>}
          </TabsList>

          <TabsContent value="summary" className="mt-4 space-y-4">
            <div className="grid gap-3 sm:grid-cols-3">
              <MetricCard
                icon={Wallet}
                label="Savings balance"
                value={current ? peso(current.savingsBalance) : "-"}
                detail={current ? `${peso(current.savingsPerCutoff)} per cutoff` : "No membership"}
                tone="emerald"
              />
              <MetricCard icon={Landmark} label="Loan balance" value="Unavailable" detail="Awaiting the Loans posting module" tone="slate" />
              <MetricCard icon={Banknote} label="Withdrawals" value="Unavailable" detail="Awaiting the Withdraw Savings module" tone="slate" />
            </div>

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
                  ["Savings balance", current ? peso(current.savingsBalance) : "-"],
                  ["Loan balance", "Unavailable"],
                  ["Past due", "Unavailable"],
                  ["Withdrawal availability", "Unavailable"],
                ]} />
                <p className="mt-3 rounded-md bg-muted/40 p-2 text-xs text-muted-foreground">
                  Loan, past-due, and withdrawal figures stay unavailable until their posting modules are live.
                </p>
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
            <Panel title="Savings statement" description="New Cooperative savings entries only. Legacy history stays separate.">
              {current ? <SavingsTable detail={detail} /> : <EmptyState>No savings statement exists for this employee.</EmptyState>}
            </Panel>
          </TabsContent>

          <TabsContent value="savings" className="mt-4 space-y-4">
            <Panel
              title="Savings ledger"
              description="Posted savings movement for this membership."
              actions={<span className="font-mono text-lg font-semibold">{current ? peso(current.savingsBalance) : "-"}</span>}
            >
              {current ? <SavingsTable detail={detail} compact /> : <EmptyState>No new savings ledger exists for this employee.</EmptyState>}
            </Panel>
            {current && (
              <Panel title="Savings policy">
                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="rounded-lg border bg-muted/20 p-3">
                    <p className="text-xs text-muted-foreground">Maintaining balance</p>
                    <p className="mt-1 font-mono font-semibold">{peso(detail.policy.maintainingBalance)}</p>
                  </div>
                  <div className="rounded-lg border bg-muted/20 p-3">
                    <p className="text-xs text-muted-foreground">Minimum savings per cutoff</p>
                    <p className="mt-1 font-mono font-semibold">{peso(detail.policy.minimumSavings)}</p>
                  </div>
                  <div className="rounded-lg border bg-muted/20 p-3">
                    <p className="text-xs text-muted-foreground">Withdrawal availability</p>
                    <p className="mt-1 text-sm font-medium">Unavailable</p>
                  </div>
                </div>
              </Panel>
            )}
          </TabsContent>

          <TabsContent value="documents" className="mt-4">
            {current ? (
              <MemberDocuments
                userId={item.userId}
                required={detail.requiredDocuments}
                storageReady={detail.documentStorageReady}
                initial={detail.documents}
                canEdit={current.status === "ACTIVE"}
              />
            ) : (
              <EmptyState>Documents apply to current memberships.</EmptyState>
            )}
          </TabsContent>

          <TabsContent value="loans" className="mt-4">
            <Panel title="Loans and withdrawals" description="These figures are intentionally unavailable in this release.">
              <div className="grid gap-3 sm:grid-cols-3">
                <MetricCard icon={Landmark} label="Loan balance" value="Unavailable" detail="No loan posting source is live" tone="slate" />
                <MetricCard icon={ReceiptText} label="Past due" value="Unavailable" detail="No installment schedule is live" tone="slate" />
                <MetricCard icon={Banknote} label="Withdrawals" value="Unavailable" detail="No withdrawal posting source is live" tone="slate" />
              </div>
              <p className="mt-3 rounded-md bg-muted/40 p-2 text-xs text-muted-foreground">
                The register does not filter on loan balance, past due, or withdrawals. Only missing-document filtering is enabled.
              </p>
            </Panel>
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
                value={detail.takeHome.headroom ? peso(detail.takeHome.headroom) : "Unavailable"}
                detail="After savings and the pay floor"
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
                    ["Savings per cutoff", detail.takeHome.savingsPerCutoff ? peso(detail.takeHome.savingsPerCutoff) : "Unavailable"],
                    ["Payroll deduction", detail.takeHome.payrollDeduction ? peso(detail.takeHome.payrollDeduction) : "Unavailable"],
                    ["Headroom", detail.takeHome.headroom ? peso(detail.takeHome.headroom) : "Unavailable", "total"],
                  ]} />
                  <p className="mt-3 text-xs text-muted-foreground">
                    This assessment uses posted payroll for cutoff {date(detail.payroll.cutoffDate)} and the member’s savings per cutoff.
                  </p>
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

function SavingsTable({ detail, compact = false }: { detail: MemberDetail; compact?: boolean }) {
  return (
    <div className="max-h-[48dvh] overflow-auto rounded-lg border">
      <Table>
        <TableHeader className="sticky top-0 z-10 bg-muted/80 backdrop-blur">
          <TableRow className="hover:bg-transparent">
            <TableHead>Date</TableHead><TableHead>Entry</TableHead><TableHead>Reference</TableHead>
            <TableHead className="text-right">Amount</TableHead><TableHead className="text-right">Balance</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {detail.savingsEntries.length === 0 && (
            <TableRow><TableCell colSpan={5}><EmptyState>No new savings entries have been posted.</EmptyState></TableCell></TableRow>
          )}
          {[...detail.savingsEntries].reverse().slice(0, compact ? 12 : undefined).map(entry => (
            <TableRow key={entry.id} className="hover:bg-muted/30">
              <TableCell className="whitespace-nowrap">{date(entry.entryDate)}</TableCell>
              <TableCell>
                <span className="inline-flex items-center rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
                  {savingsKindLabel[entry.kind] ?? entry.kind}
                </span>
              </TableCell>
              <TableCell className="font-mono text-xs">{entry.reference}</TableCell>
              <TableCell className="text-right font-mono tabular-nums">{peso(entry.amount)}</TableCell>
              <TableCell className="text-right font-mono font-medium tabular-nums">{peso(entry.balanceAfter)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
