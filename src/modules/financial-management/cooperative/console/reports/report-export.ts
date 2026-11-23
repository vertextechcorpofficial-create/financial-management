import { reportMenu, type ReportCell, type ReportColumn, type ReportKey, type ReportResult, type ReportTableData } from "./types";

type ReportExport = ReportResult & { generatedOn: string; report: ReportKey };

export function serializeMemberReport(report: ReportExport, format: "csv" | "tsv") {
  const csv = format === "csv";
  const sections = report.sections ?? [];
  const width = Math.max(report.columns.length, ...sections.map(section => section.columns.length));
  const encodeRow = (row: ReportCell[], columns?: ReportColumn[]) => Array.from({ length: width }, (_, index) => {
    let cell = String(row[index] ?? "");
    if (columns?.[index]?.kind !== "money" && columns?.[index]?.kind !== "number") {
      if (/^[\s\p{Cc}\p{Cf}]*[=+\-@＝＋－＠]/u.test(cell)) cell = "'" + cell;
    }
    if (csv) return /[",\r\n]/.test(cell) ? '"' + cell.replaceAll('"', '""') + '"' : cell;
    return cell.replace(/[\t\r\n]/g, " ");
  }).join(csv ? "," : "\t");

  const table = ({ columns, opening, rows, totals }: ReportTableData) => [
    encodeRow(columns.map(column => column.label)),
    ...(opening ? [encodeRow(opening, columns)] : []),
    ...rows.map(row => encodeRow(row.cells, columns)),
    ...(totals.length ? [encodeRow(totals, columns)] : []),
  ];
  const notices = (report.notices ?? []).map(({ label, state, message }) => [
    label, state === "pending_rollout" ? "Awaiting source data" : "Temporarily unavailable", message,
  ]);
  const header = report.metadata.length || notices.length ? [
    [reportMenu[report.report].label], ...report.metadata, ["Generated on", report.generatedOn], ...notices,
  ] : [];
  return [
    ...header.map(row => encodeRow(row)),
    ...(report.report === "soa" ? [encodeRow(["Savings"])] : []),
    ...table(report),
    ...sections.flatMap(section => [encodeRow([]), encodeRow([section.label]), ...table(section)]),
  ].join(csv ? "\r\n" : "\n");
}
