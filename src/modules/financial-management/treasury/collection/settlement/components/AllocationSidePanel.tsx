"use client";

import React, { useId, useState } from "react";
import { Search, Wallet, Percent } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { UnpaidInvoice, SettlementAllocation } from "../../types";
import { WalletItem } from "../hooks/useSettlement";
import {
    capSettlementAllocation,
    formatSettlementAmount,
    parseSettlementAmount,
    roundCurrency,
    getInvoiceAllocationCapacity,
    getInvoiceRequiredBalance,
    getSourceAllocationCapacity,
} from "../utils/settlement-balance";
import { cn } from "@/lib/utils";

function AllocationInput({ label, amount, max, sourceMax, disabled, credit, onApply, onOverage }: {
    label: string;
    amount: number;
    max: number;
    sourceMax?: number;
    onOverage?: (gross: number, excess: number) => void;
    disabled?: boolean;
    credit?: boolean;
    onApply: (amount: number) => void;
}) {
    const errorId = useId();
    const [draft, setDraft] = useState<string | null>(null);
    const [error, setError] = useState("");

    const parsedDraft = draft === null ? null : parseSettlementAmount(draft);
    const proposedOverage = !disabled && sourceMax !== undefined && parsedDraft !== null && parsedDraft > max && parsedDraft <= sourceMax
        ? { gross: parsedDraft, excess: roundCurrency(parsedDraft - max) } : null;

    function change(value: string) {
        setDraft(value);
        const parsed = value === "" ? 0 : parseSettlementAmount(value);
        if (parsed === null) {
            setError("Enter a non-negative amount with up to three decimal places.");
        } else if (sourceMax !== undefined && parsed > sourceMax) {
            setError(`Available funds: ₱${formatSettlementAmount(sourceMax)}.`);
        } else if (sourceMax !== undefined && parsed > max) {
            setError("");
        } else if (parsed > max) {
            setError(`Maximum available: ₱${formatSettlementAmount(max)}.`);
        } else {
            setError("");
            onApply(parsed);
        }
    }

    return (
        <div className="mt-1">
            <div className="relative">
                <span className="absolute left-2.5 top-2 text-[10px] font-black text-muted-foreground">₱</span>
                <Input
                    type="text"
                    inputMode="decimal"
                    aria-label={`${label} allocation amount`}
                    aria-invalid={Boolean(error)}
                    aria-describedby={error || proposedOverage ? errorId : undefined}
                    disabled={disabled}
                    className="h-8 pl-6 pr-12 text-xs font-black text-right shadow-inner bg-background"
                    placeholder="0.000"
                    value={draft ?? (amount ? amount.toFixed(3) : "")}
                    onChange={event => change(event.target.value)}
                    onBlur={() => {
                        if (!proposedOverage) setDraft(null);
                        setError("");
                    }}
                />
                <Button
                    size="sm"
                    disabled={disabled}
                    onClick={() => {
                        setDraft(null);
                        setError("");
                        onApply(max);
                    }}
                    className={cn("absolute right-1 top-1 h-6 px-2 text-[9px] font-black",
                        credit ? "bg-purple-50 text-purple-600 hover:bg-purple-200" : "bg-muted text-foreground hover:bg-emerald-100")}
                >
                    MAX
                </Button>
            </div>
            {proposedOverage && <div id={errorId} className="mt-2 flex flex-wrap items-center gap-2 text-xs text-amber-700 dark:text-amber-400">
                <span role="status">₱{formatSettlementAmount(proposedOverage.excess)} exceeds the invoice balance.</span>
                <Button size="sm" variant="outline" onClick={() => {
                    setDraft(null);
                    onOverage?.(proposedOverage.gross, proposedOverage.excess);
                }}>Record overage</Button>
            </div>}
            {error && <p id={errorId} role="alert" className="mt-1 text-[10px] text-destructive">{error}</p>}
        </div>
    );
}

interface AllocationSidePanelProps {
    activeInvoiceId: number | null;
    isPosted: boolean;
    onOverage: (invoiceId: number, sourceId: string, gross: number, excess: number) => void;
    cartInvoices: UnpaidInvoice[];
    wallet: WalletItem[];
    credits: WalletItem[];
    allocations: SettlementAllocation[];
    handleAllocate: (invoiceId: number, sourceId: string, amountInput: number) => void;
    getUsedAmount: (sourceId: string) => number;
    getInvoiceApplied: (invoiceId: number) => number;
}

