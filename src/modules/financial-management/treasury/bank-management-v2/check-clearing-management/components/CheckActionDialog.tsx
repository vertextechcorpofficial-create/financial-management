"use client";

import { useEffect, useState } from "react";
import { ChevronDown, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { cn, formatCurrency } from "@/lib/utils";

import { CHECK_CANCEL_REASONS, CHECK_RETURN_REASONS, PAYABLE_LABELS, statusLabel } from "../constants";
import { phtDate, toPhtDateString } from "../pht";
import { DateField } from "./DateField";
import { StatusBadge } from "./StatusBadge";
import { allowedActions, type CheckAction } from "./ChecksTable";
import type { BankCheck, CheckEvent } from "../types";
import type { CheckActionPayload } from "../providers/checksApi";

type Props = {
  check: BankCheck | null;
  action: CheckAction | null;
  open: boolean;
  isSaving: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (check: BankCheck, payload: CheckActionPayload) => Promise<unknown>;
  loadDetail: (checkId: number) => Promise<{ check: BankCheck; events: CheckEvent[] } | null>;
  onSelectAction: (action: CheckAction) => void;
  /** Opens another check's own detail, used by the replacement history link. */
  onOpenCheck: (checkId: number) => void;
};

const PROMPT: Record<Exclude<CheckAction, "VIEW">, { title: string; body: string }> = {
  RELEASE: { title: "Release check", body: "The check leaves the safe. No journal entry is posted at release." },
  DEPOSIT: { title: "Deposit check", body: "The received check is sent to the bank and moves to in clearing." },
  CLEAR: { title: "Mark check cleared", body: "The bank has cleared this check and the journal entry will post." },
  RETURN: { title: "Record return", body: "The check came back. Pick the reason reported by the bank." },
  CANCEL: { title: "Cancel check", body: "Cancelling reverses the check. This cannot be undone." },
  REPLACE: { title: "Replace check", body: "A new check is created and linked both ways. The original keeps its status." },
};

const SOURCE_LABELS: Record<string, string> = {
  MANUAL: "Entered by hand",
  COLLECTIONS: "Collections",
  DISBURSEMENT: "Disbursement",
  REPLACEMENT: "Replacement",
};

/** The one action worth a primary button per status; everything else lives in the menu. */
const PRIMARY_ACTIONS: CheckAction[] = ["RELEASE", "DEPOSIT", "CLEAR", "REPLACE"];

function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="mt-1 min-w-0 break-words">{children}</dd>
    </div>
  );
}

/** One check's event trail; shared by the open check and the original it replaces. */
function EventList({ rows }: { rows: CheckEvent[] }) {
  return (
    <ul className="max-h-[280px] space-y-3 overflow-y-auto">
      {rows.map((entry) => (
        <li key={entry.id} className="flex gap-3 text-sm">
          <span className="w-[136px] shrink-0 font-mono text-xs text-muted-foreground">
            {toPhtDateString(entry.occurredAt)}
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium" title={entry.action}>
                {entry.action.replace(/_/g, " ").toLowerCase()}
              </span>
              {entry.toStatus ? <StatusBadge status={entry.toStatus} /> : null}
              {entry.eventCode ? (
                <span className="text-xs text-muted-foreground">{entry.eventCode}</span>
              ) : null}
              {entry.journalNo ? (
                <span className="font-mono text-xs text-muted-foreground">{entry.journalNo}</span>
              ) : null}
            </div>
            <p className="text-xs text-muted-foreground">
              {entry.fromStatus && entry.toStatus
                ? `${entry.fromStatus} → ${entry.toStatus}`
                : entry.toStatus ?? ""}
            </p>
            {entry.note ? <p className="mt-1 break-words text-xs">{entry.note}</p> : null}
            {entry.actorName ? (
              <p className="mt-1 truncate text-xs text-muted-foreground" title={entry.actorName}>
                by {entry.actorName}
              </p>
            ) : null}
          </div>
        </li>
      ))}
    </ul>
  );
}

