import { balance, type Entry } from "./ledger.ts";

type Lot = { id: string; sym: string; acctType: string };
type Snapshot = {
  cash: Record<string, number | string | null>;
  units: Record<string, number | string | null>;
  snap: Record<string, number>;
  notes?: Record<string, string>;
};

export function reconciliationApprovalError(month: string, entries: readonly Entry[], lots: readonly Lot[], snapshot?: Snapshot) {
  if (!snapshot?.snap) return "Save a fresh draft before signing.";
  const lines = reconciliationLines(month, entries, lots, snapshot);
  if (lines.some(line => line.changed)) return "Ledger figures changed. Save a fresh draft before signing.";
  if (lines.some(line => line.statement === null || Math.abs(line.statement) > 1e12 ||
    Number(line.statement.toFixed(line.isCash ? 2 : 6)) !== line.statement ||
    (line.difference !== 0 && !line.note?.trim()))) {
    return "Complete all statement figures and explain every difference before signing.";
  }
  return null;
}

export function reconciliationLines(month: string, entries: readonly Entry[], lots: readonly Lot[], snapshot?: Snapshot) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) return [];
  const end = new Date(`${month}-01T00:00:00Z`);
  end.setUTCMonth(end.getUTCMonth() + 1, 0);
  const through = end.toISOString().slice(0, 10);
  const units = new Map<string, number>();
  const lotById = new Map(lots.map(lot => [lot.id, lot]));
  const entryById = new Map(entries.map(entry => [entry.id, entry]));
  const add = (sym: string, account: string, qty: number) => {
    const key = `${sym}|${account}`;
    units.set(key, (units.get(key) ?? 0) + qty);
  };
  for (const entry of entries) {
    if (entry.date > through) continue;
    const reverse = entry.type === "reversal";
    const source = reverse ? entryById.get(String(entry.data.reverses)) : entry;
    if (!source) continue;
    const { sym, acctType, qty, consumed } = source.data;
    const sign = reverse ? -1 : 1;
    if (source.type === "buy" && typeof sym === "string" && typeof acctType === "string" && typeof qty === "number") {
      add(sym, acctType, sign * qty);
    } else if (Array.isArray(consumed)) {
      for (const item of consumed) {
        const lot = lotById.get(item.lotId);
        if (lot && typeof item.qty === "number") add(lot.sym, lot.acctType, -sign * item.qty);
      }
    }
  }
  const cash = ["1000", "1010", "1020"];
  const keys = new Set([...cash, ...Object.keys(snapshot?.snap ?? {}), ...Object.keys(snapshot?.units ?? {}),
    ...Array.from(units).filter(([, qty]) => Number(qty.toFixed(6)) !== 0).map(([key]) => key).sort()]);
  return Array.from(keys, key => {
    const isCash = cash.includes(key);
    const current = isCash ? balance(entries, key, undefined, through) : Number((units.get(key) ?? 0).toFixed(6));
    const signed = snapshot?.snap[key];
    const raw = (isCash ? snapshot?.cash : snapshot?.units)?.[key];
    const statement = raw == null || String(raw).trim() === "" || !Number.isFinite(Number(raw)) ? null : Number(raw);
    const precision = isCash ? 2 : 6;
    return { key, isCash, current, signed, statement, note: snapshot?.notes?.[key],
      difference: statement == null ? null : Number((statement - current).toFixed(precision)),
      changed: Boolean(snapshot && (signed == null || Number((current - signed).toFixed(precision)) !== 0)) };
  });
}
