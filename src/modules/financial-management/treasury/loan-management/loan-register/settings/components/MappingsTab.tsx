"use client";

import { useState } from "react";
import { Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { formatNumber } from "@/lib/utils";

import { ACCENT, MAPPING_BLOCKS, MAPPING_SECTIONS, mappingLabel } from "../constants";
import type { LineAccountBody } from "../schemas";
import type { GlAccountOption, SettingsMapping } from "../types";
import { AddLineAccountDialog } from "./AddLineAccountDialog";
import { MappingDialog } from "./MappingDialog";
import { Notice } from "./Notice";
import { StatusBadge } from "./StatusBadge";

/** Where a key sits before the table carries a group: its static section. */
const SECTION_OF: Record<string, string> = Object.fromEntries(
  MAPPING_SECTIONS.flatMap((section) => section.keys.map((key) => [key, section.title] as const)),
);
const GROUP_ORDER = MAPPING_SECTIONS.map((section) => section.title);
const OTHER = "Other line accounts";

function groupOf(row: SettingsMapping): string {
  return row.mappingGroup ?? SECTION_OF[row.mappingKey] ?? OTHER;
}

function rank(name: string): number {
  const index = GROUP_ORDER.indexOf(name);
  return index === -1 ? GROUP_ORDER.length : index;
}

function labelOf(row: SettingsMapping): string {
  return row.mappingLabel ?? mappingLabel(row.mappingKey);
}

type Props = {
  mappings: SettingsMapping[];
  chartAccounts: GlAccountOption[];
  isSaving: boolean;
  onChange: (mappingKey: string, coaId: number | null, description: string) => Promise<unknown>;
  onAdd: (body: LineAccountBody) => Promise<unknown>;
};

/**
 * The GL accounts every loan posting needs. A key with no account stops the
 * posting that needs it, so each row says which one.
 */
export function MappingsTab({ mappings, chartAccounts, isSaving, onChange, onAdd }: Props) {
  const [editing, setEditing] = useState<SettingsMapping | null>(null);
  const [adding, setAdding] = useState(false);
  const unmapped = mappings.filter((row) => row.coaId === null);

  const buckets = new Map<string, SettingsMapping[]>();
  for (const row of mappings) {
    const name = groupOf(row);
    const list = buckets.get(name);
    if (list) list.push(row);
    else buckets.set(name, [row]);
  }
  const groups = [...buckets.entries()]
    .map(([name, rows]) => ({ name, rows }))
    .sort((a, b) => rank(a.name) - rank(b.name) || a.name.localeCompare(b.name));

  return (
    <div className="space-y-3">
      {unmapped.length === 0 ? null : (
        <Notice
          tone="danger"
          title={`${formatNumber(unmapped.length)} posting account${unmapped.length === 1 ? " is" : "s are"} not mapped.`}
        >
          Posting stops at any key that has no account.
        </Notice>
      )}

      <Card className={`border-t-[3px] ${ACCENT}`}>
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
          <div className="min-w-0">
            <h3 className="text-sm font-semibold">GL line accounts</h3>
            <p className="text-xs text-muted-foreground">
              Every key a loan posting asks for, grouped by what it touches.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-medium tabular-nums text-muted-foreground">
              {formatNumber(mappings.length)} keys
            </span>
            <Button type="button" className="min-h-11 md:min-h-0" disabled={isSaving} onClick={() => setAdding(true)}>
              <Plus className="mr-1.5 h-4 w-4" aria-hidden />
              Add Line Account
            </Button>
          </div>
        </div>

        {groups.length === 0 ? (
          <p className="px-4 py-10 text-center text-sm text-muted-foreground">No GL key is listed yet.</p>
        ) : null}

        {groups.map((group) => (
          <div key={group.name}>
            <h4 className="flex items-center justify-between gap-2 border-y border-border bg-muted/40 px-4 py-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
              <span className="min-w-0 truncate" title={group.name}>
                {group.name}
              </span>
              <span className="shrink-0 tabular-nums">{formatNumber(group.rows.length)}</span>
            </h4>

            <ul className="divide-y divide-border">
              {group.rows.map((row) => {
                const label = labelOf(row);
                const blocks = MAPPING_BLOCKS[row.mappingKey] ?? "";
                const mapped = row.coaId != null;
                return (
                  <li key={row.mappingKey} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium" title={label}>
                        {label}
                      </p>
                      <p className="font-mono text-[11px] break-words text-muted-foreground">{row.mappingKey}</p>
                      {row.description ? (
                        <p className="mt-0.5 text-xs text-muted-foreground">{row.description}</p>
                      ) : null}
                      {blocks ? <p className="mt-0.5 text-xs text-muted-foreground">{blocks}</p> : null}
                    </div>

                    <div className="flex w-full shrink-0 items-center justify-between gap-3 sm:w-auto">
                      <div className="min-w-0 sm:w-[15rem]">
                        {mapped ? (
                          <div className="min-w-0 text-sm tabular-nums">
                            <p className="truncate font-medium" title={row.glCode ?? undefined}>
                              {row.glCode}
                            </p>
                            <p className="truncate text-muted-foreground" title={row.accountTitle ?? undefined}>
                              {row.accountTitle}
                            </p>
                          </div>
                        ) : (
                          <StatusBadge tone="danger" title={`Nothing is posted to ${label} yet.`}>
                            Not mapped
                          </StatusBadge>
                        )}
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="min-h-11 shrink-0 md:min-h-0"
                        disabled={isSaving}
                        aria-label={`Change the account for ${label}`}
                        title={`Change the account for ${label}`}
                        onClick={() => setEditing(row)}
                      >
                        Change
                      </Button>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </Card>

      {adding ? (
        <AddLineAccountDialog
          groups={groups.map((group) => group.name)}
          chartAccounts={chartAccounts}
          isSaving={isSaving}
          onClose={() => setAdding(false)}
          onSubmit={onAdd}
        />
      ) : null}

      {editing ? (
        <MappingDialog
          mapping={editing}
          chartAccounts={chartAccounts}
          isSaving={isSaving}
          onClose={() => setEditing(null)}
          onSubmit={(coaId, description) => onChange(editing.mappingKey, coaId, description)}
        />
      ) : null}
    </div>
  );
}
