import { notFound, redirect } from "next/navigation";
import { ledgerAccess } from "./access";
import { workspaceRole } from "./permissions";
import { INVESTMENT_DONATIONS_WORKSPACES } from "../workspaces";

export default async function LegacyReconciliationPage() {
  const access = await ledgerAccess();
  if (!access) redirect("/login");
  const destination = INVESTMENT_DONATIONS_WORKSPACES.find(row =>
    row.key.startsWith("monthly-reconciliation-") && workspaceRole(access, row.key) !== "none");
  if (!destination) notFound();
  redirect(destination.path);
}