/** One dialog for every check action, plus a read-only detail view with its event trail. */
export function CheckActionDialog({
  check,
  action,
  open,
  isSaving,
  onOpenChange,
  onSubmit,
  loadDetail,
  onSelectAction,
  onOpenCheck,
}: Props) {
  const [returnReason, setReturnReason] = useState<string>("");
  const [cancelReason, setCancelReason] = useState<string>("");
  const [note, setNote] = useState("");
  const [releaseDate, setReleaseDate] = useState(phtDate());
  const [depositDate, setDepositDate] = useState(phtDate());
  const [clearedDate, setClearedDate] = useState(phtDate());
  const [replacementDate, setReplacementDate] = useState(phtDate());
  const [replacementAmount, setReplacementAmount] = useState("");
  const [replacementNo, setReplacementNo] = useState("");
  const [replacementDrawee, setReplacementDrawee] = useState("");
  const [events, setEvents] = useState<{ checkId: number; rows: CheckEvent[] } | null>(null);
  const [original, setOriginal] = useState<{
    checkId: number;
    detail: { check: BankCheck; events: CheckEvent[] } | null;
  } | null>(null);
  const [replacement, setReplacement] = useState<{ checkId: number; check: BankCheck } | null>(null);
  const [chain, setChain] = useState<{ checkId: number; links: BankCheck[] } | null>(null);
  const [touched, setTouched] = useState(false);

  function handleOpenChange(next: boolean) {
    if (!next) {
      setReturnReason("");
      setCancelReason("");
      setNote("");
      setReplacementNo("");
      setReplacementDrawee("");
      setReleaseDate(phtDate());
      setDepositDate(phtDate());
      setClearedDate(phtDate());
      setTouched(false);
      setEvents(null);
      setOriginal(null);
      setReplacement(null);
      setChain(null);
    } else if (action !== "VIEW") {
      setEvents(null);
      // Spec 2: a stale check offers cancel with the stale reason already chosen.
      setCancelReason(action === "CANCEL" && check?.isStale ? "Stale (over 180 days)" : "");
    }
    onOpenChange(next);
  }

  useEffect(() => {
    if (!open || action !== "VIEW" || !check) return;
    let cancelled = false;
    const checkId = check.id;
    void loadDetail(checkId).then((detail) => {
      if (!cancelled) setEvents({ checkId, rows: detail?.events ?? [] });
    });
    // The replacement's own row carries only the id; the original holds the return reason,
    // date and event trail, so the whole detail is read separately.
    if (check.replacesId) {
      const originalId = check.replacesId;
      void loadDetail(originalId).then((detail) => {
        if (!cancelled) setOriginal({ checkId: originalId, detail: detail ?? null });
      });
    }
    // A replaced check names its successor by id only, so the number has to be fetched too.
    if (check.replacedById) {
      const replacementId = check.replacedById;
      void loadDetail(replacementId).then((detail) => {
        if (!cancelled && detail) setReplacement({ checkId: replacementId, check: detail.check });
      });
    }
    // Spec section 6: the whole chain A -> B -> C, in order, whichever link is open.
    void (async () => {
      const links: BankCheck[] = [];
      const seen = new Set<number>();
      let cursor: BankCheck | null = check;
      while (cursor?.replacesId && !seen.has(cursor.replacesId) && links.length < 8) {
        seen.add(cursor.replacesId);
        const detail = await loadDetail(cursor.replacesId);
        if (!detail) break;
        links.unshift(detail.check);
        cursor = detail.check;
      }
      links.push(check);
      cursor = check;
      while (cursor?.replacedById && !seen.has(cursor.replacedById) && links.length < 12) {
        seen.add(cursor.replacedById);
        const detail = await loadDetail(cursor.replacedById);
        if (!detail) break;
        links.push(detail.check);
        cursor = detail.check;
      }
      if (!cancelled && links.length > 1) setChain({ checkId: check.id, links });
    })();
    return () => {
      cancelled = true;
    };
  }, [open, action, check, loadDetail]);

  if (!check) return null;

  const isView = action === "VIEW";
  // Tagged with the check id so a link to another check never shows the previous trail.
  const eventRows = events && events.checkId === check.id ? events.rows : null;
  const originalDetail = original?.checkId === check.replacesId ? original : null;
  const originalCheck = originalDetail?.detail?.check ?? null;
  const originalEvents = originalDetail?.detail?.events ?? null;
  const replacementCheck = replacement?.checkId === check.replacedById ? replacement.check : null;
  const prompt = action && action !== "VIEW" ? PROMPT[action] : null;
  const amountValue = replacementAmount || String(check.amount);
  // Spec 2: a stale check offers cancel with the stale reason already chosen.
  const cancelValue = cancelReason || (action === "CANCEL" && check.isStale ? "Stale (over 180 days)" : "");
  const reasonError =
    action === "RETURN" && !returnReason
      ? "Pick the reason the bank gave."
      : action === "CANCEL" && !cancelValue
        ? "Pick the reason the check is being cancelled."
        : "";
  const amountError = action === "REPLACE" && !(Number(amountValue) > 0) ? "Enter an amount greater than zero." : "";
  const hasErrors = Boolean(reasonError || amountError);
  // Spec 4.5: the clearing date is never before the check date or the date it was sent.
  const sentDate = check.direction === "ISSUED" ? check.releasedAt : check.depositedAt;
  const clearMinDate = [toPhtDateString(check.checkDate), sentDate ? toPhtDateString(sentDate) : ""]
    .filter(Boolean)
    .sort()
    .pop() ?? "";
  const journalEvents = eventRows?.filter((entry) => entry.journalNo) ?? [];
  const availableActions = allowedActions(check).filter((entry) => entry.action !== "VIEW");
  const primaryAction = availableActions.find((entry) => PRIMARY_ACTIONS.includes(entry.action)) ?? availableActions[0];
  const menuActions = availableActions.filter((entry) => entry.action !== primaryAction?.action);
  const safeActions = menuActions.filter((entry) => !entry.destructive);
  const destructiveActions = menuActions.filter((entry) => entry.destructive);

  async function handleSubmit() {
    if (!check || !action || action === "VIEW") return;
    setTouched(true);
    if (hasErrors) return;

    const payload: CheckActionPayload = { action, note: note.trim() || undefined };
    if (action === "RETURN") payload.returnReason = returnReason;
    if (action === "CANCEL") payload.cancelReason = cancelValue;
    if (action === "RELEASE") payload.releaseDate = releaseDate;
    if (action === "DEPOSIT") payload.depositDate = depositDate;
    if (action === "CLEAR") payload.clearedDate = clearedDate;
    if (action === "REPLACE") {
      payload.replacement = {
        checkDate: replacementDate,
        amount: Number(amountValue),
        checkNo: replacementNo.trim() || undefined,
        draweeBank: replacementDrawee.trim() || undefined,
      };
    }
    const saved = await onSubmit(check, payload);
    if (saved) onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent showCloseButton={false} className={cn("w-[95vw] rounded-2xl p-0", isView ? "sm:max-w-[800px]" : "sm:max-w-[550px]")}>
        <div className="flex max-h-[85vh] flex-col overflow-hidden">
          <DialogHeader className="border-b px-6 py-4">
            <DialogTitle className="line-clamp-1">
              {isView ? `Check ${check.checkNo}` : `${prompt?.title} for ${check.checkNo}`}
            </DialogTitle>
            <DialogDescription className="line-clamp-2 max-w-md">
              {isView
                ? `${statusLabel(check.status)} · ${check.direction === "ISSUED" ? "issued by us" : "received from customer"}`
                : `${formatCurrency(check.amount)} · ${check.direction === "ISSUED" ? check.payee ?? "—" : check.payor ?? "—"}`}
            </DialogDescription>
          </DialogHeader>

          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-6 py-4">
            {/* An action dialog is about the reason, not the record: the check is named in the
                title and the rest of the fields are already one click away in VIEW (C2). */}
            {isView ? (
              <dl className="grid grid-cols-1 gap-x-8 gap-y-4 text-sm sm:grid-cols-2">
              <Detail label="Check no.">
                {check.checkNo}
                {check.draweeBank ? <span className="text-muted-foreground"> · {check.draweeBank}</span> : null}
              </Detail>
              <Detail label="Status">
                <StatusBadge status={check.status} />
              </Detail>
              <Detail label="Direction">
                {check.direction === "ISSUED" ? "Issued by us" : "Received from customer"}
              </Detail>
              <Detail label="Amount">
                <span className="tabular-nums">{formatCurrency(check.amount)}</span>
              </Detail>
              <Detail label={check.direction === "ISSUED" ? "Payee" : "Customer"}>
                {check.payee ?? check.payor ?? "—"}
              </Detail>
              <Detail label="Check date">{toPhtDateString(check.checkDate)}</Detail>
              {check.direction === "ISSUED" ? (
                <Detail label="Payable account">
                  {check.controlKey === "NTP_CONTROL" ? PAYABLE_LABELS.NTP_CONTROL : PAYABLE_LABELS.AP_CONTROL}
                </Detail>
              ) : null}
              <Detail label={check.direction === "RECEIVED" ? "Destination account" : "Bank account"}>
                {check.bankAccountLabel}
              </Detail>
              {isView ? (
                <>
                  <Detail label="Drawee bank">{check.draweeBank ?? "—"}</Detail>
                  <Detail label="Value date">
                    {check.clearedAt ? (
                      <span className="tabular-nums">{toPhtDateString(check.clearedAt)}</span>
                    ) : (
                      <span className="text-muted-foreground">Not cleared yet</span>
                    )}
                  </Detail>
                </>
              ) : null}
              <Detail label="Source">
                {SOURCE_LABELS[check.sourceType] ?? check.sourceType}
                {/* A replacement's source ref is the original check number, already named by
                    "Replaces" and by the history block; printing it three times is noise (C3). */}
                {check.sourceRef && check.sourceType !== "REPLACEMENT" ? (
                  <span className="text-muted-foreground"> · {check.sourceRef}</span>
                ) : null}
              </Detail>
              {check.returnReason ? <Detail label="Reason">{check.returnReason}</Detail> : null}
              {/* The predecessor is named once, in the history block below, which also carries
                  its return reason, date and the link (C3). */}
              {check.remarks ? <Detail label="Remarks">{check.remarks}</Detail> : null}
            </dl>
            ) : null}

            {!isView && action === "RETURN" && (
              <div className="space-y-2">
                <Label htmlFor="return-reason">
                  Return reason <span className="text-destructive">*</span>
                </Label>
                <Select value={returnReason} onValueChange={setReturnReason}>
                  <SelectTrigger id="return-reason" className="w-full">
                    <SelectValue className="truncate" placeholder="Select reason" />
                  </SelectTrigger>
                  <SelectContent className="max-h-80">
                    {CHECK_RETURN_REASONS.map((reason) => (
                      <SelectItem key={reason} value={reason}>
                        {reason}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {touched && reasonError && <p className="text-xs text-destructive">{reasonError}</p>}
              </div>
            )}

            {!isView && action === "CANCEL" && (
              <div className="space-y-2">
                <Label htmlFor="cancel-reason">
                  Cancel reason <span className="text-destructive">*</span>
                </Label>
                <Select value={cancelValue} onValueChange={setCancelReason}>
                  <SelectTrigger id="cancel-reason" className="w-full">
                    <SelectValue className="truncate" placeholder="Select reason" />
                  </SelectTrigger>
                  <SelectContent className="max-h-80">
                    {CHECK_CANCEL_REASONS.map((reason) => (
                      <SelectItem key={reason} value={reason}>
                        {reason}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {touched && reasonError && <p className="text-xs text-destructive">{reasonError}</p>}
              </div>
            )}

            {!isView && action === "RELEASE" && (
              <div className="space-y-2">
                <Label htmlFor="release-date">Release date</Label>
                <DateField id="release-date" inDialog maxDate={phtDate()} value={releaseDate} onChange={setReleaseDate} />
              </div>
            )}

            {!isView && action === "DEPOSIT" && (
              <div className="space-y-2">
                <Label htmlFor="deposit-date">Deposit date</Label>
                <DateField
                  id="deposit-date"
                  inDialog
                  minDate={toPhtDateString(check.checkDate)}
                  maxDate={phtDate()}
                  value={depositDate}
                  onChange={setDepositDate}
                />
              </div>
            )}

            {!isView && action === "CLEAR" && (
              <div className="space-y-2">
                <Label htmlFor="cleared-date">Clearing date</Label>
                <DateField
                  id="cleared-date"
                  inDialog
                  minDate={clearMinDate}
                  maxDate={phtDate()}
                  value={clearedDate}
                  onChange={setClearedDate}
                />
              </div>
            )}

            {!isView && action === "REPLACE" && (
              <div className="grid items-start gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="replacement-check-no">New check no.</Label>
                  <Input
                    id="replacement-check-no"
                    value={replacementNo}
                    maxLength={40}
                    placeholder="Left blank uses the next check number"
                    onChange={(event) => setReplacementNo(event.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="replacement-amount">
                    Amount <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="replacement-amount"
                    type="number"
                    min="0.01"
                    step="0.01"
                    value={amountValue}
                    onChange={(event) => setReplacementAmount(event.target.value)}
                  />
                  {touched && amountError && <p className="text-xs text-destructive">{amountError}</p>}
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor="replacement-date">New check date</Label>
                  <DateField
                    id="replacement-date"
                    inDialog
                    value={replacementDate}
                    onChange={(value) => setReplacementDate(value)}
                  />
                </div>
                {check.direction === "RECEIVED" ? (
                  <div className="space-y-2 sm:col-span-2">
                    <Label htmlFor="replacement-drawee">Drawee bank</Label>
                    <Input
                      id="replacement-drawee"
                      value={replacementDrawee}
                      maxLength={120}
                      placeholder={check.draweeBank ?? "Bank that issued the replacement check"}
                      onChange={(event) => setReplacementDrawee(event.target.value)}
                    />
                  </div>
                ) : null}
              </div>
            )}

            {!isView && (
              <div className="space-y-2">
                <Label htmlFor="action-note">Note</Label>
                <Textarea
                  id="action-note"
                  rows={2}
                  maxLength={300}
                  className="min-h-[100px] resize-none"
                  value={note}
                  onChange={(event) => setNote(event.target.value)}
                />
              </div>
            )}

            {isView && (check.replacesId !== null || check.replacedById !== null) ? (
              <div className="border-t pt-4">
                <p className="mb-2 text-sm font-semibold">Replacement &amp; return history</p>
                <dl className="grid grid-cols-1 gap-x-8 gap-y-3 text-sm sm:grid-cols-2">
                  <Detail label="Original check">
                    {check.replacesId !== null ? originalCheck?.checkNo ?? `Check #${check.replacesId}` : "—"}
                  </Detail>
                  <Detail label="Return reason">
                    {originalCheck?.returnReason ?? check.returnReason ?? "—"}
                  </Detail>
                  <Detail label="Return date">
                    {originalCheck?.returnedAt || check.returnedAt ? (
                      <span className="tabular-nums">
                        {toPhtDateString(originalCheck?.returnedAt ?? check.returnedAt ?? "")}
                      </span>
                    ) : (
                      "—"
                    )}
                  </Detail>
                  {check.replacedById !== null ? (
                    <Detail label="Replacement check">{replacementCheck?.checkNo ?? `Check #${check.replacedById}`}</Detail>
                  ) : null}
                </dl>
                {check.replacesId !== null ? (
                  <Button
                    type="button"
                    variant="link"
                    className="mt-1 h-auto p-0"
                    onClick={() => onOpenCheck(check.replacesId as number)}
                  >
                    Open original check {originalCheck?.checkNo ?? `#${check.replacesId}`}
                  </Button>
                ) : null}
                {check.replacesId !== null ? (
                  <div className="mt-3 border-t pt-3">
                    <p className="mb-2 text-sm font-semibold">Original check audit trail</p>
                    {originalDetail === null ? (
                      <div className="space-y-2">
                        <Skeleton className="h-10 w-full" />
                        <p className="text-xs text-muted-foreground">Loading the original check&apos;s history…</p>
                      </div>
                    ) : originalEvents === null ? (
                      <p className="text-xs text-muted-foreground">
                        The original check&apos;s history could not be read.
                      </p>
                    ) : originalEvents.length === 0 ? (
                      <p className="text-xs text-muted-foreground">The original check has no recorded events.</p>
                    ) : (
                      <EventList rows={originalEvents} />
                    )}
                  </div>
                ) : null}
              </div>
            ) : null}

            {isView && chain && chain.checkId === check.id ? (
              <div className="border-t pt-4">
                <p className="mb-2 text-sm font-semibold">Replacement chain</p>
                <ol className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
                  {chain.links.map((link, index) => (
                    <li key={link.id} className="flex items-center gap-2">
                      {index > 0 ? <span className="text-muted-foreground">→</span> : null}
                      <button
                        type="button"
                        className={cn(
                          "rounded px-1 py-0.5 font-mono text-xs hover:bg-muted",
                          link.id === check.id && "font-semibold",
                        )}
                        title={`Open check ${link.checkNo}`}
                        onClick={() => onOpenCheck(link.id)}
                      >
                        {link.checkNo}
                      </button>
                      <StatusBadge status={link.status} />
                    </li>
                  ))}
                </ol>
              </div>
            ) : null}

            {isView && (
              <>
                {eventRows === null ? (
                  <div className="border-t pt-4">
                    <Skeleton className="h-16 w-full" />
                  </div>
                ) : null}

                {eventRows !== null && eventRows.length > 0 ? (
                  <div className="border-t pt-4">
                    <p className="mb-2 text-sm font-semibold">Audit trail</p>
                    <EventList rows={eventRows} />
                  </div>
                ) : null}

                {journalEvents.length > 0 ? (
                  <div className="border-t pt-4">
                    <p className="mb-2 text-sm font-semibold">Journal entries</p>
                    <ul className="space-y-1 rounded-lg border px-4 py-3 text-sm">
                      {journalEvents.map((entry) => (
                        <li key={entry.id} className="flex items-center justify-between gap-2">
                          <span className="font-mono text-xs">{entry.journalNo}</span>
                          <span className="text-xs text-muted-foreground">
                            {entry.eventCode ?? ""} {entry.action.replace(/_/g, " ").toLowerCase()}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </>
            )}
          </div>

          <Separator />
          <DialogFooter className="border-t bg-muted/20 px-6 py-4">
            {isView ? (
              <>
                {menuActions.length > 0 ? (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button type="button" variant="outline" disabled={isSaving}>
                        More actions
                        <ChevronDown className="ml-2 h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-[210px]">
                      {safeActions.map((entry) => (
                        <DropdownMenuItem key={entry.action} onSelect={() => onSelectAction(entry.action)}>
                          {entry.label}
                        </DropdownMenuItem>
                      ))}
                      {destructiveActions.length > 0 ? (
                        <>
                          <DropdownMenuSeparator />
                          {destructiveActions.map((entry) => (
                            <DropdownMenuItem
                              key={entry.action}
                              onSelect={() => onSelectAction(entry.action)}
                              className="text-destructive focus:text-destructive"
                            >
                              {entry.label}
                            </DropdownMenuItem>
                          ))}
                        </>
                      ) : null}
                    </DropdownMenuContent>
                  </DropdownMenu>
                ) : null}
                <DialogClose asChild>
                  <Button type="button" variant="outline" disabled={isSaving}>
                    Close
                  </Button>
                </DialogClose>
                {primaryAction ? (
                  <Button
                    type="button"
                    className="font-medium"
                    disabled={isSaving}
                    onClick={() => onSelectAction(primaryAction.action)}
                  >
                    {primaryAction.label}
                  </Button>
                ) : null}
              </>
            ) : (
              <>
                <DialogClose asChild>
                  <Button type="button" variant="outline" disabled={isSaving}>
                    Cancel
                  </Button>
                </DialogClose>
                <Button
                  type="button"
                  variant={action === "CANCEL" ? "destructive" : "default"}
                  className={
                    action === "CLEAR"
                      ? "bg-emerald-600 text-white hover:bg-emerald-700 dark:bg-emerald-600 dark:hover:bg-emerald-700"
                      : action === "RETURN"
                        ? "bg-amber-600 text-white hover:bg-amber-700 dark:bg-amber-600 dark:hover:bg-amber-700"
                        : undefined
                  }
                  disabled={isSaving || hasErrors}
                  onClick={handleSubmit}
                >
                  {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Confirm
                </Button>
              </>
            )}
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}
