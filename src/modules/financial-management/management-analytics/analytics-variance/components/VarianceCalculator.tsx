"use client";

import * as React from "react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

import { StatusBadge } from "./StatusBadge";

import { percentDeviation } from "../services/engine";
import type { Policy, Polarity } from "../types";

type Verdict = { label: string; tone: "success" | "warning" | "danger" | "info" | "accent"; note: string };

function verdictOf(
  deviation: ReturnType<typeof percentDeviation>,
  threshold: number,
  policy: Policy,
): Verdict {
  if (!deviation.over) {
    return deviation.watch
      ? { label: "Watch", tone: "warning", note: "Inside the threshold but past half of it. No memo is required yet." }
      : { label: "On track", tone: "success", note: "Within the threshold. No memo is required." };
  }

  const confirms = !policy.sustainedRule || deviation.ratio >= policy.spikeMultiple;
  if (!deviation.unfavorable) {
    return {
      label: "Favorable, memo required",
      tone: "info",
      note: `Past the ${threshold}% threshold in the good direction. The register still asks for a memo, because a favorable run needs its driver named too.`,
    };
  }
  if (confirms) {
    return {
      label: "Confirmed breach",
      tone: "danger",
      note: `Over the ${threshold}% threshold and confirmed. A root-cause memo and an owner are due within ${policy.memoDeadlineDays} business days.`,
    };
  }
  return {
    label: "Provisional",
    tone: "accent",
    note: `Over the ${threshold}% threshold and not yet confirmed. It confirms after ${policy.confirmPeriods} consecutive periods, or at once when it reaches ${policy.spikeMultiple}× the threshold (${(threshold * policy.spikeMultiple).toFixed(1)}%).`,
  };
}

/**
 * The reference's calculator: one target, one reading, the rule in force. It runs the same
 * percentage deviation the scan uses, so the answer here matches what the register would record.
 */
export function VarianceCalculator({ policy }: { policy: Policy }) {
  const [target, setTarget] = React.useState("100");
  const [actual, setActual] = React.useState("106.2");
  const [polarity, setPolarity] = React.useState<Polarity>("LOW");
  const [threshold, setThreshold] = React.useState("5");

  const targetValue = Number(target);
  const actualValue = Number(actual);
  const thresholdValue = Number(threshold);
  const usable =
    Number.isFinite(targetValue) &&
    targetValue !== 0 &&
    Number.isFinite(actualValue) &&
    Number.isFinite(thresholdValue);

  const deviation = usable ? percentDeviation(actualValue, targetValue, polarity, thresholdValue, 2) : null;
  const verdict = deviation ? verdictOf(deviation, thresholdValue, policy) : null;

  return (
    <div className="space-y-4 px-4 py-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="calc-target" className="text-xs text-muted-foreground">
            Target or budget
          </Label>
          <Input
            id="calc-target"
            type="number"
            step="any"
            inputMode="decimal"
            value={target}
            onChange={(event) => setTarget(event.target.value)}
            className="h-11 tabular-nums sm:h-9"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="calc-actual" className="text-xs text-muted-foreground">
            Actual
          </Label>
          <Input
            id="calc-actual"
            type="number"
            step="any"
            inputMode="decimal"
            value={actual}
            onChange={(event) => setActual(event.target.value)}
            className="h-11 tabular-nums sm:h-9"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="calc-polarity" className="text-xs text-muted-foreground">
            Polarity
          </Label>
          <Select value={polarity} onValueChange={(value) => setPolarity(value as Polarity)}>
            <SelectTrigger id="calc-polarity" className="h-11 w-full sm:h-9" aria-label="Polarity">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="LOW">Lower is better</SelectItem>
              <SelectItem value="HIGH">Higher is better</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="calc-threshold" className="text-xs text-muted-foreground">
            Threshold ±%
          </Label>
          <Input
            id="calc-threshold"
            type="number"
            step="0.5"
            min="0.5"
            inputMode="decimal"
            value={threshold}
            onChange={(event) => setThreshold(event.target.value)}
            className="h-11 tabular-nums sm:h-9"
          />
        </div>
      </div>

      <div className="rounded-lg border border-border/60 bg-muted/30 px-4 py-3">
        {deviation && verdict ? (
          <>
            <div className="flex flex-wrap items-center gap-3">
              <span
                className={cn(
                  "font-mono text-3xl leading-none tabular-nums",
                  verdict.tone === "danger" && "text-destructive",
                  verdict.tone === "warning" && "text-warning",
                  verdict.tone === "success" && "text-success",
                  verdict.tone === "info" && "text-info",
                  verdict.tone === "accent" && "text-primary",
                )}
              >
                {deviation.text}
              </span>
              <StatusBadge tone={verdict.tone}>{verdict.label}</StatusBadge>
            </div>
            <p className="mt-2 text-xs leading-5 text-muted-foreground">{verdict.note}</p>
          </>
        ) : (
          <p className="text-xs leading-5 text-muted-foreground">
            Enter a non-zero target and a numeric actual to see the deviation.
          </p>
        )}
      </div>

      <p className="text-[11.5px] leading-5 text-muted-foreground">
        Safety, uptime, churn, floors and ceilings are absolute limits and always confirm on the first period. Memo
        deadline is {policy.memoDeadlineDays} business days after the period ends.
      </p>
    </div>
  );
}
