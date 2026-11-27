import { balance, centavos } from "../ledger.ts";
import { dependencyEntries, assertFutureBalances } from "../financial-engine.mjs";

export function reverseFinancialEntry({ entries, original, input, id, registers }) {
  if (!original || ["reversal", "closing", "taxtrueup", "taxadj"].includes(original.type) || original.data.periodClose || original.data.reverses ||
      entries.some(row => row.data.reverses === original.id)) throw new Error("This entry is not eligible for reversal. Reopen year-end closes; tax true-ups recalculate automatically.");
  if (input.date < original.date) throw new Error("Enter a reversal date on or after the original entry.");
  const active = dependencyEntries(entries, input.date).filter(row => row.id !== original.id);
  const changes = {};
  const dependent = (account, tag, side) => active.some(row => (row.date > original.date || row.date === original.date && row.no > original.no) &&
    row.lines.some(line => line.acct === account && line.tag === tag && line[side] > 0));
  const subId = original.data.subId;
  const dividendId = original.data.dividendId ?? original.data.divId;
  if (original.type === "subscribe") {
    if (active.some(row => row.data.subId === subId || row.lines.some(line => line.acct === "3020" && line.tag === subId)) ||
        registers.certs.some(row => row.subId === subId && (!row.voidedAt || row.voidedAt > input.date)) ||
        registers.dividends.some(row => (!row.cancelled || row.cancelledAt > input.date) && row.date >= original.date)) {
      throw new Error("Reverse the subscription's payments, certificates and dependent dividend declarations first.");
    }
    changes.subs = registers.subs.map(row => row.id === subId ? { ...row, cancelled: true, cancelledAt: input.date } : row);
  }
  if (original.type === "issue") {
    const cert = registers.certs.find(row => row.txnId === original.id);
    if (!cert || cert.cancelledAt || (cert.history ?? []).some(event => event.date > input.date)) throw new Error("Void the certificate's later transfers before reversing its issue.");
    changes.certs = registers.certs.map(row => row.id === cert.id ? { ...row, voidedAt: input.date } : row);
    changes.subs = registers.subs.map(row => row.id === subId ? { ...row, issuedAt: null, certNo: "" } : row);
  }
  if (original.type === "subcollect" || original.type === "divpay") {
    const subscriptions = new Set(original.lines.filter(line => line.acct === "3020" && line.cr).map(line => line.tag));
    if (registers.certs.some(row => subscriptions.has(row.subId) && (!row.voidedAt || row.voidedAt > input.date))) throw new Error("Reverse certificates issued after these subscription payments first.");
  }
  if (original.type === "divdeclare") {
    const dividend = registers.dividends.find(row => row.id === dividendId);
    if (!dividend || dividend.paidAt || active.some(row => (row.data.dividendId ?? row.data.divId) === dividendId)) throw new Error("Reverse the dividend payment first.");
    changes.dividends = registers.dividends.map(row => row.id === dividendId ? { ...row, cancelled: true, cancelledAt: input.date } : row);
  }
  if (original.type === "divpay") {
    changes.dividends = registers.dividends.map(row => row.id === dividendId ? { ...row, paidAt: null, paymentId: null } : row);
  }
  if (original.type === "debt" && original.data.newDebt !== false) {
    if (active.some(row => row.lines.some(line => ["2000", "2100", "5200"].includes(line.acct) && line.tag === original.data.debtId))) {
      throw new Error("Reverse dependent loan payments, borrowings and interest accruals first.");
    }
    changes.debts = registers.debts.map(row => row.id === original.data.debtId ? { ...row, cancelled: true, cancelledAt: input.date } : row);
  }
  for (const line of original.lines) {
    if (line.dr && ["1200", "1210"].includes(line.acct) && dependent(line.acct, line.tag, "cr")) {
      throw new Error("Reverse dependent income collections first.");
    }
    if (line.cr && ["2110", "2100"].includes(line.acct) && dependent(line.acct, line.tag, "dr")) {
      throw new Error("Reverse dependent payable or loan payments first.");
    }
    if (line.cr && line.acct === "2200" && !["sell", "donation"].includes(original.type) && dependent("2200", line.tag, "dr")) {
      throw new Error("Reverse the dependent tax payment first.");
    }
  }
  let lots;
  if (original.type === "buy" || original.data.consumed) {
    lots = registers.lots.map(row => ({ ...row }));
    if (original.type === "buy") {
      const lot = lots.find(row => row.id === original.data.lotId);
      if (!lot || Number(lot.openQty.toFixed(6)) !== Number(lot.qty.toFixed(6)) ||
          active.some(row => row.data.consumed?.some(use => use.lotId === lot.id))) throw new Error("Units from this purchase were sold or donated. Reverse those entries first.");
      lot.openQty = 0;
      lot.openCost = 0;
      lot.reversed = true;
    } else {
      for (const use of original.data.consumed) {
        const lot = lots.find(row => row.id === use.lotId);
        if (!lot || lot.reversed || !Number.isFinite(use.qty) || use.qty <= 0 || !Number.isFinite(use.cost) || use.cost < 0) throw new Error("The consumed lot cannot be restored.");
        const qty = Math.round((lot.openQty + use.qty) * 1e6) / 1e6;
        const cost = centavos(lot.openCost ?? lot.cost * lot.openQty / lot.qty) + centavos(use.cost);
        if (qty > lot.qty || cost > centavos(lot.cost)) throw new Error("The restored lot would exceed its original units or cost.");
        lot.openQty = qty;
        lot.openCost = cost / 100;
      }
    }
  }
  const lines = original.lines.map(line => ({ ...line, dr: line.cr, cr: line.dr }));
  // Paid tax cannot be debited out of a settled payable; it becomes a credit/refund claim.
  if (["sell", "donation"].includes(original.type)) {
    for (const line of lines.filter(row => row.acct === "2200" && row.dr)) {
      const paid = centavos(line.dr) - Math.min(centavos(line.dr), Math.max(0, -centavos(balance(entries, "2200", line.tag, input.date))));
      if (paid > 0) {
        line.dr = (centavos(line.dr) - paid) / 100;
        lines.push({ acct: "1220", dr: paid / 100, cr: 0, tag: line.tag });
      }
    }
  }
  const entry = { id, no: entries.reduce((max, row) => Math.max(max, row.no), 0) + 1, date: input.date, type: "reversal",
    memo: `Reversal of JE-${original.no}: ${input.reason.trim()}`, data: { reverses: original.id,
      ...(original.data.taxYear ? { taxYear: original.data.taxYear } : {}),
      ...(original.data.cgtFiscalStart ? { cgtFiscalStart: original.data.cgtFiscalStart } : {}),
      ...(original.data.consumed ? { restored: original.data.consumed } : {}),
      ...(original.data.debtId ? { debtId: original.data.debtId } : {}),
    }, lines: lines.filter(row => row.dr || row.cr) };
  assertFutureBalances(entries, entry);
  return { entry, registers: changes, lots };
}
