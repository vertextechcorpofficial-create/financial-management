"use client";

import { useEffect } from "react";
import { AlertTriangle, RotateCcw } from "lucide-react";

import { Button } from "@/components/ui/button";

export default function ManagementAnalyticsError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    // The digest is what the server log keys on, so it is the only detail worth printing.
    console.error("Management analytics page failed", error.digest ?? error.message);
  }, [error]);

  return (
    <div className="flex min-h-[320px] flex-col items-center justify-center gap-4 rounded-xl border border-destructive/40 bg-destructive/5 px-6 py-12 text-center">
      <span className="flex h-10 w-10 items-center justify-center rounded-full bg-destructive/10 text-destructive">
        <AlertTriangle className="h-5 w-5" />
      </span>
      <div className="space-y-1">
        <h2 className="text-base font-semibold">This screen could not be shown</h2>
        <p className="max-w-md text-sm text-muted-foreground">
          The read failed on the way in, so nothing on this page is current. Try again; if it keeps failing, the
          database is the place to look, not this screen.
        </p>
      </div>
      <Button variant="outline" onClick={reset} className="gap-1.5">
        <RotateCcw className="h-3.5 w-3.5" />
        Try again
      </Button>
    </div>
  );
}
