"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { formatNumber } from "@/lib/utils";

import { ACCENT, MAPPING_BLOCKS, MAPPING_LABELS, MAPPING_SECTIONS } from "../constants";
import type { GlAccountOption, SettingsMapping } from "../types";
import { MappingDialog } from "./MappingDialog";
import { Notice } from "./Notice";
import { StatusBadge } from "./StatusBadge";

type Props = {
  mappings: SettingsMapping[];
  chartAccounts: GlAccountOption[];
  isSaving: boolean;
  onChange: (mappingKey: string, coaId: number | null) => Promise<unknown>;
};

/**
 * The GL accounts every loan posting needs. A key with no account stops the
 * posting that needs it, so each row says which one.
 */
export function MappingsTab({ mappings, chartAccounts, isSaving, onChange }: Props) {
  const [editing, setEditing] = useState<SettingsMapping | null>(null);
  const byKey = new Map(mappings.map((row) => [row.mappingKey, row]));
  const unmapped = mappings.filter((row) => row.coaId === null);

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

      {MAPPING_SECTIONS.map((section) => (
        <Card key={section.title} className={`border-t-[3px] ${ACCENT}`}>
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
            <h3 className="min-w-0 truncate text-sm font-semibold">{section.title}</h3>
            <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-medium tabular-nums text-muted-foreground">
              {formatNumber(section.keys.length)} keys
            </span>
          </div>

          <ul className="divide-y divide-border">
            {section.keys.map((mappingKey) => {
              const row = byKey.get(mappingKey);
              const label = MAPPING_LABELS[mappingKey] ?? mappingKey;
              const mapped = row?.coaId != null;
              return (
                <li
                  key={mappingKey}
                  className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-3"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium" title={label}>
                      {label}
                    </p>
                    <p className="font-mono text-[11px] break-words text-muted-foreground">{mappingKey}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">{MAPPING_BLOCKS[mappingKey] ?? ""}</p>
                  </div>

                  <div className="flex w-full shrink-0 items-center justify-between gap-3 sm:w-auto">
                    <div className="min-w-0 sm:w-[15rem]">
                      {mapped ? (
                        <p className="truncate text-sm tabular-nums" title={`${row.glCode} · ${row.accountTitle}`}>
                          <span className="font-medium">{row.glCode}</span> · {row.accountTitle}
                        </p>
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
                      onClick={() => row && setEditing(row)}
                    >
                      Change
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        </Card>
      ))}

      {editing ? (
        <MappingDialog
          mapping={editing}
          chartAccounts={chartAccounts}
          isSaving={isSaving}
          onClose={() => setEditing(null)}
          onSubmit={(coaId) => onChange(editing.mappingKey, coaId)}
        />
      ) : null}
    </div>
  );
}
