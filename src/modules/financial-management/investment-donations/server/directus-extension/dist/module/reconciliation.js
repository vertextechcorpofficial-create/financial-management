import { balance } from "./ledger.js";
export function reconciliationLines(month, entries, lots, snapshot) {
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month))
        return [];
    const end = new Date(`${month}-01T00:00:00Z`);
    end.setUTCMonth(end.getUTCMonth() + 1, 0);
    const through = end.toISOString().slice(0, 10);
    const units = new Map();
    const lotById = new Map(lots.map(lot => [lot.id, lot]));
    const entryById = new Map(entries.map(entry => [entry.id, entry]));
    const add = (sym, account, qty) => {
        const key = `${sym}|${account}`;
        units.set(key, (units.get(key) ?? 0) + qty);
    };
    for (const entry of entries) {
        if (entry.date > through)
            continue;
        const reverse = entry.type === "reversal";
        const source = reverse ? entryById.get(String(entry.data.reverses)) : entry;
        if (!source)
            continue;
        const { sym, acctType, qty, consumed } = source.data;
        const sign = reverse ? -1 : 1;
        if (source.type === "buy" && typeof sym === "string" && typeof acctType === "string" && typeof qty === "number") {
            add(sym, acctType, sign * qty);
        }
        else if (Array.isArray(consumed)) {
            for (const item of consumed) {
                const lot = lotById.get(item.lotId);
                if (lot && typeof item.qty === "number")
                    add(lot.sym, lot.acctType, -sign * item.qty);
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
