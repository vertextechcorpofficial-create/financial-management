"use client";

import React, { useEffect, useState, useRef } from "react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { Download, Loader2, Printer } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { PdfEngine } from "@/components/pdf-layout-design/PdfEngine";
import { PAPER_SIZES } from "@/components/pdf-layout-design/constants";
import { pdfTemplateService, type PdfTemplate } from "@/components/pdf-layout-design/services/pdf-template";
import type { PdfConfig, PdfData } from "@/components/pdf-layout-design/types";
import { SearchableSelect } from "./SearchableSelect";

export interface AssetPdfSpec {
  title: string;
  subtitle: string;
  fileName: string;
  landscape?: boolean;
  columns: { header: string; numeric?: boolean }[];
  rows: {
    cells: (string | number)[];
    isSection?: boolean;
    isTotal?: boolean;
    isGrand?: boolean;
  }[];
}

interface PdfPreviewModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  spec: AssetPdfSpec | null;
}

const fmtNum = (val: number | null | undefined): string => {
  if (val === null || val === undefined || Math.abs(val) < 0.005) return "—";
  const abs = Math.abs(val).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return val < 0 ? `(${abs})` : abs;
};

function renderSpecTable(doc: jsPDF, startY: number, config: Partial<PdfConfig>, spec: AssetPdfSpec) {
  const margins = config.margins || { top: 12, right: 12, bottom: 12, left: 12 };
  const pageWidth = doc.internal.pageSize.getWidth();
  const baseSize =
    config.paperSize === "Custom" && config.customSize
      ? config.customSize
      : PAPER_SIZES[config.paperSize || "A4"] || PAPER_SIZES.A4;
  const paperHeight = config.orientation === "landscape" ? baseSize.width : baseSize.height;
  const bottomMargin = config.bodyEnd ? paperHeight - config.bodyEnd : margins.bottom + 6;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(15, 23, 42);
  doc.text(spec.title, margins.left, startY + 2, { baseline: "top" });

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(100, 116, 139);
  doc.text(spec.subtitle, margins.left, startY + 7.5, { baseline: "top" });
  doc.text(`Generated ${new Date().toLocaleString("en-PH")}`, pageWidth - margins.right, startY + 2, {
    align: "right",
    baseline: "top",
  });

  const body = spec.rows.map((row) => {
    if (row.isSection) {
      return [
        {
          content: String(row.cells[0] || ""),
          colSpan: spec.columns.length,
          styles: {
            fontStyle: "bold" as const,
            fillColor: [241, 245, 249] as [number, number, number],
            textColor: [71, 85, 105] as [number, number, number],
          },
        },
      ];
    }
    return row.cells.map((cell, idx) => {
      const col = spec.columns[idx];
      const text = typeof cell === "number" ? fmtNum(cell) : String(cell ?? "");
      return {
        content: text,
        styles: {
          halign: (col?.numeric ? "right" : "left") as "right" | "left",
          fontStyle: (row.isTotal ? "bold" : "normal") as "bold" | "normal",
          fillColor: row.isGrand
            ? ([236, 253, 245] as [number, number, number])
            : row.isTotal
            ? ([248, 250, 252] as [number, number, number])
            : undefined,
        },
      };
    });
  });

  autoTable(doc, {
    startY: startY + 13,
    head: [
      spec.columns.map((c) => ({
        content: c.header,
        styles: { halign: (c.numeric ? "right" : "left") as "right" | "left" },
      })),
    ],
    body: body.length > 0 ? body : [[{ content: "No records found.", colSpan: spec.columns.length }]],
    theme: "grid",
    styles: {
      font: "helvetica",
      fontSize: spec.columns.length > 9 ? 6.5 : 8,
      cellPadding: 1.8,
      lineColor: [226, 232, 240],
      lineWidth: 0.15,
    },
    headStyles: {
      fillColor: [27, 67, 50],
      textColor: 255,
      fontStyle: "bold",
    },
    margin: {
      left: margins.left,
      right: margins.right,
      bottom: Math.max(margins.bottom, bottomMargin),
    },
  });
}

