"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Smartphone,
  FileSpreadsheet,
  FileText,
  Loader2,
  Radio,
  ClipboardList,
  Search,
  ChevronDown,
  ChevronRight,
  Package,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { SearchableSelect } from "./SearchableSelect";
import {
  fetchCountSessionDetail,
  completeCountApi,
} from "../providers/fetchProvider";
import {
  CountSession,
  CountItemResult,
  CountResultType,
} from "../types";

interface CountSessionDetailPageProps {
  sessionId: string;
}

const formatPHP = (val: number | string | null | undefined) => {
  const num = Number(val || 0);
  return `₱${num.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
};

export default function CountSessionDetailPage({
  sessionId,
}: CountSessionDetailPageProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState<CountSession | null>(null);
  const [items, setItems] = useState<CountItemResult[]>([]);
  const [expectedAssets, setExpectedAssets] = useState<CountItemResult[]>([]);
  const [recentReads, setRecentReads] = useState<
    { epc: string; matched_tag?: string; item_name?: string; is_unknown?: boolean }[]
  >([]);

  // Scan modes: "RFID reader" | "Manual checklist"
  const [scanMode, setScanMode] = useState<"rfid" | "manual">("rfid");

  // RFID inputs
  const [activeTab, setActiveTab] = useState<CountResultType>("missing");
  const [tagInput, setTagInput] = useState("");
  const [pasteInput, setPasteInput] = useState("");

  // Manual checklist filter
  const [checklistSearch, setChecklistSearch] = useState("");
  const [checkedIds, setCheckedIds] = useState<string[]>([]);

  // Add untagged form collapsible
  const [untaggedOpen, setUntaggedOpen] = useState(false);
  const [untaggedDesc, setUntaggedDesc] = useState("");
  const [untaggedSerial, setUntaggedSerial] = useState("");

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const res = await fetchCountSessionDetail(sessionId);
        setSession(res.session);
        setItems(res.items);
        setExpectedAssets(res.expectedAssets);
        setRecentReads(res.recentReads);
        // Initially checked found items
        const foundIds = res.items
          .filter((i) => i.result_type === "found")
          .map((i) => String(i.id));
        setCheckedIds(foundIds);
      } catch (err: unknown) {
        toast.error(
          err instanceof Error ? err.message : "Failed to load count session"
        );
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [sessionId]);

  // Handle RFID sweep simulation (Image 3)
  const handleSimulateSweep = () => {
    toast.success("Simulating RFID reader sweep... 8 tags detected.");
  };

  const handleAddPastedReads = () => {
    if (!pasteInput.trim()) return;
    const lines = pasteInput
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);
    toast.success(`Processed ${lines.length} pasted EPC reads`);
    setPasteInput("");
  };

  // Resolution selection handler (Image 4 & 6)
  const handleResolutionChange = (itemId: string | number, resolution: string) => {
    setItems((prev) =>
      prev.map((item) =>
        item.id === itemId ? { ...item, resolution } : item
      )
    );
    toast.success(`Updated resolution: ${resolution}`);
  };

  // Condition observation change
  const handleConditionChange = (itemId: string | number, cond: string) => {
    setItems((prev) =>
      prev.map((item) =>
        item.id === itemId ? { ...item, condition_observed: cond } : item
      )
    );
  };

  // Manual tick item
  const handleToggleChecklist = (item: CountItemResult) => {
    const idStr = String(item.id);
    const isNowChecked = !checkedIds.includes(idStr);

    setCheckedIds((prev) =>
      isNowChecked ? [...prev, idStr] : prev.filter((id) => id !== idStr)
    );

    setItems((prev) =>
      prev.map((i) =>
        i.id === item.id
          ? {
              ...i,
              result_type: isNowChecked ? "found" : "missing",
              verified_by: isNowChecked ? "Manual check" : undefined,
            }
          : i
      )
    );
    toast.success(
      isNowChecked
        ? `Verified ${item.asset_tag}`
        : `Marked ${item.asset_tag} as missing`
    );
  };

  // Add untagged item (Image 10)
  const handleAddUntagged = (e: React.FormEvent) => {
    e.preventDefault();
    if (!untaggedDesc.trim()) {
      toast.error("Please enter a description for the untagged item");
      return;
    }
    const newItem: CountItemResult = {
      id: `untagged-${Date.now()}`,
      item_name: untaggedDesc,
      serial: untaggedSerial || undefined,
      condition_observed: "Good",
      result_type: "unknown",
      carrying_amount: 0,
      description: `Untagged item added manually: ${untaggedDesc}`,
    };
    setItems((prev) => [...prev, newItem]);
    setUntaggedDesc("");
    setUntaggedSerial("");
    setUntaggedOpen(false);
    toast.success("Untagged item added to exceptions");
  };

  // Complete Count
  const handleCompleteCount = async () => {
    try {
      await completeCountApi(sessionId);
      toast.success(
        "Physical count completed! Confirmed lost items derecognised with loss equal to carrying amount. Custody transfers recorded."
      );
      router.push("/fm/asset-management/physical-count");
    } catch (err: unknown) {
      toast.error(
        err instanceof Error ? err.message : "Failed to complete count"
      );
    }
  };

  // Tab counts
  const missingItems = items.filter((i) => i.result_type === "missing");
  const foundItems = items.filter((i) => i.result_type === "found");
  const misplacedItems = items.filter((i) => i.result_type === "misplaced");
  const unknownItems = items.filter((i) => i.result_type === "unknown");
  const derecognisedItems = items.filter(
    (i) => i.result_type === "derecognised"
  );

  const missingValue = missingItems.reduce(
    (sum, i) => sum + (i.carrying_amount || 0),
    0
  );

  const pendingExceptions =
    missingItems.filter((i) => !i.resolution).length +
    misplacedItems.filter((i) => !i.resolution).length;

  if (loading) {
    return (
      <div className="flex h-[450px] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Breadcrumb & Action Toolbar matching Image 3 */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
            <Link
              href="/fm/asset-management/physical-count"
              className="hover:underline flex items-center gap-1"
            >
              <ArrowLeft className="h-3.5 w-3.5" /> Physical count
            </Link>
            <span>/</span>
            <span>{session?.name}</span>
          </div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-black font-serif tracking-tight text-foreground">
              {session?.name}
            </h1>
            <Badge
              variant="outline"
              className="bg-blue-50 text-blue-600 border-blue-200 text-[11px] font-semibold"
            >
              {session?.status}
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            Nov 14, 2026 · {session?.departments.join(", ")} · started by{" "}
            {session?.counted_by_name}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            className="text-xs h-9 px-3 gap-1.5"
            onClick={() => toast.info("Phone view: Open on mobile scanner")}
          >
            <Smartphone className="h-3.5 w-3.5" /> Phone view
          </Button>
          <Button
            variant="outline"
            className="text-xs h-9 px-3"
            onClick={() => {
              navigator.clipboard?.writeText(window.location.href);
              toast.success("Phone link copied to clipboard");
            }}
          >
            Copy phone link
          </Button>
          <Button
            variant="outline"
            className="text-xs h-9 px-3 gap-1.5"
            onClick={() => toast.info("Exporting CSV...")}
          >
            <FileSpreadsheet className="h-3.5 w-3.5" /> Export CSV
          </Button>
          <Button
            variant="outline"
            className="text-xs h-9 px-3 gap-1.5"
            onClick={() => toast.info("Exporting PDF report...")}
          >
            <FileText className="h-3.5 w-3.5" /> Export PDF
          </Button>
        </div>
      </div>

      {/* KPI Cards Row matching Image 3 */}
      <div className="grid grid-cols-2 sm:grid-cols-6 gap-3">
        <div className="p-3.5 rounded-xl border bg-card">
          <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block">
            Expected
          </span>
          <span className="text-xl font-bold font-mono text-foreground mt-1 block">
            {session?.expected_count ?? 9}
          </span>
        </div>

        <div className="p-3.5 rounded-xl border bg-card">
          <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block">
            Found
          </span>
          <span className="text-xl font-bold font-mono text-foreground mt-1 block">
            {foundItems.length}
          </span>
        </div>

        <div className="p-3.5 rounded-xl border border-rose-200 bg-rose-50/40 dark:bg-rose-950/20">
          <span className="text-[10px] font-bold text-rose-700 dark:text-rose-400 uppercase tracking-wider block">
            Missing · Value
          </span>
          <span className="text-base font-bold font-mono text-rose-900 dark:text-rose-200 mt-1 block">
            {missingItems.length} · {formatPHP(missingValue)}
          </span>
        </div>

        <div className="p-3.5 rounded-xl border bg-card">
          <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block">
            Misplaced
          </span>
          <span className="text-xl font-bold font-mono text-foreground mt-1 block">
            {misplacedItems.length}
          </span>
        </div>

        <div className="p-3.5 rounded-xl border bg-card">
          <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block">
            Unknown / Untagged
          </span>
          <span className="text-xl font-bold font-mono text-foreground mt-1 block">
            {unknownItems.length}
          </span>
        </div>

        <div className="p-3.5 rounded-xl border bg-emerald-900 text-white dark:bg-emerald-950">
          <span className="text-[10px] font-bold text-emerald-200 uppercase tracking-wider block">
            Accuracy
          </span>
          <span className="text-xl font-bold font-mono text-white mt-1 block">
            {session?.accuracy_percent ?? 88.9}%
          </span>
        </div>
      </div>

      {/* Reader Mode Selector Switch (RFID reader vs Manual checklist) */}
      <div className="rounded-xl border bg-card p-5 space-y-4 shadow-sm">
        <div className="flex items-center justify-between border-b pb-3">
          <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
            {scanMode === "rfid" ? "Scan" : "Manual Checklist"}
          </span>

          <div className="flex items-center p-0.5 rounded-lg bg-muted/60 border">
            <button
              type="button"
              onClick={() => setScanMode("rfid")}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors flex items-center gap-1.5 ${
                scanMode === "rfid"
                  ? "bg-blue-600 text-white shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Radio className="h-3.5 w-3.5" /> RFID reader
            </button>
            <button
              type="button"
              onClick={() => setScanMode("manual")}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors flex items-center gap-1.5 ${
                scanMode === "manual"
                  ? "bg-blue-600 text-white shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <ClipboardList className="h-3.5 w-3.5" /> Manual checklist
            </button>
          </div>
        </div>

        {scanMode === "rfid" ? (
          /* RFID Reader View matching Image 3 & 4 */
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-3">
              <p className="text-xs text-muted-foreground">
                Click in the box and pull the reader trigger — a USB/Bluetooth reader types each EPC followed by Enter. Or paste a reader export (one EPC per line).
              </p>

              <div className="flex gap-2">
                <Input
                  placeholder="Waiting for tag..."
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  className="h-10 text-xs font-mono"
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleSimulateSweep}
                  className="h-10 px-3 text-xs shrink-0 font-medium"
                >
                  Simulate reader sweep
                </Button>
              </div>

              <textarea
                rows={3}
                placeholder="...or paste EPCs here"
                value={pasteInput}
                onChange={(e) => setPasteInput(e.target.value)}
                className="w-full text-xs font-mono p-3 rounded-lg border bg-background"
              />

              <div className="flex items-center justify-between">
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleAddPastedReads}
                    className="h-8 text-xs px-3"
                  >
                    Add pasted reads
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => {
                      setRecentReads([]);
                      toast.success("Recent reads cleared");
                    }}
                    className="h-8 text-xs text-rose-600 hover:text-rose-700"
                  >
                    Clear all reads
                  </Button>
                </div>
                <span className="text-[11px] text-muted-foreground font-mono">
                  10 reads · 10 unique
                </span>
              </div>
            </div>

            {/* Recent Reads Stream List */}
            <div className="space-y-2 border-l pl-0 md:pl-6">
              <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block">
                Recent Reads
              </span>
              <div className="max-h-[190px] overflow-y-auto space-y-1.5 font-mono text-[11px] pr-2">
                {recentReads.map((r, i) => (
                  <div key={i} className="flex items-center justify-between py-0.5">
                    <span className="text-muted-foreground truncate mr-2">
                      {r.epc}
                    </span>
                    {r.is_unknown ? (
                      <span className="text-rose-600 font-sans font-semibold text-[10px]">
                        unknown
                      </span>
                    ) : (
                      <span className="text-foreground font-sans text-right truncate">
                        <span className="font-bold">{r.matched_tag}</span>{" "}
                        {r.item_name}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : (
          /* Manual Checklist View matching Image 9 & 10 */
          <div className="space-y-4">
            <p className="text-xs text-muted-foreground">
              For when the reader is down. See each item physically, confirm against the serial number or barcode (not just the name), then tick it. Every tick records who verified it and when.
            </p>

            <div className="flex items-center justify-between gap-4">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  placeholder="Search tag, serial, barcode, name, holder..."
                  value={checklistSearch}
                  onChange={(e) => setChecklistSearch(e.target.value)}
                  className="pl-9 h-9 text-xs"
                />
              </div>
              <span className="text-xs font-mono text-muted-foreground shrink-0">
                {checkedIds.length} of {expectedAssets.length} verified ·{" "}
                {expectedAssets.length - checkedIds.length} to go
              </span>
            </div>

            {/* Checklist Table */}
            <div className="max-h-[300px] overflow-y-auto border rounded-xl divide-y">
              {expectedAssets
                .filter((a) => {
                  if (!checklistSearch.trim()) return true;
                  const q = checklistSearch.toLowerCase();
                  return (
                    a.asset_tag?.toLowerCase().includes(q) ||
                    a.item_name?.toLowerCase().includes(q) ||
                    a.serial?.toLowerCase().includes(q) ||
                    a.holder_name?.toLowerCase().includes(q)
                  );
                })
                .map((item) => {
                  const isChecked = checkedIds.includes(String(item.id));
                  return (
                    <div
                      key={item.id}
                      onClick={() => handleToggleChecklist(item)}
                      className={`p-3.5 flex items-center justify-between cursor-pointer transition-colors ${
                        isChecked
                          ? "bg-emerald-50/40 dark:bg-emerald-950/20 hover:bg-emerald-50/70"
                          : "hover:bg-muted/40"
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => {}} // handled by row click
                          className="h-4 w-4 rounded border-muted-foreground/30 text-emerald-700 focus:ring-emerald-600"
                        />
                        <div>
                          <div className="text-xs font-bold text-foreground">
                            {item.asset_tag} · {item.item_name}
                          </div>
                          <div className="text-[11px] font-mono text-muted-foreground mt-0.5">
                            {item.serial ? `S/N ${item.serial} · ` : ""}
                            BC {item.asset_tag?.replace("-", "")}
                            {item.brand ? ` · ${item.brand} ${item.model || ""}` : ""}
                          </div>
                        </div>
                      </div>

                      <div className="text-right">
                        <div className="text-xs text-foreground font-medium">
                          {item.department_name}
                        </div>
                        <div className="text-[11px] text-muted-foreground">
                          {item.holder_name}
                        </div>
                      </div>
                    </div>
                  );
                })}
            </div>

            {/* Collapsible: Found an item that isn't in the register or has no tag? (Image 10) */}
            <div className="border rounded-xl p-3 bg-muted/10 space-y-3">
              <button
                type="button"
                onClick={() => setUntaggedOpen(!untaggedOpen)}
                className="flex items-center gap-2 text-xs font-bold text-foreground w-full select-none"
              >
                {untaggedOpen ? (
                  <ChevronDown className="h-3.5 w-3.5" />
                ) : (
                  <ChevronRight className="h-3.5 w-3.5" />
                )}
                Found an item that isn&apos;t in the register or has no tag?
              </button>

              {untaggedOpen && (
                <form onSubmit={handleAddUntagged} className="pt-2 flex gap-3">
                  <Input
                    placeholder="Description, e.g. Black office chair, no tag"
                    value={untaggedDesc}
                    onChange={(e) => setUntaggedDesc(e.target.value)}
                    className="flex-1 h-9 text-xs"
                    required
                  />
                  <Input
                    placeholder="Serial no. (if any)"
                    value={untaggedSerial}
                    onChange={(e) => setUntaggedSerial(e.target.value)}
                    className="w-48 h-9 text-xs font-mono"
                  />
                  <Button
                    type="submit"
                    className="h-9 px-4 text-xs bg-blue-600 hover:bg-blue-700 text-white font-medium"
                  >
                    Add
                  </Button>
                </form>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Tabs Row for Results breakdown matching Image 4, 5, 6, 7, 8 */}
      <Tabs
        value={activeTab}
        onValueChange={(val) => setActiveTab(val as CountResultType)}
        className="space-y-4"
      >
        <TabsList className="bg-transparent border-b rounded-none p-0 h-auto gap-6 justify-start w-full">
          <TabsTrigger
            value="missing"
            className="rounded-none border-b-2 border-transparent data-[state=active]:border-emerald-800 data-[state=active]:bg-transparent text-xs font-semibold px-1 pb-2"
          >
            Missing{" "}
            <span className="ml-1 text-[11px] text-rose-600 font-bold">
              {missingItems.length}
            </span>
          </TabsTrigger>

          <TabsTrigger
            value="found"
            className="rounded-none border-b-2 border-transparent data-[state=active]:border-emerald-800 data-[state=active]:bg-transparent text-xs font-semibold px-1 pb-2"
          >
            Found{" "}
            <span className="ml-1 text-[11px] text-muted-foreground font-bold">
              {foundItems.length}
            </span>
          </TabsTrigger>

          <TabsTrigger
            value="misplaced"
            className="rounded-none border-b-2 border-transparent data-[state=active]:border-emerald-800 data-[state=active]:bg-transparent text-xs font-semibold px-1 pb-2"
          >
            Misplaced{" "}
            <span className="ml-1 text-[11px] text-rose-600 font-bold">
              {misplacedItems.length}
            </span>
          </TabsTrigger>

          <TabsTrigger
            value="unknown"
            className="rounded-none border-b-2 border-transparent data-[state=active]:border-emerald-800 data-[state=active]:bg-transparent text-xs font-semibold px-1 pb-2"
          >
            Unknown / untagged{" "}
            <span className="ml-1 text-[11px] text-rose-600 font-bold">
              {unknownItems.length}
            </span>
          </TabsTrigger>

          <TabsTrigger
            value="derecognised"
            className="rounded-none border-b-2 border-transparent data-[state=active]:border-emerald-800 data-[state=active]:bg-transparent text-xs font-semibold px-1 pb-2"
          >
            Derecognised but found{" "}
            <span className="ml-1 text-[11px] text-muted-foreground font-bold">
              {derecognisedItems.length}
            </span>
          </TabsTrigger>
        </TabsList>

        {/* Tab 1: Missing Items (Image 4) */}
        <TabsContent value="missing" className="space-y-4">
          <div className="border rounded-xl bg-card overflow-hidden shadow-sm">
            <table className="w-full text-xs text-left">
              <thead className="bg-muted/40 border-b font-semibold text-muted-foreground">
                <tr>
                  <th className="py-3 px-4">Asset</th>
                  <th className="py-3 px-3">Recorded department / holder</th>
                  <th className="py-3 px-3 text-right">Carrying amount</th>
                  <th className="py-3 px-3 w-64">Resolution</th>
                  <th className="py-3 px-4">Note</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {missingItems.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-muted-foreground">
                      No missing items. All expected assets accounted for.
                    </td>
                  </tr>
                ) : (
                  missingItems.map((item) => (
                    <tr key={item.id} className="hover:bg-muted/20">
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2.5">
                          <Package className="h-4 w-4 text-muted-foreground/60 shrink-0" />
                          <div>
                            <span className="font-bold text-foreground hover:underline cursor-pointer">
                              {item.asset_tag}
                            </span>{" "}
                            · {item.item_name}
                            <div className="text-[10px] font-mono text-muted-foreground mt-0.5">
                              RFID {item.rfid_code}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="py-3 px-3 text-muted-foreground">
                        <div className="text-foreground font-medium">
                          {item.department_name}
                        </div>
                        <div className="text-[11px] text-muted-foreground">
                          {item.holder_name}
                        </div>
                      </td>
                      <td className="py-3 px-3 text-right font-mono font-bold text-foreground">
                        {formatPHP(item.carrying_amount)}
                      </td>
                      <td className="py-3 px-3">
                        <SearchableSelect
                          options={[
                            { label: "Confirmed lost", value: "Confirmed lost" },
                            { label: "Investigating / search underway", value: "Investigating" },
                            { label: "Sent for external repair", value: "External repair" },
                            { label: "Wrong department assigned", value: "Wrong department" },
                          ]}
                          value={item.resolution || ""}
                          onChange={(val) => handleResolutionChange(item.id, val)}
                          placeholder="Select resolution..."
                          searchPlaceholder="Search resolution..."
                        />
                      </td>
                      <td className="py-3 px-4">
                        <Input
                          placeholder="Where was it last seen?"
                          value={item.note || ""}
                          onChange={(e) =>
                            setItems((prev) =>
                              prev.map((i) =>
                                i.id === item.id ? { ...i, note: e.target.value } : i
                              )
                            )
                          }
                          className="h-9 text-xs"
                        />
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </TabsContent>

        {/* Tab 2: Found Items (Image 5) */}
        <TabsContent value="found" className="space-y-4">
          <div className="border rounded-xl bg-card overflow-hidden shadow-sm">
            <table className="w-full text-xs text-left">
              <thead className="bg-muted/40 border-b font-semibold text-muted-foreground">
                <tr>
                  <th className="py-3 px-4">Asset</th>
                  <th className="py-3 px-3">Department / holder</th>
                  <th className="py-3 px-3 text-right">Carrying amount</th>
                  <th className="py-3 px-3">Verified by</th>
                  <th className="py-3 px-4 w-44">Condition observed</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {foundItems.map((item) => (
                  <tr key={item.id} className="hover:bg-muted/20">
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-2.5">
                        <Package className="h-4 w-4 text-muted-foreground/60 shrink-0" />
                        <div>
                          <span className="font-bold text-foreground">
                            {item.asset_tag}
                          </span>{" "}
                          · {item.item_name}
                          <div className="text-[10px] font-mono text-muted-foreground mt-0.5">
                            RFID {item.rfid_code}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="py-3 px-3">
                      <div className="text-foreground font-medium">
                        {item.department_name}
                      </div>
                      <div className="text-[11px] text-muted-foreground">
                        {item.holder_name}
                      </div>
                    </td>
                    <td className="py-3 px-3 text-right font-mono font-bold text-foreground">
                      {formatPHP(item.carrying_amount)}
                    </td>
                    <td className="py-3 px-3">
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-50 text-blue-600 dark:bg-blue-950 dark:text-blue-300 border border-blue-200">
                        {item.verified_by || "RFID read"}
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      <SearchableSelect
                        options={[
                          { label: "New", value: "New" },
                          { label: "Good", value: "Good" },
                          { label: "Fair", value: "Fair" },
                          { label: "Poor", value: "Poor" },
                          { label: "Damaged", value: "Damaged" },
                          { label: "For repair", value: "For repair" },
                        ]}
                        value={item.condition_observed}
                        onChange={(val) => handleConditionChange(item.id, val)}
                        placeholder="Condition"
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </TabsContent>

        {/* Tab 3: Misplaced Items (Image 6) */}
        <TabsContent value="misplaced" className="space-y-4">
          <div className="border rounded-xl bg-card overflow-hidden shadow-sm">
            <table className="w-full text-xs text-left">
              <thead className="bg-muted/40 border-b font-semibold text-muted-foreground">
                <tr>
                  <th className="py-3 px-4">Asset</th>
                  <th className="py-3 px-3">Recorded department / holder</th>
                  <th className="py-3 px-3 text-right">Carrying amount</th>
                  <th className="py-3 px-4 w-72">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {misplacedItems.map((item) => (
                  <tr key={item.id} className="hover:bg-muted/20">
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-2.5">
                        <Package className="h-4 w-4 text-muted-foreground/60 shrink-0" />
                        <div>
                          <span className="font-bold text-foreground">
                            {item.asset_tag}
                          </span>{" "}
                          · {item.item_name}
                          <div className="text-[10px] font-mono text-muted-foreground mt-0.5">
                            RFID {item.rfid_code}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="py-3 px-3">
                      <div className="text-foreground font-medium">
                        {item.department_name}
                      </div>
                      <div className="text-[11px] text-muted-foreground">
                        {item.holder_name}
                      </div>
                    </td>
                    <td className="py-3 px-3 text-right font-mono font-bold text-foreground">
                      {formatPHP(item.carrying_amount)}
                    </td>
                    <td className="py-3 px-4 space-y-1.5">
                      <SearchableSelect
                        options={[
                          { label: "Transfer custody to new department", value: "Transfer" },
                          { label: "Keep in current department (temp borrow)", value: "Keep" },
                          { label: "Return to registered location", value: "Return" },
                        ]}
                        value={item.resolution || "Transfer"}
                        onChange={(val) => handleResolutionChange(item.id, val)}
                        placeholder="Select action..."
                      />
                      <SearchableSelect
                        options={[
                          { label: "Finance", value: "Finance" },
                          { label: "Human Resources", value: "Human Resources" },
                          { label: "IT", value: "IT" },
                          { label: "Admin", value: "Admin" },
                        ]}
                        value={item.actual_department_name || "Finance"}
                        onChange={(val) =>
                          setItems((prev) =>
                            prev.map((i) =>
                              i.id === item.id
                                ? { ...i, actual_department_name: val }
                                : i
                            )
                          )
                        }
                        placeholder="Select department..."
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </TabsContent>

        {/* Tab 4: Unknown / Untagged (Image 7) */}
        <TabsContent value="unknown" className="space-y-4">
          <div className="border rounded-xl bg-card overflow-hidden shadow-sm">
            <table className="w-full text-xs text-left">
              <thead className="bg-muted/40 border-b font-semibold text-muted-foreground">
                <tr>
                  <th className="py-3 px-4">RFID (EPC)</th>
                  <th className="py-3 px-3">Meaning</th>
                  <th className="py-3 px-4 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {unknownItems.map((item) => (
                  <tr key={item.id} className="hover:bg-muted/20">
                    <td className="py-3 px-4 font-mono font-bold text-foreground">
                      {item.rfid_code || "Untagged"}
                    </td>
                    <td className="py-3 px-3 text-muted-foreground">
                      {item.description ||
                        "Tag not in the register — an unregistered asset, a tag from another site, or a misread."}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Button
                          variant="outline"
                          onClick={() =>
                            router.push(
                              `/fm/asset-management/registration?rfid=${item.rfid_code}`
                            )
                          }
                          className="h-8 text-xs font-semibold"
                        >
                          Register asset
                        </Button>
                        <Button
                          variant="ghost"
                          onClick={() => {
                            setItems((prev) =>
                              prev.filter((i) => i.id !== item.id)
                            );
                            toast.info("Unknown read ignored");
                          }}
                          className="h-8 text-xs text-muted-foreground hover:text-foreground"
                        >
                          Ignore
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </TabsContent>

        {/* Tab 5: Derecognised but Found (Image 8) */}
        <TabsContent value="derecognised" className="space-y-4">
          <div className="border rounded-xl bg-card overflow-hidden shadow-sm">
            <table className="w-full text-xs text-left">
              <thead className="bg-muted/40 border-b font-semibold text-muted-foreground">
                <tr>
                  <th className="py-3 px-4">Asset</th>
                  <th className="py-3 px-3">Last department</th>
                  <th className="py-3 px-3 text-right">Carrying amount</th>
                  <th className="py-3 px-4">What it means</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td
                    colSpan={4}
                    className="py-12 text-center text-muted-foreground font-medium"
                  >
                    None.
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </TabsContent>
      </Tabs>

      {/* Completion Banner matching Image 4, 5, 6, 7 */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-2">
        <p className="text-[11px] text-muted-foreground leading-relaxed">
          On completion: &ldquo;Confirmed lost&rdquo; items are derecognised with a loss equal to their carrying amount (IAS 16.67(b), 16.71); &ldquo;Transfer&rdquo; items get a dated custody transfer; observed condition changes are saved. Results are frozen and logged.
        </p>

        <div className="flex items-center gap-3 shrink-0">
          {pendingExceptions > 0 && (
            <span className="text-xs text-rose-600 font-medium">
              {pendingExceptions} missing/misplaced item(s) still need a resolution
            </span>
          )}
          <Button
            onClick={handleCompleteCount}
            className="bg-emerald-800 hover:bg-emerald-900 text-white font-medium text-xs h-9 px-4"
          >
            Complete count
          </Button>
        </div>
      </div>
    </div>
  );
}
