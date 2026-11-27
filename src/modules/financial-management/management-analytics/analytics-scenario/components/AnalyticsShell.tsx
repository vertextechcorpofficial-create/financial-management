import type { ReactNode } from "react";

import { AnalyticsChrome } from "./AnalyticsChrome";

export async function AnalyticsShell({ children }: { children: ReactNode }) {
  return <AnalyticsChrome>{children}</AnalyticsChrome>;
}