export default function AllocationSidePanel({
                                                activeInvoiceId,
                                                isPosted,
                                                onOverage,
                                                cartInvoices,
                                                wallet,
                                                credits,
                                                allocations,
                                                handleAllocate,
                                                getUsedAmount,
                                                getInvoiceApplied
                                            }: AllocationSidePanelProps) {
    const [localSearch, setLocalSearch] = useState("");

    const inv = cartInvoices.find(i => i.id === activeInvoiceId);

    if (!inv) {
        return (
            <div className="h-full flex flex-col items-center justify-center text-muted-foreground bg-muted/10 p-6 text-center">
                <Wallet className="w-12 h-12 mb-4 opacity-20" />
                <p className="font-bold uppercase tracking-widest text-xs">No Invoice Selected</p>
                <p className="text-[10px] mt-2">Click a row in the master list to allocate funds.</p>
            </div>
        );
    }

    const appliedSession = getInvoiceApplied(inv.id);
    const requiredBalance = getInvoiceRequiredBalance(inv);
    const hasEWTApplied = allocations.some(a => a.invoiceId === inv.id && a.allocationType === "EWT" && a.amountApplied > 0);

    return (
        <div className="flex flex-col h-full bg-card border-l border-border shadow-inner animate-in fade-in slide-in-from-right-4 duration-300">
            {/* Header */}
            <div className="bg-muted/30 p-4 border-b border-border/50 shrink-0">
                <div className="flex justify-between items-start">
                    <div>
                        <h4 className="font-black text-sm text-foreground leading-none">{inv.invoiceNo}</h4>
                        <p className="text-[10px] font-bold text-muted-foreground mt-1.5 leading-none">{inv.customerName}</p>
                    </div>
                </div>
                <div className="mt-3 flex justify-between items-center bg-background border border-border rounded p-2">
                    <span className="text-[10px] font-black uppercase text-muted-foreground">Target Balance</span>
                    <span className="font-mono font-black text-emerald-600 text-sm">₱{formatSettlementAmount(Math.max(0, requiredBalance - appliedSession))}</span>
                </div>
            </div>

            {/* Body */}
            <div className="p-4 flex-1 overflow-y-auto space-y-6 scrollbar-thin">
                {/* Physical Funds Section */}
                <div className="space-y-3">
                    <h5 className="text-[10px] font-black uppercase tracking-widest text-emerald-600 flex items-center border-b pb-1">
                        <Wallet size={12} className="mr-1.5"/> Physical Funds & EWT
                    </h5>

                    {wallet.length === 0 ? (
                        <p className="text-[10px] text-muted-foreground italic">No funds available.</p>
                    ) : wallet.filter(item => !item.overageSourceId).map(w => {
                        const existingAlloc = allocations.find(a => a.invoiceId === inv.id && a.sourceTempId === w.id);
                        const overage = wallet.find(item => item.invoiceId === inv.id && item.overageSourceId === w.id);
                        const usedElsewhere = getUsedAmount(w.id) - (existingAlloc?.amountApplied || 0) - (overage?.originalAmount ?? 0);
                        const remaining = getSourceAllocationCapacity(w.originalAmount, usedElsewhere);
                        const invoiceAvailable = getInvoiceAllocationCapacity(
                            requiredBalance,
                            appliedSession - (existingAlloc?.amountApplied || 0)
                        );
                        const targetMax = capSettlementAllocation(invoiceAvailable, remaining, invoiceAvailable);

                        const isExactMatch = w.invoiceId === inv.id;
                        // Fixed strict null-check linting error here by using ?? 0
                        const isEWTDisabled = w.type === 'EWT' && hasEWTApplied && !((existingAlloc?.amountApplied ?? 0) > 0);

                        return (
                            <div key={`apply-${inv.id}-${w.id}`} className={cn("flex flex-col gap-1.5 py-2 border-b border-border/50 last:border-0", isExactMatch ? "bg-blue-50/50 px-2 -mx-2 rounded-md" : "", isEWTDisabled ? "opacity-40 grayscale pointer-events-none" : "")}>
                                <div className="flex justify-between items-start gap-2">
                                    <div className="flex flex-col min-w-0">
                                        <div className="flex items-center gap-1 flex-wrap">
                                            <span className={cn("text-[10px] font-black uppercase leading-tight break-words", w.type === 'ADJUSTMENT' ? 'text-purple-600' : (w.type === 'EWT' ? 'text-teal-600' : 'text-foreground'))}>{w.label}</span>
                                            {isExactMatch && <Badge variant="outline" className="bg-blue-100 text-blue-700 text-[8px] px-1 h-3.5">Pre-Linked</Badge>}
                                        </div>
                                    </div>
                                    <div className="flex flex-col items-end shrink-0 text-right">
                                        <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest">Rem: ₱{formatSettlementAmount(remaining)}</span>
                                    </div>
                                </div>
                                <AllocationInput
                                    label={w.label}
                                    amount={roundCurrency((existingAlloc?.amountApplied ?? 0) + (overage?.originalAmount ?? 0))}
                                    max={targetMax}
                                    sourceMax={w.type === "CASH" || w.type === "CHECK" ? remaining : undefined}
                                    onOverage={(gross, excess) => onOverage(inv.id, w.id, gross, excess)}
                                    disabled={isPosted || isEWTDisabled}
                                    onApply={amount => handleAllocate(inv.id, w.id, amount)}
                                />
                            </div>
                        );
                    })}
                </div>

                {/* Credits Section */}
                <div className="space-y-3">
                    <h5 className="text-[10px] font-black uppercase tracking-widest text-purple-600 flex items-center border-b pb-1">
                        <Percent size={12} className="mr-1.5"/> Credits (Memos/Returns)
                    </h5>
                    <div className="relative">
                        <Input type="text" placeholder="Search credits..." className="h-8 pr-7 text-xs bg-background" value={localSearch} onChange={(e) => setLocalSearch(e.target.value)} />
                        <Search size={14} className="absolute right-2.5 top-2 text-muted-foreground"/>
                    </div>

                    {credits.map(c => {
                        if (!c.label.toLowerCase().includes(localSearch.toLowerCase()) && !(c.customerName || "").toLowerCase().includes(localSearch.toLowerCase())) return null;

                        const existingAlloc = allocations.find(a => a.invoiceId === inv.id && a.sourceTempId === c.id);
                        const usedElsewhere = getUsedAmount(c.id) - (existingAlloc?.amountApplied || 0);
                        const remaining = getSourceAllocationCapacity(c.originalAmount, usedElsewhere);
                        const invoiceAvailable = getInvoiceAllocationCapacity(
                            requiredBalance,
                            appliedSession - (existingAlloc?.amountApplied || 0)
                        );
                        const targetMax = capSettlementAllocation(invoiceAvailable, remaining, invoiceAvailable);

                        return (
                            <div key={`apply-${inv.id}-${c.id}`} className="flex flex-col gap-1.5 py-2 border-b border-border/50 last:border-0">
                                <div className="flex justify-between items-start gap-2">
                                    <div className="flex min-w-0 flex-wrap items-center gap-1">
                                        <span className="text-[10px] font-black uppercase text-foreground leading-tight">{c.label}</span>
                                        {c.isCrossEntity && <Badge variant="outline" className="h-3.5 px-1 text-[8px] uppercase leading-none text-purple-700 border-purple-200 bg-purple-50">Cross-Entity</Badge>}
                                    </div>
                                    <span className="text-[9px] font-bold text-muted-foreground uppercase">Rem: ₱{formatSettlementAmount(remaining)}</span>
                                </div>
                                {(c.customerName || c.customerCode) && (
                                    <div className="truncate text-[8px] font-bold text-muted-foreground" title={`Source customer: ${c.customerName || c.customerCode}`}>
                                        Source: {c.customerName || c.customerCode}
                                    </div>
                                )}
                                <AllocationInput
                                    label={c.label}
                                    amount={existingAlloc?.amountApplied ?? 0}
                                    max={targetMax}
                                    disabled={isPosted}
                                    credit
                                    onApply={amount => handleAllocate(inv.id, c.id, amount)}
                                />
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}
