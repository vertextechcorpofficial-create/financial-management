"use client";

import React from "react";
import { StatementOfChangesInEquityProvider } from "../providers/StatementOfChangesInEquityProvider";
import { StatementOfChangesInEquityContent } from "./statement-of-changes-in-equity-content";

export function StatementOfChangesInEquityClient() {
  return (
    <StatementOfChangesInEquityProvider>
      <StatementOfChangesInEquityContent />
    </StatementOfChangesInEquityProvider>
  );
}
