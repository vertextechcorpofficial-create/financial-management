import { redirect } from "next/navigation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The module root has no screen of its own. Without this the platform's placeholder renders
 * "feature under development" for a module that is finished, so the root hands over to the
 * overview the sidebar links to.
 */
export default function Page() {
  redirect("/fm/management-analytics/analytics-overview");
}
