"use client";

import { useId, type ComponentProps, type FormEventHandler, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { policyFieldLabel, policyValue } from "../policy-labels";
import type { usePolicyEditor } from "../policy-client";

export function PolicyInput({ label, error, ...props }: ComponentProps<typeof Input> & { label: string; error?: string }) {
  const id = useId();
  return <div className="min-w-0 space-y-1.5">
    <label htmlFor={id} className="text-sm font-medium">{label}</label>
    <Input id={id} {...props} aria-invalid={error ? true : props["aria-invalid"]}
      aria-describedby={error ? `${id}-error` : props["aria-describedby"]} />
    {error && <p id={`${id}-error`} className="text-sm text-destructive">{error}</p>}
  </div>;
}

export function PolicySelect({ label, children, ...props }: ComponentProps<typeof NativeSelect> & { label: string }) {
  const id = useId();
  return <div className="min-w-0 space-y-1.5">
    <label htmlFor={id} className="block text-sm font-medium">{label}</label>
    <NativeSelect id={id} {...props}>{children}</NativeSelect>
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

export function PolicyDialog({ title, description, editor, onClose, onSubmit, children, wide = false }: {
  title: string;
  description: string;
  editor: Editor;
  onClose: () => void;
  onSubmit: FormEventHandler<HTMLFormElement>;
  children: ReactNode;
  wide?: boolean;
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
          <Button type="submit" disabled={editor.busy || editor.stale}>{editor.busy ? "Saving…" : "Save"}</Button>
        </DialogFooter>
      </form>
    </DialogContent>
  </Dialog>;
}

export function PolicyPager({ page, more, onPage }: { page: number; more: boolean; onPage: (page: number) => void }) {
  if (page === 1 && !more) return null;
  return <div className="flex flex-wrap items-center justify-end gap-2">
    <span className="pr-2 text-sm text-muted-foreground">Page {page}</span>
    <Button type="button" variant="outline" size="sm" disabled={page <= 1} onClick={() => onPage(page - 1)}>Previous</Button>
    <Button type="button" variant="outline" size="sm" disabled={!more} onClick={() => onPage(page + 1)}>Next</Button>
  </div>;
}
