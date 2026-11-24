"use client";
import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { MasterLinks } from "./onboarding-types";
import { useOnboardingRead } from "./hooks/useOnboarding";
import { OnboardingPayees } from "./components/OnboardingPayees";
import { OnboardingFunds } from "./components/OnboardingFunds";
import { OnboardingConfiguration } from "./components/OnboardingConfiguration";
import { ErrorBox } from "./components/OnboardingCommon";
import { PettyCashPageHeader } from "./components/PettyCashPageHeader";

export default function PettyCashOnboardingModule({ requesterName, canSubmitFund, canEditFunds, canDeleteFunds, canEditSettings }: { requesterName: string; canSubmitFund: boolean; canEditFunds: boolean; canDeleteFunds: boolean; canEditSettings: boolean }) {
  const links = useOnboardingRead<MasterLinks>("master-links");
  const [settingsRevision, setSettingsRevision] = useState(0);
  return <section className="space-y-5"><PettyCashPageHeader title="Onboarding" description="Request new funds and maintain registered payees. A new fund stays inactive until it is approved." />
    {canEditSettings && <OnboardingConfiguration onChanged={() => setSettingsRevision(value => value + 1)} />}
    <ErrorBox error={links.error} retry={links.refresh} title="Could not load onboarding links" />
    <Tabs defaultValue="funds"><TabsList className="h-auto w-fit max-w-full flex-wrap justify-start gap-1">
      <TabsTrigger value="funds">Fund requests</TabsTrigger><TabsTrigger value="payees">Payees</TabsTrigger>
    </TabsList>
      <TabsContent value="funds"><OnboardingFunds key={settingsRevision} requesterName={requesterName} canSubmit={canSubmitFund} canEdit={canEditFunds} canDelete={canDeleteFunds} /></TabsContent><TabsContent value="payees"><OnboardingPayees links={links.data} /></TabsContent>
    </Tabs>
  </section>;
}
