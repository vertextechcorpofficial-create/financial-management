"use client";

import { useId, useState, type ChangeEvent, type ReactNode } from "react";
import { RotateCcw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { NativeSelect } from "@/components/ui/native-select";
import { useConsole, documentStatus } from "../provider";
import { money } from "../format";
import {
  CASE_STATUS_LABEL,
  LOAN_STATUS_LABEL,
  MEMBER_STATUS_LABEL,
  WITHDRAWAL_STATUS_LABEL,
  type CaseStatus,
  type DocumentOwner,
  type LoanStatus,
  type MemberStatus,
  type WithdrawalStatus,
} from "../types";

const chipStyles: Record<string, string> = {
  ACTIVE: "border-transparent bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  RELEASED: "border-transparent bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  COMPLETED: "border-transparent bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  FULLY_PAID: "border-transparent bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  APPROVED: "border-transparent bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300",
  PENDING: "border-transparent bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  APPLIED: "border-transparent bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  PARTIAL: "border-transparent bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  DRAFT: "border-transparent bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  PAST_DUE: "border-transparent bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300",
  REJECTED: "border-transparent bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300",
  DEFAULTED: "border-transparent bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300",
  CANCELLED: "border-transparent bg-muted text-muted-foreground",
  SEPARATED: "border-transparent bg-muted text-muted-foreground",
  NON_MEMBER: "border-transparent bg-muted text-muted-foreground",
  INACTIVE: "border-transparent bg-muted text-muted-foreground",
};

export function StatusChip({ status, label }: { status: string; label?: string }) {
  const text = label ?? status.replaceAll("_", " ");
  return <span className={`inline-flex items-center whitespace-nowrap rounded-md border px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${chipStyles[status] ?? "bg-muted text-muted-foreground"}`}>{text}</span>;
}

export function memberStatusChip(status: MemberStatus) {
  return <StatusChip status={status} label={MEMBER_STATUS_LABEL[status]} />;
}
export function loanStatusChip(status: LoanStatus) {
  return <StatusChip status={status} label={LOAN_STATUS_LABEL[status]} />;
}
export function withdrawalStatusChip(status: WithdrawalStatus) {
  return <StatusChip status={status} label={WITHDRAWAL_STATUS_LABEL[status]} />;
}
export function caseStatusChip(status: CaseStatus) {
  return <StatusChip status={status} label={CASE_STATUS_LABEL[status]} />;
}

export function ConsoleShell({
  title,
  subtitle,
  actions,
  children,
}: {
  title: string;
  subtitle: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  const { actions: consoleActions } = useConsole();
  return (
    <main className="min-h-0 min-w-0 flex-1 space-y-4 overflow-y-auto p-4 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm text-muted-foreground">Cooperative</p>
          <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">{subtitle}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {actions}
          <Badge variant="outline">Sample data</Badge>
          <Button type="button" variant="outline" size="sm" onClick={consoleActions.reset}>
            <RotateCcw className="size-3.5" />
            Reset
          </Button>
        </div>
      </div>
      {children}
    </main>
  );
}

export function Panel({
  title,
  description,
  actions,
  children,
  className = "",
}: {
  title?: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`min-w-0 rounded-lg border bg-card p-4 ${className}`}>
      {(title || actions) && (
        <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
          <div>
            {title && <h2 className="text-base font-semibold">{title}</h2>}
            {description && <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>}
          </div>
          {actions}
        </div>
      )}
      {children}
    </section>
  );
}

export function Tile({
  label,
  value,
  detail,
  alert = false,
}: {
  label: string;
  value: ReactNode;
  detail?: ReactNode;
  alert?: boolean;
}) {
  return (
    <div className={`min-w-0 rounded-lg border bg-card p-3 ${alert ? "border-rose-300 dark:border-rose-900" : ""}`}>
      <p className="text-xs text-muted-foreground">{label}</p>
      <div className="mt-0.5 font-mono text-xl font-semibold tabular-nums">{value}</div>
      {detail && <p className="mt-0.5 text-xs text-muted-foreground">{detail}</p>}
    </div>
  );
}

export function FilterBar({ children, count, noun = "rows" }: { children: ReactNode; count?: number; noun?: string }) {
  return (
    <div className="mb-3 flex flex-wrap items-end gap-2 rounded-lg border bg-muted/30 p-2">
      {children}
      {count !== undefined && <span className="ml-auto self-center font-mono text-xs text-muted-foreground">{count} {noun}</span>}
    </div>
  );
}

export function FilterField({ label, children }: { label: string; children: ReactNode }) {
  const id = useId();
  return (
    <div className="min-w-36 space-y-1">
      <label className="text-[11px] font-medium text-muted-foreground" htmlFor={id}>{label}</label>
      <div id={id}>{children}</div>
    </div>
  );
}

export function Kv({ rows }: { rows: Array<[string, ReactNode, "total"?]> }) {
  return (
    <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1.5 text-sm">
      {rows.map(([label, value, kind]) => (
        <div key={label} className={`contents ${kind === "total" ? "[&>dt]:border-t [&>dt]:pt-1 [&>dd]:border-t [&>dd]:pt-1" : ""}`}>
          <dt className={kind === "total" ? "font-semibold" : "text-muted-foreground"}>{label}</dt>
          <dd className={`text-right font-mono tabular-nums ${kind === "total" ? "font-semibold" : ""}`}>{value}</dd>
        </div>
      ))}
    </dl>
  );
}

export function EmptyState({ children }: { children: ReactNode }) {
  return <p className="py-6 text-center text-sm text-muted-foreground">{children}</p>;
}

export function ConsoleDialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  footerClassName = "",
  wide = false,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  footerClassName?: string;
  wide?: boolean;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={`max-h-[92dvh] overflow-x-hidden overflow-y-auto ${wide ? "sm:max-w-4xl" : "sm:max-w-xl"}`}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        {children}
        {footer && <DialogFooter className={`flex-wrap ${footerClassName}`}>{footer}</DialogFooter>}
      </DialogContent>
    </Dialog>
  );
}

