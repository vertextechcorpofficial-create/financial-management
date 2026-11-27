"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { ReferenceKind } from "../../admin/services/brgyAdmin";
import { call, Field } from "../../shared/ui";
import { SubTabs } from "../../shared/SubTabs";
import {
  BRGY_CODE_HELP,
  JSON_HEADERS,
  messageOf,
  type ListSpec,
  type ReferenceColumn,
  type ReferenceRow,
} from "../../admin/shared/adminCommon";

/**
 * LGU admin submodule. Section 2 and Table 4: the barangays, their offices and custodians, the
 * classifications with their life spans, and the item types that belong to a classification.
 * Table 5 keeps writing to the System Admin, so a municipal account sees this read only.
 */

interface BarangayRow {
  id: number;
  code: string;
  name: string;
  status: string;
}

interface OfficeRow {
  id: number;
  barangay_id: number;
  name: string;
  status: string;
}

interface CustodianRow {
  id: number;
  barangay_id: number;
  full_name: string;
  position: string | null;
  status: string;
}

interface ClassificationRow {
  id: number;
  name: string;
  life_span_years: number | null;
  status: string;
}

interface ItemTypeRow {
  id: number;
  name: string;
  classification_id: number;
  status: string;
}

interface ListsPayload {
  barangays: BarangayRow[];
  offices: OfficeRow[];
  custodians: CustodianRow[];
  classifications: ClassificationRow[];
  itemTypes: ItemTypeRow[];
  usage: Record<string, number>;
}

function valueOf(values: Record<string, string>, field: string): string {
  return values[field] ?? "";
}

