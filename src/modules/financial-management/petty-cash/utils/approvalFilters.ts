export type ApprovalQueue = "pending" | "decided";
export type ApprovalDateBasis = "requested" | "decided";

export type ApprovalFilterState = {
  search: string;
  type: string;
  status: string;
  dateBasis: ApprovalDateBasis;
  from: string;
  to: string;
};

export const EMPTY_APPROVAL_FILTERS: Record<ApprovalQueue, ApprovalFilterState> = {
  pending: { search: "", type: "ALL", status: "ALL", dateBasis: "requested", from: "", to: "" },
  decided: { search: "", type: "ALL", status: "ALL", dateBasis: "decided", from: "", to: "" },
};

export function approvalFilterParams(input: { queue: ApprovalQueue; page: number; filters: ApprovalFilterState }): URLSearchParams {
  const params = new URLSearchParams({ queue: input.queue, page: String(input.page), pageSize: "25" });
  const search = input.filters.search.trim();
  if (search) params.set("search", search);

  const type = input.filters.type.trim().toUpperCase();
  if (type && type !== "ALL") params.set("type", type);

  if (input.queue === "decided") {
    const status = input.filters.status.trim().toUpperCase();
    if (status && status !== "ALL") params.set("status", status);
  }

  if (input.filters.from) params.set("dateFrom", input.filters.from);
  if (input.filters.to) params.set("dateTo", input.filters.to);
  if (input.queue === "decided" && (input.filters.from || input.filters.to)) params.set("dateField", input.filters.dateBasis);

  return params;
}

export function approvalFiltersActive(filters: ApprovalFilterState, queue: ApprovalQueue): boolean {
  return Boolean(
    filters.search.trim() ||
    (filters.type.trim() && filters.type.trim().toUpperCase() !== "ALL") ||
    filters.from ||
    filters.to ||
    (queue === "decided" && filters.status.trim() && filters.status.trim().toUpperCase() !== "ALL"),
  );
}
