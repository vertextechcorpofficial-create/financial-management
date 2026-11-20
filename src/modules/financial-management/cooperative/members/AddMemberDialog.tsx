"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle, CheckCircle2, ChevronRight, CircleDollarSign, Loader2, Receipt, Search, ShieldCheck, UserRound, Wallet, XCircle,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { cn } from "@/lib/utils";
import { ConsoleDialog, EmptyState, Kv, StatusChip } from "../console/components/ui";
import { PersonAvatar, SectionHeading } from "./components";
import { MemberApiError, memberFetch, newRequestKey } from "./client";
import { date, feeChannelLabel, peso, todayManila } from "./format";
import type { EnrollmentCheck, EnrollmentResult, MemberCandidate } from "./types";

type CandidateResponse = { items: MemberCandidate[] };

function CheckLine({ ok, label, detail }: { ok: boolean; label: string; detail: string }) {
  const Icon = ok ? CheckCircle2 : XCircle;
  return (
    <li className={cn(
      "flex items-start gap-2.5 rounded-lg border p-2.5 text-sm",
      ok
        ? "border-emerald-200/70 bg-emerald-50/40 dark:border-emerald-900/60 dark:bg-emerald-950/20"
        : "border-rose-200/70 bg-rose-50/40 dark:border-rose-900/60 dark:bg-rose-950/20",
    )}>
      <Icon className={cn("mt-0.5 size-4 shrink-0", ok ? "text-emerald-600" : "text-rose-600")} />
      <span className="min-w-0">
        <span className="font-medium">{label}</span>
        <span className="block text-xs text-muted-foreground">{detail}</span>
      </span>
    </li>
  );
}

function PayrollBadge({ verified }: { verified: boolean }) {
  return verified
    ? <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-[10px] text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-300">Payroll verified</Badge>
    : <Badge variant="outline" className="border-amber-200 bg-amber-50 text-[10px] text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-300">Payroll review</Badge>;
}

function CandidateRow({ candidate, onPick }: { candidate: MemberCandidate; onPick: () => void }) {
  return (
    <button
      type="button"
      onClick={onPick}
      className="flex w-full items-center gap-3 border-b px-3 py-2.5 text-left transition-colors last:border-0 hover:bg-muted/50 focus-visible:bg-muted/50 focus-visible:outline-none"
    >
      <PersonAvatar name={candidate.employeeName} size="sm" />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">{candidate.employeeName}</span>
        <span className="mt-0.5 block truncate text-xs text-muted-foreground">
          {candidate.employeeNumber} <span className="mx-1 text-muted-foreground/50">/</span> {candidate.departmentName ?? "No department"}
        </span>
      </span>
      <PayrollBadge verified={candidate.hasPostedPayroll} />
      <ChevronRight className="size-4 shrink-0 text-muted-foreground/50" />
    </button>
  );
}

