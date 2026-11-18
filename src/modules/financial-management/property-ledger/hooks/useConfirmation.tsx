"use client";
import { useEffect, useRef, useState } from "react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";

export function useConfirmation() {
  const [message, setMessage] = useState("");
  const resolver = useRef<((value: boolean) => void) | null>(null);
  useEffect(() => () => { resolver.current?.(false); }, []);
  function resolve(value: boolean) { const pending = resolver.current; resolver.current = null; setMessage(""); pending?.(value); }
  function confirm(description: string) {
    resolver.current?.(false);
    setMessage(description);
    return new Promise<boolean>(done => { resolver.current = done; });
  }
  const confirmation = <AlertDialog open={!!message} onOpenChange={open => { if (!open) resolve(false); }}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Confirm property ledger change</AlertDialogTitle><AlertDialogDescription>{message}</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel onClick={() => resolve(false)}>Cancel</AlertDialogCancel><AlertDialogAction onClick={() => resolve(true)}>Continue</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>;
  return { confirm, confirmation };
}
