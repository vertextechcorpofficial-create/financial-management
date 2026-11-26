import {
  ArrowLeftRight, BarChart3, BookOpen, Building2, CalendarCheck2, ClipboardCheck, ClipboardList,
  FileCheck2, FileSpreadsheet, FileText, History, Landmark, LayoutDashboard, MessageSquareWarning, Send,
  Settings2, ShieldCheck, TableProperties, UserMinus, type LucideIcon,
} from "lucide-react";

export const tabIcons: Record<string, LucideIcon> = {
  requests: FileText,
  enrollment: ClipboardList,
  register: TableProperties,
  "agency-balances": Landmark,
  changes: ArrowLeftRight,
  "onboarding-exits": UserMinus,
  "posting-disputes": MessageSquareWarning,
  "payroll-instructions": FileSpreadsheet,
  outbound: Send,
  inbound: BookOpen,
  overview: LayoutDashboard,
  statements: FileText,
  instructions: FileSpreadsheet,
  "to-remit": Send,
  "billing-reconciliation": FileCheck2,
  agencies: Building2,
  "loan-requests": ClipboardCheck,
  "enrollment-verification": ShieldCheck,
  close: CalendarCheck2,
  setup: Settings2,
  "employee-ledger": BookOpen,
  "remittance-report": Send,
  "year-end-summary": BarChart3,
  "audit-trail": History,
};

export function TabIcon({ tabKey, className = "size-3.5" }: { tabKey: string; className?: string }) {
  const Icon = tabIcons[tabKey];
  return Icon ? <Icon className={className} aria-hidden="true" /> : null;
}
