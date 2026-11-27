import { toast } from "sonner";

export function mutationToast(ok: boolean, message: string) {
  if (ok) toast.success(message);
  else toast.error(message);
}

export function mutationError(message: string) {
  toast.error(message);
}
