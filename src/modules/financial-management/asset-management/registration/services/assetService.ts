const API_ROUTE = "/api/fm/asset-management/registration";

async function apiRequest(url: string, options?: RequestInit) {
  const res = await fetch(url, options);
  if (!res.ok) {
    const error = await res.json().catch(() => ({}));
    throw new Error(error.error || "Request failed");
  }
  return res.json();
}

export const assetService = {
  getDepartments: () => apiRequest(`${API_ROUTE}?type=departments`),

  getUsers: () => apiRequest(`${API_ROUTE}?type=users`),

  getItemTypes: () => apiRequest(`${API_ROUTE}?type=item_types`),

  getItemClassifications: () => apiRequest(`${API_ROUTE}?type=item_classifications`),

  getItems: () => apiRequest(`${API_ROUTE}?type=items`),

  getConditions: () => apiRequest(`${API_ROUTE}?type=conditions`),

  getGeneralSetting: (key: string) =>
    apiRequest(`${API_ROUTE}?type=setting&key=${key}`),

  getAssetTag: (classification: string) =>
    apiRequest(`${API_ROUTE}?type=asset_tag&classification=${encodeURIComponent(classification)}`),

  checkRfid: (rfid: string) =>
    apiRequest(`${API_ROUTE}?type=check_rfid&rfid=${encodeURIComponent(rfid)}`),

  createAsset: (body: Record<string, unknown>) =>
    apiRequest(API_ROUTE, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),

  updateAsset: (...args: unknown[]) => {
    if (args.length >= 3) {
      const [id, itemId, values, imageId] = args;
      return apiRequest(API_ROUTE, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, item_id: itemId, ...(values as Record<string, unknown>), item_image: imageId }),
      });
    }
    return apiRequest(API_ROUTE, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(args[0]),
    });
  },

  getAssetAssignments: (assetId: number) =>
    apiRequest(`${API_ROUTE}/assignments?asset_id=${assetId}`),

  assignAsset: (body: Record<string, unknown>) =>
    apiRequest(`${API_ROUTE}/assignments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),

  returnAsset: (assignmentId: number, body: Record<string, unknown>) =>
    apiRequest(`${API_ROUTE}/assignments`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ assignment_id: assignmentId, ...body }),
    }),

  recordTransfer: (body: Record<string, unknown>) =>
    apiRequest(`${API_ROUTE}/transfer`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),

  deactivateAsset: (id: number, reason: string) =>
    apiRequest(API_ROUTE, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, reason }),
    }),

  recordEvent: (body: Record<string, unknown>) =>
    apiRequest(`${API_ROUTE}/events`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),

  recordMaintenance: (body: Record<string, unknown>) =>
    apiRequest(`${API_ROUTE}/maintenance`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
};
