import { balance, centavos, fiscalDates, type Entry, type Line } from "./ledger";

export type Trade = {
  type: "buy" | "sell" | "gift"; date: string; sym: string; acctType: "Taxable" | "PERA";
  account: string; qty: number; price: number; fees: number; memo: string; picks?: { lotId: string; qty: number }[];
};
type Security = { sym: string; cls: string; taxClass: string; inactive?: boolean };
type Lot = { id: string; sym: string; acctType: string; date: string; qty: number;
  openQty: number; cost: number; seq: number; txnId: string; openCost?: number };
const investments: Record<string, string> = { dom: "1100", intl: "1110", fi: "1120", cash: "1130", alt: "1140" };
const units = (qty: number) => {
  const scaled = Math.round(qty * 1e6);
  if (!Number.isSafeInteger(scaled) || scaled < 0 || scaled / 1e6 !== qty) throw new Error("Enter units with up to six decimal places.");
  return scaled;
};

export function cgtBalance(entries: readonly Entry[], from: string, to: string, rate: number) {
  if (!Number.isFinite(rate) || rate < 0 || rate > 100) throw new Error("Invalid capital gains tax rate.");
  const sales = entries.filter(row => row.type === "sell" && row.data.taxClass === "unlisted" &&
    row.data.acctType === "Taxable" && row.date >= from && row.date <= to);
  const gain = sales.reduce((sum, row) => sum + centavos(Number(row.data.gain)), 0);
  const booked = centavos(balance(entries.filter(row => row.data.cgtFiscalStart === from), "5320"));
  return { gain, booked, due: centavos(Math.max(0, gain / 100) * rate / 100) };
}

