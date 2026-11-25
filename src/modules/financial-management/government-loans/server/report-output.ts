import "server-only";

import { z } from "zod";
import { csvCell } from "../loans/register-csv";
import { amountFromCentavos } from "../loans/position";
import { centavos } from "../payroll-handoff/contract";
import { reportSorts, type ReportKey } from "../reports/report-options";
import { pageNumber } from "./request-input";

export function reportQuery(report: ReportKey, defaultSort: string, direction: "asc" | "desc" = "asc") {
  return { page: pageNumber, size: z.enum(["10", "25", "50"]).default("25").transform(Number),
    sort: z.string().refine(value => Object.hasOwn(reportSorts[report], value)).default(defaultSort),
    direction: z.enum(["asc", "desc"]).default(direction) };
}

export function moneyCents(value: string) {
  return value.startsWith("-") ? -centavos(value.slice(1)) : centavos(value);
}

export function moneyTotal<T>(rows: T[], field: (row: T) => string | null | undefined) {
  return amountFromCentavos(rows.reduce((sum, row) => sum + moneyCents(field(row) ?? "0.00"), 0n));
}

type SortValue = string | bigint | number | null;
const collator = new Intl.Collator("en", { numeric: true, sensitivity: "base" });
export function sortReport<T>(rows: T[], value: (row: T) => SortValue, key: (row: T) => string, direction: "asc" | "desc") {
  const order = direction === "asc" ? 1 : -1;
  return rows.sort((a, b) => {
    const left = value(a);
    const right = value(b);
    const tie = () => collator.compare(key(a), key(b)) || key(a).localeCompare(key(b));
    if (left === null || right === null) return left === right ? tie() : left === null ? 1 : -1;
    const result = typeof left === "string" && typeof right === "string" ? collator.compare(left, right) :
      left < right ? -1 : left > right ? 1 : 0;
    return result ? order * result : tie();
  });
}

export function pageReport<T>(rows: T[], { page, size }: { page: number; size: number }, full: boolean) {
  return full ? rows : rows.slice((page - 1) * size, page * size);
}

type Cell = Parameters<typeof csvCell>[0];
export async function csvReport(name: string, rows: Iterable<Cell[]> | AsyncIterable<Cell[]>, count: number) {
  const chunks = ["\uFEFF"];
  for await (const row of rows) chunks.push(row.map(csvCell).join(",") + "\r\n");
  return new Response(chunks.join(""), { headers: { "Content-Type": "text/csv; charset=utf-8",
    "Content-Disposition": `attachment; filename="government-loans-${name}.csv"`,
    "X-Report-Row-Count": String(count), "X-Content-Type-Options": "nosniff" } });
}
