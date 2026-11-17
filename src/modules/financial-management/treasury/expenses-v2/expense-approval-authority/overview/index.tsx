"use client";

import { ArrowRight, CircleAlert, ClipboardCheck, Layers3, UsersRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { POLICY_ASSUMPTIONS } from "../policy-seed";
import type { AuthorityPolicy } from "../types";

export function OverviewSubmodule({ policy, activeCount, delegationCount, exceptionCount, revision, onOpen, canOpenMatrix, canEvaluate }: {
  policy: AuthorityPolicy | null; activeCount: number; delegationCount: number; exceptionCount: number; revision: number; onOpen: (tab: string) => void; canOpenMatrix: boolean; canEvaluate: boolean;
}) {
  return <div className="space-y-5"><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{[
    { icon: Layers3, label: "Policy categories", value: policy?.rules.length || 25, note: policy ? `Company #${policy.companyId} · v${policy.version}` : "Proposed source matrix" },
    { icon: ClipboardCheck, label: "Effective published policies", value: activeCount, note: activeCount ? "Publication is separate from workflow enforcement" : "No effective ratified policy in this scope" },
    { icon: UsersRound, label: "Effective assignments", value: delegationCount, note: "Named, scoped authority officers" },
    { icon: CircleAlert, label: "Open review findings", value: exceptionCount, note: "Saved evaluations only; includes simulations" },
  ].map(item => <Card key={item.label} className="gap-3 py-4"><CardContent className="px-4"><div className="flex justify-between text-xs font-medium text-muted-foreground"><span>{item.label}</span><item.icon className="size-4" /></div><p className="my-2 text-3xl font-semibold tracking-tight tabular-nums">{item.value}</p><p className="text-xs text-muted-foreground">{item.note}</p></CardContent></Card>)}</div>
    <div className="grid gap-5 lg:grid-cols-[1.2fr_1fr]"><Card><CardHeader><CardTitle>From policy to a defensible decision</CardTitle><CardDescription>The matrix determines authority. Budget, evidence, and conflicts are independent controls.</CardDescription></CardHeader><CardContent className="space-y-5">{[["01", "Configure a company policy", "Create a draft, adjust ceilings and map COAs. Submit for ratification before publishing."], ["02", "Assign accountable officers", "Set a tier, organizational scope and effective dates. Overlapping assignments are rejected."], ["03", "Evaluate and investigate", "Preview a request or save its findings. Resolve exceptions with a documented review outcome."]].map(([number, title, text]) => <div key={number} className="flex gap-3"><span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted text-xs font-semibold text-muted-foreground">{number}</span><div><h3 className="text-sm font-semibold">{title}</h3><p className="mt-1 text-sm text-muted-foreground">{text}</p></div></div>)}<div className="flex flex-wrap gap-2">{canOpenMatrix && <Button variant="outline" onClick={() => onOpen("matrix")}>Open authority matrix<ArrowRight /></Button>}{canEvaluate && <Button onClick={() => onOpen("evaluation")} disabled={!policy}>Evaluate policy<ArrowRight /></Button>}</div></CardContent></Card>
      <Card><CardHeader><CardTitle>Policy and integration notes</CardTitle><CardDescription>Source: management memo · 20 October 2026</CardDescription></CardHeader><CardContent><ul className="space-y-3 text-sm text-muted-foreground">{POLICY_ASSUMPTIONS.map(note => <li key={note} className="flex gap-2"><span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-amber-500" />{note}</li>)}</ul><div className="mt-5 border-t pt-4 text-xs text-muted-foreground">Storage ready · workspace revision {revision}<br />Signed-reference publication is an administrator attestation, not signature verification.</div></CardContent></Card></div>
  </div>;
}
