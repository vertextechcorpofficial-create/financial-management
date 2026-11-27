import { Badge } from "@/components/ui/badge";
import { peso } from "@/modules/financial-management/cooperative/members/format";
import type { Capacity, RequestCheck } from "./types";

export function RequestCapacity({ capacity, checks }: { capacity: Capacity | null; checks: RequestCheck[] }) {
  if (!capacity && !checks.length) return <p className="text-sm text-muted-foreground">Choose an employee, agency, and program to see the deduction estimate.</p>;
  const amount = (value: string | null) => value === null ? "Unavailable" : peso(value);
  const share = capacity?.deductionPercent === null || capacity?.deductionPercent === undefined ? null : Number(capacity.deductionPercent);
  const figures = capacity ? [
    ["Basic monthly pay", amount(capacity.basicPay)],
    ["Existing monthly loan deductions", amount(capacity.existingTotal)],
    [capacity.agencyEstimate ? "Agency monthly amortization" : "Estimated new monthly amortization", amount(capacity.estimatedAmortization)],
    ["Left after loan deductions", amount(capacity.remainingPay)],
    ["Share of basic pay", capacity.deductionPercent === null ? "Unavailable" : capacity.deductionPercent + "%"],
  ] : [];
  return <div className={capacity ? "grid gap-5 lg:grid-cols-2" : undefined}>
    {capacity && <div>
      <dl className="space-y-2 text-sm">
        {figures.map(([label, value]) => <div key={label} className="flex flex-wrap justify-between gap-x-3">
          <dt className="text-muted-foreground">{label}</dt><dd className="font-medium tabular-nums">{value}</dd>
        </div>)}
      </dl>
      {share !== null && Number.isFinite(share) && <div className="mt-3 space-y-1">
        <div className="h-2 overflow-hidden rounded-full bg-muted" role="progressbar" aria-label="Share of basic pay"
          aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(share)}>
          <div className={"h-full rounded-full " + (share > 40 ? "bg-destructive" : "bg-primary")} style={{ width: Math.min(100, Math.max(0, share)) + "%" }} />
        </div>
        <p className={"text-xs " + (share > 40 ? "text-destructive" : "text-muted-foreground")}>{share.toFixed(2)}% of basic pay · 40% guide</p>
      </div>}
      {capacity.existingLoans.length > 0 && <ul className="mt-3 space-y-1 border-t pt-3 text-xs text-muted-foreground">
        {capacity.existingLoans.map(loan => <li key={loan.id}>
          {loan.agencyCode} · {loan.reference ?? loan.id} · {peso(loan.amortization)} monthly
        </li>)}
      </ul>}
    </div>}
    <ul aria-label="Request checks" className="space-y-2">
      {checks.map(check => <li key={check.label} className="flex items-start justify-between gap-2 rounded-md border p-2.5 text-sm">
        <div><p className="font-medium">{check.label}</p><p className="text-xs text-muted-foreground">{check.detail}</p></div>
        <Badge variant="outline" className={check.result === "review" ? "text-amber-700 dark:text-amber-400" : "text-emerald-700 dark:text-emerald-400"}>
          {check.result === "pass" ? "Pass" : "Needs review"}
        </Badge>
      </li>)}
    </ul>
  </div>;
}
