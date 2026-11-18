"use client";
import { usePathname } from "next/navigation";
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from "@/components/ui/breadcrumb";
import { LEDGER_BASE, LEDGER_PAGES, ledgerPage } from "../navigation";

export function PropertyLedgerBreadcrumb() {
  const page = ledgerPage(usePathname());
  const title = LEDGER_PAGES.find(item => item.slug === page)!.title;
  return <Breadcrumb className="min-w-0"><BreadcrumbList className="flex-nowrap overflow-hidden">
    <BreadcrumbItem className="hidden shrink-0 md:block"><BreadcrumbLink href="/fm">FM</BreadcrumbLink></BreadcrumbItem><BreadcrumbSeparator className="hidden shrink-0 md:block" />
    <BreadcrumbItem className="hidden shrink-0 sm:block"><BreadcrumbLink href={LEDGER_BASE}>Property Ledger</BreadcrumbLink></BreadcrumbItem><BreadcrumbSeparator className="hidden shrink-0 sm:block" />
    <BreadcrumbItem className="min-w-0"><BreadcrumbPage className="block truncate">{title}</BreadcrumbPage></BreadcrumbItem>
  </BreadcrumbList></Breadcrumb>;
}
