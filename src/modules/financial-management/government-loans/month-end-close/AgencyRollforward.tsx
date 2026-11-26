"use client";

import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { date } from "@/modules/financial-management/cooperative/members/format";
import type { Rollforward } from "../server/month-end-rollforward";

const columns = [
  ["opening", "Opening"], ["withheld", "Withheld"], ["remitted", "Remitted principal"], ["closing", "Closing"],
  ["current", "From this month"], ["earlier", "From earlier months"],
] as const;
const grouped = new Intl.NumberFormat("en-PH");

function currency(value: string | null) {
  if (value === null) return "—";
  const [whole, fraction] = value.replace(/^-/, "").split(".");
  return (value.startsWith("-") ? "-" : "") + "₱" + grouped.format(BigInt(whole)) + "." + fraction;
}

function AmountCells({ amounts }: { amounts: Rollforward["totals"] }) {
  return columns.map(([key]) => <TableCell key={key} className={`text-right tabular-nums ${key === "earlier" &&
    amounts.earlier && amounts.earlier !== "0.00" && !amounts.earlier.startsWith("-") ? "font-semibold text-destructive" : ""}`}>{currency(amounts[key])}</TableCell>);
}

type RollforwardRow = Rollforward["rows"][number];

function RollforwardDetails({ row, onOpenMonth }: { row: RollforwardRow; onOpenMonth: (month: string) => void }) {
  return <div className="mt-2 max-w-md space-y-2 whitespace-normal break-words text-xs text-muted-foreground">
    {row.openingSnapshot && <p>Opening from{" "}
      <button type="button" className="underline" onClick={() => onOpenMonth(row.openingSnapshot!.month)}>
        {row.openingSnapshot.month} snapshot</button> · {row.openingSnapshot.id}</p>}
    {([["Opening Payroll", row.openingReceipts], ["Current Payroll", row.receipt ? [row.receipt] : []]] as const).map(([label, receipts]) => {
      if (!receipts.length) return null;
      return <div key={label}><p className="font-medium">{label}</p><ul className="space-y-1">
        {receipts.map(receipt => <li key={receipt.id}>{receipt.month} · revision {receipt.revision} · {currency(receipt.amount)} · {receipt.id}</li>)}</ul></div>;
    })}
    {([["Opening remittances", row.openingPayments], ["Remittances this month", row.payments]] as const).map(([label, payments]) => {
      if (!payments.length) return null;
      return <div key={label}><p className="font-medium">{label}</p><ul className="space-y-1">
        {payments.map(payment => <li key={payment.id}>{payment.reference} · {date(payment.date)} · {currency(payment.amount)}
          {" · Payroll " + payment.month} · {payment.decisionId ? "Approval " + payment.decisionId : "Remittance " + payment.id}</li>)}</ul></div>;
    })}
    {!row.openingSnapshot && !row.openingReceipts.length && !row.openingPayments.length && !row.receipt && !row.payments.length &&
      <p>No source activity.</p>}
  </div>;
}

export function AgencyRollforward({ rollforward, onOpenMonth }: {
  rollforward: Rollforward | null;
  onOpenMonth: (month: string) => void;
}) {
  return <section className="space-y-3" aria-labelledby="agency-rollforward">
    <div>
      <h2 id="agency-rollforward" className="font-semibold">Agency rollforward</h2>
      <p className="text-sm text-muted-foreground">
        At month-end the balance should be only this month&apos;s deductions, which are remitted next month by the deadline.
        Anything under earlier months is unremitted and should be paid and approved before closing.
      </p>
    </div>
    {!rollforward ? <p className="rounded-lg border p-4 text-sm text-muted-foreground">Rollforward unavailable. This period was closed before rollforwards were saved.</p>
      : <>
        {!rollforward.complete && <p className="text-sm text-muted-foreground">Awaiting confirmed Payroll. Withholding and closing balances are incomplete.</p>}
        <div className="hidden overflow-x-auto rounded-lg border md:block"><Table>
          <TableHeader><TableRow><TableHead>Agency</TableHead>
            {columns.map(([key, label]) => <TableHead className="text-right" key={key}>{label}</TableHead>)}</TableRow></TableHeader>
          <TableBody>{rollforward.rows.map(row => <TableRow key={row.agencyId}>
            <TableCell><details>
              <summary className="cursor-pointer">{row.code} · {row.agency}</summary>
              <RollforwardDetails row={row} onOpenMonth={onOpenMonth} />
            </details></TableCell>
            <AmountCells amounts={row} />
          </TableRow>)}
            {!rollforward.rows.length && <TableRow><TableCell colSpan={7}>No agencies with reportable activity.</TableCell></TableRow>}
          </TableBody>
          <TableFooter><TableRow><TableCell>Total</TableCell><AmountCells amounts={rollforward.totals} /></TableRow></TableFooter>
        </Table></div>
        <div className="space-y-2 md:hidden">
          {rollforward.rows.map(row => <article key={row.agencyId} className="space-y-2 rounded-lg border p-3 text-sm">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <p className="break-words font-medium">{row.code} · {row.agency}</p>
              <span className={row.earlier && row.earlier !== "0.00" && !row.earlier.startsWith("-") ? "font-semibold text-destructive" : "text-muted-foreground"}>
                Earlier {currency(row.earlier)}
              </span>
            </div>
            <dl className="grid grid-cols-2 gap-2">
              <div><dt className="text-xs text-muted-foreground">Opening</dt><dd className="tabular-nums">{currency(row.opening)}</dd></div>
              <div><dt className="text-xs text-muted-foreground">Withheld</dt><dd className="tabular-nums">{currency(row.withheld)}</dd></div>
              <div><dt className="text-xs text-muted-foreground">Remitted</dt><dd className="tabular-nums">{currency(row.remitted)}</dd></div>
              <div><dt className="text-xs text-muted-foreground">Closing</dt><dd className="font-semibold tabular-nums">{currency(row.closing)}</dd></div>
              <div><dt className="text-xs text-muted-foreground">From this month</dt><dd className="tabular-nums">{currency(row.current)}</dd></div>
              <div><dt className="text-xs text-muted-foreground">From earlier months</dt><dd className="tabular-nums">{currency(row.earlier)}</dd></div>
            </dl>
            <details className="text-xs text-muted-foreground"><summary className="cursor-pointer">Source details</summary>
              <RollforwardDetails row={row} onOpenMonth={onOpenMonth} /></details>
          </article>)}
          {!rollforward.rows.length && <p className="rounded-lg border p-4 text-sm text-muted-foreground">No agencies with reportable activity.</p>}
          <article className="rounded-lg border bg-muted/30 p-3 text-sm">
            <p className="font-medium">Total</p>
            <dl className="mt-2 grid grid-cols-2 gap-2">
              <div><dt className="text-xs text-muted-foreground">Closing</dt><dd className="font-semibold tabular-nums">{currency(rollforward.totals.closing)}</dd></div>
              <div><dt className="text-xs text-muted-foreground">Earlier months</dt><dd className="tabular-nums">{currency(rollforward.totals.earlier)}</dd></div>
            </dl>
          </article>
        </div>
        <p className="text-xs text-muted-foreground">
          The company is a collecting agent: withheld amounts belong to the agency until remitted, late-remittance penalties are a company expense,
          and the loans stay off the company&apos;s books.
        </p>
      </>}
  </section>;
}
