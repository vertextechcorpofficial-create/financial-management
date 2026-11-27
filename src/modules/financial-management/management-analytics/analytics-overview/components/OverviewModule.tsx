import { OverviewInteractiveSection } from "./OverviewInteractiveSection";
import type { OverviewPayload } from "../types";

interface Props {
  payload: OverviewPayload;
  pageSize: number;
  basePath: string;
  status?: string;
}

export function OverviewModule({ payload, basePath, status }: Props) {
  const rows = status ? payload.rows.filter((row) => row.status.code === status) : payload.rows;
  const isGroupView = payload.company === null;

  return (
    <OverviewInteractiveSection
      payload={payload}
      rows={rows}
      basePath={basePath}
      isGroupView={isGroupView}
    />
  );
}
