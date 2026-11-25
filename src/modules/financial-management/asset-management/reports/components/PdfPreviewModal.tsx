"use client";

import React, { useEffect, useState, useRef } from "react";
import { Download, Loader2, Printer } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import type { PdfTemplate } from "@/components/pdf-layout-design/services/pdf-template";
import type { PdfData } from "@/components/pdf-layout-design/types";
import { SearchableSelect } from "./SearchableSelect";
import {
  buildExportSpec,
  buildReportPdfDocument,
  fetchPdfCompanyData,
} from "../utils/exportReports";
import type { ActivityLogRow, AssetReportsPayload, ReportTabKey } from "../types";

interface PdfPreviewModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  activeTab: ReportTabKey;
  data: AssetReportsPayload;
  filteredActivityRows: ActivityLogRow[];
}

async function fetchTemplatesSafely(): Promise<PdfTemplate[]> {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch("/api/pdf/templates", { cache: "no-store" });
      if (res.ok) {
        const json = (await res.json()) as { data?: PdfTemplate[] };
        return Array.isArray(json.data) ? json.data : [];
      }
    } catch {
      // retry once silently
    }
  }
  return [];
}

export default function PdfPreviewModal({
  open,
  onOpenChange,
  activeTab,
  data,
  filteredActivityRows,
}: PdfPreviewModalProps) {
  const [templates, setTemplates] = useState<PdfTemplate[]>([]);
  const [companyData, setCompanyData] = useState<PdfData | null>(null);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>("");
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string>("report.pdf");
  const [reportTitle, setReportTitle] = useState<string>("PDF Preview");
  const [isRendering, setIsRendering] = useState(false);
  const [metaLoaded, setMetaLoaded] = useState(false);

  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const blobUrlRef = useRef<string | null>(null);

  // Load saved PDF Layout templates & company data when modal opens
  useEffect(() => {
    if (!open) return;
    let cancelled = false;

    const loadMeta = async () => {
      setIsRendering(true);
      try {
        const [tpls, comp] = await Promise.all([
          fetchTemplatesSafely(),
          fetchPdfCompanyData(),
        ]);
        if (cancelled) return;
        setTemplates(tpls);
        setCompanyData(comp);

        const spec = buildExportSpec(activeTab, data, filteredActivityRows);
        const preferLandscape = Boolean(spec.landscape || spec.columns.length > 6);

        // Pick best matching saved PDF Layout template automatically
        const preferred =
          tpls.find(
            (t) =>
              t.config?.orientation === (preferLandscape ? "landscape" : "portrait") &&
              t.config?.paperSize?.toLowerCase() === "a4"
          ) ||
          tpls.find(
            (t) => t.config?.orientation === (preferLandscape ? "landscape" : "portrait")
          ) ||
          tpls[0];

        setSelectedTemplateId(preferred ? String(preferred.id) : "none");
        setMetaLoaded(true);
      } catch {
        if (!cancelled) {
          setSelectedTemplateId("none");
          setMetaLoaded(true);
        }
      }
    };

    loadMeta();
    return () => {
      cancelled = true;
    };
  }, [open, activeTab, data, filteredActivityRows]);

  // Generate PDF preview blob whenever template or report changes
  useEffect(() => {
    if (!open || !metaLoaded) return;
    let cancelled = false;

    const renderPdf = async () => {
      setIsRendering(true);
      try {
        const tpl = templates.find((t) => String(t.id) === selectedTemplateId) || null;
        const { doc, fileName: fName, title } = await buildReportPdfDocument(
          activeTab,
          data,
          filteredActivityRows,
          tpl,
          companyData
        );
        if (cancelled) return;

        const blob = doc.output("blob");
        const nextUrl = URL.createObjectURL(blob);

        if (blobUrlRef.current) {
          URL.revokeObjectURL(blobUrlRef.current);
        }
        blobUrlRef.current = nextUrl;
        setPdfUrl(nextUrl);
        setFileName(fName);
        setReportTitle(title);
      } finally {
        if (!cancelled) setIsRendering(false);
      }
    };

    renderPdf();
    return () => {
      cancelled = true;
    };
  }, [open, metaLoaded, selectedTemplateId, templates, companyData, activeTab, data, filteredActivityRows]);

  // Cleanup object URL on close/unmount
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
      value: String(t.id),
      subLabel: `${t.config?.paperSize || "A4"} · ${t.config?.orientation || "portrait"}`,
    })),
    { label: "Standard Header (No Template)", value: "none" },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[95vw] max-w-[95vw] sm:max-w-[92vw] xl:max-w-[1400px] h-[92vh] flex flex-col p-0 gap-0 overflow-hidden">
        <DialogHeader className="px-5 py-3.5 border-b flex flex-col sm:flex-row sm:items-center justify-between gap-3 shrink-0 pr-12">
          <DialogTitle className="text-sm font-semibold text-foreground truncate">
            PDF Preview &mdash; {reportTitle}
          </DialogTitle>

          <div className="flex items-center gap-2 shrink-0">
            <span className="text-xs text-muted-foreground whitespace-nowrap">PDF Layout</span>
            <div className="w-52">
              <SearchableSelect
                options={templateOptions}
                value={selectedTemplateId}
                onChange={setSelectedTemplateId}
                placeholder="Select layout..."
                searchPlaceholder="Search PDF layout..."
                className="h-8"
                disabled={isRendering && !metaLoaded}
              />
            </div>
          </div>
        </DialogHeader>

        {/* Embedded PDF Preview Area */}
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
              title={reportTitle}
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
