"use client";

import { useState } from "react";
import Link from "next/link";
import { Plus, Settings } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

import { ACCENT } from "./constants";
import { LoanDetailDialog } from "./components/LoanDetailDialog";
import { NewLoanDialog } from "./components/NewLoanDialog";
import { Notice } from "./components/Notice";
import { RegisterFilters } from "./components/RegisterFilters";
import { RegisterKpis } from "./components/RegisterKpis";
import { RegisterTable } from "./components/RegisterTable";
import { TablePager, pageCountFor } from "./components/TablePager";
import { useRegister } from "./hooks/useRegister";
import type { LoanListRow } from "./types";

export function LoanRegisterModule() {
  const register = useRegister();
  const [detail, setDetail] = useState<LoanListRow | null>(null);
  const [isNewOpen, setNewOpen] = useState(false);

  const accounts = register.summary?.accounts ?? [];
  const { q, status, lenderType } = register.filters;
  const isFiltered = q.length > 0 || status !== "ALL" || lenderType !== "ALL";
  const pageCount = pageCountFor(register.total, register.pageSize);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-lg font-semibold">Loan Register</h1>
          <p className="text-xs text-muted-foreground">
            Every borrowing, its schedule, its effective rate and what is still owed.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button asChild variant="outline" className="min-h-11 md:min-h-0">
            <Link href="/fm/treasury/loan-management/loan-journal">Journal entries</Link>
          </Button>
          <Button asChild variant="outline" className="min-h-11 md:min-h-0">
            <Link href="/fm/treasury/loan-management/loan-settings">
              <Settings className="mr-2 h-4 w-4" aria-hidden />
              Settings
            </Link>
          </Button>
          <Button
            className="min-h-11 md:min-h-0"
            onClick={() => {
              if (accounts.length === 0) {
                toast.error("Set up a payment account before recording a loan.");
                return;
              }
              setNewOpen(true);
            }}
          >
            <Plus className="mr-2 h-4 w-4" aria-hidden />
            New loan
          </Button>
        </div>
      </div>

      {register.error ? (
        <Notice tone="danger" title="The register could not be read.">
          {register.error}
        </Notice>
      ) : null}

      {register.summary ? <RegisterKpis summary={register.summary} /> : null}

      <Card className={`overflow-hidden border-t-[3px] ${ACCENT}`}>
        <div className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3">
          <div>
            <h2 className="text-sm font-semibold">Loans</h2>
            <p className="text-xs text-muted-foreground">
              Click a row for the terms, the money and the dates behind it.
            </p>
          </div>
          <span className="rounded-full bg-muted px-2 py-0.5 text-xs tabular-nums text-muted-foreground">
            {isFiltered ? `${register.total} matching` : `${register.total} loans`}
          </span>
        </div>

        <RegisterFilters filters={register.filters} onChange={register.updateFilters} isFiltered={isFiltered} />

        <RegisterTable rows={register.rows} isLoading={register.isLoading} onOpen={setDetail} />

        <TablePager
          page={register.page}
          pageCount={pageCount}
          total={register.total}
          pageSize={register.pageSize}
          onPageChange={register.setPage}
          onPageSizeChange={register.setPageSize}
          isLoading={register.isLoading}
        />
      </Card>

      <NewLoanDialog open={isNewOpen} onOpenChange={setNewOpen} accounts={accounts} onSaved={register.reload} />
      <LoanDetailDialog loan={detail} onOpenChange={(open) => (open ? undefined : setDetail(null))} />
    </div>
  );
}
