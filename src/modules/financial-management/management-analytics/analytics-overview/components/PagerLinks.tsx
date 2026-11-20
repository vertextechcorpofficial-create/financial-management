"use client";

import { useRouter } from "next/navigation";
import { TablePager, pageCountFor, usePageSize } from "./TablePager";

interface Props {
  page: number;
  total: number;
  pageSize: number;
  basePath: string;
  query: Record<string, string | undefined>;
}

/** Server pages cannot pass callbacks to the shared pager, so navigation goes through the router. */
export function PagerLinks({ page, total, pageSize, basePath, query }: Props) {
  const router = useRouter();
  const pageCount = pageCountFor(total, pageSize);

  const go = (next: { page?: number; pageSize?: number }) => {
    const search = new URLSearchParams();
    for (const [key, value] of Object.entries(query)) {
      if (value) search.set(key, value);
    }
    const size = next.pageSize ?? pageSize;
    const target = next.page ?? page;
    if (size !== 10) search.set("size", String(size));
    if (target > 1) search.set("page", String(target));
    const suffix = search.toString();
    router.push(suffix ? `${basePath}?${suffix}` : basePath);
  };

  return (
    <TablePager
      page={page}
      pageCount={pageCount}
      total={total}
      pageSize={pageSize}
      onPageChange={(next) => go({ page: next })}
      onPageSizeChange={(size) => go({ pageSize: size, page: 1 })}
      className="border-t border-border/50 px-4 py-3"
    />
  );
}

export { usePageSize };
