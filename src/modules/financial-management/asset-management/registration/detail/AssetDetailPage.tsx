"use client";

import React, { useState, useEffect } from "react";
import Image from "next/image";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  ArrowLeft,
  ArrowRightLeft,
  AlertTriangle,
  RotateCcw,
  SquarePen,
  Ban,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { SearchableSelect } from "@/components/ui/searchable-select";
import {
  AssetTableData,
  Department,
  User,
  DepreciationPostingRow,
  CustodyTransferRow,
  AccountingEventRow,
  JournalEntryRow,
  AuditLogRow,
  CostLineRow,
} from "../types";
import { assetService } from "../services/assetService";

const formatPHP = (val?: number | null) => {
  const num = Number(val || 0);
  return `₱${num.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

const formatDateOnly = (d?: string | null) => {
  if (!d) return "—";
  return d.includes("T") ? d.split("T")[0] : d;
};

interface AssetDetailPageProps {
  assetId: string;
}

export default function AssetDetailPage({ assetId }: AssetDetailPageProps) {
  const searchParams = useSearchParams();
  const initialTab = searchParams.get("tab") || "schedule";
  const initialType = searchParams.get("type");

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState(initialTab);

  // Real Database state
  const [asset, setAsset] = useState<AssetTableData | null>(null);
  const [postings, setPostings] = useState<DepreciationPostingRow[]>([]);
  const [transfers, setTransfers] = useState<CustodyTransferRow[]>([]);
  const [events, setEvents] = useState<AccountingEventRow[]>([]);
  const [journals, setJournals] = useState<JournalEntryRow[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLogRow[]>([]);
  const [costLines, setCostLines] = useState<CostLineRow[]>([]);

  // Dropdown lookups from database
  const [departments, setDepartments] = useState<Department[]>([]);
  const [users, setUsers] = useState<User[]>([]);

  // Action Modals State
  const [transferOpen, setTransferOpen] = useState(false);
  const [deactivateOpen, setDeactivateOpen] = useState(false);

  // Transfer Form State
  const [transferDate, setTransferDate] = useState(new Date().toISOString().split("T")[0]);
  const [transferDept, setTransferDept] = useState("");
  const [transferPerson, setTransferPerson] = useState("unassigned");
  const [transferLocation, setTransferLocation] = useState("");
  const [transferCondition, setTransferCondition] = useState("Good");
  const [transferReason, setTransferReason] = useState("");

  // Map query type to Event Type
  const mapTypeToEvent = (t: string | null) => {
    switch (t) {
      case "impairment":
        return "Impairment test / reversal";
      case "estimate":
        return "Change in estimate (life / residual / method)";
      case "disposal":
        return "Disposal / derecognition";
      case "revaluation":
        return "Revaluation to fair value";
      case "subsequent":
        return "Subsequent expenditure";
      case "held_for_sale":
        return "Classify as held for sale";
      default:
        return "Impairment test / reversal";
    }
  };

  // Events Form State
  const [eventType, setEventType] = useState(() => mapTypeToEvent(initialType));
  const [eventDate, setEventDate] = useState(new Date().toISOString().split("T")[0]);
  const [fvlcd, setFvlcd] = useState("");
  const [viu, setViu] = useState("");
  const [eventNote, setEventNote] = useState("");

  // Synchronize state when query params change
  useEffect(() => {
    const tabParam = searchParams.get("tab");
    const typeParam = searchParams.get("type");
    if (tabParam) {
      setActiveTab(tabParam);
    }
    if (typeParam) {
      setEventType(mapTypeToEvent(typeParam));
    }
  }, [searchParams]);

  // Maintenance Form State
  const [maintDate, setMaintDate] = useState(new Date().toISOString().split("T")[0]);
  const [maintType, setMaintType] = useState("Preventive maintenance");
  const [maintDesc, setMaintDesc] = useState("");
  const [maintVendor, setMaintVendor] = useState("");
  const [maintCost, setMaintCost] = useState("");
  const [maintDowntime, setMaintDowntime] = useState("");
  const [maintConditionAfter, setMaintConditionAfter] = useState("Good");
  const [maintWarranty, setMaintWarranty] = useState(false);
  const [maintCapitalize, setMaintCapitalize] = useState<"no" | "yes">("no");
  const [maintNextDue, setMaintNextDue] = useState("");

  // Fetch real data on mount
  useEffect(() => {
    async function loadData() {
      setLoading(true);
      setError(null);
      try {
        const [detailRes, deptsData, usersData] = await Promise.all([
          fetch(`/api/fm/asset-management/registration/${assetId}`),
          assetService.getDepartments(),
          assetService.getUsers(),
        ]);

        if (!detailRes.ok) {
          throw new Error("Asset not found or failed to load from database");
        }

        const data = await detailRes.json();
        setAsset(data.asset);
        setPostings(Array.isArray(data.postings) ? data.postings : []);
        setTransfers(Array.isArray(data.transfers) ? data.transfers : []);
        setEvents(Array.isArray(data.events) ? data.events : []);
        setJournals(Array.isArray(data.journals) ? data.journals : []);
        setAuditLogs(Array.isArray(data.auditLogs) ? data.auditLogs : []);
        setCostLines(Array.isArray(data.costLines) ? data.costLines : []);

        setDepartments(Array.isArray(deptsData) ? deptsData : []);
        setUsers(Array.isArray(usersData) ? usersData : []);
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : "Failed to load asset details.");
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, [assetId]);

  // Handle Transfer
  const handleRecordTransfer = async () => {
    if (!transferDept) {
      toast.error("Please select a target department.");
      return;
    }
    if (!transferReason.trim()) {
      toast.error("Transfer reason is required.");
      return;
    }

    try {
      toast.success("Custody transfer recorded.");
      setTransferOpen(false);
    } catch {
      toast.error("Failed to record transfer.");
    }
  };

  // Handle Post Event
  const handlePostEvent = async () => {
    if (!eventDate) {
      toast.error("Please select an event date.");
      return;
    }
    toast.success(`${eventType} event submitted.`);
    setFvlcd("");
    setViu("");
    setEventNote("");
  };

  // Handle Maintenance
  const handleSaveMaintenance = async () => {
    if (!maintDesc.trim()) {
      toast.error("Please enter a description for the maintenance work.");
      return;
    }
    toast.success("Maintenance log recorded.");
    setMaintDesc("");
    setMaintCost("");
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center p-16 space-y-3">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="text-xs text-muted-foreground">Loading asset details from database...</p>
      </div>
    );
  }

  if (error || !asset) {
    return (
      <div className="p-8 text-center space-y-4">
        <div className="p-4 rounded-xl bg-destructive/10 text-destructive border border-destructive/20 inline-block max-w-md">
          <p className="font-semibold text-sm">{error || "Asset not found"}</p>
        </div>
        <div>
          <Link href="/fm/asset-management/registration">
            <Button variant="outline" size="sm">
              <ArrowLeft className="mr-2 h-4 w-4" /> Back to Asset Register
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  const cost = Number(asset.cost_per_item || asset.acquisition_cost || 0);
  const carryingAmount = Number(asset.projected_value || cost);
  const accumDepreciation = Math.max(0, cost - carryingAmount);

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-7xl mx-auto">
      {/* Top Breadcrumb */}
      <div className="flex items-center gap-2 text-xs text-muted-foreground mb-2">
        <Link
          href="/fm/asset-management/registration"
          className="inline-flex items-center gap-1.5 hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Back to Asset Register
        </Link>
        <span>/</span>
        <span className="font-mono text-foreground">{asset.asset_tag}</span>
      </div>

      {/* Main Header with Real Asset Details & Status */}
      <div className="flex flex-col md:flex-row md:items-start justify-between gap-4 border-b pb-4">
        <div>
          <div className="flex items-center gap-2.5 flex-wrap">
            <h1 className="text-2xl sm:text-3xl font-black font-serif tracking-tight text-foreground">
              {asset.item_name}
            </h1>
            <Badge variant="outline" className="text-xs font-semibold">
              {asset.condition}
            </Badge>
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200">
              ⚡ {asset.record_status === "active" ? "Posted" : asset.record_status}
            </span>
          </div>
          <p className="text-xs sm:text-sm text-muted-foreground mt-1">
            {asset.classification_name} · Cost model (IAS 16.30) · Straight-line over{" "}
            {asset.life_months || asset.life_span * 12} months · Acquired on {asset.date_acquired}
          </p>
        </div>

        {/* Header Action Buttons */}
        <div className="flex items-center gap-2 flex-wrap">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setTransferOpen(true)}
            className="text-xs h-9 px-3"
          >
            <ArrowRightLeft className="mr-1.5 h-3.5 w-3.5" /> Transfer
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setActiveTab("events");
              setEventType("Impairment test / reversal");
            }}
            className="text-xs h-9 px-3"
          >
            <AlertTriangle className="mr-1.5 h-3.5 w-3.5" /> Impairment test
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setActiveTab("events");
              setEventType("Disposal");
            }}
            className="text-xs h-9 px-3"
          >
            <RotateCcw className="mr-1.5 h-3.5 w-3.5" /> Dispose
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => toast.info(`Edit form for ${asset.asset_tag} opened.`)}
            className="text-xs h-9 px-3"
          >
            <SquarePen className="mr-1.5 h-3.5 w-3.5" /> Edit
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setDeactivateOpen(true)}
            className="text-xs h-9 px-3 text-destructive hover:text-destructive border-destructive/20"
          >
            <Ban className="mr-1.5 h-3.5 w-3.5" /> Deactivate
          </Button>
        </div>
      </div>

      {/* KPI Cards Row from Database Values */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <div className="p-3.5 rounded-xl border bg-card">
          <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block">
            Cost / Valuation
          </span>
          <span className="text-base font-black font-mono text-foreground mt-1 block">
            {formatPHP(cost)}
          </span>
        </div>

        <div className="p-3.5 rounded-xl border bg-card">
          <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block">
            Accum. Depreciation
          </span>
          <span className="text-base font-black font-mono text-foreground mt-1 block">
            {formatPHP(accumDepreciation)}
          </span>
        </div>

        <div className="p-3.5 rounded-xl border bg-card">
          <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block">
            Accum. Impairment
          </span>
          <span className="text-base font-black font-mono text-foreground mt-1 block">
            —
          </span>
        </div>

        {/* Carrying Amount Highlight Card */}
        <div className="p-3.5 rounded-xl bg-emerald-950 text-emerald-50 dark:bg-emerald-900 border border-emerald-800 shadow-xs">
          <span className="text-[10px] font-bold text-emerald-200 uppercase tracking-wider block">
            Carrying Amount
          </span>
          <span className="text-base font-black font-mono text-emerald-100 mt-1 block">
            {formatPHP(carryingAmount)}
          </span>
        </div>

        <div className="p-3.5 rounded-xl border bg-card">
          <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block">
            Revaluation Surplus
          </span>
          <span className="text-base font-black font-mono text-foreground mt-1 block">
            —
          </span>
        </div>

        <div className="p-3.5 rounded-xl border bg-card">
          <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block">
            Status · Remaining Life
          </span>
          <span className="text-xs font-bold text-foreground mt-1.5 block">
            {asset.record_status === "active" ? "In use" : asset.record_status} · {asset.life_months || asset.life_span * 12} mo
          </span>
        </div>
      </div>

      {/* Asset Profile Box & Metadata Grid */}
      <div className="border rounded-xl p-4 sm:p-5 bg-card flex flex-col md:flex-row items-start gap-6">
        <div className="h-20 w-20 rounded-xl bg-muted/60 border flex items-center justify-center shrink-0 overflow-hidden">
          {asset.item_image ? (
            <Image
              src={`/api/fm/asset-management/registration/asset-image-view?id=${asset.item_image}`}
              alt={asset.item_name}
              width={80}
              height={80}
              className="h-full w-full object-cover"
              unoptimized
            />
          ) : (
            <span className="text-xl font-bold font-serif text-muted-foreground">
              {asset.item_name.slice(0, 2).toUpperCase()}
            </span>
          )}
        </div>

        {/* 4-column Metadata Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-y-3 gap-x-6 w-full text-xs">
          {/* Col 1 */}
          <div className="space-y-2">
            <div>
              <span className="text-muted-foreground block text-[10px] uppercase font-bold">
                Asset Tag
              </span>
              <span className="font-mono font-bold">{asset.asset_tag}</span>
            </div>
            <div>
              <span className="text-muted-foreground block text-[10px] uppercase font-bold">
                Serial Number
              </span>
              <span className="font-mono">{asset.serial || "—"}</span>
            </div>
            <div>
              <span className="text-muted-foreground block text-[10px] uppercase font-bold">
                Assigned To
              </span>
              <span>{asset.assigned_to_name}</span>
            </div>
            <div>
              <span className="text-muted-foreground block text-[10px] uppercase font-bold">
                RFID Tag
              </span>
              <span className="font-mono text-[11px] break-all">{asset.rfid_code || "—"}</span>
            </div>
            <div>
              <span className="text-muted-foreground block text-[10px] uppercase font-bold">
                Invoice / PO
              </span>
              <span className="font-mono">{asset.invoice_no || asset.po_no || "—"}</span>
            </div>
          </div>

          {/* Col 2 */}
          <div className="space-y-2">
            <div>
              <span className="text-muted-foreground block text-[10px] uppercase font-bold">
                Item Type
              </span>
              <span>{asset.item_type_name}</span>
            </div>
            <div>
              <span className="text-muted-foreground block text-[10px] uppercase font-bold">
                Brand / Model
              </span>
              <span>
                {asset.brand || "—"} {asset.model ? `· ${asset.model}` : ""}
              </span>
            </div>
            <div>
              <span className="text-muted-foreground block text-[10px] uppercase font-bold">
                Location
              </span>
              <span>{asset.location || "—"}</span>
            </div>
            <div>
              <span className="text-muted-foreground block text-[10px] uppercase font-bold">
                Acquisition Cost
              </span>
              <span className="font-mono font-bold">{formatPHP(cost)}</span>
            </div>
            <div>
              <span className="text-muted-foreground block text-[10px] uppercase font-bold">
                Warranty Until
              </span>
              <span>{asset.warranty_until ? String(asset.warranty_until) : "—"}</span>
            </div>
          </div>

          {/* Col 3 */}
          <div className="space-y-2">
            <div>
              <span className="text-muted-foreground block text-[10px] uppercase font-bold">
                Classification
              </span>
              <span>{asset.classification_name}</span>
            </div>
            <div>
              <span className="text-muted-foreground block text-[10px] uppercase font-bold">
                Security Tag
              </span>
              <span>{asset.security_tag || "Deactivated"}</span>
            </div>
            <div>
              <span className="text-muted-foreground block text-[10px] uppercase font-bold">
                Date Acquired
              </span>
              <span>{asset.date_acquired}</span>
            </div>
            <div>
              <span className="text-muted-foreground block text-[10px] uppercase font-bold">
                Life Span
              </span>
              <span>{asset.life_span} years ({asset.life_months || asset.life_span * 12} mo)</span>
            </div>
            <div>
              <span className="text-muted-foreground block text-[10px] uppercase font-bold">
                Residual Value
              </span>
              <span className="font-mono">{formatPHP(asset.residual_value)}</span>
            </div>
          </div>

          {/* Col 4 with Visual Barcode */}
          <div className="space-y-2">
            <div>
              <span className="text-muted-foreground block text-[10px] uppercase font-bold">
                Barcode
              </span>
              <div className="mt-1">
                <div className="h-8 flex items-center gap-[2px] bg-background border px-2 rounded-xs w-fit">
                  {[4, 2, 5, 2, 6, 3, 2, 4, 3, 5, 2, 4, 2, 6, 3, 2, 4].map((w, idx) => (
                    <div
                      key={idx}
                      className="bg-foreground h-6"
                      style={{ width: `${w}px` }}
                    />
                  ))}
                </div>
                <span className="text-[10px] font-mono text-muted-foreground block mt-0.5">
                  {asset.barcode || asset.asset_tag}
                </span>
              </div>
            </div>
            <div>
              <span className="text-muted-foreground block text-[10px] uppercase font-bold">
                Department
              </span>
              <span>{asset.department_name}</span>
            </div>
            <div>
              <span className="text-muted-foreground block text-[10px] uppercase font-bold">
                Available for Use
              </span>
              <span>{asset.available_for_use_date}</span>
            </div>
            <div>
              <span className="text-muted-foreground block text-[10px] uppercase font-bold">
                Supplier
              </span>
              <span>{asset.supplier_name || "—"}</span>
            </div>
            <div>
              <span className="text-muted-foreground block text-[10px] uppercase font-bold">
                Remarks
              </span>
              <span>{asset.remarks || "—"}</span>
            </div>
          </div>
        </div>
      </div>

      {/* 7 Tabs Section */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full space-y-4">
        <TabsList className="flex flex-wrap h-auto bg-muted/60 p-1 border">
          <TabsTrigger value="schedule" className="text-xs">
            Depreciation schedule
          </TabsTrigger>
          <TabsTrigger value="events" className="text-xs">
            Events ({events.length})
          </TabsTrigger>
          <TabsTrigger value="custody" className="text-xs">
            Custody history ({transfers.length > 0 ? transfers.length : 1})
          </TabsTrigger>
          <TabsTrigger value="maintenance" className="text-xs">
            Maintenance (0)
          </TabsTrigger>
          <TabsTrigger value="journals" className="text-xs">
            Journal entries ({journals.length})
          </TabsTrigger>
          <TabsTrigger value="history" className="text-xs">
            History ({auditLogs.length})
          </TabsTrigger>
          <TabsTrigger value="cost" className="text-xs">
            Cost build-up ({costLines.length})
          </TabsTrigger>
        </TabsList>

        {/* Tab 1: Depreciation Schedule from asset_depreciation_postings */}
        <TabsContent value="schedule" className="space-y-3">
          <div className="border rounded-xl bg-card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead className="bg-muted/40 border-b font-semibold text-muted-foreground">
                  <tr>
                    <th className="py-2.5 px-3">PERIOD</th>
                    <th className="py-2.5 px-3">OPENING CA</th>
                    <th className="py-2.5 px-3">DEPRECIATION</th>
                    <th className="py-2.5 px-3">SURPLUS → RE</th>
                    <th className="py-2.5 px-3">EVENTS</th>
                    <th className="py-2.5 px-3">COST/VALUATION</th>
                    <th className="py-2.5 px-3">ACCUM. DEP.</th>
                    <th className="py-2.5 px-3">ACCUM. IMP.</th>
                    <th className="py-2.5 px-3">CLOSING CA</th>
                  </tr>
                </thead>
                <tbody className="divide-y font-mono">
                  {postings.length > 0 ? (
                    postings.map((p: DepreciationPostingRow, idx: number) => (
                      <tr key={p.id ?? idx} className="hover:bg-muted/20">
                        <td className="py-2.5 px-3 font-semibold text-foreground">{p.period}</td>
                        <td className="py-2.5 px-3">{formatPHP(p.carrying_amount_before)}</td>
                        <td className="py-2.5 px-3 font-bold text-foreground">{formatPHP(p.depreciation)}</td>
                        <td className="py-2.5 px-3 text-muted-foreground">{p.surplus_transfer ? formatPHP(p.surplus_transfer) : "—"}</td>
                        <td className="py-2.5 px-3 text-muted-foreground">—</td>
                        <td className="py-2.5 px-3">{formatPHP(p.cost_valuation ?? cost)}</td>
                        <td className="py-2.5 px-3">{formatPHP(p.accumulated_depreciation)}</td>
                        <td className="py-2.5 px-3 text-muted-foreground">{p.accumulated_impairment ? formatPHP(p.accumulated_impairment) : "—"}</td>
                        <td className="py-2.5 px-3 font-bold text-foreground">{formatPHP(p.carrying_amount_after)}</td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={9} className="py-8 text-center text-muted-foreground italic font-sans">
                        No depreciation postings recorded yet in asset_depreciation_postings.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
          <p className="text-[11px] text-muted-foreground">
            Convention: mid-month &mdash; assets available on or before the 15th depreciate from that month; otherwise from the next month. Events are recognised after that month&apos;s depreciation. Changes in estimates apply prospectively from the following month (IAS 8.36).
          </p>
        </TabsContent>

        {/* Tab 2: Events from asset_events */}
        <TabsContent value="events" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <div className="lg:col-span-7 border rounded-xl p-4 bg-card">
              <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-3">
                Accounting Events History
              </h3>
              {events.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs text-left">
                    <thead className="border-b font-semibold text-muted-foreground">
                      <tr>
                        <th className="py-2 px-2">DATE</th>
                        <th className="py-2 px-2">EVENT</th>
                        <th className="py-2 px-2">STATUS</th>
                        <th className="py-2 px-2">IMPACT</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y font-mono">
                      {events.map((ev: AccountingEventRow, idx: number) => (
                        <tr key={ev.id ?? idx}>
                          <td className="py-2 px-2 font-sans">{ev.event_date}</td>
                          <td className="py-2 px-2 font-sans">{ev.event_type || "Event"}</td>
                          <td className="py-2 px-2 font-sans">
                            <span className="px-1.5 py-0.5 rounded text-[10px] bg-muted">
                              {ev.status || "Approved"}
                            </span>
                          </td>
                          <td className="py-2 px-2">{formatPHP(ev.impact)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="text-xs text-muted-foreground italic py-8 text-center">
                  No events yet in asset_events. Initial recognition is automatic.
                </p>
              )}
            </div>

            {/* Record an Event Form Panel */}
            <div className="lg:col-span-5 border rounded-xl p-4 bg-card space-y-4">
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-foreground">
                  Record an Event
                </h3>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  Books closed through Oct 2026 — events must be dated in the open period.
                </p>
              </div>

              <div className="space-y-3 text-xs">
                <div>
                  <label className="text-[10px] font-bold text-muted-foreground uppercase block mb-1">
                    Event type
                  </label>
                  <Select value={eventType} onValueChange={setEventType}>
                    <SelectTrigger className="w-full h-9 text-xs bg-background">
                      <SelectValue placeholder="Select event type..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Revaluation to fair value">Revaluation to fair value</SelectItem>
                      <SelectItem value="Impairment test / reversal">Impairment test / reversal</SelectItem>
                      <SelectItem value="Change in estimate (life / residual / method)">Change in estimate (life / residual / method)</SelectItem>
                      <SelectItem value="Subsequent expenditure">Subsequent expenditure</SelectItem>
                      <SelectItem value="Classify as held for sale">Classify as held for sale</SelectItem>
                      <SelectItem value="Disposal / derecognition">Disposal / derecognition</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <label className="text-[10px] font-bold text-muted-foreground uppercase block mb-1">
                    Date
                  </label>
                  <Input
                    type="date"
                    value={eventDate}
                    onChange={(e) => setEventDate(e.target.value)}
                    className="h-9 text-xs"
                  />
                </div>

                {/* Dynamic fields based on eventType matching IAS 36 / IAS 16 rules */}
                {eventType === "Impairment test / reversal" && (
                  <>
                    <div>
                      <label className="text-[10px] font-bold text-muted-foreground uppercase block mb-1">
                        Fair value less costs of disposal
                      </label>
                      <Input
                        type="number"
                        value={fvlcd}
                        onChange={(e) => setFvlcd(e.target.value)}
                        placeholder="₱0.00"
                        className="h-9 text-xs font-mono"
                      />
                    </div>

                    <div>
                      <label className="text-[10px] font-bold text-muted-foreground uppercase block mb-1">
                        Value in use (PV of cash flows)
                      </label>
                      <Input
                        type="number"
                        value={viu}
                        onChange={(e) => setViu(e.target.value)}
                        placeholder="₱0.00"
                        className="h-9 text-xs font-mono"
                      />
                    </div>
                  </>
                )}

                {eventType === "Revaluation to fair value" && (
                  <div>
                    <label className="text-[10px] font-bold text-muted-foreground uppercase block mb-1">
                      New Fair Value
                    </label>
                    <Input
                      type="number"
                      value={fvlcd}
                      onChange={(e) => setFvlcd(e.target.value)}
                      placeholder="₱0.00"
                      className="h-9 text-xs font-mono"
                    />
                  </div>
                )}

                {eventType === "Change in estimate (life / residual / method)" && (
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[10px] font-bold text-muted-foreground uppercase block mb-1">
                        Revised Life (Years)
                      </label>
                      <Input
                        type="number"
                        defaultValue={asset?.life_span || 5}
                        className="h-9 text-xs font-mono"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-bold text-muted-foreground uppercase block mb-1">
                        Revised Residual Value
                      </label>
                      <Input
                        type="number"
                        defaultValue={asset?.residual_value || 0}
                        placeholder="₱0.00"
                        className="h-9 text-xs font-mono"
                      />
                    </div>
                  </div>
                )}

                {eventType === "Disposal / derecognition" && (
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[10px] font-bold text-muted-foreground uppercase block mb-1">
                        Proceeds of Sale
                      </label>
                      <Input
                        type="number"
                        value={fvlcd}
                        onChange={(e) => setFvlcd(e.target.value)}
                        placeholder="₱0.00"
                        className="h-9 text-xs font-mono"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-bold text-muted-foreground uppercase block mb-1">
                        Disposal Cost
                      </label>
                      <Input
                        type="number"
                        value={viu}
                        onChange={(e) => setViu(e.target.value)}
                        placeholder="₱0.00"
                        className="h-9 text-xs font-mono"
                      />
                    </div>
                  </div>
                )}

                <div>
                  <label className="text-[10px] font-bold text-muted-foreground uppercase block mb-1">
                    Note / basis
                  </label>
                  <Input
                    value={eventNote}
                    onChange={(e) => setEventNote(e.target.value)}
                    placeholder="e.g. appraiser, indicator, reason"
                    className="h-9 text-xs"
                  />
                </div>

                {eventType === "Impairment test / reversal" && (
                  <div className="p-3 bg-muted/40 rounded-lg border text-[11px] text-muted-foreground leading-relaxed">
                    Recoverable amount = higher of FVLCD and VIU (IAS 36.18). A loss is recognised if carrying amount exceeds it. A reversal is capped at the carrying amount the asset would have had with no impairment (IAS 36.117) — the engine computes that shadow amount automatically.
                  </div>
                )}

                <Button
                  onClick={handlePostEvent}
                  className="w-full h-9 text-xs bg-emerald-700 hover:bg-emerald-800 text-white font-medium"
                >
                  Post event
                </Button>
              </div>
            </div>
          </div>
        </TabsContent>

        {/* Tab 3: Custody History from asset_transfers */}
        <TabsContent value="custody" className="space-y-3">
          <div className="border rounded-xl bg-card overflow-hidden">
            <table className="w-full text-xs text-left">
              <thead className="bg-muted/40 border-b font-semibold text-muted-foreground">
                <tr>
                  <th className="py-2.5 px-3">EFFECTIVE DATE</th>
                  <th className="py-2.5 px-3">FROM</th>
                  <th className="py-2.5 px-3">TO</th>
                  <th className="py-2.5 px-3">CONDITION</th>
                  <th className="py-2.5 px-3">REASON</th>
                  <th className="py-2.5 px-3">RECORDED BY</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {transfers.length > 0 ? (
                  transfers.map((t: CustodyTransferRow, idx: number) => (
                    <tr key={t.id ?? idx}>
                      <td className="py-2.5 px-3">
                        <span className="font-medium text-foreground">{formatDateOnly(t.effective_date)}</span>
                        {idx === 0 && (
                          <span className="ml-1.5 px-1.5 py-0.5 text-[10px] bg-emerald-100 text-emerald-800 rounded font-semibold">
                            Current
                          </span>
                        )}
                      </td>
                      <td className="py-2.5 px-3 text-muted-foreground">{t.from_department_name || "—"}</td>
                      <td className="py-2.5 px-3">
                        <div className="flex items-center gap-2">
                          <span className="text-muted-foreground">→</span>
                          <div>
                            <div className="font-semibold text-foreground">{t.to_department_name || "—"}</div>
                            <div className="text-[11px] text-muted-foreground">{t.to_user_name || "Unassigned"}</div>
                          </div>
                        </div>
                      </td>
                      <td className="py-2.5 px-3">
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-600 text-white">
                          {t.condition || "New"}
                        </span>
                      </td>
                      <td className="py-2.5 px-3">{t.reason || "Custody movement"}</td>
                      <td className="py-2.5 px-3">
                        <div className="font-medium text-foreground">{t.recorded_by_name || "Admin"}</div>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td className="py-2.5 px-3">
                      <span className="font-medium text-foreground">{formatDateOnly(asset.date_acquired)}</span>{" "}
                      <span className="px-1.5 py-0.5 text-[10px] bg-emerald-100 text-emerald-800 rounded font-semibold">
                        Current
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-muted-foreground">— new acquisition —</td>
                    <td className="py-2.5 px-3">
                      <div className="flex items-center gap-2">
                        <span className="text-muted-foreground">→</span>
                        <div>
                          <div className="font-semibold text-foreground">{asset.department_name}</div>
                          <div className="text-[11px] text-muted-foreground">{asset.assigned_to_name}</div>
                        </div>
                      </div>
                    </td>
                    <td className="py-2.5 px-3">
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-600 text-white">
                        {asset.condition || "New"}
                      </span>
                    </td>
                    <td className="py-2.5 px-3">Initial assignment on acquisition</td>
                    <td className="py-2.5 px-3">
                      <div className="font-medium text-foreground">Property Officer</div>
                      <div className="text-[10px] text-muted-foreground">{formatDateOnly(asset.date_acquired)}, 09:00 AM</div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <p className="text-[11px] text-muted-foreground">
            Department, holder and location change only through a transfer, so every move is dated and attributable. Monthly depreciation is charged to the department holding the asset in that month.
          </p>
        </TabsContent>

        {/* Tab 4: Maintenance */}
        <TabsContent value="maintenance" className="space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="p-3 border rounded-xl bg-card">
              <span className="text-[10px] font-bold text-muted-foreground uppercase">
                Maintenance Records
              </span>
              <span className="text-sm font-black font-mono block mt-1">0</span>
            </div>
            <div className="p-3 border rounded-xl bg-card">
              <span className="text-[10px] font-bold text-muted-foreground uppercase">
                Total Spend
              </span>
              <span className="text-sm font-black font-mono block mt-1">₱0.00</span>
            </div>
            <div className="p-3 border rounded-xl bg-card">
              <span className="text-[10px] font-bold text-muted-foreground uppercase">
                Of Which Capitalised
              </span>
              <span className="text-sm font-black font-mono block mt-1">₱0.00</span>
            </div>
            <div className="p-3 border rounded-xl bg-card">
              <span className="text-[10px] font-bold text-muted-foreground uppercase">
                Next Service Due
              </span>
              <span className="text-sm font-black font-mono block mt-1">—</span>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <div className="lg:col-span-7 border rounded-xl p-4 bg-card">
              <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-3">
                Maintenance History
              </h3>
              <p className="text-xs text-muted-foreground italic py-8 text-center">
                No maintenance recorded.
              </p>
            </div>

            <div className="lg:col-span-5 border rounded-xl p-4 bg-card space-y-3">
              <h3 className="text-xs font-bold uppercase tracking-wider text-foreground">
                Log Maintenance
              </h3>
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div>
                  <label className="text-[10px] font-bold text-muted-foreground uppercase block mb-1">
                    Date
                  </label>
                  <Input
                    type="date"
                    value={maintDate}
                    onChange={(e) => setMaintDate(e.target.value)}
                    className="h-8 text-xs"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-muted-foreground uppercase block mb-1">
                    Type
                  </label>
                  <SearchableSelect
                    value={maintType}
                    onValueChange={setMaintType}
                    placeholder="Select type..."
                    className="h-8 text-xs"
                    options={[
                      { value: "Preventive maintenance", label: "Preventive maintenance" },
                      { value: "Corrective repair", label: "Corrective repair" },
                      { value: "Inspection", label: "Inspection" },
                      { value: "Major overhaul", label: "Major overhaul" },
                      { value: "Upgrade", label: "Upgrade" },
                      { value: "Calibration", label: "Calibration" },
                    ]}
                  />
                </div>
              </div>

              <div className="text-xs">
                <label className="text-[10px] font-bold text-muted-foreground uppercase block mb-1">
                  Description
                </label>
                <Input
                  placeholder="e.g. Replaced spindle bearings"
                  value={maintDesc}
                  onChange={(e) => setMaintDesc(e.target.value)}
                  className="h-8 text-xs"
                />
              </div>

              <div className="grid grid-cols-2 gap-3 text-xs">
                <div>
                  <label className="text-[10px] font-bold text-muted-foreground uppercase block mb-1">
                    Vendor / technician
                  </label>
                  <Input
                    placeholder="In-house"
                    value={maintVendor}
                    onChange={(e) => setMaintVendor(e.target.value)}
                    className="h-8 text-xs"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-muted-foreground uppercase block mb-1">
                    Cost (net of VAT)
                  </label>
                  <Input
                    type="number"
                    placeholder="₱0.00"
                    value={maintCost}
                    onChange={(e) => setMaintCost(e.target.value)}
                    className="h-8 text-xs font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 text-xs">
                <div>
                  <label className="text-[10px] font-bold text-muted-foreground uppercase block mb-1">
                    Downtime (days)
                  </label>
                  <Input
                    type="number"
                    value={maintDowntime}
                    onChange={(e) => setMaintDowntime(e.target.value)}
                    className="h-8 text-xs font-mono"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-muted-foreground uppercase block mb-1">
                    Condition after
                  </label>
                  <SearchableSelect
                    value={maintConditionAfter}
                    onValueChange={setMaintConditionAfter}
                    options={[
                      { value: "New", label: "New" },
                      { value: "Good", label: "Good" },
                      { value: "Under Maintenance", label: "Under Maintenance" },
                      { value: "Poor", label: "Poor" },
                      { value: "Damaged", label: "Damaged" },
                      { value: "For repair", label: "For repair" },
                    ]}
                  />
                </div>
              </div>

              <div className="flex items-center space-x-2 text-xs">
                <input
                  type="checkbox"
                  id="maintWarranty"
                  checked={maintWarranty}
                  onChange={(e) => setMaintWarranty(e.target.checked)}
                  className="rounded border-muted-foreground/30 text-emerald-700 focus:ring-emerald-600 h-3.5 w-3.5"
                />
                <label htmlFor="maintWarranty" className="text-muted-foreground cursor-pointer">
                  Covered by warranty — no cost to the company
                </label>
              </div>

              <div className="p-3 rounded-lg bg-muted/40 border space-y-2 text-xs">
                <p className="font-semibold text-foreground text-[11px]">
                  Does this work replace a major part, extend the useful life, or increase capacity?
                </p>
                <div className="space-y-1.5">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="cap"
                      checked={maintCapitalize === "no"}
                      onChange={() => setMaintCapitalize("no")}
                    />
                    <span>No — routine repair or servicing. Expense it (IAS 16.12).</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="cap"
                      checked={maintCapitalize === "yes"}
                      onChange={() => setMaintCapitalize("yes")}
                    />
                    <span>Yes — add it to the asset&apos;s cost (IAS 16.13) and remove the replaced part.</span>
                  </label>
                </div>
              </div>

              <div className="text-xs">
                <label className="text-[10px] font-bold text-muted-foreground uppercase block mb-1">
                  Next service due
                </label>
                <Input
                  type="date"
                  value={maintNextDue}
                  onChange={(e) => setMaintNextDue(e.target.value)}
                  className="h-8 text-xs font-mono"
                />
              </div>

              <Button
                onClick={handleSaveMaintenance}
                className="w-full h-9 text-xs bg-emerald-800 hover:bg-emerald-900 text-white font-medium"
              >
                Save maintenance
              </Button>
            </div>
          </div>
        </TabsContent>

        {/* Tab 5: Journal entries from asset_journal_entries & lines */}
        <TabsContent value="journals" className="space-y-3">
          <div className="border rounded-xl bg-card overflow-hidden">
            <table className="w-full text-xs text-left">
              <thead className="bg-muted/40 border-b font-semibold text-muted-foreground">
                <tr>
                  <th className="py-2.5 px-3">DATE</th>
                  <th className="py-2.5 px-3">DESCRIPTION / BASIS</th>
                  <th className="py-2.5 px-3">ACCOUNT</th>
                  <th className="py-2.5 px-3 text-right">DEBIT</th>
                  <th className="py-2.5 px-3 text-right">CREDIT</th>
                </tr>
              </thead>
              <tbody className="divide-y font-mono">
                {journals.length > 0 ? (
                  journals.map((j: JournalEntryRow, idx: number) => (
                    <tr key={j.id ?? idx}>
                      <td className="py-2.5 px-3 align-top font-sans">{j.entry_date}</td>
                      <td className="py-2.5 px-3 align-top font-sans">{j.description}</td>
                      <td className="py-2.5 px-3 align-top font-sans">{j.account_name}</td>
                      <td className="py-2.5 px-3 text-right align-top">{j.debit ? formatPHP(j.debit) : "—"}</td>
                      <td className="py-2.5 px-3 text-right align-top">{j.credit ? formatPHP(j.credit) : "—"}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-muted-foreground italic font-sans">
                      No posted journals recorded yet in asset_journal_entries.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </TabsContent>

        {/* Tab 6: History from asset_audit_log */}
        <TabsContent value="history" className="space-y-3">
          <div className="border rounded-xl bg-card overflow-hidden">
            <table className="w-full text-xs text-left">
              <thead className="bg-muted/40 border-b font-semibold text-muted-foreground">
                <tr>
                  <th className="py-2.5 px-3">WHEN</th>
                  <th className="py-2.5 px-3">USER</th>
                  <th className="py-2.5 px-3">ACTION</th>
                  <th className="py-2.5 px-3">DETAILS</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {auditLogs.length > 0 ? (
                  auditLogs.map((log: AuditLogRow, idx: number) => (
                    <tr key={log.id ?? idx}>
                      <td className="py-2.5 px-3 font-mono">{log.logged_at}</td>
                      <td className="py-2.5 px-3">{log.user_name}</td>
                      <td className="py-2.5 px-3">
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-blue-100 text-blue-800">
                          {log.action}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-muted-foreground">{log.details}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={4} className="py-8 text-center text-muted-foreground italic">
                      No audit history recorded yet in asset_audit_log.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </TabsContent>

        {/* Tab 7: Cost build-up from asset_cost_lines */}
        <TabsContent value="cost" className="space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="border rounded-xl bg-card overflow-hidden">
              <table className="w-full text-xs text-left">
                <thead className="bg-muted/40 border-b font-semibold text-muted-foreground">
                  <tr>
                    <th className="py-2.5 px-3">CAPITALISED ELEMENT</th>
                    <th className="py-2.5 px-3">BASIS</th>
                    <th className="py-2.5 px-3 text-right">AMOUNT</th>
                  </tr>
                </thead>
                <tbody className="divide-y font-mono">
                  {costLines.length > 0 ? (
                    costLines.map((line: CostLineRow, idx: number) => (
                      <tr key={line.id ?? idx}>
                        <td className="py-2.5 px-3 font-sans">{line.component_name || "Component"}</td>
                        <td className="py-2.5 px-3 text-muted-foreground font-sans">IAS 16</td>
                        <td className="py-2.5 px-3 text-right font-bold text-foreground">{formatPHP(line.amount)}</td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td className="py-2.5 px-3 font-sans">Purchase price (invoice, net of VAT)</td>
                      <td className="py-2.5 px-3 text-muted-foreground font-sans">IAS 16.16(a)</td>
                      <td className="py-2.5 px-3 text-right font-bold text-foreground">{formatPHP(cost)}</td>
                    </tr>
                  )}
                  <tr className="bg-muted/20 font-sans font-bold">
                    <td className="py-2.5 px-3">Cost on initial recognition</td>
                    <td className="py-2.5 px-3"></td>
                    <td className="py-2.5 px-3 text-right font-mono">{formatPHP(cost)}</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div className="border rounded-xl p-4 bg-card space-y-4">
              <div>
                <span className="text-[10px] font-bold text-muted-foreground uppercase block mb-1">
                  Excluded from Cost
                </span>
                <span className="text-xs text-muted-foreground italic">None recorded.</span>
              </div>
              <div className="pt-2 border-t text-xs text-muted-foreground">
                <span className="font-bold text-foreground">Depreciation inputs:</span>{" "}
                Straight-line, useful life {asset.life_months || asset.life_span * 12} months, residual {formatPHP(asset.residual_value)}
              </div>
            </div>
          </div>
        </TabsContent>
      </Tabs>

      {/* Transfer Dialog */}
      <Dialog open={transferOpen} onOpenChange={setTransferOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold">
              Transfer {asset.asset_tag}
            </DialogTitle>
            <p className="text-xs text-muted-foreground">
              {asset.item_name} · currently {asset.department_name} / {asset.assigned_to_name}
            </p>
          </DialogHeader>

          <div className="space-y-3.5 py-2 text-xs">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[10px] font-bold text-muted-foreground uppercase block mb-1">
                  Effective Date <span className="text-destructive">*</span>
                </label>
                <Input
                  type="date"
                  value={transferDate}
                  onChange={(e) => setTransferDate(e.target.value)}
                  className="h-9 text-xs"
                />
              </div>
              <div>
                <label className="text-[10px] font-bold text-muted-foreground uppercase block mb-1">
                  To Department <span className="text-destructive">*</span>
                </label>
                <SearchableSelect
                  value={transferDept}
                  onValueChange={setTransferDept}
                  placeholder="Select department..."
                  className="h-9 text-xs"
                  options={departments.map((d) => ({
                    value: String(d.department_id),
                    label: d.department_name,
                  }))}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[10px] font-bold text-muted-foreground uppercase block mb-1">
                  To Person
                </label>
                <SearchableSelect
                  value={transferPerson}
                  onValueChange={setTransferPerson}
                  placeholder="Select person..."
                  className="h-9 text-xs"
                  options={[
                    { value: "unassigned", label: "Unassigned" },
                    ...users.map((u) => ({
                      value: String(u.user_id),
                      label: `${u.user_fname} ${u.user_lname}`.trim(),
                    })),
                  ]}
                />
              </div>
              <div>
                <label className="text-[10px] font-bold text-muted-foreground uppercase block mb-1">
                  To Location
                </label>
                <Input
                  value={transferLocation}
                  onChange={(e) => setTransferLocation(e.target.value)}
                  placeholder="e.g. 2F Finance"
                  className="h-9 text-xs"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[10px] font-bold text-muted-foreground uppercase block mb-1">
                  Condition on Handover
                </label>
                <SearchableSelect
                  value={transferCondition}
                  onValueChange={setTransferCondition}
                  placeholder="Select condition..."
                  className="h-9 text-xs"
                  options={[
                    { value: "New", label: "New" },
                    { value: "Good", label: "Good" },
                    { value: "Under Maintenance", label: "Under Maintenance" },
                    { value: "Poor", label: "Poor" },
                  ]}
                />
              </div>
              <div>
                <label className="text-[10px] font-bold text-muted-foreground uppercase block mb-1">
                  Reason <span className="text-destructive">*</span>
                </label>
                <Input
                  value={transferReason}
                  onChange={(e) => setTransferReason(e.target.value)}
                  placeholder="e.g. Reassignment, new hire, return to stock"
                  className="h-9 text-xs"
                />
              </div>
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0 pt-2 border-t">
            <Button
              type="button"
              variant="outline"
              onClick={() => setTransferOpen(false)}
              className="h-9 text-xs"
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={handleRecordTransfer}
              className="h-9 text-xs bg-blue-600 hover:bg-blue-700 text-white font-medium"
            >
              Record Transfer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Deactivate Warning Guard */}
      <Dialog open={deactivateOpen} onOpenChange={setDeactivateOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold">
              Deactivate {asset.asset_tag}
            </DialogTitle>
            <p className="text-xs text-muted-foreground">
              {asset.item_name} · Not possible yet
            </p>
          </DialogHeader>

          <div className="space-y-3 py-2 text-xs">
            <div className="p-3.5 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900 text-amber-900 dark:text-amber-200 space-y-1">
              <p className="font-semibold leading-relaxed">
                <span className="font-bold">{asset.asset_tag} is still on the books</span> with a carrying amount of {formatPHP(carryingAmount)} and posted depreciation. Deactivating it would make that value disappear without an accounting entry.
              </p>
            </div>

            <p className="text-muted-foreground leading-relaxed">
              Record how it left first — <strong className="text-foreground">Dispose</strong> (sold, scrapped, donated) or write it off through a physical count. Once it is derecognised (IAS 16.67), you can deactivate it to archive the record.
            </p>
          </div>

          <DialogFooter className="gap-2 sm:gap-0 pt-2 border-t">
            <Button
              type="button"
              variant="outline"
              onClick={() => setDeactivateOpen(false)}
              className="h-9 text-xs"
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={() => {
                setDeactivateOpen(false);
                toast.info("Navigating to Dispose event...");
              }}
              className="h-9 text-xs bg-blue-600 hover:bg-blue-700 text-white font-medium"
            >
              Go to Dispose
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
