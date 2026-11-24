"use client";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useFundRead } from "./hooks/useFunds";
import { UpdatedAgo } from "./components/UpdatedAgo";
import { PettyCashPageHeader } from "./components/PettyCashPageHeader";
import { ErrorBox, Paging } from "./components/OnboardingCommon";
import { FundSelect } from "./components/FundSelect";
import { ResponsiveListSkeleton } from "./components/PettyCashSkeletons";
import { VoucherReview, voucherMoney } from "./components/VoucherReview";
import { VoucherDecisionDetails } from "./components/VoucherDecisionDetails";
import { dateTime } from "./utils/dateTime";
import type { Page } from "./onboarding-types";
import type { VoucherApprovalFund, VoucherApprovalRow } from "./voucher-approval-types";

const PENDING_HEADERS = ["Voucher / revision", "Fund", "Payee / particulars", "Prepared by", "Voucher date / submitted", "Gross", "Cash paid", "Cash to pay / (return)", ""];
const DECIDED_HEADERS = ["Voucher / revision", "Fund", "Payee / particulars", "Decision", "Decided by", "Decided at", "Cash paid before", "Cash paid / (returned)", ""];

export default function PettyCashDisbursementApprovalModule({ actorName }: { actorName: string }) {
  const funds = useFundRead<VoucherApprovalFund[]>("disbursement-approval/funds"), [revision, setRevision] = useState(0);
  const [selected, setSelected] = useState<{ id: number; history: boolean } | null>(null);
  const fundsDisabled = funds.loading || Boolean(funds.error && !funds.data);
  function changed() { setSelected(null); setRevision(value => value + 1); }
  return <section className="space-y-5"><PettyCashPageHeader title="Disbursement Approval" description="Review submitted payment vouchers and corrections across all funds. Approval records the confirmed cash payment or return; expenses post only through replenishment." />
    <ErrorBox error={funds.error || null} retry={funds.refresh} title="Could not load fund filters" />
    <Queue queue="pending" funds={funds.data || []} fundsDisabled={fundsDisabled} revision={revision} onOpen={row => setSelected({ id: row.voucherId, history: false })} />
    <Queue queue="decided" funds={funds.data || []} fundsDisabled={fundsDisabled} revision={revision} onOpen={row => setSelected({ id: row.decisionId!, history: true })} />
    {selected && (selected.history ? <VoucherDecisionDetails id={selected.id} onClose={() => setSelected(null)} /> : <VoucherReview id={selected.id} review actorName={actorName} onClose={() => setSelected(null)} onChanged={changed} />)}
  </section>;
}
function Queue({ queue, funds, fundsDisabled, revision, onOpen }: { queue: "pending" | "decided"; funds: VoucherApprovalFund[]; fundsDisabled: boolean; revision: number; onOpen: (row: VoucherApprovalRow) => void }) {
  const pending = queue === "pending", title = pending ? "Awaiting approval" : "History";
  const [page, setPage] = useState(1), [search, setSearch] = useState(""), [fundId, setFundId] = useState(""), [decision, setDecision] = useState("ALL"), [from, setFrom] = useState(""), [to, setTo] = useState("");
  const invalid = Boolean(from && to && from > to), filtered = Boolean(search.trim() || fundId || from || to || decision !== "ALL");
  const params = new URLSearchParams({ queue, page: String(page), pageSize: "25", decision });
  if (search.trim()) params.set("search", search.trim()); if (fundId) params.set("fundId", fundId); if (from) params.set("dateFrom", from); if (to) params.set("dateTo", to);
  const read = useFundRead<Page<VoucherApprovalRow>>(invalid ? null : `disbursement-approval/requests?${params}`, 250), refresh = read.refresh;
  useEffect(() => { if (revision) refresh(); }, [revision, refresh]);
  const lastPage = read.data ? Math.max(1, Math.ceil(read.data.total / 25)) : page;
  if (page > lastPage) setPage(lastPage);
  function update(action: () => void) { action(); setPage(1); }
  const headers = pending ? PENDING_HEADERS : DECIDED_HEADERS;
  return <section aria-label={title} className="overflow-hidden rounded-xl border bg-card"><div className="space-y-3 p-5"><div className="flex flex-wrap items-center justify-between gap-2"><h2 className="text-lg font-semibold">{title}{read.data ? ` (${read.data.total})` : ""}</h2>{pending && <UpdatedAgo at={read.updatedAt} />}</div><p className="text-sm text-muted-foreground">{pending ? "Oldest submitted vouchers and corrections appear first." : "Individual approval and rejection decisions, newest first. Direct payments are not approval decisions."}</p>
    <div role="search" aria-label={`${title} filters`} className="flex flex-wrap items-end gap-3">
      <div className="min-w-0 flex-1 basis-56 space-y-1"><label htmlFor={`${queue}-search`} className="text-xs">Search</label><Input id={`${queue}-search`} placeholder="Voucher, fund, payee, particulars or receipt" maxLength={200} value={search} onChange={event => update(() => setSearch(event.target.value))} /></div>
      <div className="w-64 max-w-full"><FundSelect funds={funds} value={fundId ? Number(fundId) : null} onChange={value => update(() => setFundId(value === null ? "" : String(value)))} includeAll size="sm" disabled={fundsDisabled} pageSize={10} searchPlaceholder="Search fund number or name..." /></div>
      {!pending && <div className="space-y-1"><label htmlFor={`${queue}-decision`} className="block text-xs">Decision</label><select id={`${queue}-decision`} className="h-9 rounded-md border bg-background px-2 text-sm" value={decision} onChange={event => update(() => setDecision(event.target.value))}><option value="ALL">All decisions</option><option value="APPROVED">Approved</option><option value="REJECTED">Rejected</option></select></div>}
      <div className="space-y-1"><label className="text-xs" htmlFor={`${queue}-from`}>{pending ? "Voucher" : "Decision"} date from</label><Input id={`${queue}-from`} type="date" value={from} onChange={event => update(() => setFrom(event.target.value))} /></div><div className="space-y-1"><label className="text-xs" htmlFor={`${queue}-to`}>{pending ? "Voucher" : "Decision"} date to</label><Input id={`${queue}-to`} type="date" value={to} onChange={event => update(() => setTo(event.target.value))} /></div>
      {filtered && <Button variant="ghost" onClick={() => update(() => { setSearch(""); setFundId(""); setDecision("ALL"); setFrom(""); setTo(""); })}>Clear filters</Button>}
    </div>{invalid && <p role="alert" className="text-sm text-destructive">From must be on or before To.</p>}<ErrorBox error={read.error || null} retry={refresh} title={`Could not load ${title.toLowerCase()}`} />
    {read.loading && <ResponsiveListSkeleton label={`Loading ${title.toLowerCase()}`} rows={5} columns={headers.length} />}{read.refreshing && <p role="status" className="text-sm text-muted-foreground">Updating {title.toLowerCase()}...</p>}
    </div>{!invalid && read.data && <>{read.data.items.length ? <><div className="hidden overflow-x-auto md:block"><table aria-label={title} className="w-full text-left text-sm [&_th]:whitespace-nowrap [&_th]:p-3 [&_th]:font-medium [&_td]:p-3"><thead className="border-y bg-muted/30"><tr>{headers.map((label, i) => <th key={i}>{label}</th>)}</tr></thead><tbody>{read.data.items.map(row => <tr key={row.decisionId || row.voucherId} className="border-b align-top"><td className="font-semibold">{row.docNo}<small className="block font-normal text-muted-foreground">Revision {row.revision}{row.correction ? " · Correction" : ""}</small></td><td>{row.fundDocNo}<small className="block text-muted-foreground">{row.fundName}</small></td><td>{row.payee}<small className="block max-w-sm break-words text-muted-foreground">{row.particulars}</small></td>{pending ? <><td>{row.preparedBy}</td><td>{row.date}<small className="block text-muted-foreground">{dateTime(row.submittedAt)}</small></td><td className="whitespace-nowrap">{voucherMoney(row.gross)}</td></> : <><td>{row.decision === "APPROVED" ? "Approved" : "Rejected"}{row.reason && <small className="block max-w-sm break-words text-muted-foreground">{row.reason}</small>}</td><td>{row.decidedBy}</td><td className="whitespace-nowrap">{dateTime(row.decidedAt)}</td></>}<td className="whitespace-nowrap">{voucherMoney(row.paidNetCash)}</td><td className="whitespace-nowrap">{voucherMoney(row.cashDelta)}</td><td><Button variant="outline" size="sm" aria-label={`${pending ? "Review" : "View decision for"} ${row.docNo}`} onClick={() => onOpen(row)}>{pending ? "Review" : "View"}</Button></td></tr>)}</tbody></table></div>
      <div className="space-y-3 p-4 md:hidden">{read.data.items.map(row => <div key={row.decisionId || row.voucherId} className="space-y-2 rounded-lg border p-3 text-sm"><strong>{row.docNo} · Revision {row.revision}{row.correction ? " · Correction" : ""}</strong><p>{row.fundDocNo} · {row.fundName}</p><p>{row.payee} · {row.particulars}</p><p>{pending ? `${row.preparedBy} · ${row.date}` : `${row.decision === "APPROVED" ? "Approved" : "Rejected"} · ${row.decidedBy} · ${dateTime(row.decidedAt)}`}</p><p>{pending ? "To pay / (return)" : "Paid / (returned)"}: {voucherMoney(row.cashDelta)}</p>{row.reason && <p className="break-words">{row.reason}</p>}<Button variant="outline" size="sm" aria-label={`${pending ? "Review" : "View decision for"} ${row.docNo}`} onClick={() => onOpen(row)}>{pending ? "Review" : "View"}</Button></div>)}</div></> : <p className="px-5 pb-5 text-sm text-muted-foreground">{filtered ? "No records match these filters." : pending ? "No vouchers are waiting for approval. Submitted vouchers and corrections appear here." : "No approval or rejection decisions yet."}</p>}
      <div className="p-3"><Paging page={page} pageSize={25} total={read.data.total} onChange={setPage} /></div></>}
  </section>;
}
