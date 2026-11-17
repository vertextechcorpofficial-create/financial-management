import { useEffect, useId, useRef } from "react";
import { Button } from "@/components/ui/button";

export function DecisionConfirm({ title, description, note, items, confirmLabel, busy, onCancel, onConfirm }: {
  title: string; description: string; note?: string; items: Array<[string, string]>;
  confirmLabel: string; busy: boolean; onCancel: () => void; onConfirm: () => void;
}) {
  const titleId = useId(), root = useRef<HTMLElement>(null);
  useEffect(() => { root.current?.scrollIntoView({ block: "center" }); }, []);
  return <section ref={root} role="group" aria-labelledby={titleId} onKeyDown={event => { if (event.key !== "Escape") return; event.preventDefault(); event.stopPropagation(); if (!busy) onCancel(); }} className="space-y-3 rounded-lg border border-primary/40 bg-primary/5 p-4">
    <div className="space-y-1"><h2 id={titleId} className="font-semibold">{title}</h2><p className="text-sm text-muted-foreground">{description}</p></div>
    <dl className="grid gap-3 text-sm sm:grid-cols-3">{items.map(([label, value]) => <div key={label}><dt className="text-muted-foreground">{label}</dt><dd className="mt-1 font-medium">{value}</dd></div>)}</dl>
    {note && <p className="text-sm">{note}</p>}
    <div className="flex flex-wrap gap-2"><Button type="button" autoFocus disabled={busy} onClick={onConfirm}>{busy ? "Saving..." : confirmLabel}</Button><Button type="button" variant="outline" disabled={busy} onClick={onCancel}>Cancel</Button></div>
  </section>;
}
