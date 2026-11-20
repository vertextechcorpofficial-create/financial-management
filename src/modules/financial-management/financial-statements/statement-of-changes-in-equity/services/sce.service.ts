import { SCEFilterState, SCEStatementResponse, SCEJournalLine } from "../types";

export async function fetchSCEStatement(filters: SCEFilterState): Promise<SCEStatementResponse> {
  const params = new URLSearchParams({
    viewBy: filters.viewBy,
    periodDate: filters.periodDate,
    divisionId: filters.divisionId,
    departmentId: filters.departmentId,
    basis: filters.basis,
    compare: String(filters.compare),
    compareMode: filters.compareMode,
  });

  const res = await fetch(`/api/fm/financial-statements/statement-of-changes-in-equity?${params.toString()}`, {
    cache: "no-store",
  });

  if (!res.ok) {
    throw new Error(`Failed to fetch SCE statement: ${res.statusText}`);
  }

  return res.json();
}

export async function fetchSCEJournalLines(
  glCode: string,
  startDate: string,
  endDate: string
): Promise<SCEJournalLine[]> {
  const params = new URLSearchParams({
    glCode,
    startDate,
    endDate,
  });

  const res = await fetch(`/api/fm/financial-statements/statement-of-changes-in-equity/transactions?${params.toString()}`, {
    cache: "no-store",
  });

  if (!res.ok) {
    throw new Error(`Failed to fetch journal lines: ${res.statusText}`);
  }

  const data = await res.json();
  return data.lines || [];
}
