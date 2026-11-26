"use client";

import * as React from "react";
import { Download, FileWarning, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

/**
 * One viewer for every file this module shows. Fetching through our own proxy
 * means the browser never holds a Directus token, and the file is previewed in
 * place instead of being thrown at a new tab.
 */
export interface FilePreviewDialogProps {
  open: boolean;
  url: string | null;
  title: string;
  description?: string | null;
  onClose: () => void;
}

type Loaded =
  | { kind: "loading" }
  | { kind: "image"; src: string }
  | { kind: "pdf"; src: string }
  | { kind: "other"; src: string; type: string }
  | { kind: "error"; message: string };

export function FilePreviewDialog({ open, url, title, description, onClose }: FilePreviewDialogProps) {
  const [loaded, setLoaded] = React.useState<Loaded>({ kind: "loading" });

  React.useEffect(() => {
    if (!open || !url) return;
    let objectUrl: string | null = null;
    let alive = true;
    setLoaded({ kind: "loading" });

    fetch(url)
      .then(async (res) => {
        if (!res.ok) {
          const body = (await res.json().catch(() => null)) as { message?: string } | null;
          throw new Error(body?.message ?? "This file could not be opened");
        }
        return res.blob();
      })
      .then((blob) => {
        if (!alive) return;
        objectUrl = URL.createObjectURL(blob);
        if (blob.type.startsWith("image/")) setLoaded({ kind: "image", src: objectUrl });
        else if (blob.type === "application/pdf") setLoaded({ kind: "pdf", src: objectUrl });
        else setLoaded({ kind: "other", src: objectUrl, type: blob.type || "unknown" });
      })
      .catch((err: unknown) => {
        if (!alive) return;
        setLoaded({ kind: "error", message: err instanceof Error ? err.message : String(err) });
      });

    return () => {
      alive = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [open, url]);

  return (
    <Dialog open={open} onOpenChange={(next) => (!next ? onClose() : undefined)}>
      <DialogContent className="flex max-h-[92vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-4xl">
        <DialogHeader className="shrink-0 px-6 pt-6 pb-2">
          <DialogTitle className="pr-8 text-base">{title}</DialogTitle>
          {description ? <DialogDescription>{description}</DialogDescription> : null}
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-auto bg-muted/30 px-6 py-2">
          {loaded.kind === "loading" ? (
            <div className="flex h-64 items-center justify-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Opening the file...
            </div>
          ) : null}

          {loaded.kind === "image" ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img src={loaded.src} alt={title} className="mx-auto max-h-[70vh] w-auto object-contain" />
          ) : null}

          {loaded.kind === "pdf" ? (
            <iframe src={loaded.src} title={title} className="h-[70vh] w-full rounded-md border bg-background" />
          ) : null}

          {loaded.kind === "other" ? (
            <div className="flex h-64 flex-col items-center justify-center gap-2 text-sm text-muted-foreground">
              <FileWarning className="h-5 w-5" />
              This file type cannot be previewed here ({loaded.type}).
            </div>
          ) : null}

          {loaded.kind === "error" ? (
            <div className="flex h-64 flex-col items-center justify-center gap-2 text-sm text-destructive">
              <FileWarning className="h-5 w-5" />
              {loaded.message}
            </div>
          ) : null}
        </div>

        <DialogFooter className="shrink-0 border-t bg-background px-6 py-4">
          {loaded.kind === "image" || loaded.kind === "pdf" || loaded.kind === "other" ? (
            <Button asChild variant="outline">
              <a href={loaded.src} download={title}>
                <Download className="mr-2 h-4 w-4" />
                Download
              </a>
            </Button>
          ) : null}
          <Button onClick={onClose}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
