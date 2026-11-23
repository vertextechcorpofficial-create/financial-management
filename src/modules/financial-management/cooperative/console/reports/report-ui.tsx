"use client";

import type { ComponentType } from "react";
import {
  CalendarClock, FileBarChart, FileText, FolderCheck, HandCoins, History, Landmark, PiggyBank, Receipt, Scale, UsersRound,
} from "lucide-react";
import type { ReportKey } from "./types";

export type ReportGroupKey = "members" | "loans" | "finance" | "governance";

export const reportGroups: Array<{ key: ReportGroupKey; label: string; reports: ReportKey[] }> = [
  { key: "members", label: "Member accounts", reports: ["soa", "savings", "roster", "docs"] },
  { key: "loans", label: "Loans", reports: ["portfolio", "aging"] },
  { key: "finance", label: "Finance", reports: ["collections", "trial-balance", "month-end"] },
  { key: "governance", label: "Governance", reports: ["audit"] },
];

export const reportUi: Record<ReportKey, { shortLabel: string; icon: ComponentType<{ className?: string }>; group: ReportGroupKey }> = {
  soa: { shortLabel: "Statement", icon: FileText, group: "members" },
  portfolio: { shortLabel: "Portfolio", icon: HandCoins, group: "loans" },
  aging: { shortLabel: "Aging", icon: CalendarClock, group: "loans" },
  collections: { shortLabel: "Collections", icon: Receipt, group: "finance" },
  savings: { shortLabel: "Savings", icon: PiggyBank, group: "members" },
  roster: { shortLabel: "Roster", icon: UsersRound, group: "members" },
  docs: { shortLabel: "Documents", icon: FolderCheck, group: "members" },
  "trial-balance": { shortLabel: "Trial balance", icon: Scale, group: "finance" },
  "month-end": { shortLabel: "Month-end", icon: Landmark, group: "finance" },
  audit: { shortLabel: "Audit", icon: History, group: "governance" },
};

export const reportHeroIcon = FileBarChart;

export const reportTotalsHighlights: Partial<Record<ReportKey, string[]>> = {
  portfolio: ["Principal", "Balance", "Past due", "Penalties"],
  aging: ["Total past due", "Penalties"],
  collections: ["Total", "Loan payment", "Savings", "Fees"],
  savings: ["Opening", "Deposits", "Withdrawals", "Closing"],
  roster: ["Posted savings", "Loan balance"],
};

export const reportMetadataHighlights: Partial<Record<ReportKey, string[]>> = {
  soa: ["Member", "Status", "Membership agreement"],
  "trial-balance": ["Opening check", "Period check", "Closing check"],
  "month-end": ["Employer opening balance", "Net recognized employer receivables", "Net verified remittances"],
  audit: ["From", "To"],
};
