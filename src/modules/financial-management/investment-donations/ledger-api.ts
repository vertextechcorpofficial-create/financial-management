type Result = { ok: false; message: string } | { ok: true; number?: number };

export async function submitLedger(operation: "cash" | "reverse" | "reconciliation" | "period" | "donation-document" | "trade" | "annual-review" | "issue-certificate" | "giving" | "cgt-reconcile" | "cgt-filing" | "subscribe" | "capital", input: unknown): Promise<Result> {
  const fallback = { ok: false as const, message: "The save could not be confirmed. Refresh before retrying." };
  try {
    const response = await fetch("/api/fm/investment-donations", {
      method: "POST",
      mode: "same-origin",
      credentials: "same-origin",
      redirect: "error",
      headers: { "Content-Type": "application/json", "X-Ledger-Request": "1" },
      body: JSON.stringify({ operation, input }),
    });
    const result = await response.json();
    if (result?.ok === false && typeof result.message === "string") return { ok: false, message: result.message };
    if (response.ok && result?.ok === true) {
      if (operation === "reconciliation" || operation === "period" || operation === "donation-document" || operation === "annual-review" || operation === "cgt-filing") return { ok: true };
      if (Number.isSafeInteger(result.number) && result.number > 0) return { ok: true, number: result.number };
      if ((operation === "giving" || operation === "capital") && result.number === null) return { ok: true };
    }
  } catch {
    return fallback;
  }
  return fallback;
}
