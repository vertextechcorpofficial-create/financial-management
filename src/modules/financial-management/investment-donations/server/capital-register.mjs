import { balance, centavos } from "../ledger.ts";
import { certificateActiveAt, certificateHistory } from "../certificates.ts";

const certNumber = value => typeof value === "string" && /^[A-Za-z0-9-]{1,40}$/.test(value);
const validDate = value => typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) &&
  Number.isFinite(+new Date(`${value}T00:00:00Z`)) && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
const reference = value => typeof value === "string" && value.trim().length > 0 && value.length <= 200;
const changeCert = (cert, date, action, transferId) => ({
  ...cert, history: [...certificateHistory(cert), { date, action, transferId }],
  ...(action === "surrender" ? { cancelledAt: date, cancelledBy: transferId } :
    action === "void" ? { voidedAt: date } : { cancelledAt: null, cancelledBy: null }),
});

export function transferShares({ certs, transfers, dividends, holders, corp, policy, input, id }) {
  const { date } = input;
  if (!validDate(date)) throw new Error("Enter a valid transfer date.");
  if (transfers.some(row => (row.voidedAt ?? row.date) > date) ||
      certs.some(row => row.date > date || certificateHistory(row).some(event => event.date > date))) {
    throw new Error("Use a date on or after the latest certificate and transfer event.");
  }
  if (input.type === "voidTransfer") {
    const transfer = transfers.find(row => row.id === input.target && !row.voidedAt);
    if (!transfer || date < transfer.date || typeof input.reason !== "string" || !input.reason.trim() || input.reason.length > 500) {
      throw new Error("Select an active transfer and enter a reason of up to 500 characters.");
    }
    const imported = !transfer.sourceCertId && !transfer.sourceCertIds;
    if (imported && (!reference(input.evidenceRef) || input.confirmHistorical !== true)) {
      throw new Error("Historical corrections require an evidence reference and confirmation of the imported certificate history.");
    }
    const sourceIds = transfer.sourceCertIds ?? (transfer.sourceCertId ? [transfer.sourceCertId] : null);
    const sources = sourceIds ? sourceIds.map(key => certs.find(cert => cert.id === key)) :
      transfer.surrendered.map(no => {
        const matches = certs.filter(cert => cert.no === no && cert.cancelledBy === transfer.id);
        return matches.length === 1 ? matches[0] : null;
      });
    const issued = certs.filter(cert => cert.transferId === transfer.id);
    const sourceTotal = sources.reduce((sum, cert) => sum + (cert?.shares ?? 0), 0);
    if (!sources.length || sources.some(cert => !cert || cert.holderId !== transfer.fromId ||
        cert.cancelledBy !== transfer.id || certificateActiveAt(cert, date)) ||
        issued.length !== transfer.newCerts.length || !issued.length ||
        issued.some(cert => !transfer.newCerts.includes(cert.no) || !certificateActiveAt(cert, date) ||
          certificateHistory(cert).length > 0) ||
        issued.reduce((sum, cert) => sum + cert.shares, 0) !== sourceTotal ||
        issued.filter(cert => cert.holderId === transfer.toId).reduce((sum, cert) => sum + cert.shares, 0) !== transfer.shares ||
        issued.some(cert => ![transfer.fromId, transfer.toId].includes(cert.holderId))) {
      throw new Error("A subsequent transaction or inconsistent imported history prevents this correction.");
    }
    if (dividends.some(row => !row.cancelled && row.recordDate >= transfer.date)) {
      throw new Error("This transfer affected a recorded dividend entitlement.");
    }
    return {
      before: transfer,
      after: { ...transfer, sourceCertIds: sources.map(cert => cert.id), voidedAt: date,
        voidReason: input.reason.trim(), correctionEvidence: input.evidenceRef?.trim() ?? null, importedCorrection: imported },
      certs: certs.map(cert => sources.some(source => source.id === cert.id) ? changeCert(cert, date, "restore", transfer.id) :
        cert.transferId === transfer.id ? changeCert(cert, date, "void", transfer.id) : cert),
    };
  }
  if (dividends.some(row => !row.cancelled && row.recordDate >= date)) {
    throw new Error("Transfer corrections cannot change a recorded dividend entitlement.");
  }
  const ids = input.targets ?? [input.target];
  if (!Array.isArray(ids) || !ids.length || ids.length > 100 || new Set(ids).size !== ids.length) {
    throw new Error("Select distinct surrendered certificates.");
  }
  const sources = ids.map(key => certs.find(cert => cert.id === key));
  const owner = sources[0]?.holderId;
  if (sources.some(cert => !cert || cert.holderId !== owner || !certificateActiveAt(cert, date)) ||
      !holders.some(holder => holder.id === input.toId) || input.toId === owner) {
    throw new Error("Select active certificates belonging to one seller and a different receiving stockholder.");
  }
  const total = sources.reduce((sum, cert) => sum + cert.shares, 0);
  if (!Number.isSafeInteger(total) || !Number.isSafeInteger(input.shares) || input.shares < 1 || input.shares > total) {
    throw new Error("Transfer exceeds the surrendered certificates' shares.");
  }
  if (!Number.isFinite(input.price) || input.price < 0 || input.price * input.shares > 1e12 ||
      !reference(input.carRef) || !reference(input.deedRef)) throw new Error("Enter valid consideration, eCAR and deed references.");
  const remaining = total - input.shares;
  const newCerts = remaining ? [input.buyerNo, input.balanceNo] : [input.buyerNo];
  const used = new Set(certs.map(cert => String(cert.no).toUpperCase()));
  if (newCerts.some(no => !certNumber(no) || used.has(no.toUpperCase())) ||
      new Set(newCerts.map(no => no.toUpperCase())).size !== newCerts.length) {
    throw new Error("Enter unique certificate numbers for the buyer and any remaining shares.");
  }
  if (!Number.isFinite(corp.par) || corp.par <= 0 || !Number.isFinite(policy.dstTransfer) ||
      policy.dstTransfer < 0 || policy.dstTransfer > 100) throw new Error("Invalid transfer tax settings.");
  const after = { id, date, fromId: owner, toId: input.toId, shares: input.shares, price: input.price,
    carRef: input.carRef.trim(), deedRef: input.deedRef.trim(), sourceCertId: sources[0].id,
    sourceCertIds: ids, surrendered: sources.map(cert => cert.no), newCerts,
    dstSeller: centavos(input.shares * corp.par * policy.dstTransfer / 100) / 100, recordedAt: new Date().toISOString() };
  const created = [{ id, no: input.buyerNo, holderId: input.toId, shares: input.shares, date, source: "transfer", transferId: id }];
  if (remaining) created.push({ id: `${id}-balance`, no: input.balanceNo, holderId: owner,
    shares: remaining, date, source: "transfer", transferId: id });
  return { before: null, after, certs: [...certs.map(cert => ids.includes(cert.id) ?
    changeCert(cert, date, "surrender", id) : cert), ...created] };
}

