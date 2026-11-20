"use client";

import React from "react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

export function SCERulesAccordion() {
  return (
    <div className="rounded-lg border bg-card shadow-sm text-xs">
      <Accordion type="single" collapsible className="w-full">
        <AccordionItem value="rules" className="border-none">
          <AccordionTrigger className="px-4 py-3 hover:no-underline font-semibold text-foreground">
            Accounting standards alignment & business rules
          </AccordionTrigger>
          <AccordionContent className="px-4 pb-4 pt-1 space-y-3 text-muted-foreground leading-relaxed">
            <div>
              <strong className="text-foreground">PAS 1 Presentation of Financial Statements:</strong> Reconciles
              each equity component from beginning to ending balance. Profit or loss, other comprehensive income (OCI),
              and transactions with owners are presented separately.
            </div>
            <div>
              <strong className="text-foreground">PAS 8 Accounting Policies, Changes in Accounting Estimates and Errors:</strong> Prior-period
              errors are corrected retrospectively without reopening historic ledgers. Adjusting entries are re-presented
              in the periods they belong to under the Restated basis.
            </div>
            <div>
              <strong className="text-foreground">PAS 32 Financial Instruments: Presentation:</strong> Treasury shares
              are deducted directly from total equity at cost. No gain or loss is recognized in profit or loss on the
              purchase, sale, issue, or cancellation of treasury shares.
            </div>
            <div>
              <strong className="text-foreground">Republic Act 11232 (Revised Corporation Code):</strong> Retained earnings
              must remain restricted and appropriated up to the cost of treasury shares held in possession.
            </div>
            <div>
              <strong className="text-foreground">PFRS 8 Operating Segments:</strong> Segment reporting does not require
              balance sheet equity allocation. Division and Department views show in-period movements and activity only.
            </div>
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </div>
  );
}
