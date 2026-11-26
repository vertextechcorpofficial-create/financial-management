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

export function AgencyRollforward({ rollforward, onOpenMonth }: {
  rollforward: Rollforward | null;
  onOpenMonth: (month: string) => void;
}) {
  return <section className="space-y-3" aria-labelledby="agency-rollforward">
    <h2 id="agency-rollforward" className="font-semibold">Agency rollforward</h2>
    {!rollforward ? <p className="text-sm text-muted-foreground">Rollforward unavailable. This period was closed before rollforwards were saved.</p>
      : <>
        {!rollforward.complete && <p className="text-sm text-muted-foreground">Awaiting confirmed Payroll. Withholding and closing balances are incomplete.</p>}
        <div className="rounded-md border"><Table>
          <TableHeader><TableRow><TableHead>Agency</TableHead>
            {columns.map(([key, label]) => <TableHead className="text-right" key={key}>{label}</TableHead>)}</TableRow></TableHeader>
          <TableBody>{rollforward.rows.map(row => <TableRow key={row.agencyId}>
            <TableCell><details>
              <summary className="cursor-pointer">{row.code} · {row.agency}</summary>
              <div className="mt-2 max-w-md space-y-2 whitespace-normal break-words text-xs text-muted-foreground">
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
              </div>
            </details></TableCell>
            <AmountCells amounts={row} />
          </TableRow>)}
            {!rollforward.rows.length && <TableRow><TableCell colSpan={7}>No agencies with reportable activity.</TableCell></TableRow>}
          </TableBody>
          <TableFooter><TableRow><TableCell>Total</TableCell><AmountCells amounts={rollforward.totals} /></TableRow></TableFooter>
        </Table></div>
      </>}
  </section>;
}
