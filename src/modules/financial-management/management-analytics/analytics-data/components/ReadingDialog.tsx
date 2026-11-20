"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { OptionCombobox } from "./OptionCombobox";
import type { DataPayload } from "../types";
import { postReading } from "../providers/dataApi";

export function ReadingDialog({
  open,
  onOpenChange,
  data,
  defaultCompanyCode,
  defaultPeriod,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  data: DataPayload | null;
  defaultCompanyCode?: string;
  defaultPeriod: string;
  onSaved: () => void;
}) {
  const [companyCode, setCompanyCode] = useState(defaultCompanyCode ?? "dist");
  const [kpiId, setKpiId] = useState<number | null>(null);
  const [period, setPeriod] = useState(defaultPeriod);
  const [value, setValue] = useState("");
  const [basis, setBasis] = useState<"ACTUAL" | "PROVISIONAL">("ACTUAL");
  const [sourceCode, setSourceCode] = useState("MANUAL");
  const [note, setNote] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSaving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setPeriod(defaultPeriod);
    if (defaultCompanyCode) setCompanyCode(defaultCompanyCode);
  }, [open, defaultPeriod, defaultCompanyCode]);

  const companies = useMemo(
    () => (data?.companies ?? []).map((company) => ({ value: company.code, label: company.name, description: company.code })),
    [data],
  );

  const company = data?.companies.find((item) => item.code === companyCode);
  const kpis = useMemo(
    () =>
      (data?.kpis ?? [])
        .filter((kpi) => (company ? kpi.company_id === company.id : true))
        .map((kpi) => ({
          value: String(kpi.id),
          label: kpi.name,
          searchText: `${kpi.kpi_key} ${kpi.name}`,
          description: kpi.kpi_key,
        })),
    [data, company],
  );

  const sources = data?.sources.map((source) => source.code) ?? ["MANUAL"];

  const blocker =
    kpiId === null
      ? "Choose the measure this reading belongs to."
      : value.trim() === "" || !Number.isFinite(Number(value))
        ? "Enter the reading as a number."
        : !/^\d{4}-\d{2}$/.test(period)
          ? "Month must look like 2026-11."
          : null;

  const submit = async () => {
    const found: Record<string, string> = {};
    if (!kpiId) found.kpi = "Choose the measure this reading belongs to.";
    if (!/^\d{4}-\d{2}$/.test(period.trim())) found.period = "Use a month like 2026-11.";
    const parsed = Number(value.replace(/,/g, ""));
    if (value.trim().length === 0 || Number.isNaN(parsed)) found.value = "Enter the reading as a number.";
    setErrors(found);
    if (Object.keys(found).length > 0) {
      toast.error("Some fields need attention.");
      return;
    }

    setSaving(true);
    try {
      const result = await postReading({
        kpiId: kpiId as number,
        period: period.trim(),
        value: parsed,
        basis,
        sourceCode,
        note: note.trim() === "" ? null : note.trim(),
      });
      toast.success(`${result.created ? "Reading recorded" : "Reading corrected"} for ${period.trim()}.`);
      onSaved();
      onOpenChange(false);
      setValue("");
      setNote("");
      setKpiId(null);
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "The reading was not saved.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent showCloseButton={false} className="flex max-h-[85vh] w-[95vw] flex-col overflow-hidden rounded-2xl p-0 sm:max-w-[560px]">
        <DialogHeader className="space-y-1 border-b px-6 py-4">
          <DialogTitle className="text-base">Record a reading</DialogTitle>
          <DialogDescription className="text-xs">
            One reading per measure and month. Recording the same month again corrects it instead of adding a second row.
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-6 py-4">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Company</label>
            <OptionCombobox
              value={companyCode}
              onChange={(next) => {
                setCompanyCode(next);
                setKpiId(null);
              }}
              placeholder="Choose the company"
              searchPlaceholder="Search companies"
              emptyLabel="No company matches."
              options={companies}
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Measure</label>
            <OptionCombobox
              value={kpiId === null ? "" : String(kpiId)}
              onChange={(next) => setKpiId(next === "" ? null : Number(next))}
              placeholder="Choose the measure"
              searchPlaceholder="Search measures"
              emptyLabel="No measure matches this company."
              options={kpis}
            />
            {errors.kpi ? <p className="text-xs text-destructive">{errors.kpi}</p> : null}
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Month</label>
              <Input value={period} onChange={(event) => setPeriod(event.target.value)} placeholder="2026-11" className="h-9" />
              {errors.period ? <p className="text-xs text-destructive">{errors.period}</p> : null}
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Reading</label>
              <Input
                value={value}
                onChange={(event) => setValue(event.target.value)}
                inputMode="decimal"
                placeholder="0.00"
                className="h-9 tabular-nums"
              />
              {errors.value ? <p className="text-xs text-destructive">{errors.value}</p> : null}
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Basis</label>
              <Select value={basis} onValueChange={(next) => setBasis(next as "ACTUAL" | "PROVISIONAL")}>
                <SelectTrigger className="h-9 w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="min-w-[200px] [&_[data-slot=select-item]]:whitespace-nowrap">
                  <SelectItem value="ACTUAL">Actual</SelectItem>
                  <SelectItem value="PROVISIONAL">Provisional</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Source</label>
              <Select value={sourceCode} onValueChange={setSourceCode}>
                <SelectTrigger className="h-9 w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="max-h-60 min-w-[200px] [&_[data-slot=select-item]]:whitespace-nowrap">
                  <SelectItem value="MANUAL">Typed in</SelectItem>
                  {sources
                    .filter((code) => code !== "MANUAL")
                    .map((code) => (
                      <SelectItem key={code} value={code}>
                        {code}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Note</label>
            <Textarea value={note} onChange={(event) => setNote(event.target.value)} rows={2} placeholder="Why this figure, in one line." />
          </div>
        </div>

        <footer className="flex items-center justify-end gap-2 border-t bg-muted/20 px-6 py-4">
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          <span title={blocker ?? undefined}>
            <Button
              size="sm"
              className="gap-1.5"
              onClick={() => void submit()}
              disabled={isSaving || blocker !== null}
            >
              {isSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
              Save reading
            </Button>
          </span>
        </footer>
      </DialogContent>
    </Dialog>
  );
}