export function postDividend({ entries, holders, subs, certs, dividends, policy, input, id }) {
  const { date, type } = input;
  const lines = [];
  const add = (acct, dr, cr, tag = "") => { if (dr || cr) lines.push({ acct, dr: dr / 100, cr: cr / 100, tag }); };
  let record;
  let data;
  let memo;
  if (type === "declareDividend") {
    if (!Number.isFinite(input.perShare) || input.perShare <= 0 || input.perShare > 1e6 ||
        input.confirmUnrestricted !== true || !validDate(input.payDate) || input.payDate < date) {
      throw new Error("Enter a payment date and confirm unrestricted earnings.");
    }
    const shares = new Map();
    for (const cert of certs.filter(cert => certificateActiveAt(cert, date))) {
      shares.set(cert.holderId, (shares.get(cert.holderId) ?? 0) + cert.shares);
    }
    for (const sub of subs.filter(sub => !sub.cancelled && sub.date <= date && (!sub.issuedAt || sub.issuedAt > date))) {
      shares.set(sub.holderId, (shares.get(sub.holderId) ?? 0) + sub.shares);
    }
    const allocations = [...shares].map(([holderId, units]) => {
      if (!holders.some(holder => holder.id === holderId) || !Number.isSafeInteger(units) || units < 1) {
        throw new Error("The stockholder register is inconsistent.");
      }
      return { holderId, shares: units, gross: centavos(units * input.perShare) / 100 };
    }).filter(row => row.gross > 0);
    const total = allocations.reduce((sum, row) => sum + centavos(row.gross), 0);
    if (!Number.isSafeInteger(total) || total < 1 || total > 1e14) throw new Error("The dividend amount is invalid.");
    if (total > -centavos(balance(entries, "3800", undefined, date))) throw new Error("Dividend exceeds recorded retained earnings.");
    add("3800", total, 0);
    add("2300", 0, total, id);
    record = { id, date, recordDate: date, payDate: input.payDate, perShare: input.perShare, gross: total / 100, allocations };
    data = { dividendId: id, gross: total / 100, confirmUnrestricted: true };
    memo = "Cash dividend declaration";
  } else {
    record = dividends.find(row => row.id === input.target && !row.paidAt && !row.cancelled);
    if (!record || !Array.isArray(record.allocations) || date < record.payDate ||
        !["1000", "1010", "1020"].includes(input.account)) throw new Error("Select an unpaid dividend on or after its payment date.");
    const total = centavos(record.gross);
    if (-centavos(balance(entries, "2300", record.id, date)) !== total ||
        record.allocations.reduce((sum, row) => sum + centavos(row.gross), 0) !== total) {
      throw new Error("Dividend payable does not match the declaration.");
    }
    let cash = 0;
    let tax = 0;
    const payments = [];
    for (const allocation of record.allocations) {
      const holder = holders.find(row => row.id === allocation.holderId);
      if (!holder) throw new Error("A stockholder is missing from the register.");
      const rate = holder.type === "domestic" ? 0 : holder.type === "individual" ? policy.divWhtInd :
        holder.type === "nonresident" ? policy.divWhtNr : NaN;
      if (!Number.isFinite(rate) || rate < 0 || rate > 100) throw new Error("A stockholder has no supported withholding classification.");
      const gross = centavos(allocation.gross);
      const withheld = centavos(allocation.gross * rate / 100);
      let remainder = gross - withheld;
      const offsets = [];
      for (const sub of subs.filter(row => row.holderId === holder.id && !row.cancelled && row.callDue && row.callDue <= date)
        .sort((a, b) => a.callDue.localeCompare(b.callDue) || a.id.localeCompare(b.id))) {
        const delinquency = new Date(`${sub.callDue}T00:00:00Z`);
        delinquency.setUTCDate(delinquency.getUTCDate() + 30);
        if (delinquency.toISOString().slice(0, 10) >= date) continue;
        const amount = Math.min(remainder, Math.max(0, centavos(balance(entries, "3020", sub.id, date))));
        if (amount) {
          add("3020", 0, amount, sub.id);
          offsets.push({ subscription: sub.id, amount: amount / 100 });
          remainder -= amount;
        }
      }
      payments.push({ ...allocation, rate, withheld: withheld / 100, cash: remainder / 100, offsets });
      tax += withheld;
      cash += remainder;
    }
    if (cash > centavos(balance(entries, input.account, undefined, date))) throw new Error("Payment exceeds the cash account balance.");
    add("2300", total, 0, record.id);
    add(input.account, 0, cash);
    add("2200", 0, tax, id);
    data = { dividendId: record.id, payments, taxForm: tax ? "Dividend withholding" : null };
    record = { ...record, paidAt: date, paymentId: id };
    memo = "Cash dividend payment";
  }
  return { record, entry: { id, date, no: entries.reduce((max, row) => Math.max(max, row.no), 0) + 1,
    type: type === "declareDividend" ? "divdeclare" : "divpay", data, lines, memo } };
}