export function Money({ value }: { value: number }) {
  return <span className="font-mono tabular-nums">{money(value)}</span>;
}

export function Progress({ value, max }: { value: number; max: number }) {
  const percent = max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 0;
  return (
    <div className="h-2 overflow-hidden rounded-full border bg-muted">
      <div className="h-full bg-emerald-600 transition-all" style={{ width: `${percent}%` }} />
    </div>
  );
}

export function MemberSelect({
  members,
  value,
  onChange,
  include = "active",
  label = "Member",
  placeholder = "Choose a member",
  disabled = false,
}: {
  members: Array<{ id: string; firstName: string; lastName: string; employeeNumber: string; status: string }>;
  value: string;
  onChange: (value: string) => void;
  include?: "active" | "candidates" | "all";
  label?: string;
  placeholder?: string;
  disabled?: boolean;
}) {
  const options = members
    .filter(member => include === "all"
      || (include === "active" && member.status === "ACTIVE")
      || (include === "candidates" && (member.status === "APPLIED" || member.status === "NON_MEMBER")))
    .sort((a, b) => a.lastName.localeCompare(b.lastName));
  const id = useId();
  return (
    <div className="space-y-1">
      <label className="text-xs font-medium text-muted-foreground" htmlFor={id}>{label}</label>
      <NativeSelect id={id} value={value} onChange={event => onChange(event.target.value)} disabled={disabled}>
        <option value="">{placeholder}</option>
        {options.map(member => (
          <option key={member.id} value={member.id}>
            {member.lastName}, {member.firstName} · {member.employeeNumber}
          </option>
        ))}
      </NativeSelect>
    </div>
  );
}

export function DocumentPanel({
  ownerType,
  ownerId,
  required,
  canEdit = true,
}: {
  ownerType: DocumentOwner;
  ownerId: string;
  required: string[];
  canEdit?: boolean;
}) {
  const { state, actions } = useConsole();
  const docs = state.documents.filter(document => document.ownerType === ownerType && document.ownerId === ownerId);
  const status = documentStatus(state, ownerType, ownerId, required);
  const [category, setCategory] = useState(status.missing[0] ?? required[0] ?? "Other");
  const categories = Array.from(new Set([...required, ...docs.map(document => document.category), "Other"]));

  function upload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    actions.addDocument({
      ownerType,
      ownerId,
      category,
      name: file.name,
      size: file.size,
      mime: file.type || "application/octet-stream",
    });
    event.target.value = "";
  }

  return (
    <div className="grid gap-4 md:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
      <div className="space-y-3">
        <div>
          <h3 className="text-sm font-semibold">Required documents</h3>
          <p className="text-xs text-muted-foreground">{required.length ? `${status.done} of ${status.required.length} on file` : "None required"}</p>
        </div>
        <ul className="space-y-1.5">
          {required.map(item => {
            const missing = status.missing.includes(item);
            return (
              <li key={item} className={`flex items-start gap-2 rounded-md border p-2 text-sm ${missing ? "border-amber-300 bg-amber-50 dark:bg-amber-950/30" : ""}`}>
                <span className={`mt-0.5 grid size-4 place-items-center rounded-full text-[10px] font-bold ${missing ? "bg-amber-200 text-amber-800" : "bg-emerald-100 text-emerald-700"}`}>{missing ? "!" : "✓"}</span>
                <span>{item}<span className="block text-xs text-muted-foreground">{missing ? "Missing" : "On file"}</span></span>
              </li>
            );
          })}
          {!required.length && <li className="text-sm text-muted-foreground">Nothing required.</li>}
        </ul>
        {canEdit && (
          <div className="space-y-2 rounded-md border p-3">
            <label className="text-xs font-medium text-muted-foreground">Document type</label>
            <NativeSelect value={category} onChange={event => setCategory(event.target.value)}>
              {categories.map(item => <option key={item} value={item}>{item}</option>)}
            </NativeSelect>
            <label className="flex cursor-pointer items-center justify-center rounded-md border border-dashed p-3 text-sm font-medium text-muted-foreground hover:border-primary">
              Choose a file
              <input type="file" className="sr-only" accept=".pdf,image/*" onChange={upload} />
            </label>
            <p className="text-[11px] text-muted-foreground">UI-only: the file name is recorded in the sample state.</p>
          </div>
        )}
      </div>
      <div className="min-w-0">
        <h3 className="text-sm font-semibold">Files</h3>
        {docs.length ? (
          <ul className="mt-2 divide-y rounded-md border">
            {docs.map(document => (
              <li key={document.id} className="flex flex-wrap items-center gap-2 p-2 text-sm">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{document.name}</p>
                  <p className="text-xs text-muted-foreground">{document.category} · {Math.max(1, Math.round(document.size / 1024))} KB · {document.uploadedAt}</p>
                </div>
                {canEdit && (
                  <Button type="button" size="sm" variant="ghost" onClick={() => actions.removeDocument(document.id)}>
                    Remove
                  </Button>
                )}
              </li>
            ))}
          </ul>
        ) : <EmptyState>No files yet.</EmptyState>}
      </div>
    </div>
  );
}
