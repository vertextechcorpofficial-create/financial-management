"use client";

import * as React from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type {
  Brgy,
  BrgyAsset,
  BrgyCondition,
  BrgyCount,
  BrgyDisposal,
  BrgyHistoryEntry,
  BrgySettings,
  BrgyStatus,
  BrgyTransfer,
} from "../../types";
import { call } from "../../shared/ui";
import { officeYear } from "../../shared/dates";

/* ----------------------------------------------------------------- count */

export function CountTab({
  barangayId,
  lookups,
  setError,
  setNotice,
}: {
  barangayId: number;
  lookups?: { barangays: Brgy[] };
  setError: (v: string | null) => void;
  setNotice: (v: string | null) => void;
}) {
  const [counts, setCounts] = React.useState<BrgyCount[]>([]);
  const [openId, setOpenId] = React.useState<number | null>(null);
  const [yearFilter, setYearFilter] = React.useState("");
  const [statusFilter, setStatusFilter] = React.useState("");
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [newYear, setNewYear] = React.useState(String(officeYear()));
  const [dialogError, setDialogError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  const barangay = (lookups?.barangays ?? []).find((b) => b.id === barangayId) ?? null;
  const openCount = counts.find((c) => c.status === "open") ?? null;

  const load = React.useCallback(async () => {
    try {
      const data = await call("/counts?barangayId=" + barangayId);
      setCounts(data.counts ?? []);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [barangayId, setError]);

  React.useEffect(() => {
    void load();
  }, [load]);

  const years = React.useMemo(() => {
    const seen = new Set(counts.map((c) => String(c.year)));
    return Array.from(seen).sort((a, b) => Number(b) - Number(a));
  }, [counts]);

  // rule 94: a closed count is final, and one year is counted once. So every year that already has
  // a count is offered but not pickable, and the panel explains why instead of failing on submit.
  const countedStatus = React.useMemo(() => {
    const map = new Map<string, string>();
    for (const c of counts) map.set(String(c.year), c.status);
    return map;
  }, [counts]);

  const candidateYears = React.useMemo(() => {
    const thisYear = officeYear();
    const set = new Set<string>();
    for (let y = thisYear; y >= thisYear - 9; y -= 1) set.add(String(y));
    for (const c of counts) set.add(String(c.year));
    return Array.from(set).sort((a, b) => Number(b) - Number(a));
  }, [counts]);

  const freeYears = candidateYears.filter((y) => !countedStatus.has(y));
  const yearTaken = countedStatus.get(newYear) ?? null;
  const canOpenYear = freeYears.includes(newYear) && !busy;

  const visible = counts.filter((c) => {
    if (yearFilter && String(c.year) !== yearFilter) return false;
    if (statusFilter && c.status !== statusFilter) return false;
    return true;
  });

  async function createCount() {
    setBusy(true);
    setDialogError(null);
    try {
      const created = await call("/counts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ barangayId, year: Number(newYear) }),
      });
      setNotice("Count opened for " + created.year + ".");
      setError(null);
      setDialogOpen(false);
      await load();
      setOpenId(created.id);
    } catch (err) {
      setDialogError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="text-sm font-medium">Yearly physical count</div>
          <p className="text-sm text-muted-foreground">
            {barangay ? barangay.code + " " + barangay.name : "the selected barangay"} | one count per barangay at a time
            {openCount ? ", and " + openCount.year + " is still open" : ""}.
          </p>
        </div>
        <Button
          onClick={() => {
            setDialogError(null);
            setNewYear(freeYears[0] ?? String(officeYear()));
            setDialogOpen(true);
          }}
        >
          Open a new count
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <select
          className="h-9 rounded-md border bg-background px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
          value={yearFilter}
          onChange={(e) => setYearFilter(e.target.value)}
        >
          <option value="">any year</option>
          {years.map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </select>
        <select
          className="h-9 rounded-md border bg-background px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
        >
          <option value="">any status</option>
          <option value="open">open</option>
          <option value="closed">closed</option>
        </select>
        <Button
          size="sm"
          variant="ghost"
          disabled={!yearFilter && !statusFilter}
          onClick={() => {
            setYearFilter("");
            setStatusFilter("");
          }}
        >
          Clear
        </Button>
        <span className="text-xs text-muted-foreground">
          {visible.length} of {counts.length} count(s)
        </span>
      </div>

      {dialogOpen ? (
        <div className="rounded-md border bg-muted/20 p-3">
          <div className="flex flex-wrap items-end gap-2">
            <label className="grid gap-1 text-sm">
              <span className="text-muted-foreground">Year to count</span>
              <select
                className="h-9 rounded-md border bg-background px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
                value={newYear}
                onChange={(e) => setNewYear(e.target.value)}
              >
                {candidateYears.map((y) => {
                  const taken = countedStatus.get(y);
                  return (
                    <option
                      key={y}
                      value={y}
                      disabled={Boolean(taken)}
                      title={taken ? y + " already has an " + taken + " count, so it cannot be counted again" : y + " has no count yet"}
                    >
                      {y}
                      {taken ? " (" + taken + ")" : ""}
                    </option>
                  );
                })}
              </select>
            </label>
            <Button disabled={!canOpenYear} onClick={() => void createCount()}>
              {busy ? "Opening..." : "Open this count"}
            </Button>
            <Button variant="ghost" disabled={busy} onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            {openCount ? (
              <Button
                variant="outline"
                disabled={busy}
                onClick={() => {
                  setDialogOpen(false);
                  setOpenId(openCount.id);
                }}
              >
                Go to the open {openCount.year} count
              </Button>
            ) : null}
          </div>
          {yearTaken ? (
            <p className="mt-2 text-xs text-muted-foreground">
              {newYear} already has an {yearTaken} count. A year is counted once, and a closed count cannot be changed.{" "}
              {openCount && String(openCount.year) !== newYear ? "Close " + openCount.year + " before opening another year." : ""}
            </p>
          ) : null}
          {freeYears.length === 0 ? (
            <p className="mt-2 text-xs text-muted-foreground">
              Every year in the list already has a count. Nothing to open until a later year.
            </p>
          ) : null}
          {dialogError ? <p className="mt-2 text-sm text-destructive">{dialogError}</p> : null}
        </div>
      ) : null}

      <div className="rounded-md border">
        <table className="w-full text-sm">
          <thead className="sticky top-0 z-10 bg-background">
            <tr className="border-b bg-muted/40 text-left">
              <th className="p-2">Year</th>
              <th className="p-2">Status</th>
              <th className="p-2">Opened by</th>
              <th className="p-2">Closed by</th>
              <th className="p-2" />
            </tr>
          </thead>
          <tbody>
            {visible.map((c) => (
              <tr key={c.id} className="border-b last:border-0">
                <td className="p-2">{c.year}</td>
                <td className="p-2">
                  <Badge variant={c.status === "open" ? "default" : "outline"}>{c.status}</Badge>
                </td>
                <td className="p-2">{c.opened_by ?? ""}</td>
                <td className="p-2">{c.closed_by ?? ""}</td>
                <td className="p-2 text-right">
                  <Button size="sm" variant={openId === c.id ? "secondary" : "ghost"} onClick={() => setOpenId(c.id)}>
                    {openId === c.id ? "Shown below" : "Open"}
                  </Button>
                </td>
              </tr>
            ))}
            {visible.length === 0 ? (
              <tr>
                <td colSpan={5} className="p-6 text-center text-sm text-muted-foreground">
                  {counts.length === 0 ? "No count has been opened for this barangay yet." : "No count matches these filters."}
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      {openId ? <CountSheet countId={openId} onClose={() => setOpenId(null)} setError={setError} onChanged={load} /> : null}
    </div>
  );
}

function CountSheet({ countId, onClose, setError, onChanged }: { countId: number; onClose: () => void; setError: (v: string | null) => void; onChanged: () => Promise<void> | void }) {
  const [detail, setDetail] = React.useState<{
    count: BrgyCount;
    expected: { line: { asset_id: number | null; result: string; condition: BrgyCondition | null }; asset: BrgyAsset | null }[];
    summary: { expected: number; found: number; notFound: number; notYetRecorded: number; pending: number };
    closed: boolean;
  } | null>(null);
  const [unrecordedName, setUnrecordedName] = React.useState("");
  const [scanValue, setScanValue] = React.useState("");
  const [scanMiss, setScanMiss] = React.useState<string | null>(null);

  /** Section 4.7: scanning the barcode or tag speeds the count up. */
  async function scanOne() {
    const needle = scanValue.trim().toLowerCase();
    if (!needle || !detail) return;
    const hit = detail.expected.find(({ asset }) => {
      if (!asset) return false;
      return [asset.asset_code, asset.barcode, asset.tag_no, asset.security_tag, asset.serial_no]
        .filter(Boolean)
        .some((code) => String(code).toLowerCase() === needle);
    });
    if (!hit?.asset) {
      setScanMiss("No asset in this count matches " + scanValue.trim());
      return;
    }
    setScanMiss(null);
    setScanValue("");
    await act({ action: "mark", assetId: hit.asset.id, result: "found" });
  }

  const load = React.useCallback(async () => {
    try {
      setDetail((await call("/counts/" + countId)) as never);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [countId, setError]);

  React.useEffect(() => {
    void load();
  }, [load]);

  async function act(body: Record<string, unknown>) {
    try {
      setError(null);
      await call("/counts/" + countId + "/actions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      // the action returns one line, not the sheet: reload so the summary and the rows agree
      await load();
      await onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  if (!detail) return <p className="text-sm text-muted-foreground">Loading count...</p>;

  return (
    <div className="flex flex-col gap-2 rounded-md border p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-sm">
          <span className="font-medium">{detail.count.year} count</span> | {detail.summary.found} found | {detail.summary.notFound} not found |{" "}
          {detail.summary.pending} pending | {detail.summary.notYetRecorded} not yet recorded
        </div>
        <div className="flex items-center gap-2">
          {detail.closed ? <Badge variant="outline">closed</Badge> : (
            <Button size="sm" onClick={() => void act({ action: "close" })}>Close count</Button>
          )}
          <Button size="sm" variant="ghost" onClick={onClose}>Hide</Button>
        </div>
      </div>

      {!detail.closed ? (
        <>
        <div className="flex flex-wrap items-center gap-2 rounded border bg-muted/30 p-2">
          <Input
            className="max-w-xs"
            placeholder="Scan or type a barcode, tag or asset ID"
            value={scanValue}
            onChange={(e) => setScanValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void scanOne();
              }
            }}
          />
          <Button size="sm" onClick={() => void scanOne()} disabled={!scanValue.trim()}>
            Mark found
          </Button>
          {scanMiss ? <span className="text-xs text-destructive">{scanMiss}</span> : null}
        </div>

        <div className="flex flex-wrap items-center gap-2 rounded border bg-muted/30 p-2">
          <Input className="max-w-xs" placeholder="Item found but not on the list" value={unrecordedName} onChange={(e) => setUnrecordedName(e.target.value)} />
          <Button
            size="sm"
            variant="outline"
            onClick={async () => {
              await act({ action: "unrecorded", name: unrecordedName });
              setUnrecordedName("");
            }}
          >
            Note as not yet recorded
          </Button>
        </div>
        </>
      ) : null}

      <div className="max-h-[420px] overflow-y-auto rounded border">
        <table className="w-full text-sm">
          <tbody>
            {detail.expected.map(({ line, asset }, index) => (
              <tr key={asset ? asset.asset_code : "unrecorded-" + index} className="border-b last:border-0">
                <td className="p-2 font-mono text-xs">{asset?.asset_code}</td>
                <td className="p-2">{asset?.name}</td>
                <td className="p-2">{line.result === "found" ? "found" : line.result === "not_found" ? "not found" : "pending"}</td>
                <td className="p-2 text-right">
                  {detail.closed ? null : (
                    <span className="flex justify-end gap-1">
                      <Button size="sm" variant="outline" disabled={!asset} onClick={() => asset && void act({ action: "mark", assetId: asset.id, result: "found" })}>Found</Button>
                      <Button size="sm" variant="ghost" disabled={!asset} onClick={() => asset && void act({ action: "mark", assetId: asset.id, result: "not_found" })}>Not found</Button>
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

