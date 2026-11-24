import { balance, centavos, validateLines, type Entry } from "./ledger";
import type { LedgerRegisters } from "./server/registers";
import { certificateActiveAt, certificateHistory } from "./certificates";

type Cell = string | number | null | undefined;

export function csvReport(rows: Cell[][]) {
  return rows.map(row => row.map(value => {
    const text = String(value ?? "");
    const safe = typeof value === "string" && /^[\s\uFEFF]*[=+\-@]/.test(text) ? `'${text}` : text;
    return `"${safe.replaceAll('"', '""')}"`;
  }).join(",")).join("\r\n");
}

export function stockReports(entries: readonly Entry[], registers: LedgerRegisters, asOf: string) {
  const holders = [...registers.holders].sort((a, b) => a.name.localeCompare(b.name));
  const names = new Map(holders.map(row => [row.id, row.name]));
  const book: Cell[][] = [["Record type", "Date", "Stockholder", "Counterparty", "Reference", "Shares", "Amount (PHP)", "Status", "eCAR", "Deed", "Certificates"]];
  const gis: Cell[][] = [["Name", "TIN", "Nationality", "Address", "Shares originally subscribed", "Subscription amount (PHP)",
    "Paid subscription amount (PHP)", "Current shares held", "Active certificates"]];
  for (const holder of holders) {
    const subs = registers.subs.filter(row => row.holderId === holder.id && row.date <= asOf);
    const certs = registers.certs.filter(row => row.holderId === holder.id && row.date <= asOf);
    const liveSubs = subs.filter(row => !("cancelled" in row && row.cancelled));
    const liveCerts = certs.filter(row => certificateActiveAt(row, asOf));
    const total = liveSubs.reduce((sum, row) => sum + centavos(row.shares * row.price), 0);
    const paid = total - liveSubs.reduce((sum, row) => sum + centavos(balance(entries, "3020", row.id, asOf)), 0);
    const held = liveCerts.reduce((sum, row) => sum + row.shares, 0) +
      liveSubs.filter(row => !row.issuedAt || row.issuedAt > asOf).reduce((sum, row) => sum + row.shares, 0);
    gis.push([holder.name, holder.tin, holder.nationality, holder.address, liveSubs.reduce((sum, row) => sum + row.shares, 0),
      total / 100, paid / 100, held, liveCerts.map(row => row.no).join("; ")]);
    for (const sub of subs) {
      book.push(["Subscription", sub.date, holder.name, "", sub.id, sub.shares, sub.shares * sub.price,
        "cancelled" in sub && sub.cancelled ? "Cancelled" : "Registered"]);
      for (const entry of entries.filter(row => row.date <= asOf).sort((a, b) => a.date.localeCompare(b.date) || a.no - b.no)) {
        const payment = -balance([entry], "3020", sub.id);
        if (entry.id === sub.txnId ? Number(entry.data.paid ?? 0) > 0 : payment > 0) {
          book.push(["Payment or offset", entry.date, holder.name, "", `JE-${entry.no}`, "",
            entry.id === sub.txnId ? Number(entry.data.paid) : payment, entry.reversedBy ? "Reversed" : "Posted"]);
        }
      }
    }
    for (const cert of certs) {
      book.push(["Certificate", cert.date, holder.name, "", cert.no, cert.shares, "", "Issued"]);
      for (const event of certificateHistory(cert).filter(event => event.date <= asOf)) {
        book.push(["Certificate", event.date, holder.name, "", cert.no, cert.shares, "",
          event.action === "restore" ? "Restored" : event.action === "surrender" ? "Surrendered" : "Voided"]);
      }
    }
  }
  for (const row of registers.transfers.filter(row => row.date <= asOf)) {
    book.push(["Transfer", row.date, names.get(row.fromId), names.get(row.toId), row.id, row.shares, row.shares * row.price,
      row.voidedAt && row.voidedAt <= asOf ? "Voided" : "Recorded", row.carRef, row.deedRef,
      `${row.surrendered.join("; ")} → ${row.newCerts.join("; ")}`]);
  }
  return { book: csvReport(book), gis: csvReport(gis) };
}

