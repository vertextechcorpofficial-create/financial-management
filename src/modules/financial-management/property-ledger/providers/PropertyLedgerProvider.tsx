"use client";
import { createContext, useContext, useState } from "react";
import { usePathname } from "next/navigation";
import { usePropertyLedger } from "../hooks/usePropertyLedger";
import { ledgerPage } from "../navigation";
import { todayMonth } from "../utils/dates";

function useWorkspaceState() {
  const page = ledgerPage(usePathname());
  const ledger = usePropertyLedger(page);
  const [month, setMonth] = useState(todayMonth());
  const [horizon, setHorizon] = useState("");
  const [entity, setEntity] = useState("");
  const [tag, setTag] = useState("");
  const portfolio = ledger.state?.portfolio;
  const activeEntity = portfolio?.entities.some(e => e.id === entity) ? entity : "";
  const activeTag = portfolio?.assets.some(a => a.tags.includes(tag)) ? tag : "";
  const through = horizon || `${portfolio?.policies.projectionEndYear ?? new Date().getFullYear() + 25}-12`;
  return { ...ledger, page, month, setMonth, through, setThrough: setHorizon, entity: activeEntity, setEntity, tag: activeTag, setTag };
}
type WorkspaceState = ReturnType<typeof useWorkspaceState>;
const Context = createContext<WorkspaceState | null>(null);
export function usePropertyLedgerContext() {
  const context = useContext(Context);
  if (!context) throw new Error("Property Ledger pages require PropertyLedgerProvider");
  return context;
}
export function PropertyLedgerProvider({ children }: { children: React.ReactNode }) {
  const workspace = useWorkspaceState();
  // Data/filter sharing only. Navigation belongs to the subsystem's existing sidebar.
  return <Context.Provider value={workspace}><div className="min-w-0 p-3 sm:p-5">{children}</div></Context.Provider>;
}