function ReferenceCard({
  kind,
  title,
  hint,
  columns,
  rows,
  canEdit,
  setError,
  setNotice,
  onSaved,
}: {
  kind: ReferenceKind;
  title: string;
  hint?: string;
  columns: ReferenceColumn[];
  rows: ReferenceRow[];
  canEdit: boolean;
  setError: (v: string | null) => void;
  setNotice: (v: string | null) => void;
  onSaved: () => Promise<void>;
}) {
  // an edit shadows the stored row until it is saved, so a reload always shows the server's answer
  const [edits, setEdits] = React.useState<Record<number, Record<string, string>>>({});
  const [fresh, setFresh] = React.useState<Record<string, string>>({});
  const [busy, setBusy] = React.useState(false);

  function valuesFor(row: ReferenceRow): Record<string, string> {
    return { ...row.values, ...(edits[row.id] ?? {}) };
  }

  function setEdit(id: number, field: string, value: string) {
    setEdits((prev) => ({ ...prev, [id]: { ...(prev[id] ?? {}), [field]: value } }));
  }

  async function act(row: ReferenceRow, action: "retire" | "restore" | "delete") {
    if (action === "delete") {
      const ok = window.confirm(
        "Remove this " + title.toLowerCase() + " from the lists?\n\nThis cannot be undone. Only allowed while nothing points at it."
      );
      if (!ok) return;
    }
    setBusy(true);
    setError(null);
    try {
      await call("/admin/lists", {
        method: "POST",
        headers: JSON_HEADERS,
        body: JSON.stringify({ kind, id: row.id, action }),
      });
      setNotice(
        title +
          (action === "retire" ? ": retired, it is hidden from new records." : action === "restore" ? ": back in the lists." : ": row removed.")
      );
      await onSaved();
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setBusy(false);
    }
  }

  async function save(id: number | null) {
    const payload = id === null ? fresh : edits[id] ?? {};
    setBusy(true);
    setError(null);
    try {
      await call("/admin/lists", {
        method: "POST",
        headers: JSON_HEADERS,
        body: JSON.stringify(id === null ? { kind, ...payload } : { kind, id, ...payload }),
      });
      setNotice(title + (id === null ? ": row added." : ": row saved."));
      if (id === null) setFresh({});
      else
        setEdits((prev) => {
          const next = { ...prev };
          delete next[id];
          return next;
        });
      await onSaved();
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-md border p-4">
      <div className="text-sm font-medium">{title}</div>
      {hint ? <div className="mt-1 text-sm text-muted-foreground">{hint}</div> : null}
      {canEdit ? null : (
        <div className="mt-1 text-xs text-muted-foreground">
          Read only for your role. The System Admin keeps these lists.
        </div>
      )}
      {canEdit ? (
        <div className="mt-3 flex flex-wrap items-end gap-2 rounded-md border bg-muted/20 p-2">
          {columns.map((column) => (
            <div key={column.field} className="min-w-[180px] flex-1">
              <Field label={column.label}>
                {column.kind === "select" ? (
                  <select
                    className="cursor-pointer h-9 w-full rounded-md border bg-background px-2 text-sm"
                    value={valueOf(fresh, column.field)}
                    onChange={(e) => setFresh({ ...fresh, [column.field]: e.target.value })}
                  >
                    <option value="">choose</option>
                    {(column.options ?? []).map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                ) : (
                  <Input
                    placeholder={"new " + column.label.toLowerCase()}
                    value={valueOf(fresh, column.field)}
                    onChange={(e) => setFresh({ ...fresh, [column.field]: e.target.value })}
                  />
                )}
              </Field>
            </div>
          ))}
          <Button size="sm" variant="outline" disabled={busy} onClick={() => void save(null)}>
            Add
          </Button>
        </div>
      ) : null}

      <div className="mt-3 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0 z-10 bg-background">
            <tr className="border-b text-left">
              {columns.map((column) => (
                <th key={column.field} className="p-2">
                  {column.label}
                </th>
              ))}
              <th className="p-2" />
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const values = valuesFor(row);
              return (
                <tr key={row.id} className="border-b last:border-0">
                  {columns.map((column) => (
                    <td key={column.field} className="p-2 align-top">
                      {column.kind === "select" ? (
                        <select
                          className="cursor-pointer h-9 rounded-md border bg-background px-2 text-sm"
                          value={valueOf(values, column.field)}
                          disabled={!canEdit}
                          onChange={(e) => setEdit(row.id, column.field, e.target.value)}
                        >
                          <option value="">choose</option>
                          {(column.options ?? []).map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <Input
                          value={valueOf(values, column.field)}
                          disabled={!canEdit}
                          onChange={(e) => setEdit(row.id, column.field, e.target.value)}
                        />
                      )}
                    </td>
                  ))}
                  <td className="p-2 text-right align-top">
                    <div className="flex flex-wrap items-center justify-end gap-1">
                      {row.status && row.status !== "active" ? (
                        <span className="rounded-full border px-2 py-0.5 text-xs text-muted-foreground">retired</span>
                      ) : null}
                      <Button size="sm" disabled={busy || !canEdit} onClick={() => void save(row.id)}>
                        Save
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={busy || !canEdit}
                        onClick={() => void act(row, row.status && row.status !== "active" ? "restore" : "retire")}
                      >
                        {row.status && row.status !== "active" ? "Restore" : "Retire"}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={busy || !canEdit || (row.usage ?? 0) > 0}
                        title={
                          (row.usage ?? 0) > 0
                            ? "Still used by " + row.usage + " record(s). Retire it instead."
                            : "Nothing points at this row, so it can be removed"
                        }
                        onClick={() => void act(row, "delete")}
                      >
                        Delete{(row.usage ?? 0) > 0 ? " (" + row.usage + ")" : ""}
                      </Button>
                    </div>
                  </td>
                </tr>
              );
            })}

          </tbody>
        </table>
      </div>
      {rows.length === 0 ? <p className="mt-2 text-sm text-muted-foreground">Nothing here yet.</p> : null}
    </div>
  );
}