export function AddMemberDialog({
  onClose,
  onEnrolled,
}: {
  onClose: () => void;
  onEnrolled: (result: EnrollmentResult) => void;
}) {
  const [search, setSearch] = useState("");
  const [candidates, setCandidates] = useState<MemberCandidate[]>([]);
  const [selected, setSelected] = useState<MemberCandidate | null>(null);
  const [signedAt, setSignedAt] = useState(todayManila());
  const [savingsPerCutoff, setSavingsPerCutoff] = useState("");
  const [openingDeposit, setOpeningDeposit] = useState("0.00");
  const [feeChannel, setFeeChannel] = useState("COUNTER");
  const [beneficiary, setBeneficiary] = useState("");
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [check, setCheck] = useState<EnrollmentCheck>();
  const [checking, setChecking] = useState(false);
  const [checkAttempt, setCheckAttempt] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [submitErrors, setSubmitErrors] = useState<Record<string, string>>({});
  const [requestKey, setRequestKey] = useState(() => newRequestKey());

  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      try {
        const query = search.trim() ? `?q=${encodeURIComponent(search.trim())}` : "";
        const payload = await memberFetch<CandidateResponse>(`/api/fm/cooperative/members/candidates${query}`, { signal: controller.signal });
        if (!controller.signal.aborted) setCandidates(payload.items);
      } catch (cause) {
        if (!controller.signal.aborted && !(cause instanceof DOMException && cause.name === "AbortError")) {
          setError(cause instanceof Error ? cause.message : "Unable to load employees.");
        }
      }
    }, 200);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [search]);

  useEffect(() => {
    if (!selected) {
      setCheck(undefined);
      return;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setChecking(true);
      setError("");
      try {
        const params = new URLSearchParams({
          userId: String(selected.userId), signedAt, openingDeposit, feeChannel, beneficiary,
        });
        if (savingsPerCutoff.trim()) params.set("savingsPerCutoff", savingsPerCutoff.trim());
        const payload = await memberFetch<EnrollmentCheck>(`/api/fm/cooperative/members/enrollment?${params}`, { signal: controller.signal });
        if (controller.signal.aborted) return;
        setCheck(payload);
        setSavingsPerCutoff(current => current || payload.inputs.savingsPerCutoff);
      } catch (cause) {
        if (!controller.signal.aborted && !(cause instanceof DOMException && cause.name === "AbortError")) {
          setError(cause instanceof Error ? cause.message : "Unable to check this employee.");
        }
      } finally {
        if (!controller.signal.aborted) setChecking(false);
      }
    }, 250);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [selected, signedAt, savingsPerCutoff, openingDeposit, feeChannel, beneficiary, checkAttempt]);

  const options = useMemo(() => {
    if (!selected || candidates.some(candidate => candidate.userId === selected.userId)) return candidates;
    return [selected, ...candidates];
  }, [selected, candidates]);
  const fields = { ...check?.fieldErrors, ...submitErrors };
  const passed = check?.checks.filter(item => item.ok).length ?? 0;
  const totalChecks = check?.checks.length ?? 0;
  const ready = Boolean(check?.canEnroll);

  function changed() {
    setSubmitErrors({});
    setError("");
    setTermsAccepted(false);
    setRequestKey(newRequestKey());
  }

  function pick(value: string) {
    const candidate = options.find(item => String(item.userId) === value) ?? null;
    setSelected(candidate);
    setSavingsPerCutoff("");
    setOpeningDeposit("0.00");
    setBeneficiary("");
    setFeeChannel("COUNTER");
    setSignedAt(todayManila());
    setCheck(undefined);
    changed();
  }

  async function submit() {
    if (!selected || !check) return;
    setSubmitting(true);
    setError("");
    setSubmitErrors({});
    try {
      const result = await memberFetch<EnrollmentResult>("/api/fm/cooperative/members", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: selected.userId,
          signedAt,
          savingsPerCutoff,
          openingDeposit,
          feeChannel,
          beneficiary,
          termsAccepted: true,
          fingerprint: check.fingerprint,
          requestKey,
        }),
      });
      onEnrolled(result);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The member could not be enrolled.");
      if (cause instanceof MemberApiError) {
        setSubmitErrors(cause.payload?.fieldErrors ?? cause.payload?.details?.fieldErrors ?? {});
        if (cause.payload?.code === "STALE_TERMS") {
          setCheckAttempt(value => value + 1);
          setTermsAccepted(false);
        }
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <ConsoleDialog
      open
      onOpenChange={open => { if (!open) onClose(); }}
      title="Add member"
      description="Enroll an active employee and record the signed membership agreement in one posting."
      wide
      footerClassName="sticky bottom-0 z-20 -mx-6 -mb-6 mt-4 border-t bg-background/95 px-6 py-3 backdrop-blur"
      footer={(
        <>
          <p className="mr-auto hidden max-w-xs text-left text-[11px] leading-4 text-muted-foreground sm:block">
            Activation posts the agreement, opening savings, journal, and official receipt together.
          </p>
          <Button variant="outline" onClick={onClose} disabled={submitting}>Cancel</Button>
          <Button disabled={!check?.canEnroll || !termsAccepted || checking || submitting} onClick={() => void submit()}>
            {submitting ? <Loader2 className="size-4 animate-spin" /> : <UserRound className="size-4" />}
            {submitting ? "Enrolling..." : "Enroll member"}
          </Button>
        </>
      )}
    >
      <div className="space-y-5">
        {error && (
          <div role="alert" className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" />
            <p>{error}</p>
          </div>
        )}

        <section className="space-y-3">
          <SectionHeading
            step="1"
            title={selected ? "Selected employee" : "Choose an employee"}
            description={selected ? "Continue with the membership details below." : "Only active employees without a current Cooperative membership appear here."}
            aside={selected ? <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => pick("")}>Change</Button> : undefined}
          />

          {selected && (
            <div className="flex flex-wrap items-center gap-3 rounded-xl border bg-muted/20 p-3">
              <PersonAvatar name={selected.employeeName} size="lg" />
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold">{selected.employeeName}</p>
                <p className="mt-0.5 truncate text-xs text-muted-foreground">
                  {selected.employeeNumber} <span className="mx-1 text-muted-foreground/50">/</span> {selected.departmentName ?? "No department"}
                </p>
              </div>
              <PayrollBadge verified={selected.hasPostedPayroll} />
            </div>
          )}

          {!selected && (
            <>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  autoFocus
                  value={search}
                  onChange={event => setSearch(event.target.value)}
                  placeholder="Search by name, HR employee number, or department"
                  className="h-10 pl-9"
                />
              </div>

              <div className="max-h-60 overflow-y-auto rounded-xl border bg-card">
                {options.length === 0
                  ? <EmptyState>No active employees match this search.</EmptyState>
                  : options.map(candidate => (
                    <CandidateRow
                      key={candidate.userId}
                      candidate={candidate}
                      onPick={() => pick(String(candidate.userId))}
                    />
                  ))}
              </div>
            </>
          )}
        </section>

        {selected && (
          <>
            <section className="space-y-3 rounded-xl border bg-card p-4">
              <SectionHeading
                step="2"
                title="Membership details"
                description="These values are written to the agreement snapshot and opening posting."
                aside={checking ? <span className="flex items-center gap-1.5 text-xs text-muted-foreground"><Loader2 className="size-3.5 animate-spin" /> Rechecking</span> : undefined}
              />
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <label className="space-y-1.5 text-xs font-medium text-muted-foreground">
                  Date signed
                  <Input type="date" value={signedAt} onChange={event => { setSignedAt(event.target.value); changed(); }} />
                  {fields.signedAt && <span className="block text-xs font-normal text-destructive">{fields.signedAt}</span>}
                </label>
                <label className="space-y-1.5 text-xs font-medium text-muted-foreground">
                  Savings per cutoff
                  <div className="relative">
                    <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">₱</span>
                    <Input
                      type="number" min={0} step={1} value={savingsPerCutoff}
                      onChange={event => { setSavingsPerCutoff(event.target.value); changed(); }}
                      placeholder={check?.policy.minimumSavings}
                      className="pl-7"
                    />
                  </div>
                  {fields.savingsPerCutoff && <span className="block text-xs font-normal text-destructive">{fields.savingsPerCutoff}</span>}
                  {check && <span className="block font-normal">Minimum {peso(check.policy.minimumSavings)} in whole pesos.</span>}
                </label>
                <label className="space-y-1.5 text-xs font-medium text-muted-foreground">
                  Opening deposit (optional)
                  <div className="relative">
                    <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">₱</span>
                    <Input
                      type="number" min={0} step="0.01" value={openingDeposit}
                      onChange={event => { setOpeningDeposit(event.target.value); changed(); }}
                      className="pl-7"
                    />
                  </div>
                  {fields.openingDeposit && <span className="block text-xs font-normal text-destructive">{fields.openingDeposit}</span>}
                </label>
                <label className="space-y-1.5 text-xs font-medium text-muted-foreground">
                  Membership fee channel
                  <NativeSelect value={feeChannel} onChange={event => { setFeeChannel(event.target.value); changed(); }} className="w-full">
                    <option value="COUNTER">Over the counter</option>
                    <option value="PAYROLL">Payroll deduction</option>
                  </NativeSelect>
                  {fields.feeChannel && <span className="block text-xs font-normal text-destructive">{fields.feeChannel}</span>}
                </label>
                <label className="space-y-1.5 text-xs font-medium text-muted-foreground sm:col-span-2">
                  Beneficiary (optional)
                  <Input
                    value={beneficiary}
                    onChange={event => { setBeneficiary(event.target.value); changed(); }}
                    placeholder="Name and relationship"
                  />
                  {fields.beneficiary && <span className="block text-xs font-normal text-destructive">{fields.beneficiary}</span>}
                </label>
              </div>
            </section>

            {check && (
              <section className="space-y-3 rounded-xl border bg-card p-4">
                <SectionHeading
                  step="3"
                  title="Eligibility and take-home pay"
                  description="Every check is revalidated on the server before the posting is created."
                  aside={(
                    <Badge
                      variant="outline"
                      className={ready
                        ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-300"
                        : "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-300"}
                    >
                      {ready ? "Ready to enroll" : `${passed}/${totalChecks} checks passed`}
                    </Badge>
                  )}
                />
                <div className="grid gap-4 lg:grid-cols-2">
                  <div className="space-y-2">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Enrollment checks</p>
                    <ul className="space-y-2">
                      {check.checks.map(item => <CheckLine key={item.key} ok={item.ok} label={item.label} detail={item.detail} />)}
                    </ul>
                  </div>
                  <div className="space-y-3 rounded-lg border bg-muted/20 p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Take-home pay</p>
                        <p className="mt-1 font-mono text-2xl font-semibold tabular-nums">
                          {check.values.netPay ? peso(check.values.netPay) : "Unavailable"}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {check.payroll.state === "verified" ? `Posted cutoff ${date(check.payroll.cutoffDate)}` : "Posted VOS payroll unavailable"}
                        </p>
                      </div>
                      <span className="grid size-9 place-items-center rounded-lg bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
                        <Wallet className="size-4" />
                      </span>
                    </div>
                    <Kv rows={[
                      ["Gross pay", check.payroll.state === "verified" ? peso(check.payroll.grossPay) : "Unavailable"],
                      ["Total deductions", check.payroll.state === "verified" ? peso(check.payroll.totalDeductions) : "Unavailable"],
                      ["Net pay", check.values.netPay ? peso(check.values.netPay) : "Unavailable"],
                      ["Pay floor", check.values.floor ? peso(check.values.floor) : "Unavailable"],
                      ["Savings per cutoff", check.inputs.savingsPerCutoff ? peso(check.inputs.savingsPerCutoff) : "-"],
                      ["Payroll deduction", check.values.payrollDeduction ? peso(check.values.payrollDeduction) : "Unavailable"],
                      ["Headroom", check.values.headroom ? peso(check.values.headroom) : "Unavailable", "total"],
                    ]} />
                    {check.payroll.state !== "verified" && (
                      <p className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-2 text-xs text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-300">
                        <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />{check.payroll.message}
                      </p>
                    )}
                    <p className="text-[11px] leading-4 text-muted-foreground">
                      The payroll membership fee is included when the fee is deducted from pay. Loan deductions remain unavailable until the Loans module posts payments.
                    </p>
                  </div>
                </div>
              </section>
            )}

            {check && (
              <section className="space-y-3 rounded-xl border bg-card p-4">
                <SectionHeading
                  step="4"
                  title="Membership agreement"
                  description="Review the policy values before confirming the signed agreement."
                  aside={<StatusChip status="ACTIVE" label={`Policy revision ${check.policy.revision}`} />}
                />
                <div className="grid gap-2 sm:grid-cols-2">
                  <div className="flex items-center gap-2.5 rounded-lg border bg-muted/20 p-2.5">
                    <Receipt className="size-4 text-emerald-600" />
                    <div className="min-w-0">
                      <p className="text-[11px] text-muted-foreground">One-time membership fee</p>
                      <p className="font-mono text-sm font-semibold">{peso(check.policy.membershipFee)}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2.5 rounded-lg border bg-muted/20 p-2.5">
                    <CircleDollarSign className="size-4 text-emerald-600" />
                    <div className="min-w-0">
                      <p className="text-[11px] text-muted-foreground">Savings per cutoff</p>
                      <p className="font-mono text-sm font-semibold">{peso(check.inputs.savingsPerCutoff)}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2.5 rounded-lg border bg-muted/20 p-2.5">
                    <ShieldCheck className="size-4 text-emerald-600" />
                    <div className="min-w-0">
                      <p className="text-[11px] text-muted-foreground">Take-home floor</p>
                      <p className="font-mono text-sm font-semibold">
                        {check.policy.floorMode === "FIXED" ? peso(check.policy.floorFixedAmount ?? "0.00") : `${check.policy.floorPercent ?? "0"}% of gross`}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2.5 rounded-lg border bg-muted/20 p-2.5">
                    <Wallet className="size-4 text-emerald-600" />
                    <div className="min-w-0">
                      <p className="text-[11px] text-muted-foreground">Membership fee channel</p>
                      <p className="text-sm font-semibold">{feeChannelLabel(check.inputs.feeChannel)}</p>
                    </div>
                  </div>
                </div>
                <p className="text-sm text-muted-foreground">
                  The member agrees to the by-laws, the one-time fee, the savings per cutoff, and salary deduction of savings and loan payments.
                  The membership fee is {feeChannelLabel(check.inputs.feeChannel).toLowerCase()}.
                </p>
                <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-emerald-200 bg-emerald-50/50 p-3 text-sm dark:border-emerald-900 dark:bg-emerald-950/20">
                  <input
                    type="checkbox" checked={termsAccepted}
                    onChange={event => setTermsAccepted(event.target.checked)}
                    className="mt-0.5 size-4 accent-emerald-600"
                  />
                  <span>
                    <span className="font-medium">The member has read and signed the membership agreement.</span>
                    <span className="mt-0.5 block text-xs text-muted-foreground">The counter or payroll amounts shown above are correct.</span>
                  </span>
                </label>
              </section>
            )}
          </>
        )}
      </div>
    </ConsoleDialog>
  );
}
