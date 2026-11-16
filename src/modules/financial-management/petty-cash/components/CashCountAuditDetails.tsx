"use client";
import { MasterTable } from "./MasterCommon";
import { approvalTimestamp } from "./VoucherDecisionDetails";
import { voucherMoney } from "../utils/voucherMoney";

const object = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
const list = (value: unknown) => Array.isArray(value) ? value.map(object) : [];
const text = (value: unknown) => value == null || value === "" ? "-" : String(value);
const money = (value: unknown) => value == null ? "-" : voucherMoney(String(value));

export function CashCountAuditDetails({ event }: { event: Record<string, unknown> }) {
  const details = object(event.details), before = object(details.before), decision = object(details.decision);
  const count = before.snapshot ? before : details.snapshot ? details : object(details.count), snapshot = object(count.snapshot), fund = object(snapshot.fund);
  const reconciliation = object(object(before.snapshot).reconciliation), adjustments = list(reconciliation.adjustments ?? details.countAdjustments);
  const supported = String(event.action).startsWith("COUNT_") || adjustments.length > 0 || reconciliation.calculationVersion === 2;
  if (!supported) return <pre className="max-h-96 overflow-auto whitespace-pre-wrap break-words rounded bg-muted/30 p-3 text-xs">{JSON.stringify(event.details ?? {}, null, 2)}</pre>;
  return <div className="space-y-4 text-sm">
    {Boolean(count.snapshot) && <><dl className="grid gap-3 rounded-lg border p-3 sm:grid-cols-2"><div><dt className="text-muted-foreground">Count / time</dt><dd>{text(count.docNo)} - {approvalTimestamp(String(count.recordedAt || ""))}</dd></div><div><dt className="text-muted-foreground">Custodian at count</dt><dd>{text(fund.custodian)} (ID {text(fund.custodianId)})</dd></div><div><dt className="text-muted-foreground">Counter / witness</dt><dd>{text(snapshot.counter)} / {text(snapshot.witness)}</dd></div><div><dt className="text-muted-foreground">Physical cash counted</dt><dd>{money(snapshot.countedCash)}</dd></div><div><dt className="text-muted-foreground">Expected cash / over (short)</dt><dd>{money(fund.expectedCash)} / {money(snapshot.variance)}</dd></div><div><dt className="text-muted-foreground">Approved account</dt><dd>{text(object(decision.account).code)} - {text(object(decision.account).name)}</dd></div></dl>
      <MasterTable label="Audited cash denominations" headers={["Denomination", "Quantity", "Total"]}>{list(snapshot.lines).filter(line => Number(line.quantity) > 0).map(line => <tr key={text(line.denominationId)}><td>{text(line.kind)} {money(line.amount)}</td><td>{text(line.quantity)}</td><td>{money(line.total)}</td></tr>)}</MasterTable></>}
    {(decision.cashBefore != null || details.cashBefore != null) && <p>Operational cash: {money(decision.cashBefore ?? details.cashBefore)} before; {money(decision.cashAfter ?? details.cashAfter)} after.</p>}
    {adjustments.length > 0 && <MasterTable label="Audited count adjustments" headers={["Count", "Custodian at count", "Over / (short)", "Approved account"]}>{adjustments.map(row => <tr key={text(row.countId)}><td>{text(row.docNo)}</td><td>{text(row.custodian)} (ID {text(row.custodianId)})</td><td>{money(row.variance)}</td><td>{text(object(row.account).code)} - {text(object(row.account).name)}</td></tr>)}</MasterTable>}
    <div className="rounded-lg border p-3"><p className="font-medium">Linked GL journals</p>{list(event.journals).length ? <ul className="mt-2 space-y-1">{list(event.journals).map(journal => <li key={text(journal.id)}>{text(journal.number)} (ID {text(journal.id)}) - {text(journal.role).replaceAll("_", " ")} - {text(journal.date)}</li>)}</ul> : <p className="mt-1 text-muted-foreground">No GL journal posted. Count approval changes operational cash; GL recognition follows at replenishment or closure.</p>}</div>
  </div>;
}
