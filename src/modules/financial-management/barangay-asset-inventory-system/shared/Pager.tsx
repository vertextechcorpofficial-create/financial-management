"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";

/** One pager for every long table, so a hundred rows never become one endless scroll. */
export function Pager({
  page,
  pageSize,
  total,
  onChange,
  noun = "row",
}: {
  page: number;
  pageSize: number;
  total: number;
  onChange: (page: number) => void;
  noun?: string;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (total <= pageSize) {
    return (
      <div className="text-xs text-muted-foreground">
        {total} {noun}(s), all on this page.
      </div>
    );
  }
  const first = (page - 1) * pageSize + 1;
  const last = Math.min(total, page * pageSize);
  return (
    <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
      <span>
        {noun}s {first} to {last} of {total}, page {page} of {pages}
      </span>
      <span className="ml-auto flex gap-1">
        <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => onChange(page - 1)}>
          Previous
        </Button>
        <Button size="sm" variant="outline" disabled={page >= pages} onClick={() => onChange(page + 1)}>
          Next
        </Button>
      </span>
    </div>
  );
}