export function LguAdminTab({
  canEdit,
  setError,
  setNotice,
}: {
  canEdit: boolean;
  setError: (v: string | null) => void;
  setNotice: (v: string | null) => void;
}) {
  const [lists, setLists] = React.useState<ListsPayload | null>(null);
  const [loading, setLoading] = React.useState(true);
  // one list at a time, so five long tables never stack into one endless page
  const [active, setActive] = React.useState<ReferenceKind>("barangay");

  const load = React.useCallback(async () => {
    setLists((await call("/admin/lists")) as ListsPayload);
  }, []);

  React.useEffect(() => {
    void (async () => {
      try {
        await load();
      } catch (err) {
        setError(messageOf(err));
      } finally {
        setLoading(false);
      }
    })();
  }, [load, setError]);

  const specs = React.useMemo<ListSpec[]>(() => {
    const barangayOptions = (lists?.barangays ?? []).map((b) => ({ value: String(b.id), label: b.code + " " + b.name }));
    const classificationOptions = (lists?.classifications ?? []).map((c) => ({ value: String(c.id), label: c.name }));
    return [
      {
        kind: "barangay",
        title: "Barangays",
        hint: "Barangay code: " + BRGY_CODE_HELP + ".",
        columns: [
          { field: "code", label: "Code", kind: "text" },
          { field: "name", label: "Name", kind: "text" },
        ],
        rows: (lists?.barangays ?? []).map((b) => ({
          id: b.id,
          values: { code: b.code, name: b.name },
          status: b.status,
          usage: lists?.usage?.["barangay:" + b.id] ?? 0,
        })),
      },
      {
        kind: "office",
        title: "Offices",
        hint: "Where an asset is kept, for example Barangay Hall, Health Center, Day Care.",
        columns: [
          { field: "barangayId", label: "Barangay", kind: "select", options: barangayOptions },
          { field: "name", label: "Office", kind: "text" },
        ],
        rows: (lists?.offices ?? []).map((o) => ({
          id: o.id,
          values: { barangayId: String(o.barangay_id), name: o.name },
          status: o.status,
          usage: lists?.usage?.["office:" + o.id] ?? 0,
        })),
      },
      {
        kind: "custodian",
        title: "Custodians",
        hint: "The people who can be made responsible for an asset.",
        columns: [
          { field: "barangayId", label: "Barangay", kind: "select", options: barangayOptions },
          { field: "name", label: "Full name", kind: "text" },
          { field: "position", label: "Position", kind: "text" },
        ],
        rows: (lists?.custodians ?? []).map((c) => ({
          id: c.id,
          values: { barangayId: String(c.barangay_id), name: c.full_name, position: c.position ?? "" },
          status: c.status,
          usage: lists?.usage?.["custodian:" + c.id] ?? 0,
        })),
      },
      {
        kind: "classification",
        title: "Classifications",
        hint: "Equipment, machinery, furniture and other assets, each with its default life span in years.",
        columns: [
          { field: "name", label: "Classification", kind: "text" },
          { field: "lifeSpanYears", label: "Life span years", kind: "text" },
        ],
        rows: (lists?.classifications ?? []).map((c) => ({
          id: c.id,
          values: { name: c.name, lifeSpanYears: c.life_span_years == null ? "" : String(c.life_span_years) },
          status: c.status,
          usage: lists?.usage?.["classification:" + c.id] ?? 0,
        })),
      },
      {
        kind: "item_type",
        title: "Item types",
        hint: "Every item type belongs to one classification, for example Laptop belongs to Equipment.",
        columns: [
          { field: "name", label: "Item type", kind: "text" },
          { field: "classificationId", label: "Classification", kind: "select", options: classificationOptions },
        ],
        rows: (lists?.itemTypes ?? []).map((t) => ({
          id: t.id,
          values: { name: t.name, classificationId: String(t.classification_id) },
          status: t.status,
          usage: lists?.usage?.["item_type:" + t.id] ?? 0,
        })),
      },
    ];
  }, [lists]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="text-sm font-medium">Reference lists</div>
          <p className="text-sm text-muted-foreground">
            The barangays, their offices and custodians, the classifications, and the item types. Nothing here is ever deleted, so
            an old asset keeps pointing at the list it was registered with.
          </p>
        </div>
        <Button size="sm" variant="outline" disabled={loading} onClick={() => void load().catch((err) => setError(messageOf(err)))}>
          Refresh
        </Button>
      </div>
      {loading ? <p className="text-sm text-muted-foreground">Loading lists...</p> : null}

      <SubTabs
        value={active}
        onChange={setActive}
        tabs={specs.map((spec) => ({ id: spec.kind, label: spec.title, count: spec.rows.length }))}
      />

      {specs.filter((spec) => spec.kind === active).map((spec) => (
        <ReferenceCard
          key={spec.kind}
          kind={spec.kind}
          title={spec.title}
          hint={spec.hint}
          columns={spec.columns}
          rows={spec.rows}
          canEdit={canEdit}
          setError={setError}
          setNotice={setNotice}
          onSaved={load}
        />
      ))}
    </div>
  );
}
