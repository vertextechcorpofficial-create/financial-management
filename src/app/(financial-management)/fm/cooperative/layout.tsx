import type { ReactNode } from "react";
import { CooperativeConsoleProvider } from "@/modules/financial-management/cooperative/console/provider";

export default function CooperativeLayout({ children }: { children: ReactNode }) {
  return <CooperativeConsoleProvider>{children}</CooperativeConsoleProvider>;
}
