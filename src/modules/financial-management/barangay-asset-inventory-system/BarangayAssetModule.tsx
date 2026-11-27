"use client";

import * as React from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { call, type Lookups } from "./shared/ui";
import { SubTabs } from "./shared/SubTabs";
import { AssetsTab } from "./assets/components/AssetsTab";
import { CustodyTab } from "./custody/components/CustodyTab";
import { CountTab } from "./count/components/CountTab";
import { DisposalTab } from "./disposal/components/DisposalTab";
import { TransfersTab } from "./transfers/components/TransfersTab";
import { ReportsTab } from "./reports/components/ReportsTab";
import { SettingsTab } from "./settings/components/SettingsTab";
import { LguAdminTab } from "./lgu-admin/components/LguAdminTab";
import { SystemAdminTab } from "./system-admin/components/SystemAdminTab";
import { LguConsole } from "./lgu/components/LguConsole";

/** The five submodules. The first one holds the day to day work. */
export const TABS = ["Asset Management", "LGU console", "LGU Admin", "Settings", "System admin"] as const;
export type Tab = (typeof TABS)[number];

/** The sections inside Asset Management, the submodule a barangay user lives in. */
export const SECTIONS = ["Assets", "Custody", "Physical count", "Disposal", "Transfers", "Reports"] as const;
export type Section = (typeof SECTIONS)[number];

export function isSection(value: string): value is Section {
  return (SECTIONS as readonly string[]).includes(value);
}

interface Access {
  role: string;
  /** rule 18: one person may hold several roles, so the header shows all of them */
  roles?: string[];
  email?: string | null;
  barangayId: number | null;
  unconfigured: boolean;
  permissions: Record<string, boolean>;
}

function roleLabel(role: string): string {
  if (role === "system_admin") return "System Admin";
  if (role === "barangay_admin") return "Barangay Admin";
  if (role === "property_custodian") return "Property Custodian";
  if (role === "encoder") return "Encoder";
  if (role === "municipal") return "Municipal Property and Accounting";
  return "Auditor / Viewer";
}

/**
 * The shell of the barangay asset system: it resolves the caller and the barangay, decides which
 * submodules the role may open, and renders the one that is active. Each tab lives in its own
 * submodule under assets, custody, count, disposal, transfers, reports, lgu and settings.
 */
