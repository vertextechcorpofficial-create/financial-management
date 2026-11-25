import type { ReactNode } from "react";

import { AnalyticsChrome } from "./AnalyticsChrome";

/**
 * The module chrome around every Management Analytics screen: the shared period bar.
 * Screen navigation lives in the application sidebar, so it is not repeated here.
 */
export async function AnalyticsShell({ children }: { children: ReactNode }) {
  return <AnalyticsChrome>{children}</AnalyticsChrome>;
}
