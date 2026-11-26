"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowRight, Boxes, CheckCircle2, FolderTree, Globe, Server } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { WorkspaceLayerStatus } from "./types";

const LAYERS: WorkspaceLayerStatus[] = [
  {
    layer: "route",
    label: "Route shell",
    path: "fm/lgu-asset-management-system",
    online: true,
  },
  {
    layer: "api",
    label: "API routes",
    path: "api/fm/lgu-asset-management-system",
    online: true,
  },
  {
    layer: "module",
    label: "Module code",
    path: "modules/financial-management/lgu-asset-management-system",
    online: true,
  },
];

const ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  route: Globe,
  api: Server,
  module: FolderTree,
};

interface FeatureLink {
  title: string;
  href: string;
  description: string;
}

const FEATURES: FeatureLink[] = [
  {
    title: "Property Register",
    href: "/fm/lgu-asset-management-system/registration",
    description: "PPE register with automatic classification and property numbering.",
  },
  {
    title: "Custody",
    href: "/fm/lgu-asset-management-system/custody",
    description: "PAR and ICS issuance, transfers, returns, and the movement log.",
  },
  {
    title: "Physical Count",
    href: "/fm/lgu-asset-management-system/physical-count",
    description: "Count sessions, reconciliation, and the RPCPPE and RPCSP reports.",
  },
  {
    title: "Disposal",
    href: "/fm/lgu-asset-management-system/disposal",
    description: "Unserviceable and missing assets through IIRUP and PCV.",
  },
  {
    title: "Reports",
    href: "/fm/lgu-asset-management-system/reports",
    description: "Property ledger and straight line depreciation schedule.",
  },
];

const UPCOMING: FeatureLink[] = [
  {
    title: "Attachments",
    href: "#",
    description: "Photographs and scanned forms on the asset record.",
  },
  {
    title: "Bulk import",
    href: "#",
    description: "Load an existing register from a spreadsheet.",
  },
];

export default function LguAssetManagementModule() {
  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-xl border bg-muted">
            <Boxes className="h-5 w-5" />
          </span>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">
              LGU Asset Management
            </h1>
            <p className="text-sm text-muted-foreground">
              Duplicated from the Financial Management asset module. Self contained,
              zero imports from other modules.
            </p>
          </div>
        </div>
        <Badge variant="secondary">Workspace ready</Badge>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {LAYERS.map((item) => {
          const Icon = ICONS[item.layer] ?? Boxes;
          return (
            <Card key={item.layer}>
              <CardHeader className="gap-2">
                <div className="flex items-center justify-between">
                  <Icon className="h-4 w-4 text-muted-foreground" />
                  <span className="flex items-center gap-1 text-xs text-emerald-600">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    live
                  </span>
                </div>
                <CardTitle className="text-base">{item.label}</CardTitle>
                <CardDescription className="break-all text-xs">
                  {item.path}
                </CardDescription>
              </CardHeader>
            </Card>
          );
        })}
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {FEATURES.map((feature) => (
          <Link key={feature.href} href={feature.href} className="group">
            <Card className="h-full transition-colors group-hover:border-foreground/30">
              <CardHeader className="gap-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">{feature.title}</CardTitle>
                  <ArrowRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                </div>
                <CardDescription className="text-xs">
                  {feature.description}
                </CardDescription>
              </CardHeader>
            </Card>
          </Link>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Next to build</CardTitle>
          <CardDescription>Scoped, not started.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-2 text-sm text-muted-foreground">
          {UPCOMING.map((item) => (
            <p key={item.title}>
              <span className="font-medium text-foreground">{item.title}</span>: {item.description}
            </p>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Locked rules for this module</CardTitle>
          <CardDescription>
            Enforced by the repo, not by preference.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-2 text-sm text-muted-foreground">
          <p>R1 code is written only inside the three review free zones.</p>
          <p>R3 no dependency is added, ever. We use what is installed.</p>
          <p>R4 no import from another module. Everything we need is owned here.</p>
          <p>R5 the design system is imported, never copied.</p>
          <p>R8 module anatomy is fixed per feature: types, provider, hooks, components.</p>
        </CardContent>
      </Card>
    </div>
  );
}
