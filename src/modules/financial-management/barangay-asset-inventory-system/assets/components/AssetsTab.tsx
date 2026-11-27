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
import type { BrgyAsset, BrgyCondition, BrgyHistoryEntry, BrgySettings, BrgyStatus } from "../../types";
import { BRGY_CONDITIONS, BRGY_STATUSES, projectedTotal, projectedValue } from "../../types";
import { call, Field, money, offerable, peso, today, type Lookups } from "../../shared/ui";
import { printAssetLabel } from "../../shared/brgyLabel";
import { Pager } from "../../shared/Pager";

/* ---------------------------------------------------------------- assets */

export function AssetsTab({
  barangayId,
  lookups,
  settings,
  can,
  setError,
  setNotice,
}: {
  barangayId: number;
  lookups: Lookups;
  settings: BrgySettings | null;
  /** Table 5: the screen shows only the actions the role may perform, the routes still enforce */
  can?: Record<string, boolean>;
  setError: (v: string | null) => void;
  setNotice: (v: string | null) => void;
}) {
  const allow = (permission: string) => (can ? can[permission] === true : true);
  const [rows, setRows] = React.useState<BrgyAsset[]>([]);
  const [total, setTotal] = React.useState(0);
  const [q, setQ] = React.useState("");
  const [status, setStatus] = React.useState("all");
  // how many assets need attention, shown as a filter chip so it stays readable at any number
  const [missing, setMissing] = React.useState(0);
  const [condition, setCondition] = React.useState("all");
  const [loading, setLoading] = React.useState(false);
  const [page, setPage] = React.useState(1);
  const PAGE_SIZE = 25;
  const [addOpen, setAddOpen] = React.useState(false);
  const [editTarget, setEditTarget] = React.useState<BrgyAsset | null>(null);
  const [detail, setDetail] = React.useState<{ asset: BrgyAsset; history: BrgyHistoryEntry[]; projected: number; projectedTotalValue: number } | null>(null);
  const salvage = settings?.salvage_percent ?? 0;

  const load = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        barangayId: String(barangayId),
        q,
        status,
        condition,
        page: String(page),
        pageSize: String(PAGE_SIZE),
      });
      const data = await call("/assets?" + params);
      setRows(data.assets ?? []);
      setTotal(data.total ?? 0);
      // the response carries the status totals, so the Missing chip costs nothing extra
      setMissing(Number(data.statusCounts?.Missing ?? 0));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [barangayId, q, status, condition, page, setError]);

  // a new search or filter starts again at the first page, otherwise the reader sees an empty page
  React.useEffect(() => {
    setPage(1);
  }, [q, status, condition]);

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
  const itemTypeName = (id: number | null) => lookups.itemTypes.find((t) => t.id === id)?.name ?? "";
  const officeName = (id: number | null) => lookups.offices.find((o) => o.id === id)?.name ?? "";

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, code, barcode, serial..." className="w-full max-w-sm" />
        <select className="cursor-pointer h-9 rounded-md border bg-background px-3 text-sm" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="all">Any status</option>
          {BRGY_STATUSES.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
        <select className="cursor-pointer h-9 rounded-md border bg-background px-3 text-sm" value={condition} onChange={(e) => setCondition(e.target.value)}>
          <option value="all">Any condition</option>
          {BRGY_CONDITIONS.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
        <Badge variant="secondary">{total} on record</Badge>
        {missing > 0 ? (
          <button
            type="button"
            aria-pressed={status === "Missing"}
            onClick={() => {
              setStatus(status === "Missing" ? "all" : "Missing");
              setPage(1);
            }}
            className={
              "inline-flex h-7 items-center gap-1.5 rounded-full border px-3 text-xs font-medium outline-none transition-colors focus-visible:ring-[3px] focus-visible:ring-ring/50 " +
              (status === "Missing"
                ? "border-amber-500 bg-amber-500/20 text-amber-700 dark:text-amber-300"
                : "border-amber-500/40 bg-amber-500/10 text-amber-700 hover:bg-amber-500/20 dark:text-amber-300")
            }
            title="Show only the assets marked Missing"
          >
            Missing
            <span className="tabular-nums">{missing}</span>
          </button>
        ) : null}
        <div className="ml-auto">
          {allow("register") ? <Button onClick={() => setAddOpen(true)}>Add asset</Button> : null}
        </div>
      </div>

      <div className="rounded-md border">
        <div className="overflow-x-auto">
        <table className="w-full min-w-[70rem] text-sm">
          <thead className="sticky top-0 z-10 bg-background">
            <tr className="border-b bg-muted/40 text-left">
              <th className="p-2">Code</th>
              <th className="p-2">Name</th>
              <th className="p-2">Type</th>
              <th className="p-2">Office</th>
              <th className="p-2">Custodian</th>
              <th className="p-2">Condition</th>
              <th className="p-2">Status</th>
              <th className="whitespace-nowrap p-2 text-right">Cost</th>
              <th className="whitespace-nowrap p-2 text-right">Projected</th>
              <th className="whitespace-nowrap p-2 text-right">Total</th>
              <th className="sticky right-0 z-10 w-24 bg-muted/40 p-2 text-right">Action</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((a) => (
              <tr key={a.id} className="border-b last:border-0">
                <td className="p-2 font-mono text-xs">{a.asset_code}</td>
                <td className="max-w-[20rem] truncate p-2" title={a.name}>{a.name}{a.is_draft ? <Badge variant="outline" className="ml-2">draft</Badge> : null}</td>
                <td className="p-2">{itemTypeName(a.item_type_id)}</td>
                <td className="p-2">{officeName(a.office_id)}</td>
                <td className="p-2">{custodianName(a.custodian_id)}</td>
                <td className="p-2">{a.condition}</td>
                <td className="p-2"><Badge variant="outline">{a.status}</Badge></td>
                <td className="whitespace-nowrap p-2 text-right tabular-nums" title={peso(a.cost)}>{money(a.cost)}</td>
                <td className="whitespace-nowrap p-2 text-right tabular-nums" title={peso(projectedValue(a, today(), salvage))}>
                  {money(projectedValue(a, today(), salvage))}
                </td>
                <td className="whitespace-nowrap p-2 text-right tabular-nums" title={peso(projectedTotal(a, today(), salvage))}>
                  {money(projectedTotal(a, today(), salvage))}
                </td>
                <td className="sticky right-0 z-10 w-24 bg-background p-2 text-right">
                  <Button size="sm" variant="ghost" onClick={() => void openDetail(a)}>Open</Button>
                </td>
              </tr>
            ))}
            {rows.length === 0 ? (
              <tr>
                <td colSpan={11} className="p-6 text-center text-sm text-muted-foreground">
                  {loading ? "Loading assets..." : "No asset matches these filters."}
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
        </div>
      </div>

      <Pager page={page} pageSize={PAGE_SIZE} total={total} onChange={setPage} />

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
          allow={allow}
          setError={setError}
          onClose={() => setDetail(null)}
          onEdit={(asset) => {
            setDetail(null);
            setEditTarget(asset);
          }}
          onChanged={async () => {
            await load();
            if (detail) setDetail((await call("/assets/" + detail.asset.id)) as never);
          }}
        />
      ) : null}

      {editTarget ? (
        <AddAssetDialog
          open
          asset={editTarget}
          barangayId={barangayId}
          lookups={lookups}
          setError={setError}
          onClose={() => setEditTarget(null)}
          onSaved={async () => {
            setEditTarget(null);
            setNotice("Asset updated.");
            await load();
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
  asset,
}: {
  open: boolean;
  onClose: () => void;
  barangayId: number;
  lookups: Lookups;
  onSaved: () => Promise<void> | void;
  setError: (v: string | null) => void;
  /** when present the dialog edits that asset, which is also how a draft is completed */
  asset?: BrgyAsset | null;
}) {
  const editing = Boolean(asset);
  const [form, setForm] = React.useState({
    name: asset?.name ?? "",
    classificationId: asset?.classification_id ? String(asset.classification_id) : "",
    itemTypeId: asset?.item_type_id ? String(asset.item_type_id) : "",
    barcode: asset?.barcode ?? "",
    tagNo: asset?.tag_no ?? "",
    securityTag: asset?.security_tag ?? "",
    serialNo: asset?.serial_no ?? "",
    officeId: asset?.office_id ? String(asset.office_id) : "",
    custodianId: asset?.custodian_id ? String(asset.custodian_id) : "",
    dateAcquired: asset?.date_acquired ?? today(),
    cost: asset ? String(asset.cost) : "",
    quantity: asset ? String(asset.quantity) : "1",
    lifeSpanYears: asset ? String(asset.life_span_years) : "5",
    condition: (asset?.condition ?? "Good") as BrgyCondition,
    remarks: asset?.remarks ?? "",
    isDraft: asset?.is_draft ?? false,
  });
  const [busy, setBusy] = React.useState(false);
  const [formError, setFormError] = React.useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = React.useState<Record<string, string>>({});
  const [knownNames, setKnownNames] = React.useState<string[]>([]);

  React.useEffect(() => {
    if (!open) return;
    void (async () => {
      try {
        const data = await call("/assets/names?barangayId=" + barangayId);
        setKnownNames(data.names ?? []);
      } catch {
        /* suggestions are a convenience, never a blocker */
      }
    })();
  }, [open, barangayId]);

  const lifeFor = (classificationId: string) => {
    const c = lookups.classifications.find((x) => String(x.id) === classificationId);
    return c && c.life_span_years ? String(c.life_span_years) : "";
  };

  /** Section 4.1: problems are shown beside the item concerned, before anything is sent. */
  function validate(): Record<string, string> {
    const errors: Record<string, string> = {};
    if (!form.name.trim()) errors.name = "Item name is required";
    // Table 2: classification and item type are required. A draft is half finished by definition.
    if (!form.isDraft) {
      if (!form.classificationId) errors.classificationId = "Classification is required";
      if (!form.itemTypeId) errors.itemTypeId = "Item type is required";
    }
    if (!form.dateAcquired) errors.dateAcquired = "Date acquired is required";
    else if (form.dateAcquired > today()) errors.dateAcquired = "Date acquired cannot be later than today";
    const qty = Number(form.quantity);
    if (!Number.isFinite(qty) || qty < 1) errors.quantity = "Quantity must be at least 1";
    const cost = Number(form.cost || 0);
    if (!Number.isFinite(cost) || cost < 0) errors.cost = "Cost cannot be negative";
    const life = Number(form.lifeSpanYears);
    if (!Number.isFinite(life) || life < 1) errors.lifeSpanYears = "Life span must be at least 1 year";
    return errors;
  }

  function fieldForMessage(message: string): string | null {
    const m = message.toLowerCase();
    if (m.includes("barcode")) return "barcode";
    if (m.includes("tag number")) return "tagNo";
    if (m.includes("security tag")) return "securityTag";
    if (m.includes("item name") || m.includes("name is required")) return "name";
    if (m.includes("date acquired")) return "dateAcquired";
    if (m.includes("quantity")) return "quantity";
    if (m.includes("life span")) return "lifeSpanYears";
    if (m.includes("item type")) return "itemTypeId";
    if (m.includes("classification")) return "classificationId";
    if (m.includes("cost")) return "cost";
    if (m.includes("for return") || m.includes("for receiving")) return null;
    return null;
  }

  async function submit() {
    const errors = validate();
    setFieldErrors(errors);
    if (Object.keys(errors).length) {
      setFormError(null);
      return;
    }
    setBusy(true);
    setFormError(null);
    try {
      const payload = {
        barangayId,
        name: form.name,
          classificationId: form.classificationId ? Number(form.classificationId) : null,
          itemTypeId: form.itemTypeId ? Number(form.itemTypeId) : null,
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
      };
      if (editing && asset) {
        await call("/assets/" + asset.id + "/actions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "update", ...payload, custodianId: undefined }),
        });
      } else {
        await call("/assets", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      }
      await onSaved();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const field = fieldForMessage(message);
      if (field) setFieldErrors({ [field]: message });
      else setFormError(message);
      setError(null);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => (!next ? onClose() : undefined)}>
      <DialogContent className="flex max-h-[90vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-2xl">
        <DialogHeader className="shrink-0 px-6 pt-6 pb-2">
          <DialogTitle>{editing ? "Edit asset" : "Add asset"}</DialogTitle>
          <DialogDescription>
            {editing
              ? "Changes are recorded in the asset history. Completing a draft clears the draft mark so it counts in totals and reports."
              : "The code is issued automatically as AST-(barangay code)-(number)."}
          </DialogDescription>
        </DialogHeader>
        <div className="grid min-h-0 flex-1 gap-3 overflow-y-auto px-6 py-2">
          <Field label="Item name">
            <Input
              value={form.name}
              list="brgy-item-names"
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="Monobloc chair, white"
            />
            {fieldErrors.name ? <span className="text-xs text-destructive">{fieldErrors.name}</span> : null}
          </Field>
          <datalist id="brgy-item-names">
            {knownNames.map((n) => (
              <option key={n} value={n} />
            ))}
          </datalist>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Classification">
              <select
                className="cursor-pointer h-9 w-full rounded-md border bg-background px-3 text-sm"
                value={form.classificationId}
                onChange={(e) => {
                  const life = lifeFor(e.target.value);
                  setForm({ ...form, classificationId: e.target.value, itemTypeId: "", lifeSpanYears: life || form.lifeSpanYears });
                }}
              >
                <option value="">Choose one</option>
                {offerable(lookups.classifications).map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
              {fieldErrors.classificationId ? <span className="text-xs text-destructive">{fieldErrors.classificationId}</span> : null}
            </Field>
            <Field label="Item type">
              <select
                className="cursor-pointer h-9 w-full rounded-md border bg-background px-3 text-sm"
                value={form.itemTypeId}
                onChange={(e) => setForm({ ...form, itemTypeId: e.target.value })}
              >
                <option value="">Choose one</option>
                {offerable(lookups.itemTypes)
                  .filter((t) => !form.classificationId || String(t.classification_id) === form.classificationId)
                  .map((t) => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
              </select>
              {fieldErrors.itemTypeId ? <span className="text-xs text-destructive">{fieldErrors.itemTypeId}</span> : null}
            </Field>
            <Field label="Condition">
              <select
                className="cursor-pointer h-9 w-full rounded-md border bg-background px-3 text-sm"
                value={form.condition}
                onChange={(e) => setForm({ ...form, condition: e.target.value as BrgyCondition })}
              >
                {BRGY_CONDITIONS.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </Field>
            <Field label="Office">
              <select className="cursor-pointer h-9 w-full rounded-md border bg-background px-3 text-sm" value={form.officeId} onChange={(e) => setForm({ ...form, officeId: e.target.value })}>
                <option value="">None</option>
                {offerable(lookups.offices).map((o) => (
                  <option key={o.id} value={o.id}>{o.name}</option>
                ))}
              </select>
            </Field>
            <Field label="Custodian">
              <select className="cursor-pointer h-9 w-full rounded-md border bg-background px-3 text-sm" value={form.custodianId} onChange={(e) => setForm({ ...form, custodianId: e.target.value })}>
                <option value="">Unassigned</option>
                {offerable(lookups.custodians).map((c) => (
                  <option key={c.id} value={c.id}>{c.full_name}</option>
                ))}
              </select>
            </Field>
            <Field label="Date acquired">
              <Input type="date" value={form.dateAcquired} onChange={(e) => setForm({ ...form, dateAcquired: e.target.value })} />
              {fieldErrors.dateAcquired ? <span className="text-xs text-destructive">{fieldErrors.dateAcquired}</span> : null}
            </Field>
            <Field label="Cost, pesos">
              <Input value={form.cost} onChange={(e) => setForm({ ...form, cost: e.target.value })} placeholder="30000" />
              {fieldErrors.cost ? <span className="text-xs text-destructive">{fieldErrors.cost}</span> : null}
            </Field>
            <Field label="Quantity">
              <Input value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} />
              {fieldErrors.quantity ? <span className="text-xs text-destructive">{fieldErrors.quantity}</span> : null}
            </Field>
            <Field label="Life span, years">
              <Input value={form.lifeSpanYears} onChange={(e) => setForm({ ...form, lifeSpanYears: e.target.value })} />
              {fieldErrors.lifeSpanYears ? <span className="text-xs text-destructive">{fieldErrors.lifeSpanYears}</span> : null}
            </Field>
            <Field label="Barcode">
              <Input value={form.barcode} onChange={(e) => setForm({ ...form, barcode: e.target.value })} />
              {fieldErrors.barcode ? <span className="text-xs text-destructive">{fieldErrors.barcode}</span> : null}
            </Field>
            <Field label="Tag number">
              <Input value={form.tagNo} onChange={(e) => setForm({ ...form, tagNo: e.target.value })} />
              {fieldErrors.tagNo ? <span className="text-xs text-destructive">{fieldErrors.tagNo}</span> : null}
            </Field>
            <Field label="Security tag">
              <Input value={form.securityTag} onChange={(e) => setForm({ ...form, securityTag: e.target.value })} />
              {fieldErrors.securityTag ? <span className="text-xs text-destructive">{fieldErrors.securityTag}</span> : null}
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
          <Button onClick={() => void submit()} disabled={busy}>
            {busy ? "Saving..." : editing ? (asset?.is_draft && !form.isDraft ? "Complete draft" : "Save changes") : "Save asset"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AssetDetailDialog({
  detail,
  lookups,
  allow,
  onClose,
  onChanged,
  setError,
  onEdit,
}: {
  detail: { asset: BrgyAsset; history: BrgyHistoryEntry[]; projected: number; projectedTotalValue: number };
  lookups: Lookups;
  allow: (permission: string) => boolean;
  onClose: () => void;
  onChanged: () => Promise<void> | void;
  setError: (v: string | null) => void;
  onEdit: (asset: BrgyAsset) => void;
}) {
  const asset = detail.asset;
  const [busy, setBusy] = React.useState(false);
  const [action, setAction] = React.useState<"assign" | "condition" | "status" | "cancel" | "return" | null>(null);
  const [custodianId, setCustodianId] = React.useState(String(asset.custodian_id ?? ""));
  const [officeId, setOfficeId] = React.useState(String(asset.office_id ?? ""));
  const [condition, setCondition] = React.useState<BrgyCondition>(asset.condition);
  const [toStatus, setToStatus] = React.useState<BrgyStatus>("Active");
  const [remarks, setRemarks] = React.useState("");
  const [repairNote, setRepairNote] = React.useState("");
  const [repairCondition, setRepairCondition] = React.useState<BrgyCondition>("Good");
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
            {asset.name} | {lookups.itemTypes.find((t) => t.id === asset.item_type_id)?.name ?? "no item type"} | {asset.status} |{" "}
            {asset.condition} | projected {peso(detail.projected)}, total {peso(detail.projectedTotalValue)}
          </DialogDescription>
        </DialogHeader>

        <div className="grid min-h-0 flex-1 gap-3 overflow-y-auto px-6 py-2">
          <div className="flex flex-wrap gap-2">
            {allow("editRecord") ? (
              <Button size="sm" variant="outline" onClick={() => onEdit(asset)}>
                Edit
              </Button>
            ) : null}
            {allow("assign") ? (
              <Button size="sm" variant="outline" onClick={() => setAction("assign")}>
                Assign
              </Button>
            ) : null}
            {allow("condition") ? (
              <Button size="sm" variant="outline" onClick={() => setAction("condition")}>
                Update condition
              </Button>
            ) : null}
            {allow("condition") ? (
              <Button size="sm" variant="outline" onClick={() => setAction("status")}>
                Change status
              </Button>
            ) : null}
            {asset.owner_type === "lgu" && allow("assign") ? (
              <Button size="sm" variant="outline" onClick={() => setAction("return")}>
                Return to LGU
              </Button>
            ) : null}
            <Button
              size="sm"
              variant="outline"
              onClick={() => printAssetLabel({ asset, barangay: lookups.barangays.find((b) => b.id === asset.barangay_id)?.name ?? "" })}
            >
              Print label
            </Button>
            {allow("cancelRecord") ? (
              <Button size="sm" variant="ghost" onClick={() => setAction("cancel")}>
                Cancel record
              </Button>
            ) : null}
          </div>

          {action === "assign" ? (
            <div className="grid gap-2 rounded-md border p-3">
              <Field label="Custodian">
                <select className="cursor-pointer h-9 w-full rounded-md border bg-background px-3 text-sm" value={custodianId} onChange={(e) => setCustodianId(e.target.value)}>
                  <option value="">Choose one</option>
                  {offerable(lookups.custodians).map((c) => (
                    <option key={c.id} value={c.id}>{c.full_name}</option>
                  ))}
                </select>
              </Field>
              <Field label="Office">
                <select className="cursor-pointer h-9 w-full rounded-md border bg-background px-3 text-sm" value={officeId} onChange={(e) => setOfficeId(e.target.value)}>
                  <option value="">None</option>
                  {offerable(lookups.offices).map((o) => (
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
                <select className="cursor-pointer h-9 w-full rounded-md border bg-background px-3 text-sm" value={condition} onChange={(e) => setCondition(e.target.value as BrgyCondition)}>
                  {BRGY_CONDITIONS.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </Field>
              {condition === "Needs Repair" ? (
                <p className="rounded border border-amber-500/40 bg-amber-500/10 p-2 text-xs">
                  Needs Repair suggests changing the status to <strong>Under Repair</strong>. Saving the condition does not change the status, so
                  use Change status next.
                </p>
              ) : null}
              {condition === "Unserviceable" ? (
                <p className="rounded border border-destructive/40 bg-destructive/10 p-2 text-xs">
                  Unserviceable means it cannot be used or repaired. After saving, choose <strong>Under Repair</strong> if a repair is still worth
                  trying, or <strong>For Disposal</strong> to send it for approval.
                </p>
              ) : null}
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
                <select className="cursor-pointer h-9 w-full rounded-md border bg-background px-3 text-sm" value={toStatus} onChange={(e) => setToStatus(e.target.value as BrgyStatus)}>
                  {BRGY_STATUSES.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </Field>
              {toStatus === "Under Repair" ? (
                <Field label="Who is repairing it">
                  <Input value={repairNote} onChange={(e) => setRepairNote(e.target.value)} placeholder="Name of the repairer or shop" />
                </Field>
              ) : null}
              {toStatus === "Active" ? (
                <Field label="Condition after the repair">
                  <select
                    className="cursor-pointer h-9 w-full rounded-md border bg-background px-3 text-sm"
                    value={repairCondition}
                    onChange={(e) => setRepairCondition(e.target.value as BrgyCondition)}
                  >
                    <option value="Good">Good</option>
                    <option value="Fair">Fair</option>
                  </select>
                </Field>
              ) : null}
              <Field label="Reason, required for Missing, For Disposal and Disposed">
                <Input value={remarks} onChange={(e) => setRemarks(e.target.value)} />
              </Field>
              <div className="flex justify-end gap-2">
                <Button size="sm" variant="outline" onClick={() => setAction(null)}>Cancel</Button>
                <Button
                  size="sm"
                  disabled={busy}
                  onClick={() =>
                    void run({
                      action: "status",
                      to: toStatus,
                      reason: remarks,
                      repairNote: toStatus === "Under Repair" ? repairNote : null,
                      condition: toStatus === "Active" && repairCondition ? repairCondition : null,
                    })
                  }
                >
                  Change status
                </Button>
              </div>
            </div>
          ) : null}

          {action === "return" ? (
            <div className="grid gap-2 rounded-md border p-3">
              <Field label="Describe the defect, required">
                <Input value={remarks} onChange={(e) => setRemarks(e.target.value)} />
              </Field>
              <Field label="Photo of the defect, optional">
                <input
                  type="file"
                  accept="image/*"
                  className="text-xs"
                  disabled={busy}
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    setBusy(true);
                    setFormError(null);
                    try {
                      const body = new FormData();
                      body.append("file", file);
                      const res = await fetch("/api/fm/barangay-asset-inventory-system/assets/" + asset.id + "/photo", { method: "POST", body });
                      if (!res.ok) {
                        const payload = await res.json().catch(() => null);
                        throw new Error(payload?.message ?? "The photo could not be attached");
                      }
                      await onChanged();
                    } catch (err) {
                      setFormError(err instanceof Error ? err.message : String(err));
                    } finally {
                      setBusy(false);
                    }
                  }}
                />
              </Field>
              <p className="text-xs text-muted-foreground">The LGU sees this photo with the return, so the defect is visible before they decide.</p>
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
            <h3 className="mb-1 text-sm font-medium">Photo</h3>
            <div className="flex flex-wrap items-center gap-3 rounded border p-2">
              {asset.photo ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={"/api/fm/barangay-asset-inventory-system/assets/" + asset.id + "/photo?v=" + asset.photo}
                  alt={"Photo of " + asset.name}
                  className="h-24 w-32 rounded object-cover"
                />
              ) : (
                <span className="text-xs text-muted-foreground">No photo yet. One clear photo per asset is strongly encouraged.</span>
              )}
              <input
                type="file"
                accept="image/*"
                className="text-xs"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  setBusy(true);
                  setFormError(null);
                  try {
                    const body = new FormData();
                    body.append("file", file);
                    const res = await fetch("/api/fm/barangay-asset-inventory-system/assets/" + asset.id + "/photo", { method: "POST", body });
                    if (!res.ok) {
                      const payload = await res.json().catch(() => null);
                      throw new Error(payload?.message ?? "Upload failed");
                    }
                    await onChanged();
                  } catch (err) {
                    setFormError(err instanceof Error ? err.message : String(err));
                  } finally {
                    setBusy(false);
                  }
                }}
              />
            </div>
          </section>

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