export function taxReports(entries: readonly Entry[], registers: LedgerRegisters,
  filings: Record<string, { reference: string; status?: string; filedOn?: string | null; receiptReference?: string | null }> | null) {
  const tax: Cell[][] = [["Journal", "Booked date", "Form", "Due date", "Tag", "Base/gain if recorded (PHP)",
    "Rate if recorded (%)", "Amount booked (PHP)", "Amount outstanding (PHP)", "Filing reference", "External filing status", "Filed on", "Receipt reference"]];
  const giving: Cell[][] = [["Journal", "Gift date", "Donee", "Accreditation status at gift", "Vehicle", "Fair value (PHP)", "Deduction basis (PHP)", "Donor's tax (PHP)", "Reversed"]];
  const dividends: Cell[][] = [["Journal", "Paid date", "Stockholder", "TIN", "Gross (PHP)", "Rate (%)", "Withheld (PHP)", "Cash (PHP)"]];
  for (const entry of entries) {
    for (const line of entry.lines.filter(row => row.acct === "2200" && row.cr > 0)) {
      tax.push([entry.no, entry.date, String(entry.data.taxForm ?? ""), String(entry.data.taxDue ?? ""), line.tag,
        typeof entry.data.gain === "number" ? entry.data.gain : undefined,
        typeof entry.data.dstRate === "number" ? entry.data.dstRate : undefined, line.cr,
        -balance(entries, "2200", line.tag), filings?.[entry.id]?.reference,
        filings?.[entry.id]?.status ?? "Not recorded", filings?.[entry.id]?.filedOn, filings?.[entry.id]?.receiptReference]);
    }
    if (entry.type === "donation") {
      giving.push([entry.no, entry.date, registers.charities.find(row => row.id === entry.data.charityId)?.name,
        String(entry.data.donee ?? ""), String(entry.data.vehicle ?? ""), Number(entry.data.amount), Number(entry.data.deductBasis),
        Number(entry.data.donorTax ?? 0), entry.reversedBy ? "Yes" : "No"]);
    }
    if (entry.type === "divpay" && Array.isArray(entry.data.payments)) {
      for (const row of entry.data.payments) {
        const holder = registers.holders.find(item => item.id === row.holderId);
        dividends.push([entry.no, entry.date, holder?.name, holder?.tin, row.gross, row.rate, row.withheld, row.cash]);
      }
    }
  }
  return { tax: csvReport(tax), giving: csvReport(giving), dividends: csvReport(dividends) };
}

/** Evidence package for accountant review, deliberately not a government filing format. */
export function filingReviewPack(entries: readonly Entry[], registers: LedgerRegisters, asOf: string,
  filings: Parameters<typeof taxReports>[2]) {
  const through = entries.filter(entry => entry.date <= asOf);
  const issues: string[] = [];
  for (const entry of through) {
    try { validateLines(entry.lines); }
    catch { issues.push(`JE-${entry.no}: invalid journal lines`); }
  }
  if (!registers.corp.name?.trim() || !registers.corp.secReg?.trim()) issues.push("Corporation name or SEC registration is missing.");
  for (const holder of registers.holders) {
    if (!holder.name?.trim() || !holder.tin?.trim() || !holder.address?.trim() || !holder.nationality?.trim()) {
      issues.push(`Stockholder ${holder.id}: incomplete identity, TIN, address or nationality.`);
    }
  }
  const seen = new Set<string>();
  for (const cert of registers.certs) {
    if (seen.has(cert.no.toUpperCase())) issues.push(`Duplicate certificate number: ${cert.no}`);
    seen.add(cert.no.toUpperCase());
    if (!registers.holders.some(holder => holder.id === cert.holderId) || !Number.isSafeInteger(cert.shares) || cert.shares < 1) {
      issues.push(`Certificate ${cert.no}: invalid holder or share quantity.`);
    }
  }
  const held = registers.certs.filter(cert => certificateActiveAt(cert, asOf)).reduce((sum, cert) => sum + cert.shares, 0) +
    registers.subs.filter(sub => sub.date <= asOf && !("cancelled" in sub && sub.cancelled) &&
      (!sub.issuedAt || sub.issuedAt > asOf)).reduce((sum, sub) => sum + sub.shares, 0);
  const subscribed = registers.subs.filter(sub => sub.date <= asOf && !("cancelled" in sub && sub.cancelled))
    .reduce((sum, sub) => sum + sub.shares, 0);
  if (held !== subscribed) issues.push("Current certificate and unissued-subscription shares do not reconcile to subscribed shares.");
  if (subscribed > registers.corp.authorized) issues.push("Subscribed shares exceed authorized capital.");
  for (const entry of through.filter(entry => entry.lines.some(line => line.acct === "2200" && line.cr > 0))) {
    if (!entry.data.taxForm || !entry.data.taxDue) issues.push(`JE-${entry.no}: tax form or due date requires review.`);
  }
  return {
    format: "investment-donations-accountant-review-v1",
    asOf, corporation: registers.corp, officialSubmission: false, submittedByApplication: false,
    reviewStatus: "Pending independent accountant approval",
    notice: "Supporting workpapers only. Validate against current SEC/BIR forms and filing-channel requirements before external submission.",
    issues, totals: { subscribedShares: subscribed, heldShares: held,
      taxesPayable: -balance(through, "2200"), taxCreditsReceivable: balance(through, "1220"),
      charitableContributions: balance(through.filter(entry => entry.type !== "closing"), "5000"),
      journalNetCentavos: through.reduce((sum, entry) => sum + entry.lines.reduce((net, line) => net + centavos(line.dr) - centavos(line.cr), 0), 0) },
    workpapers: { ...stockReports(through, registers, asOf), ...taxReports(through, registers, filings) },
    filings: filings ?? {},
  };
}