export function BarangayAssetModule({
  initialTab = "Asset Management",
  standalone = false,
}: {
  initialTab?: Tab | Section;
  /** true when the platform sidebar opens this submodule as its own row, like the LGU screens do */
  standalone?: boolean;
}) {
  // an old link such as /custody still lands on the right thing: the main submodule, that section
  const [tab, setTab] = React.useState<Tab>(isSection(initialTab) ? "Asset Management" : initialTab);
  const [section, setSection] = React.useState<Section>(isSection(initialTab) ? initialTab : "Assets");
  const [access, setAccess] = React.useState<Access | null>(null);
  const [lookups, setLookups] = React.useState<Lookups | null>(null);
  const [barangayId, setBarangayId] = React.useState<number | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [notice, setNotice] = React.useState<string | null>(null);
  const [missingCount, setMissingCount] = React.useState(0);

  React.useEffect(() => {
    void (async () => {
      try {
        const data = (await call("/lookups")) as Lookups;
        setLookups(data);
        if (data.barangays.length && barangayId === null) setBarangayId(data.barangays[0].id);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const refreshAccess = React.useCallback(async () => {
    try {
      setAccess(await call("/access"));
    } catch {
      /* the routes still enforce, the screen just cannot tailor itself */
    }
  }, []);

  React.useEffect(() => {
    void refreshAccess();
  }, [refreshAccess]);

  // a role can be changed by another system admin while this screen is open, and the browser
  // cache would otherwise keep the old badge until a hard refresh
  React.useEffect(() => {
    function onFocus() {
      void refreshAccess();
    }
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [refreshAccess]);

  React.useEffect(() => {
    if (!barangayId) return;
    void (async () => {
      try {
        setLookups((await call("/lookups?barangayId=" + barangayId)) as Lookups);
      } catch {
        /* keep the previous lookups */
      }
    })();
  }, [barangayId]);

  React.useEffect(() => {
    if (!barangayId) return;
    void (async () => {
      try {
        const data = await call("/assets?barangayId=" + barangayId + "&status=Missing&pageSize=5");
        setMissingCount(Number(data.total ?? 0));
      } catch {
        /* the notice is optional, never block the screen on it */
      }
    })();
  }, [barangayId, tab]);

  // a refusal belongs to the action that produced it, so moving to another screen clears it
  React.useEffect(() => {
    setError(null);
    setNotice(null);
  }, [tab, section]);

  const allowedTabs = React.useMemo(() => {
    if (!access) return TABS;
    const p = access.permissions;
    return TABS.filter((t) => {
      if (t === "System admin") return p.users === true;
      if (t === "Settings") return p.users === true;
      // Table 5 keeps writing the lists with the System Admin, so municipal reads them only
      if (t === "LGU Admin") return p.users === true || access.role === "municipal";
      if (t === "LGU console") return access.role === "municipal" || access.role === "system_admin";
      return true;
    });
  }, [access]);

  const allowedSections = React.useMemo(() => {
    if (!access) return SECTIONS;
    const p = access.permissions;
    return SECTIONS.filter((s) => {
      if (s === "Custody") return p.assign === true;
      if (s === "Physical count") return p.count === true;
      if (s === "Disposal") return p.disposeRequest === true || p.disposeApprove === true;
      if (s === "Reports") return p.reports === true;
      return true;
    });
  }, [access]);

  const activeSection: Section = allowedSections.includes(section) ? section : "Assets";
  // a direct URL must obey the same rule as the tab strip, or a role could open anything by typing it
  const tabAllowed = access === null || allowedTabs.includes(tab);

  const settings = lookups?.settings ?? null;

  // section 5: a barangay role is pinned to its own barangay, so it never gets a picker
  const pinnedBarangay =
    access && access.role !== "municipal" && access.role !== "system_admin" && access.barangayId != null
      ? (lookups?.barangays ?? []).find((b) => b.id === access.barangayId) ?? null
      : null;

  return (
    // the fm layout is a fixed height column with overflow hidden, so the screen owns its scroll
    <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-4 overflow-y-auto overflow-x-hidden p-6">
      <div className="-mx-2 -mt-2 flex flex-wrap items-start justify-between gap-3 bg-background/95 px-2 pt-2 pb-2 backdrop-blur supports-[backdrop-filter]:bg-background/80 sticky top-0 z-30">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight">Barangay Asset Inventory</h1>
            {standalone ? (
              <Badge variant="outline">{tab === "Asset Management" ? "Asset Management: " + activeSection : tab}</Badge>
            ) : null}
            {access ? <Badge variant="outline">{roleLabel(access.role)}</Badge> : null}
            {(access?.roles ?? [])
              .filter((r) => r !== access?.role)
              .map((r) => (
                <Badge key={r} variant="secondary">
                  {roleLabel(r)}
                </Badge>
              ))}
            {access?.unconfigured ? <Badge variant="destructive">roles not set up yet</Badge> : null}
          </div>
          <p className="text-sm text-muted-foreground">
            Barangay property, custody, yearly count, disposal and reports. The screen offers only what your role may do.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-sm text-muted-foreground" htmlFor="barangay">
            Barangay
          </label>
          {pinnedBarangay ? (
            <span className="rounded-md border bg-muted/40 px-3 py-1.5 text-sm">
              {pinnedBarangay.code} {pinnedBarangay.name}
            </span>
          ) : (
            <select
              id="barangay"
              className="h-9 rounded-md border bg-background px-3 text-sm"
              value={barangayId ?? ""}
              onChange={(e) => setBarangayId(Number(e.target.value))}
            >
              {(lookups?.barangays ?? []).map((b) => (
                <option key={b.id} value={b.id}>
                  {b.code} {b.name}
                </option>
              ))}
            </select>
          )}
        </div>
      </div>

      {standalone ? null : (
        <div className="flex flex-wrap gap-2">
          {allowedTabs.map((t) => (
            <Button key={t} size="sm" variant={tab === t ? "default" : "outline"} onClick={() => setTab(t)}>
              {t}
            </Button>
          ))}
        </div>
      )}

      {tab === "Asset Management" ? (
        <SubTabs
          label="Asset Management"
          value={activeSection}
          onChange={setSection}
          tabs={allowedSections.map((s) => ({ id: s, label: s }))}
        />
      ) : null}

      {missingCount > 0 ? (
        <div className="flex flex-wrap items-center gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
          <span className="font-medium">{missingCount} asset(s) marked Missing.</span>
          <span className="text-muted-foreground">The Barangay Admin follows up through the official lost property procedure.</span>
          <Button
            size="sm"
            variant="outline"
            className="ml-auto"
            onClick={() => {
              setTab("Asset Management");
              setSection("Assets");
            }}
          >
            Open the register
          </Button>
        </div>
      ) : null}

      {error ? <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">{error}</div> : null}
      {notice ? <div className="rounded-md border bg-muted/40 p-3 text-sm">{notice}</div> : null}

      {!tabAllowed ? (
        <div className="rounded-md border border-dashed p-6 text-sm">
          <div className="font-medium">This screen is not available to your role.</div>
          <p className="mt-1 text-muted-foreground">
            {access ? "You are signed in as " + roleLabel(access.role) + ". " : ""}
            The open screens are: {allowedTabs.join(", ") || "none yet"}. Ask the System Admin if you need more access.
          </p>
          <Button
            size="sm"
            variant="outline"
            className="mt-3"
            onClick={() => {
              setTab(allowedTabs[0] ?? "Asset Management");
              setSection("Assets");
            }}
          >
            Open {allowedTabs[0] ?? "Asset Management"}
          </Button>
        </div>
      ) : !barangayId || !lookups ? (
        <p className="text-sm text-muted-foreground">Loading barangay data...</p>
      ) : tab === "Asset Management" ? (
        activeSection === "Assets" ? (
          <AssetsTab
            barangayId={barangayId}
            lookups={lookups}
            settings={settings}
            can={access?.permissions}
            setError={setError}
            setNotice={setNotice}
          />
        ) : activeSection === "Custody" ? (
          <CustodyTab barangayId={barangayId} lookups={lookups} settings={settings} setError={setError} setNotice={setNotice} />
        ) : activeSection === "Physical count" ? (
          <CountTab barangayId={barangayId} lookups={lookups} setError={setError} setNotice={setNotice} />
        ) : activeSection === "Disposal" ? (
          <DisposalTab barangayId={barangayId} setError={setError} setNotice={setNotice} />
        ) : activeSection === "Transfers" ? (
          <TransfersTab barangayId={barangayId} lookups={lookups} setError={setError} setNotice={setNotice} />
        ) : (
          <ReportsTab barangayId={barangayId} setError={setError} />
        )
      ) : tab === "LGU console" ? (
        <LguConsole barangays={lookups.barangays} setError={setError} setNotice={setNotice} />
      ) : tab === "LGU Admin" ? (
        <LguAdminTab canEdit={access?.permissions.users === true} setError={setError} setNotice={setNotice} />
      ) : tab === "System admin" ? (
        <SystemAdminTab setError={setError} setNotice={setNotice} onRoleChanged={refreshAccess} />
      ) : (
        <SettingsTab settings={settings} setError={setError} setNotice={setNotice} />
      )}
    </div>
  );
}
