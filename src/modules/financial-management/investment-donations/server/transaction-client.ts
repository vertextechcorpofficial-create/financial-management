import "server-only";

export async function directusTransaction(path: "/health" | "/commands", body?: object) {
  const base = process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/+$/, "");
  const token = process.env.DIRECTUS_STATIC_TOKEN;
  if (!base || !token) throw new Error("Directus is not configured.");
  return fetch(`${base}/capital-giving-ledger${path}`, {
    method: body ? "POST" : "GET",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
    cache: "no-store", redirect: "error", signal: AbortSignal.timeout(15000),
  });
}

export async function postingAvailable() {
  try {
    const response = await directusTransaction("/health");
    return response.ok && (await response.json()).ready === true;
  } catch {
    return false;
  }
}
