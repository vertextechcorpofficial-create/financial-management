"use client";

import * as React from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type {
  Brgy,
  BrgyAsset,
  BrgyClassification,
  BrgyCondition,
  BrgyCount,
  BrgyCustodian,
  BrgyDisposal,
  BrgyHistoryEntry,
  BrgyOffice,
  BrgySettings,
  BrgyStatus,
  BrgyTransfer,
} from "./types";
import { BRGY_CONDITIONS, BRGY_STATUSES, projectedTotal, projectedValue } from "./types";

const API = "/api/fm/barangay-asset-inventory-system";
const TABS = ["Assets", "Custody", "Physical count", "Disposal", "Transfers", "Reports", "Settings"] as const;
type Tab = (typeof TABS)[number];

const peso = (n: number) => "PHP " + n.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const today = () => new Date().toISOString().slice(0, 10);

interface Lookups {
  barangays: Brgy[];
  classifications: BrgyClassification[];
  offices: BrgyOffice[];
  custodians: BrgyCustodian[];
  settings: BrgySettings | null;
}

async function call(path: string, init?: RequestInit) {
  const res = await fetch(API + path, init);
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new Error((body && body.message) || "Request failed");
  return body;
}

export function BarangayAssetModule() {
  const [tab, setTab] = React.useState<Tab>("Assets");
  const [lookups, setLookups] = React.useState<Lookups | null>(null);
  const [barangayId, setBarangayId] = React.useState<number | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [notice, setNotice] = React.useState<string | null>(null);

  React.useEffect(() => {
    void (async () => {
      try {
        const data = (await call("/lookups")) as Lookups;
        setLookups(data);
        if (data.barangays.length && barangayId === null) setBarangayId(data.barangays[0].id);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  React.useEffect(() => {
    if (!barangayId) return;
    void (async () => {
      try {
        const data = (await call("/lookups?barangayId=" + barangayId)) as Lookups;
        setLookups(data);
      } catch {
        /* keep the previous lookups */
      }
    })();
  }, [barangayId]);

  const settings = lookups?.settings ?? null;

  return (
    <div className="flex flex-col gap-4 p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Barangay Asset Inventory</h1>
          <p className="text-sm text-muted-foreground">
            Barangay property, custody, yearly count, disposal and reports. Values follow the barangay guide.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-sm text-muted-foreground" htmlFor="barangay">
            Barangay
          </label>
          <select
            id="barangay"
            className="h-9 rounded-md border bg-background px-3 text-sm"
            value={barangayId ?? ""}
            onChange={(e) => setBarangayId(Number(e.target.value))}
          >
            {(lookups?.barangays ?? []).map((b) => (
              <option key={b.id} value={b.id}>
                {b.code} {b.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {TABS.map((t) => (
          <Button key={t} size="sm" variant={tab === t ? "default" : "outline"} onClick={() => setTab(t)}>
            {t}
          </Button>
        ))}
      </div>

      {error ? (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">{error}</div>
      ) : null}
      {notice ? <div className="rounded-md border bg-muted/40 p-3 text-sm">{notice}</div> : null}

      {!barangayId || !lookups ? (
        <p className="text-sm text-muted-foreground">Loading barangay data...</p>
      ) : tab === "Assets" ? (
        <AssetsTab barangayId={barangayId} lookups={lookups} settings={settings} setError={setError} setNotice={setNotice} />
      ) : tab === "Custody" ? (
        <CustodyTab barangayId={barangayId} lookups={lookups} settings={settings} setError={setError} setNotice={setNotice} />
      ) : tab === "Physical count" ? (
        <CountTab barangayId={barangayId} setError={setError} setNotice={setNotice} />
      ) : tab === "Disposal" ? (
        <DisposalTab barangayId={barangayId} setError={setError} setNotice={setNotice} />
      ) : tab === "Transfers" ? (
        <TransfersTab barangayId={barangayId} lookups={lookups} setError={setError} setNotice={setNotice} />
      ) : tab === "Reports" ? (
        <ReportsTab barangayId={barangayId} setError={setError} />
      ) : (
        <SettingsTab settings={settings} setError={setError} setNotice={setNotice} />
      )}
    </div>
  );
}

/* ---------------------------------------------------------------- assets */

function AssetsTab({
  barangayId,
  lookups,
  settings,
  setError,
  setNotice,
}: {
  barangayId: number;
  lookups: Lookups;
  settings: BrgySettings | null;
  setError: (v: string | null) => void;
  setNotice: (v: string | null) => void;
}) {
  const [rows, setRows] = React.useState<BrgyAsset[]>([]);
  const [total, setTotal] = React.useState(0);
  const [q, setQ] = React.useState("");
  const [status, setStatus] = React.useState("all");
  const [condition, setCondition] = React.useState("all");
  const [loading, setLoading] = React.useState(false);
  const [addOpen, setAddOpen] = React.useState(false);
  const [detail, setDetail] = React.useState<{ asset: BrgyAsset; history: BrgyHistoryEntry[]; projected: number; projectedTotalValue: number } | null>(null);
  const salvage = settings?.salvage_percent ?? 0;

  const load = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ barangayId: String(barangayId), q, status, condition, pageSize: "100" });
      const data = await call("/assets?" + params);
      setRows(data.assets ?? []);
      setTotal(data.total ?? 0);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [barangayId, q, status, condition, setError]);

  React.useEffect(() => {
    void load();
  }, [load]);

  async function openDetail(asset: BrgyAsset) {
    try {
      setDetail((await call("/assets/" + asset.id)) as never);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  const custodianName = (id: number | null) => lookups.custodians.find((c) => c.id === id)?.full_name ?? "unassigned";
  const officeName = (id: number | null) => lookups.offices.find((o) => o.id === id)?.name ?? "";

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, code, barcode, serial..." className="w-full max-w-sm" />
        <select className="h-9 rounded-md border bg-background px-3 text-sm" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="all">Any status</option>
          {BRGY_STATUSES.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
        <select className="h-9 rounded-md border bg-background px-3 text-sm" value={condition} onChange={(e) => setCondition(e.target.value)}>
          <option value="all">Any condition</option>
          {BRGY_CONDITIONS.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
        <Badge variant="secondary">{total} on record</Badge>
        <div className="ml-auto">
          <Button onClick={() => setAddOpen(true)}>Add asset</Button>
        </div>
      </div>

      <div className="rounded-md border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/40 text-left">
              <th className="p-2">Code</th>
              <th className="p-2">Name</th>
              <th className="p-2">Office</th>
              <th className="p-2">Custodian</th>
              <th className="p-2">Condition</th>
              <th className="p-2">Status</th>
              <th className="p-2 text-right">Cost</th>
              <th className="p-2 text-right">Projected</th>
              <th className="p-2 text-right">Total</th>
              <th className="p-2" />
            </tr>
          </thead>
          <tbody>
            {rows.map((a) => (
              <tr key={a.id} className="border-b last:border-0">
                <td className="p-2 font-mono text-xs">{a.asset_code}</td>
                <td className="p-2">{a.name}{a.is_draft ? <Badge variant="outline" className="ml-2">draft</Badge> : null}</td>
                <td className="p-2">{officeName(a.office_id)}</td>
                <td className="p-2">{custodianName(a.custodian_id)}</td>
                <td className="p-2">{a.condition}</td>
                <td className="p-2"><Badge variant="outline">{a.status}</Badge></td>
                <td className="p-2 text-right">{peso(a.cost)}</td>
                <td className="p-2 text-right">{peso(projectedValue(a, today(), salvage))}</td>
                <td className="p-2 text-right">{peso(projectedTotal(a, today(), salvage))}</td>
                <td className="p-2 text-right">
                  <Button size="sm" variant="ghost" onClick={() => void openDetail(a)}>Open</Button>
                </td>
              </tr>
            ))}
            {rows.length === 0 ? (
              <tr>
                <td colSpan={10} className="p-6 text-center text-sm text-muted-foreground">
                  {loading ? "Loading assets..." : "No asset matches these filters."}
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      <AddAssetDialog
        open={addOpen}
        onClose={() => setAddOpen(false)}
        barangayId={barangayId}
        lookups={lookups}
        onSaved={async () => {
          setAddOpen(false);
          setNotice("Asset saved.");
          await load();
        }}
        setError={setError}
      />

      {detail ? (
        <AssetDetailDialog
          detail={detail}
          lookups={lookups}
          setError={setError}
          onClose={() => setDetail(null)}
          onChanged={async () => {
            await load();
            if (detail) setDetail((await call("/assets/" + detail.asset.id)) as never);
          }}
        />
      ) : null}
    </div>
  );
}

function AddAssetDialog({
  open,
  onClose,
  barangayId,
  lookups,
  onSaved,
  setError,
}: {
  open: boolean;
  onClose: () => void;
  barangayId: number;
  lookups: Lookups;
  onSaved: () => Promise<void> | void;
  setError: (v: string | null) => void;
}) {
  const [form, setForm] = React.useState({
    name: "",
    classificationId: "",
    barcode: "",
    tagNo: "",
    securityTag: "",
    serialNo: "",
    officeId: "",
    custodianId: "",
    dateAcquired: today(),
    cost: "",
    quantity: "1",
    lifeSpanYears: "5",
    condition: "Good" as BrgyCondition,
    remarks: "",
    isDraft: false,
  });
  const [busy, setBusy] = React.useState(false);
  const [formError, setFormError] = React.useState<string | null>(null);

  const lifeFor = (classificationId: string) => {
    const c = lookups.classifications.find((x) => String(x.id) === classificationId);
    return c && c.life_span_years ? String(c.life_span_years) : "";
  };

  async function submit() {
    setBusy(true);
    setFormError(null);
    try {
      await call("/assets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          barangayId,
          name: form.name,
          classificationId: form.classificationId ? Number(form.classificationId) : null,
          barcode: form.barcode || null,
          tagNo: form.tagNo || null,
          securityTag: form.securityTag || null,
          serialNo: form.serialNo || null,
          officeId: form.officeId ? Number(form.officeId) : null,
          custodianId: form.custodianId ? Number(form.custodianId) : null,
          dateAcquired: form.dateAcquired,
          cost: Number(form.cost || 0),
          quantity: Number(form.quantity || 1),
          lifeSpanYears: Number(form.lifeSpanYears || 0),
          condition: form.condition,
          remarks: form.remarks || null,
          isDraft: form.isDraft,
        }),
      });
      await onSaved();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setFormError(message);
      setError(null);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => (!next ? onClose() : undefined)}>
      <DialogContent className="flex max-h-[90vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-2xl">
        <DialogHeader className="shrink-0 px-6 pt-6 pb-2">
          <DialogTitle>Add asset</DialogTitle>
          <DialogDescription>The code is issued automatically as AST-(barangay code)-(number).</DialogDescription>
        </DialogHeader>
        <div className="grid min-h-0 flex-1 gap-3 overflow-y-auto px-6 py-2">
          <Field label="Item name">
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Monobloc chair, white" />
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Classification">
              <select
                className="h-9 w-full rounded-md border bg-background px-3 text-sm"
                value={form.classificationId}
                onChange={(e) => {
                  const life = lifeFor(e.target.value);
                  setForm({ ...form, classificationId: e.target.value, lifeSpanYears: life || form.lifeSpanYears });
                }}
              >
                <option value="">Choose one</option>
                {lookups.classifications.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </Field>
            <Field label="Condition">
              <select
                className="h-9 w-full rounded-md border bg-background px-3 text-sm"
                value={form.condition}
                onChange={(e) => setForm({ ...form, condition: e.target.value as BrgyCondition })}
              >
                {BRGY_CONDITIONS.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </Field>
            <Field label="Office">
              <select className="h-9 w-full rounded-md border bg-background px-3 text-sm" value={form.officeId} onChange={(e) => setForm({ ...form, officeId: e.target.value })}>
                <option value="">None</option>
                {lookups.offices.map((o) => (
                  <option key={o.id} value={o.id}>{o.name}</option>
                ))}
              </select>
            </Field>
            <Field label="Custodian">
              <select className="h-9 w-full rounded-md border bg-background px-3 text-sm" value={form.custodianId} onChange={(e) => setForm({ ...form, custodianId: e.target.value })}>
                <option value="">Unassigned</option>
                {lookups.custodians.map((c) => (
                  <option key={c.id} value={c.id}>{c.full_name}</option>
                ))}
              </select>
            </Field>
            <Field label="Date acquired">
              <Input type="date" value={form.dateAcquired} onChange={(e) => setForm({ ...form, dateAcquired: e.target.value })} />
            </Field>
            <Field label="Cost, pesos">
              <Input value={form.cost} onChange={(e) => setForm({ ...form, cost: e.target.value })} placeholder="30000" />
            </Field>
            <Field label="Quantity">
              <Input value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} />
            </Field>
            <Field label="Life span, years">
              <Input value={form.lifeSpanYears} onChange={(e) => setForm({ ...form, lifeSpanYears: e.target.value })} />
            </Field>
            <Field label="Barcode">
              <Input value={form.barcode} onChange={(e) => setForm({ ...form, barcode: e.target.value })} />
            </Field>
            <Field label="Tag number">
              <Input value={form.tagNo} onChange={(e) => setForm({ ...form, tagNo: e.target.value })} />
            </Field>
            <Field label="Security tag">
              <Input value={form.securityTag} onChange={(e) => setForm({ ...form, securityTag: e.target.value })} />
            </Field>
            <Field label="Serial number">
              <Input value={form.serialNo} onChange={(e) => setForm({ ...form, serialNo: e.target.value })} />
            </Field>
          </div>
          <Field label="Remarks">
            <Input value={form.remarks} onChange={(e) => setForm({ ...form, remarks: e.target.value })} />
          </Field>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={form.isDraft} onChange={(e) => setForm({ ...form, isDraft: e.target.checked })} />
            Save as draft, not counted in totals or reports
          </label>
          {formError ? <p className="rounded-md border border-destructive/40 bg-destructive/10 p-2 text-sm text-destructive">{formError}</p> : null}
        </div>
        <DialogFooter className="shrink-0 border-t bg-background px-6 py-4">
          <Button variant="outline" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button onClick={() => void submit()} disabled={busy}>{busy ? "Saving..." : "Save asset"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AssetDetailDialog({
  detail,
  lookups,
  onClose,
  onChanged,
  setError,
}: {
  detail: { asset: BrgyAsset; history: BrgyHistoryEntry[]; projected: number; projectedTotalValue: number };
  lookups: Lookups;
  onClose: () => void;
  onChanged: () => Promise<void> | void;
  setError: (v: string | null) => void;
}) {
  const asset = detail.asset;
  const [busy, setBusy] = React.useState(false);
  const [action, setAction] = React.useState<"assign" | "condition" | "status" | "cancel" | "return" | null>(null);
  const [custodianId, setCustodianId] = React.useState(String(asset.custodian_id ?? ""));
  const [officeId, setOfficeId] = React.useState(String(asset.office_id ?? ""));
  const [condition, setCondition] = React.useState<BrgyCondition>(asset.condition);
  const [toStatus, setToStatus] = React.useState<BrgyStatus>("Active");
  const [remarks, setRemarks] = React.useState("");
  const [formError, setFormError] = React.useState<string | null>(null);

  async function run(body: Record<string, unknown>) {
    setBusy(true);
    setFormError(null);
    try {
      await call("/assets/" + asset.id + "/actions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      setAction(null);
      setRemarks("");
      await onChanged();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setFormError(message);
      setError(null);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open onOpenChange={(next) => (!next ? onClose() : undefined)}>
      <DialogContent className="flex max-h-[90vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-2xl">
        <DialogHeader className="shrink-0 px-6 pt-6 pb-2">
          <DialogTitle className="font-mono text-sm">{asset.asset_code}</DialogTitle>
          <DialogDescription>
            {asset.name} | {asset.status} | {asset.condition} | projected {peso(detail.projected)}, total {peso(detail.projectedTotalValue)}
          </DialogDescription>
        </DialogHeader>

        <div className="grid min-h-0 flex-1 gap-3 overflow-y-auto px-6 py-2">
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={() => setAction("assign")}>Assign</Button>
            <Button size="sm" variant="outline" onClick={() => setAction("condition")}>Update condition</Button>
            <Button size="sm" variant="outline" onClick={() => setAction("status")}>Change status</Button>
            {asset.owner_type === "lgu" ? (
              <Button size="sm" variant="outline" onClick={() => setAction("return")}>Return to LGU</Button>
            ) : null}
            <Button size="sm" variant="ghost" onClick={() => setAction("cancel")}>Cancel record</Button>
          </div>

          {action === "assign" ? (
            <div className="grid gap-2 rounded-md border p-3">
              <Field label="Custodian">
                <select className="h-9 w-full rounded-md border bg-background px-3 text-sm" value={custodianId} onChange={(e) => setCustodianId(e.target.value)}>
                  <option value="">Choose one</option>
                  {lookups.custodians.map((c) => (
                    <option key={c.id} value={c.id}>{c.full_name}</option>
                  ))}
                </select>
              </Field>
              <Field label="Office">
                <select className="h-9 w-full rounded-md border bg-background px-3 text-sm" value={officeId} onChange={(e) => setOfficeId(e.target.value)}>
                  <option value="">None</option>
                  {lookups.offices.map((o) => (
                    <option key={o.id} value={o.id}>{o.name}</option>
                  ))}
                </select>
              </Field>
              <Field label="Remark">
                <Input value={remarks} onChange={(e) => setRemarks(e.target.value)} placeholder="transferred to the new Secretary" />
              </Field>
              <div className="flex justify-end gap-2">
                <Button size="sm" variant="outline" onClick={() => setAction(null)}>Cancel</Button>
                <Button size="sm" disabled={busy || !custodianId} onClick={() => void run({ action: "assign", custodianId: Number(custodianId), officeId: officeId ? Number(officeId) : null, remarks })}>Assign</Button>
              </div>
            </div>
          ) : null}

          {action === "condition" ? (
            <div className="grid gap-2 rounded-md border p-3">
              <Field label="New condition">
                <select className="h-9 w-full rounded-md border bg-background px-3 text-sm" value={condition} onChange={(e) => setCondition(e.target.value as BrgyCondition)}>
                  {BRGY_CONDITIONS.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </Field>
              <Field label="Remark, required">
                <Input value={remarks} onChange={(e) => setRemarks(e.target.value)} />
              </Field>
              <div className="flex justify-end gap-2">
                <Button size="sm" variant="outline" onClick={() => setAction(null)}>Cancel</Button>
                <Button size="sm" disabled={busy} onClick={() => void run({ action: "condition", condition, remarks })}>Save condition</Button>
              </div>
            </div>
          ) : null}

          {action === "status" ? (
            <div className="grid gap-2 rounded-md border p-3">
              <Field label="New status">
                <select className="h-9 w-full rounded-md border bg-background px-3 text-sm" value={toStatus} onChange={(e) => setToStatus(e.target.value as BrgyStatus)}>
                  {BRGY_STATUSES.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </Field>
              <Field label="Reason, required for Missing, For Disposal and Disposed">
                <Input value={remarks} onChange={(e) => setRemarks(e.target.value)} />
              </Field>
              <div className="flex justify-end gap-2">
                <Button size="sm" variant="outline" onClick={() => setAction(null)}>Cancel</Button>
                <Button size="sm" disabled={busy} onClick={() => void run({ action: "status", to: toStatus, reason: remarks })}>Change status</Button>
              </div>
            </div>
          ) : null}

          {action === "return" ? (
            <div className="grid gap-2 rounded-md border p-3">
              <Field label="Describe the defect, required">
                <Input value={remarks} onChange={(e) => setRemarks(e.target.value)} />
              </Field>
              <div className="flex justify-end gap-2">
                <Button size="sm" variant="outline" onClick={() => setAction(null)}>Cancel</Button>
                <Button size="sm" disabled={busy} onClick={() => void run({ action: "return", defect: remarks })}>Request return</Button>
              </div>
            </div>
          ) : null}

          {action === "cancel" ? (
            <div className="grid gap-2 rounded-md border p-3">
              <Field label="Reason, required">
                <Input value={remarks} onChange={(e) => setRemarks(e.target.value)} />
              </Field>
              <div className="flex justify-end gap-2">
                <Button size="sm" variant="outline" onClick={() => setAction(null)}>Cancel</Button>
                <Button size="sm" variant="destructive" disabled={busy} onClick={() => void run({ action: "cancel", reason: remarks })}>Cancel record</Button>
              </div>
            </div>
          ) : null}

          {formError ? <p className="rounded-md border border-destructive/40 bg-destructive/10 p-2 text-sm text-destructive">{formError}</p> : null}

          <section>
            <h3 className="mb-1 text-sm font-medium">History</h3>
            <div className="grid gap-1">
              {detail.history.map((h) => (
                <div key={h.id} className="rounded border p-2 text-xs">
                  <span className="font-medium">{h.action}</span>
                  {h.from_value || h.to_value ? " | " + (h.from_value ?? "-") + " to " + (h.to_value ?? "-") : ""}
                  {h.remarks ? " | " + h.remarks : ""}
                  <span className="text-muted-foreground"> | {h.actor ?? "unknown"} | {(h.date_created ?? "").slice(0, 10)}</span>
                </div>
              ))}
              {detail.history.length === 0 ? <p className="text-sm text-muted-foreground">No history yet.</p> : null}
            </div>
          </section>
        </div>

        <DialogFooter className="shrink-0 border-t bg-background px-6 py-4">
          <Button onClick={onClose}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="grid gap-1 text-sm">
      <span className="text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}

/* --------------------------------------------------------------- custody */

function CustodyTab(props: {
  barangayId: number;
  lookups: Lookups;
  settings: BrgySettings | null;
  setError: (v: string | null) => void;
  setNotice: (v: string | null) => void;
}) {
  const { barangayId, lookups, settings, setError } = props;
  const [rows, setRows] = React.useState<BrgyAsset[]>([]);
  const [busy, setBusy] = React.useState(false);

  const load = React.useCallback(async () => {
    try {
      const data = await call("/assets?barangayId=" + barangayId + "&pageSize=100");
      setRows(data.assets ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [barangayId, setError]);

  React.useEffect(() => {
    void load();
  }, [load]);

  const groups = React.useMemo(() => {
    const map = new Map<string, BrgyAsset[]>();
    for (const row of rows) {
      const name = lookups.custodians.find((c) => c.id === row.custodian_id)?.full_name ?? "Unassigned";
      if (!map.has(name)) map.set(name, []);
      map.get(name)!.push(row);
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [rows, lookups.custodians]);

  async function reassign(assetId: number) {
    const name = window.prompt("Custodian name or id? Enter the custodian id from the list.");
    if (!name) return;
    setBusy(true);
    try {
      await call("/assets/" + assetId + "/actions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "assign", custodianId: Number(name) }),
      });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  const salvage = settings?.salvage_percent ?? 0;

  return (
    <div className="flex flex-col gap-3">
      <div className="rounded-md border bg-muted/30 p-3 text-sm">
        Property accountability by custodian. Reassign from the asset card so the previous assignment is closed properly.
      </div>
      {groups.map(([custodian, items]) => (
        <div key={custodian} className="rounded-md border">
          <div className="flex items-center justify-between border-b bg-muted/40 p-2 text-sm">
            <span className="font-medium">{custodian}</span>
            <span className="text-muted-foreground">
              {items.length} asset(s) | total {peso(items.reduce((s, a) => s + projectedTotal(a, today(), salvage), 0))}
            </span>
          </div>
          <table className="w-full text-sm">
            <tbody>
              {items.map((a) => (
                <tr key={a.id} className="border-b last:border-0">
                  <td className="p-2 font-mono text-xs">{a.asset_code}</td>
                  <td className="p-2">{a.name}</td>
                  <td className="p-2">{a.status}</td>
                  <td className="p-2 text-right">{peso(projectedTotal(a, today(), salvage))}</td>
                  <td className="p-2 text-right">
                    <Button size="sm" variant="ghost" disabled={busy} onClick={() => void reassign(a.id)}>Reassign</Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  );
}

/* ----------------------------------------------------------------- count */

function CountTab({ barangayId, setError, setNotice }: { barangayId: number; setError: (v: string | null) => void; setNotice: (v: string | null) => void }) {
  const [counts, setCounts] = React.useState<BrgyCount[]>([]);
  const [openId, setOpenId] = React.useState<number | null>(null);
  const [year, setYear] = React.useState(String(new Date().getFullYear()));

  const load = React.useCallback(async () => {
    try {
      const data = await call("/counts?barangayId=" + barangayId);
      setCounts(data.counts ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [barangayId, setError]);

  React.useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <Input className="w-24" value={year} onChange={(e) => setYear(e.target.value)} />
        <Button
          onClick={async () => {
            try {
              const created = await call("/counts", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ barangayId, year: Number(year) }),
              });
              setNotice("Count opened for " + created.year + ".");
              await load();
              setOpenId(created.id);
            } catch (err) {
              setError(err instanceof Error ? err.message : String(err));
            }
          }}
        >
          Open count
        </Button>
        <span className="text-sm text-muted-foreground">One count per barangay at a time.</span>
      </div>

      <div className="rounded-md border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/40 text-left">
              <th className="p-2">Year</th>
              <th className="p-2">Status</th>
              <th className="p-2">Opened by</th>
              <th className="p-2">Closed by</th>
              <th className="p-2" />
            </tr>
          </thead>
          <tbody>
            {counts.map((c) => (
              <tr key={c.id} className="border-b last:border-0">
                <td className="p-2">{c.year}</td>
                <td className="p-2"><Badge variant={c.status === "open" ? "default" : "outline"}>{c.status}</Badge></td>
                <td className="p-2">{c.opened_by ?? ""}</td>
                <td className="p-2">{c.closed_by ?? ""}</td>
                <td className="p-2 text-right"><Button size="sm" variant="ghost" onClick={() => setOpenId(c.id)}>Open</Button></td>
              </tr>
            ))}
            {counts.length === 0 ? <tr><td colSpan={5} className="p-6 text-center text-sm text-muted-foreground">No count yet.</td></tr> : null}
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

  const load = React.useCallback(async () => {
    try {
      setDetail((await call("/counts/" + countId)) as never);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [countId, setError]);

  React.useEffect(() => {
    void load();
  }, [load]);

  async function act(body: Record<string, unknown>) {
    try {
      setDetail((await call("/counts/" + countId + "/actions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })) as never);
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

/* -------------------------------------------------------------- disposal */

function DisposalTab({ barangayId, setError, setNotice }: { barangayId: number; setError: (v: string | null) => void; setNotice: (v: string | null) => void }) {
  const [rows, setRows] = React.useState<{ request: BrgyDisposal; asset: BrgyAsset | null }[]>([]);

  const load = React.useCallback(async () => {
    try {
      const data = await call("/disposals?barangayId=" + barangayId);
      setRows(data.rows ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [barangayId, setError]);

  React.useEffect(() => {
    void load();
  }, [load]);

  async function act(id: number, body: Record<string, unknown>) {
    try {
      await call("/disposals/" + id + "/actions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      setNotice("Disposal updated.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <div className="rounded-md border">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b bg-muted/40 text-left">
            <th className="p-2">Asset</th>
            <th className="p-2">Reason</th>
            <th className="p-2">Status</th>
            <th className="p-2">Requested by</th>
            <th className="p-2">Approved by</th>
            <th className="p-2 text-right">Action</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ request, asset }) => (
            <tr key={request.id} className="border-b last:border-0">
              <td className="p-2">{asset ? asset.asset_code + " " + asset.name : request.asset_id}</td>
              <td className="p-2">{request.reason}</td>
              <td className="p-2"><Badge variant="outline">{request.status}</Badge></td>
              <td className="p-2">{request.requested_by ?? ""}</td>
              <td className="p-2">{request.approved_by ?? ""}</td>
              <td className="p-2 text-right">
                {request.status === "pending" ? (
                  <span className="flex justify-end gap-1">
                    <Button size="sm" onClick={() => void act(request.id, { action: "approve", remark: window.prompt("Approve remark") ?? "" })}>Approve</Button>
                    <Button size="sm" variant="ghost" onClick={() => void act(request.id, { action: "return", remark: window.prompt("Why return this request?") ?? "" })}>Return</Button>
                  </span>
                ) : request.status === "approved" ? (
                  <Button
                    size="sm"
                    onClick={() => {
                      const method = window.prompt("Method: sold, donated, condemned or destroyed", "condemned") as "sold" | "donated" | "condemned" | "destroyed" | null;
                      if (method) void act(request.id, { action: "complete", method, note: window.prompt("Short note") ?? "" });
                    }}
                  >
                    Mark disposed
                  </Button>
                ) : null}
              </td>
            </tr>
          ))}
          {rows.length === 0 ? <tr><td colSpan={6} className="p-6 text-center text-sm text-muted-foreground">No disposal request yet. Send an unserviceable asset for disposal from its asset card.</td></tr> : null}
        </tbody>
      </table>
    </div>
  );
}

/* ------------------------------------------------------------- transfers */

function TransfersTab({ barangayId, lookups, setError, setNotice }: { barangayId: number; lookups: Lookups; setError: (v: string | null) => void; setNotice: (v: string | null) => void }) {
  const [data, setData] = React.useState<{ incoming: BrgyTransfer[]; outgoing: BrgyTransfer[] }>({ incoming: [], outgoing: [] });

  const load = React.useCallback(async () => {
    try {
      setData(await call("/transfers?barangayId=" + barangayId));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [barangayId, setError]);

  React.useEffect(() => {
    void load();
  }, [load]);

  async function act(body: Record<string, unknown>) {
    try {
      await call("/transfers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      setNotice("Transfer updated.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <div className="grid gap-3">
      <div className="rounded-md border">
        <div className="border-b bg-muted/40 p-2 text-sm font-medium">Incoming, waiting for this barangay</div>
        <table className="w-full text-sm">
          <tbody>
            {data.incoming.map((t) => (
              <tr key={t.id} className="border-b last:border-0">
                <td className="p-2 font-mono text-xs">asset {t.asset_id}</td>
                <td className="p-2">{t.status}</td>
                <td className="p-2">{t.direction}</td>
                <td className="p-2 text-right">
                  {t.status === "for_receiving" ? (
                    <span className="flex justify-end gap-1">
                      <Button size="sm" onClick={() => void act({ transferId: t.id, decision: "receive" })}>Receive</Button>
                      <Button size="sm" variant="ghost" onClick={() => void act({ transferId: t.id, decision: "reject", remark: window.prompt("Why reject?") ?? "" })}>Reject</Button>
                    </span>
                  ) : t.status === "for_return" ? (
                    <span className="flex justify-end gap-1">
                      <Button size="sm" onClick={() => void act({ transferId: t.id, decision: "confirm_return" })}>Confirm return</Button>
                      <Button size="sm" variant="ghost" onClick={() => void act({ transferId: t.id, decision: "decline_return", remark: window.prompt("Why decline?") ?? "" })}>Decline</Button>
                    </span>
                  ) : null}
                </td>
              </tr>
            ))}
            {data.incoming.length === 0 ? <tr><td className="p-4 text-center text-sm text-muted-foreground">Nothing waiting.</td></tr> : null}
          </tbody>
        </table>
      </div>

      <div className="rounded-md border">
        <div className="border-b bg-muted/40 p-2 text-sm font-medium">Outgoing from this barangay</div>
        <table className="w-full text-sm">
          <tbody>
            {data.outgoing.map((t) => (
              <tr key={t.id} className="border-b last:border-0">
                <td className="p-2 font-mono text-xs">asset {t.asset_id}</td>
                <td className="p-2">{t.direction}</td>
                <td className="p-2">{t.status}</td>
                <td className="p-2">{t.defect ?? t.remark ?? ""}</td>
              </tr>
            ))}
            {data.outgoing.length === 0 ? <tr><td className="p-4 text-center text-sm text-muted-foreground">No outgoing transfer.</td></tr> : null}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-muted-foreground">
        LGU staff send assets to this barangay from the LGU module. A barangay can only send back an LGU asset with a reported defect. {lookups.barangays.length} barangay record(s) available.
      </p>
    </div>
  );
}

/* --------------------------------------------------------------- reports */

interface ReportRow {
  asset: BrgyAsset;
  office: string;
  custodian: string;
  projected: number;
  total: number;
}

type ReportPayload =
  | { kind: "masterlist"; asOf: string; rows: ReportRow[]; totalValue: number }
  | { kind: "accountability"; asOf: string; groups: { custodian: string; rows: ReportRow[]; total: number }[] }
  | { kind: "consolidation"; asOf: string; rows: { barangay: string; code: string; assets: number; cost: number; totalValue: number }[]; totals: { assets: number; cost: number; totalValue: number } }
  | { kind: "count"; year: number; status: string; found: number; notFound: number; notYetRecorded: number; conditionChanges: { assetCode: string; name: string; condition: string }[] };

const REPORT_LABELS: Record<string, string> = {
  masterlist: "Asset masterlist",
  accountability: "Property accountability",
  consolidation: "Municipal consolidation",
  count: "Count summary",
};

function ReportsTab({ barangayId, setError }: { barangayId: number; setError: (v: string | null) => void }) {
  const [kind, setKind] = React.useState<keyof typeof REPORT_LABELS>("masterlist");
  const [payload, setPayload] = React.useState<ReportPayload | null>(null);
  const [counts, setCounts] = React.useState<BrgyCount[]>([]);
  const [countId, setCountId] = React.useState<string>("");

  React.useEffect(() => {
    void (async () => {
      try {
        const data = await call("/counts?barangayId=" + barangayId);
        const list: BrgyCount[] = data.counts ?? [];
        setCounts(list);
        if (list.length && !countId) setCountId(String(list[0].id));
      } catch {
        /* the count picker is optional for three of the four reports */
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [barangayId]);

  React.useEffect(() => {
    if (kind === "count" && !countId) return;
    void (async () => {
      try {
        const query = "/reports?kind=" + kind + "&barangayId=" + barangayId + (kind === "count" ? "&countId=" + countId : "");
        const data = await call(query);
        setPayload({ kind, ...data } as ReportPayload);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    })();
  }, [kind, countId, barangayId, setError]);

  const exportHref =
    "/api/fm/barangay-asset-inventory-system/reports/export?kind=" +
    kind +
    (kind === "consolidation" ? "" : "&barangayId=" + barangayId) +
    (kind === "count" && countId ? "&countId=" + countId : "");

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        {(Object.keys(REPORT_LABELS) as (keyof typeof REPORT_LABELS)[]).map((k) => (
          <Button key={k} size="sm" variant={kind === k ? "default" : "outline"} onClick={() => setKind(k)}>
            {REPORT_LABELS[k]}
          </Button>
        ))}
        {kind === "count" ? (
          <select className="h-9 rounded-md border bg-background px-3 text-sm" value={countId} onChange={(e) => setCountId(e.target.value)}>
            {counts.length === 0 ? <option value="">No count yet</option> : null}
            {counts.map((c) => (
              <option key={c.id} value={c.id}>
                {c.year} {c.status}
              </option>
            ))}
          </select>
        ) : null}
        <div className="ml-auto">
          <a href={exportHref}>
            <Button size="sm" variant="outline" disabled={kind === "count" && !countId}>
              Excel
            </Button>
          </a>
        </div>
      </div>

      {!payload ? (
        <p className="text-sm text-muted-foreground">Loading report...</p>
      ) : payload.kind === "masterlist" ? (
        <div className="rounded-md border">
          <div className="flex items-center justify-between border-b bg-muted/40 p-2 text-sm">
            <span className="font-medium">Asset masterlist</span>
            <span className="text-muted-foreground">
              {payload.rows.length} assets | total {peso(payload.totalValue)} | as of {payload.asOf}
            </span>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/20 text-left">
                <th className="p-2">Asset ID</th>
                <th className="p-2">Description</th>
                <th className="p-2">Office</th>
                <th className="p-2">Custodian</th>
                <th className="p-2">Condition</th>
                <th className="p-2 text-right">Qty</th>
                <th className="p-2 text-right">Projected</th>
                <th className="p-2 text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {payload.rows.map((row) => (
                <tr key={row.asset.id} className="border-b last:border-0">
                  <td className="p-2 font-mono text-xs">{row.asset.asset_code}</td>
                  <td className="p-2">{row.asset.name}</td>
                  <td className="p-2">{row.office}</td>
                  <td className="p-2">{row.custodian || "Unassigned"}</td>
                  <td className="p-2">{row.asset.condition}</td>
                  <td className="p-2 text-right">{row.asset.quantity}</td>
                  <td className="p-2 text-right">{peso(row.projected)}</td>
                  <td className="p-2 text-right">{peso(row.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : payload.kind === "accountability" ? (
        <div className="flex flex-col gap-2">
          {payload.groups.map((group) => (
            <div key={group.custodian} className="rounded-md border">
              <div className="flex items-center justify-between border-b bg-muted/40 p-2 text-sm">
                <span className="font-medium">{group.custodian}</span>
                <span className="text-muted-foreground">
                  {group.rows.length} asset(s) | {peso(group.total)}
                </span>
              </div>
              <table className="w-full text-sm">
                <tbody>
                  {group.rows.map((row) => (
                    <tr key={row.asset.id} className="border-b last:border-0">
                      <td className="p-2 font-mono text-xs">{row.asset.asset_code}</td>
                      <td className="p-2">{row.asset.name}</td>
                      <td className="p-2">{row.office}</td>
                      <td className="p-2">{row.asset.condition}</td>
                      <td className="p-2 text-right">{peso(row.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
          {payload.groups.length === 0 ? <p className="text-sm text-muted-foreground">No active asset yet.</p> : null}
        </div>
      ) : payload.kind === "consolidation" ? (
        <div className="rounded-md border">
          <div className="flex items-center justify-between border-b bg-muted/40 p-2 text-sm">
            <span className="font-medium">Municipal consolidation</span>
            <span className="text-muted-foreground">
              {payload.totals.assets} assets | {peso(payload.totals.totalValue)} | as of {payload.asOf}
            </span>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/20 text-left">
                <th className="p-2">Code</th>
                <th className="p-2">Barangay</th>
                <th className="p-2 text-right">Assets</th>
                <th className="p-2 text-right">Cost</th>
                <th className="p-2 text-right">Projected total</th>
              </tr>
            </thead>
            <tbody>
              {payload.rows.map((row) => (
                <tr key={row.code} className="border-b last:border-0">
                  <td className="p-2 font-mono text-xs">{row.code}</td>
                  <td className="p-2">{row.barangay}</td>
                  <td className="p-2 text-right">{row.assets}</td>
                  <td className="p-2 text-right">{peso(row.cost)}</td>
                  <td className="p-2 text-right">{peso(row.totalValue)}</td>
                </tr>
              ))}
              <tr className="bg-muted/20 font-medium">
                <td className="p-2" />
                <td className="p-2">Total</td>
                <td className="p-2 text-right">{payload.totals.assets}</td>
                <td className="p-2 text-right">{peso(payload.totals.cost)}</td>
                <td className="p-2 text-right">{peso(payload.totals.totalValue)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          <div className="grid gap-2 sm:grid-cols-4">
            <SummaryTile label="Found" value={String(payload.found)} />
            <SummaryTile label="Not found" value={String(payload.notFound)} />
            <SummaryTile label="Not yet recorded" value={String(payload.notYetRecorded)} />
            <SummaryTile label="Count" value={payload.year + " " + payload.status} />
          </div>
          <div className="rounded-md border">
            <div className="border-b bg-muted/40 p-2 text-sm font-medium">Condition recorded during the count</div>
            <table className="w-full text-sm">
              <tbody>
                {payload.conditionChanges.map((row, index) => (
                  <tr key={row.assetCode + index} className="border-b last:border-0">
                    <td className="p-2 font-mono text-xs">{row.assetCode}</td>
                    <td className="p-2">{row.name}</td>
                    <td className="p-2">{row.condition}</td>
                  </tr>
                ))}
                {payload.conditionChanges.length === 0 ? (
                  <tr>
                    <td className="p-4 text-center text-sm text-muted-foreground">No condition was recorded during this count.</td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function SummaryTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-lg font-semibold">{value}</div>
    </div>
  );
}


/* -------------------------------------------------------------- settings */

function SettingsTab({ settings, setError, setNotice }: { settings: BrgySettings | null; setError: (v: string | null) => void; setNotice: (v: string | null) => void }) {
  const [form, setForm] = React.useState({
    salvagePercent: String(settings?.salvage_percent ?? 0),
    approvalRequired: settings?.approval_required ?? true,
    lifeEquipment: String(settings?.life_equipment ?? ""),
    lifeMachinery: String(settings?.life_machinery ?? ""),
    lifeFurniture: String(settings?.life_furniture ?? ""),
    lifeOther: String(settings?.life_other ?? ""),
  });
  const [busy, setBusy] = React.useState(false);

  async function save() {
    setBusy(true);
    try {
      await call("/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          salvagePercent: Number(form.salvagePercent || 0),
          approvalRequired: form.approvalRequired,
          lifeEquipment: form.lifeEquipment ? Number(form.lifeEquipment) : null,
          lifeMachinery: form.lifeMachinery ? Number(form.lifeMachinery) : null,
          lifeFurniture: form.lifeFurniture ? Number(form.lifeFurniture) : null,
          lifeOther: form.lifeOther ? Number(form.lifeOther) : null,
        }),
      });
      setNotice("Settings saved.");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid max-w-xl gap-3 rounded-md border p-4">
      <Field label="Salvage percent of cost, the projected value never goes below it">
        <Input value={form.salvagePercent} onChange={(e) => setForm({ ...form, salvagePercent: e.target.value })} />
      </Field>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={form.approvalRequired} onChange={(e) => setForm({ ...form, approvalRequired: e.target.checked })} />
        Disposal needs approval from another person
      </label>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Equipment life, years"><Input value={form.lifeEquipment} onChange={(e) => setForm({ ...form, lifeEquipment: e.target.value })} /></Field>
        <Field label="Machinery life, years"><Input value={form.lifeMachinery} onChange={(e) => setForm({ ...form, lifeMachinery: e.target.value })} /></Field>
        <Field label="Furniture life, years"><Input value={form.lifeFurniture} onChange={(e) => setForm({ ...form, lifeFurniture: e.target.value })} /></Field>
        <Field label="Other assets life, years"><Input value={form.lifeOther} onChange={(e) => setForm({ ...form, lifeOther: e.target.value })} /></Field>
      </div>
      <div className="text-sm text-muted-foreground">Valuation method: straight line, fixed for now.</div>
      <div>
        <Button disabled={busy} onClick={() => void save()}>{busy ? "Saving..." : "Save settings"}</Button>
      </div>
    </div>
  );
}
