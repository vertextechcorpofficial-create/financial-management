"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { CountLineRow, LguOffice } from "../../types";
import { SearchableSelect } from "../../registry/components/SearchableSelect";

interface ReconcilePanelProps {
  rows: CountLineRow[];
  offices: LguOffice[];
  busy: boolean;
  locked: boolean;
  onResolve: (payload: {
    lineId: number;
    resolution: "missing" | "moved" | "station";
    toOfficeId?: number | null;
    toOfficer?: string | null;
    locationSeen?: string | null;
    remarks?: string | null;
    stationDescription?: string | null;
    stationLocation?: string | null;
    stationCost?: number | null;
    approvedBy?: string | null;
  }) => Promise<void>;
}

export function ReconcilePanel({ rows, offices, busy, locked, onResolve }: ReconcilePanelProps) {
  const [target, setTarget] = React.useState<CountLineRow | null>(null);
  const [mode, setMode] = React.useState<"missing" | "moved" | "station">("missing");
  const [stationDescription, setStationDescription] = React.useState("");
  const [stationLocation, setStationLocation] = React.useState("");
  const [stationCost, setStationCost] = React.useState("");
  const [approvedBy, setApprovedBy] = React.useState("");
  const [toOfficeId, setToOfficeId] = React.useState("");
  const [toOfficer, setToOfficer] = React.useState("");
  const [locationSeen, setLocationSeen] = React.useState("");
  const [remarks, setRemarks] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);

  const pending = rows.filter((row) => row.line.found === false && row.line.resolution === "pending");
  const resolved = rows.filter(
    (row) => row.line.resolution !== "pending" && (row.line.found === false || row.line.is_found_at_station)
  );
  const officeOptions = offices.map((o) => ({ label: o.name, value: String(o.id) }));

  function open(row: CountLineRow, nextMode: "missing" | "moved" | "station") {
    setTarget(row);
    setMode(nextMode);
    setToOfficeId("");
    setToOfficer(row.line.expected_officer ?? "");
    setLocationSeen("");
    setRemarks("");
    setStationDescription("");
    setStationLocation("");
    setStationCost(row.asset?.cost ? String(row.asset.cost) : "");
    setApprovedBy("");
    setError(null);
  }

  async function submit() {
    if (!target) return;
    setError(null);
    if (mode === "moved" && !toOfficeId) return setError("Say which office it was actually found in");
    if (mode === "station" && !stationDescription.trim()) return setError("Say which station it was found at");
    if (mode === "station" && !(Number(stationCost) > 0)) {
      return setError("Give the value of the property at that station");
    }
    try {
      await onResolve({
        lineId: target.line.id,
        resolution: mode,
        toOfficeId: mode === "moved" ? Number(toOfficeId) : null,
        toOfficer: toOfficer.trim() || null,
        locationSeen: locationSeen.trim() || null,
        remarks: remarks.trim() || null,
        stationDescription: mode === "station" ? stationDescription.trim() : null,
        stationLocation: mode === "station" ? stationLocation.trim() || null : null,
        stationCost: mode === "station" ? Number(stationCost || 0) : null,
        approvedBy: mode === "station" ? approvedBy.trim() || null : null,
      });
      setTarget(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="text-base font-semibold">Waiting for a decision</h2>
        <p className="text-sm text-muted-foreground">
          A line marked not found must be resolved before the session can lock. Nothing on the register changes until then.
        </p>
      </div>

      <div className="rounded-lg border">
        {pending.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground">
            Nothing is waiting. Every line is either found or already resolved.
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Property No.</TableHead>
                <TableHead>Description</TableHead>
                <TableHead>Expected officer</TableHead>
                <TableHead>Found at</TableHead>
                <TableHead className="text-right">Decision</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pending.map((row) => (
                <TableRow key={row.line.id}>
                  <TableCell className="font-mono text-xs">{row.line.expected_property_no ?? row.asset?.property_no ?? "-"}</TableCell>
                  <TableCell className="text-sm">{row.line.expected_description ?? row.asset?.description ?? "-"}</TableCell>
                  <TableCell className="text-sm">{row.line.expected_officer ?? "unassigned"}</TableCell>
                  <TableCell className="text-sm">{row.line.location_seen ?? "-"}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex flex-wrap justify-end gap-2">
                      <Button size="sm" variant="outline" disabled={busy || locked} onClick={() => open(row, "moved")}>
                        It exists elsewhere
                      </Button>
                      <Button size="sm" variant="secondary" disabled={busy || locked} onClick={() => open(row, "station")}>
                        Found at another station
                      </Button>
                      <Button size="sm" variant="destructive" disabled={busy || locked} onClick={() => open(row, "missing")}>
                        Confirm missing
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      <div>
        <h2 className="text-base font-semibold">Already decided</h2>
        {resolved.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">
            Nothing decided yet. A decision made here stays listed with where the asset was found.
          </p>
        ) : null}
        {resolved.length > 0 ? (
          <div className="mt-2 rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Property No.</TableHead>
                  <TableHead>Decision</TableHead>
                  <TableHead>Remarks</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {resolved.map((row) => (
                  <TableRow key={row.line.id}>
                    <TableCell className="font-mono text-xs">{row.line.expected_property_no ?? row.asset?.property_no ?? "-"}</TableCell>
                    <TableCell className="text-sm">
                      {row.line.resolution === "missing"
                        ? "Confirmed missing"
                        : row.line.resolution === "station"
                          ? "Found at " + (row.line.station_description ?? "another station")
                          : "Found elsewhere"}
                    </TableCell>
                    <TableCell className="text-sm">
                      {row.line.resolution === "station"
                        ? [
                            row.line.station_location,
                            row.line.station_cost ? "value PHP " + Number(row.line.station_cost).toLocaleString("en-PH", { minimumFractionDigits: 2 }) : null,
                            row.line.approved_by ? "approved by " + row.line.approved_by : null,
                            row.line.remarks,
                          ]
                            .filter(Boolean)
                            .join(", ")
                        : row.line.remarks ?? "-"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ) : null}
      </div>

      <Dialog open={Boolean(target)} onOpenChange={(next) => (!next ? setTarget(null) : undefined)}>
        <DialogContent className="flex flex-col gap-0 overflow-hidden p-0 max-h-[90vh] sm:max-w-xl">
          <DialogHeader className="shrink-0 px-6 pt-6 pb-2">
            <DialogTitle>
              {mode === "missing"
                ? "Confirm this asset as missing"
                : mode === "station"
                  ? "Record that it was found at another station"
                  : "Record where it actually is"}
            </DialogTitle>
            <DialogDescription>
              {target?.asset?.property_no ?? ""} {target?.asset?.description ?? ""}
            </DialogDescription>
          </DialogHeader>

          <div className="grid min-h-0 flex-1 gap-4 overflow-y-auto px-6 pb-2">
            {mode === "station" ? (
              <>
                <div className="grid gap-2">
                  <Label>Station where it was found</Label>
                  <Input
                    value={stationDescription}
                    onChange={(e) => setStationDescription(e.target.value)}
                    placeholder="For example, Barangay Matalava road project"
                  />
                </div>
                <div className="grid gap-2">
                  <Label>Exact location</Label>
                  <Input
                    value={stationLocation}
                    onChange={(e) => setStationLocation(e.target.value)}
                    placeholder="Site, room, or officer holding it there"
                  />
                </div>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="grid gap-2">
                    <Label>Value at the station</Label>
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      value={stationCost}
                      onChange={(e) => setStationCost(e.target.value)}
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label>Approved by</Label>
                    <Input
                      value={approvedBy}
                      onChange={(e) => setApprovedBy(e.target.value)}
                      placeholder="Officer who verified it there"
                    />
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">
                  COA Circular 2020-006. The asset counts as found and stops being a shortage for the accountable officer.
                  The register is not moved here. Use Custody to transfer it to the officer who now holds it.
                </p>
              </>
            ) : mode === "moved" ? (
              <>
                <div className="grid gap-2">
                  <Label>Office where it was found</Label>
                  <SearchableSelect options={officeOptions} value={toOfficeId} onChange={setToOfficeId} placeholder="Select office" />
                </div>
                <div className="grid gap-2">
                  <Label>Holder, if known</Label>
                  <Input value={toOfficer} onChange={(e) => setToOfficer(e.target.value)} />
                </div>
                <div className="grid gap-2">
                  <Label>Exact location</Label>
                  <Input value={locationSeen} onChange={(e) => setLocationSeen(e.target.value)} placeholder="Room, floor, building" />
                </div>
                <p className="text-xs text-muted-foreground">
                  This records a transfer in custody and moves the asset to that office. The PAR or ICS number can be attached later in Custody.
                </p>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">
                The asset stays on the register but is marked missing when the session is locked. Nothing is deleted.
              </p>
            )}

            <div className="grid gap-2">
              <Label>Remarks</Label>
              <Input value={remarks} onChange={(e) => setRemarks(e.target.value)} placeholder="What the committee observed" />
            </div>

            {error ? (
              <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">{error}</div>
            ) : null}
          </div>

          <DialogFooter className="shrink-0 border-t bg-background px-6 py-4">
            <Button variant="outline" onClick={() => setTarget(null)} disabled={busy}>
              Cancel
            </Button>
            <Button onClick={() => void submit()} disabled={busy}>
              {busy
                ? "Saving..."
                : mode === "missing"
                  ? "Confirm missing"
                  : mode === "station"
                    ? "Record station"
                    : "Record transfer"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
