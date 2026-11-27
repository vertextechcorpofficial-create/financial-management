"use client";

import { TablePager, pageCountFor } from "./TablePager";

/** The board pages in the browser, so the pager calls back into the hook rather than the router. */
export function Pager({
  page,
  size,
  total,
  onPage,
  onSize,
}: {
  page: number;
  size: number;
  total: number;
  onPage: (page: number) => void;
  onSize: (size: number) => void;
}) {
  return (
    <TablePager
      page={page}
      pageCount={pageCountFor(total, size)}
      total={total}
      pageSize={size}
      onPageChange={onPage}
      onPageSizeChange={onSize}
      className="border-t border-border/50 px-4 py-3"
    />
  );
}