export default function PdfPreviewModal({
  open,
  onOpenChange,
  spec,
}: PdfPreviewModalProps) {
  const [templates, setTemplates] = useState<PdfTemplate[]>([]);
  const [companyData, setCompanyData] = useState<PdfData | null>(null);
  const [selectedTemplateName, setSelectedTemplateName] = useState<string>("");
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string>("report.pdf");
  const [isRendering, setIsRendering] = useState(false);
  const [metaLoaded, setMetaLoaded] = useState(false);

  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const blobUrlRef = useRef<string | null>(null);

  useEffect(() => {
    if (!open || !spec) return;
    let cancelled = false;

    const loadMeta = async () => {
      setIsRendering(true);
      try {
        const [compRes, tpls] = await Promise.all([
          fetch("/api/pdf/company", { cache: "no-store" }),
          pdfTemplateService.fetchTemplates(),
        ]);
        if (cancelled) return;

        let comp: PdfData | null = null;
        if (compRes.ok) {
          const result = (await compRes.json()) as { data?: PdfData[] | PdfData };
          comp = Array.isArray(result.data) ? result.data[0] ?? null : result.data ?? null;
        }

        setCompanyData(comp);
        setTemplates(tpls);

        const preferLandscape = Boolean(spec.landscape || spec.columns.length > 6);
        const preferred =
          tpls.find(
            (t) =>
              t.config?.orientation === (preferLandscape ? "landscape" : "portrait") &&
              t.config?.paperSize?.toLowerCase() === "a4"
          ) ||
          tpls.find((t) => t.config?.orientation === (preferLandscape ? "landscape" : "portrait")) ||
          tpls[0];

        setSelectedTemplateName(preferred ? preferred.name : "__none__");
        setMetaLoaded(true);
      } catch {
        if (!cancelled) {
          setSelectedTemplateName("__none__");
          setMetaLoaded(true);
        }
      }
    };

    loadMeta();
    return () => {
      cancelled = true;
    };
  }, [open, spec]);

  useEffect(() => {
    if (!open || !metaLoaded || !spec || !selectedTemplateName) return;
    let cancelled = false;

    const renderPdf = async () => {
      setIsRendering(true);
      try {
        let doc: jsPDF;
        if (selectedTemplateName !== "__none__") {
          doc = await PdfEngine.generateWithFrame(selectedTemplateName, companyData, (pdf, startY, config) => {
            renderSpecTable(pdf, startY + 2, config, spec);
          });
        } else {
          const orientation = spec.landscape || spec.columns.length > 6 ? "landscape" : "portrait";
          doc = new jsPDF({ orientation, unit: "mm", format: "a4" });
          const compName =
            typeof companyData?.company_name === "string" && companyData.company_name.trim()
              ? companyData.company_name
              : "FINANCIAL MANAGEMENT SYSTEM";
          doc.setFont("helvetica", "bold");
          doc.setFontSize(13);
          doc.setTextColor(15, 23, 42);
          doc.text(compName, 12, 14);
          renderSpecTable(doc, 20, { paperSize: "A4", orientation, margins: { top: 12, right: 12, bottom: 12, left: 12 }, elements: {} }, spec);
        }

        if (!cancelled) {
          const blob = doc.output("blob");
          const nextUrl = URL.createObjectURL(blob);
          if (blobUrlRef.current) URL.revokeObjectURL(blobUrlRef.current);
          blobUrlRef.current = nextUrl;
          setPdfUrl(nextUrl);
          setFileName(spec.fileName.endsWith(".pdf") ? spec.fileName : `${spec.fileName}.pdf`);
        }
      } finally {
        if (!cancelled) setIsRendering(false);
      }
    };

    renderPdf();
    return () => {
      cancelled = true;
    };
  }, [open, metaLoaded, selectedTemplateName, companyData, spec]);

  useEffect(() => {
    if (!open) {
      setMetaLoaded(false);
      if (blobUrlRef.current) {
        URL.revokeObjectURL(blobUrlRef.current);
        blobUrlRef.current = null;
      }
      setPdfUrl(null);
    }
  }, [open]);

  const handleDownload = () => {
    if (!pdfUrl) return;
    const a = document.createElement("a");
    a.href = pdfUrl;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const handlePrint = () => {
    if (iframeRef.current?.contentWindow) {
      iframeRef.current.contentWindow.focus();
      iframeRef.current.contentWindow.print();
    } else if (pdfUrl) {
      window.open(pdfUrl, "_blank");
    }
  };

  const templateOptions = [
    ...templates.map((t) => ({
      label: t.name,
      value: t.name,
      subLabel: `${t.config?.paperSize || "A4"} · ${t.config?.orientation || "portrait"}`,
    })),
    { label: "Standard Header (No Template)", value: "__none__" },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[95vw] max-w-[95vw] sm:max-w-[92vw] xl:max-w-[1400px] h-[92vh] flex flex-col p-0 gap-0 overflow-hidden">
        <DialogHeader className="px-5 py-3.5 border-b flex flex-col sm:flex-row sm:items-center justify-between gap-3 shrink-0 pr-12">
          <DialogTitle className="text-sm font-semibold text-foreground truncate">
            PDF Preview &mdash; {spec?.title || "Report"}
          </DialogTitle>

          <div className="flex items-center gap-2 shrink-0">
            <span className="text-xs text-muted-foreground whitespace-nowrap">PDF Layout</span>
            <div className="w-52">
              <SearchableSelect
                options={templateOptions}
                value={selectedTemplateName}
                onChange={setSelectedTemplateName}
                placeholder="Select layout..."
                searchPlaceholder="Search PDF layout..."
                className="h-8"
                disabled={isRendering && !metaLoaded}
              />
            </div>
          </div>
        </DialogHeader>

        <div className="flex-1 bg-muted/30 relative overflow-hidden">
          {isRendering && (
            <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-background/70 backdrop-blur-[1px] gap-2">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
              <span className="text-xs text-muted-foreground">Preparing PDF preview...</span>
            </div>
          )}

          {pdfUrl ? (
            <iframe
              ref={iframeRef}
              src={`${pdfUrl}#toolbar=1&navpanes=0`}
              title={spec?.title || "PDF Preview"}
              className="w-full h-full border-0"
            />
          ) : !isRendering ? (
            <div className="flex items-center justify-center h-full text-xs text-muted-foreground">
              Unable to generate PDF preview.
            </div>
          ) : null}
        </div>

        <DialogFooter className="px-5 py-3 border-t bg-background shrink-0 flex items-center justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onOpenChange(false)}
            className="h-8 text-xs"
          >
            Close
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleDownload}
            disabled={!pdfUrl || isRendering}
            className="h-8 text-xs gap-1.5"
          >
            <Download className="h-3.5 w-3.5" />
            Download PDF
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={handlePrint}
            disabled={!pdfUrl || isRendering}
            className="h-8 text-xs gap-1.5"
          >
            <Printer className="h-3.5 w-3.5" />
            Print
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