export function buildTrade(entries: readonly Entry[], closed: readonly string[], securities: Record<string, Security>,
  lots: readonly Lot[], trade: Trade, id: string, policy: { sttRate: number; sttRateOld: number; fyStart: number; cgtUnlisted: number }) {
  const { date, type, sym, acctType, account, qty, price, fees, memo } = trade;
  if (closed.includes(date.slice(0, 7))) throw new Error("This month is closed.");
  if (entries.some(entry => entry.date > date)) throw new Error("Use a date on or after the latest journal entry.");
  const security = Object.hasOwn(securities, sym) ? securities[sym] : undefined;
  if (!security || security.inactive || security.sym !== sym || !Object.hasOwn(investments, security.cls)) throw new Error("Select an active security.");
  if (!["listed", "fund", "govsec", "unlisted"].includes(security.taxClass)) throw new Error("Select a security with a known tax class.");
  if (!["1000", "1010", "1020"].includes(account) || !["Taxable", "PERA"].includes(acctType)) throw new Error("Select an account.");
  if (security.taxClass === "unlisted" && acctType !== "Taxable") throw new Error("Select a taxable account for unlisted shares.");
  const requested = units(qty);
  if (!requested || !Number.isFinite(price) || price <= 0 || !Number.isFinite(fees) || fees < 0 ||
    centavos(fees) / 100 !== fees || qty * price > 1e12) throw new Error("Enter a valid quantity, price, and trading cost.");
  const gross = centavos(qty * price);
  if (!gross) throw new Error("Enter a trade worth at least one centavo.");
  const charge = centavos(fees);
  const acct = investments[security.cls];
  const no = entries.reduce((max, row) => Math.max(max, row.no), 0) + 1;
  const nextLots = lots.map(lot => ({ ...lot }));
  const lines: Line[] = [];
  const add = (code: string, debit: number, credit: number, tag = "") => {
    if (debit || credit) lines.push({ acct: code, dr: debit / 100, cr: credit / 100, tag });
  };
  const data: Record<string, unknown> = { sym, acctType, qty, price, fees, taxClass: security.taxClass };
  if (type === "buy") {
    const cost = gross + charge;
    if (cost > centavos(balance(entries, account, undefined, date))) throw new Error("Payment exceeds the cash account balance.");
    add(acct, cost, 0, sym);
    add(account, 0, cost);
    nextLots.push({ id, sym, acctType, date, qty, openQty: qty, cost: cost / 100, openCost: cost / 100, seq: no, txnId: id });
    data.lotId = id;
  } else {
    const eligible = nextLots.filter(lot => lot.sym === sym && lot.acctType === acctType && lot.date <= date && lot.openQty > 0)
      .sort((a, b) => a.date.localeCompare(b.date) || a.seq - b.seq || a.id.localeCompare(b.id));
    let left = requested, cost = 0;
    const consumed: { lotId: string; qty: number; cost: number }[] = [];
    const seen = new Set<string>();
    const take = (lot: Lot, amount: number) => {
      const open = units(lot.openQty);
      if (amount < 1 || amount > open || amount > left || seen.has(lot.id)) throw new Error("Lot quantities exceed the units available or requested.");
      seen.add(lot.id);
      const oldCost = centavos(lot.openCost ?? lot.cost * lot.openQty / lot.qty);
      if (oldCost < 0) throw new Error("The lot has an invalid cost basis.");
      const newCost = amount === open ? 0 : Math.round(oldCost * ((open - amount) / open));
      const used = oldCost - newCost;
      lot.openQty = (open - amount) / 1e6;
      lot.openCost = newCost / 100;
      cost += used;
      left -= amount;
      consumed.push({ lotId: lot.id, qty: amount / 1e6, cost: used / 100 });
    };
    if (trade.picks?.length) {
      for (const pick of trade.picks) {
        const lot = eligible.find(row => row.id === pick.lotId);
        if (!lot) throw new Error("Choose lots in the selected security and account that exist on the trade date.");
        take(lot, units(pick.qty));
      }
    } else {
      for (const lot of eligible) {
        if (!left) break;
        take(lot, Math.min(left, units(lot.openQty)));
      }
    }
    if (left) throw new Error("Selected lots must cover exactly the number of units sold.");
    if (cost > centavos(balance(entries, acct, sym, date))) throw new Error("The selected lot cost does not match available ledger cost.");
    if (type === "gift") {
      if (acctType !== "Taxable") throw new Error("Only taxable-account securities can be gifted here.");
      add(acct, 0, cost, sym);
      add("4110", Math.max(0, cost - gross), Math.max(0, gross - cost), sym);
      return { entry: { id, no, date, type: "donation", memo, lines, data: { ...data, consumed } },
        lots: nextLots, gift: { fairValue: gross / 100, cost: cost / 100 } };
    }
    const rate = date < "2025-07-01" ? policy.sttRateOld : policy.sttRate;
    if (!Number.isFinite(rate) || rate < 0 || rate > 100) throw new Error("Invalid stock transaction tax policy.");
    const stt = acctType === "Taxable" && security.taxClass === "listed" ? centavos(gross / 100 * rate / 100) : 0;
    const proceeds = gross - charge - stt;
    if (proceeds < 0) throw new Error("Trading costs and tax exceed the sale proceeds.");
    const gain = gross - charge - cost;
    add(account, proceeds, 0);
    add("5310", stt, 0);
    add(acct, 0, cost, sym);
    add("4100", Math.max(0, -gain), Math.max(0, gain));
    if (security.taxClass === "unlisted") {
      const fy = fiscalDates(date, policy.fyStart);
      const previous = cgtBalance(entries, fy.from, date, policy.cgtUnlisted);
      const cgt = Math.max(0, centavos(Math.max(0, (previous.gain + gain) / 100) * policy.cgtUnlisted / 100) - previous.booked);
      const due = new Date(`${date}T00:00:00Z`);
      due.setUTCDate(due.getUTCDate() + 30);
      add("5320", cgt, 0, id);
      add("2200", 0, cgt, id);
      Object.assign(data, { cgtFiscalStart: fy.from, cgt: cgt / 100, taxForm: "1707", taxDue: due.toISOString().slice(0, 10) });
    }
    Object.assign(data, { consumed, stt: stt / 100, gain: gain / 100, method: trade.picks?.length ? "specific" : "fifo" });
  }
  const entry: Entry = { id, no, date, type, memo: memo.trim() || `${type === "buy" ? "Purchase" : "Sale"} · ${sym}`, lines, data };
  return { entry, lots: nextLots };
}
