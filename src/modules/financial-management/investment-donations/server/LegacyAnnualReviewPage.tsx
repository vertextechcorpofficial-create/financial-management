import { notFound, redirect } from "next/navigation";
import { ledgerAccess } from "./access";
import { annualReviewDestination } from "./annual-review-navigation";

export default async function LegacyAnnualReviewPage() {
  const access = await ledgerAccess();
  if (!access) redirect("/login");
  const destination = annualReviewDestination(access);
  if (!destination) notFound();
  redirect(destination.path);
}
