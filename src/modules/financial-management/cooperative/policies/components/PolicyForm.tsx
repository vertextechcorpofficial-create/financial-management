"use client";

import { useId, type ComponentProps, type FormEventHandler, type ReactNode } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { policyFieldLabel, policyValue } from "../policy-labels";
import type { usePolicyEditor } from "../policy-client";

type FieldExtras = { label: string; error?: string; helper?: string; required?: boolean };

function FieldLabel({ htmlFor, label, required }: { htmlFor: string; label: string; required?: boolean }) {
  return <label htmlFor={htmlFor} className="text-sm font-medium">
    {label}{required && <span aria-hidden="true" className="text-destructive"> *</span>}
  </label>;
}

export function PolicyInput({ label, error, helper, required, ...props }: ComponentProps<typeof Input> & FieldExtras) {
  const id = useId();
  const errorId = error ? `${id}-error` : undefined;
  const helperId = helper ? `${id}-help` : undefined;
  return <div className="min-w-0 space-y-1.5">
    <FieldLabel htmlFor={id} label={label} required={required} />
    <Input {...props} id={id} required={required} aria-required={required || undefined}
      aria-invalid={error ? true : props["aria-invalid"]}
      aria-describedby={[errorId, helperId, props["aria-describedby"]].filter(Boolean).join(" ") || undefined} />
    {helper && !error && <p id={helperId} className="text-xs text-muted-foreground">{helper}</p>}
    {error && <p id={errorId} className="text-sm text-destructive">{error}</p>}
  </div>;
}

export function PolicySelect({ label, error, helper, required, children, ...props }: ComponentProps<typeof NativeSelect> & FieldExtras) {
  const id = useId();
  const errorId = error ? `${id}-error` : undefined;
  const helperId = helper ? `${id}-help` : undefined;
  return <div className="min-w-0 space-y-1.5">
    <FieldLabel htmlFor={id} label={label} required={required} />
    <NativeSelect {...props} id={id} required={required} aria-required={required || undefined}
      aria-invalid={error ? true : props["aria-invalid"]}
      aria-describedby={[errorId, helperId, props["aria-describedby"]].filter(Boolean).join(" ") || undefined}>
      {children}
    </NativeSelect>
    {helper && !error && <p id={helperId} className="text-xs text-muted-foreground">{helper}</p>}
    {error && <p id={errorId} className="text-sm text-destructive">{error}</p>}
  </div>;
}

export function PolicyTextarea({ label, error, helper, required, ...props }: ComponentProps<typeof Textarea> & FieldExtras) {
  const id = useId();
  const errorId = error ? `${id}-error` : undefined;
  const helperId = helper ? `${id}-help` : undefined;
  return <div className="min-w-0 space-y-1.5">
    <FieldLabel htmlFor={id} label={label} required={required} />
    <Textarea {...props} id={id} required={required} aria-required={required || undefined}
      aria-invalid={error ? true : props["aria-invalid"]}
      aria-describedby={[errorId, helperId, props["aria-describedby"]].filter(Boolean).join(" ") || undefined} />
    {helper && !error && <p id={helperId} className="text-xs text-muted-foreground">{helper}</p>}
    {error && <p id={errorId} className="text-sm text-destructive">{error}</p>}
  </div>;
}

type Editor = ReturnType<typeof usePolicyEditor>;

export function PolicyFeedback({ editor }: { editor: Editor }) {
  return <>
    {editor.message && <p className="text-sm text-muted-foreground" role="status">{editor.message}</p>}
    {editor.error && <div role="alert" className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm">
      <p className="text-destructive">{editor.error}</p>
      {editor.stale && !editor.review && <Button type="button" variant="outline" size="sm" className="mt-2"
        onClick={() => void editor.reviewLatest()} disabled={editor.busy}>Review latest</Button>}
      {editor.review && <div className="mt-3 space-y-2">
        <h3 className="font-medium">Latest saved values</h3>
        {editor.review.details ? <dl className="grid gap-1 sm:grid-cols-2">
          {Object.entries(editor.review.details).filter(([key]) => !["id", "code"].includes(key)).map(([key, value]) => (
            <div key={key} className="min-w-0 break-words rounded bg-muted px-2 py-1.5">
              <dt className="text-xs text-muted-foreground">{policyFieldLabel(key)}</dt>
              <dd>{policyValue(key, value)}</dd>
            </div>
          ))}
        </dl> : <p className="text-muted-foreground">No saved values for this record.</p>}
        <Button type="button" variant="outline" size="sm" onClick={editor.keepDraft}>Keep my draft</Button>
      </div>}
    </div>}
  </>;
}

export function PolicyDialog({ title, description, editor, onClose, onSubmit, children, wide = false, submitDisabled = false }: {
  title: string;
  description: string;
  editor: Editor;
  onClose: () => void;
  onSubmit: FormEventHandler<HTMLFormElement>;
  children: ReactNode;
  wide?: boolean;
  submitDisabled?: boolean;
}) {
  return <Dialog open onOpenChange={open => { if (!open && !editor.busy) onClose(); }}>
    <DialogContent showCloseButton={false}
      className={`flex max-h-[calc(100dvh-2rem)] min-h-0 flex-col gap-0 overflow-hidden p-0 ${wide ? "sm:max-w-4xl" : "sm:max-w-lg"}`}>
      <DialogHeader className="shrink-0 border-b px-5 py-4 text-left">
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription>{description}</DialogDescription>
      </DialogHeader>
      <form noValidate onSubmit={onSubmit} className="flex min-h-0 flex-col">
        <div className="min-h-0 space-y-4 overflow-y-auto px-5 py-4">
          <fieldset disabled={editor.busy} className="min-w-0 space-y-4">{children}</fieldset>
        </div>
        {(editor.error || editor.message) && <div className="max-h-[30dvh] shrink-0 overflow-y-auto border-t px-5 py-2">
          <PolicyFeedback editor={editor} />
        </div>}
        <DialogFooter className="shrink-0 border-t px-5 py-3">
          <Button type="button" variant="outline" onClick={onClose} disabled={editor.busy}>Cancel</Button>
          <Button type="submit" disabled={editor.busy || editor.stale || submitDisabled}>{editor.busy ? "Saving…" : "Save"}</Button>
        </DialogFooter>
      </form>
    </DialogContent>
  </Dialog>;
}

export function PolicyPager({ page, more, onPage, from, to, total, noun = "rows", summary }: {
  page: number;
  more: boolean;
  onPage: (page: number) => void;
  from?: number;
  to?: number;
  total?: number;
  noun?: string;
  summary?: string;
}) {
  const range = total !== undefined && from !== undefined && to !== undefined
    ? `Showing ${from}–${to} of ${total} ${noun}`
    : summary ?? `Page ${page}`;
  return <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-3 text-xs text-muted-foreground">
    <span>{range}</span>
    {(page > 1 || more) && <div className="flex items-center gap-2">
      <Button type="button" variant="outline" size="sm" disabled={page <= 1} onClick={() => onPage(page - 1)}>
        <ChevronLeft className="size-3.5" /> Previous
      </Button>
      <span className="min-w-14 text-center font-medium text-foreground">Page {page}</span>
      <Button type="button" variant="outline" size="sm" disabled={!more} onClick={() => onPage(page + 1)}>
        Next <ChevronRight className="size-3.5" />
      </Button>
    </div>}
  </div>;
}
