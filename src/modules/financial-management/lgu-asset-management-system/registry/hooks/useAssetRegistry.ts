"use client";

import * as React from "react";
import type {
  AssetRegistryQuery,
  AssetRegistryResponse,
  BulkAssetInput,
  LguAssetInput,
} from "../../types";
import {
  createAssetRequest,
  createBulkRequest,
  fetchRegistry,
  retireAssetRequest,
  updateAssetRequest,
} from "../providers/fetchProvider";

const EMPTY: AssetRegistryResponse = {
  assets: [],
  total: 0,
  page: 1,
  pageSize: 10,
  lookups: { classes: [], offices: [], fundSources: [], conditions: [] },
};

export function useAssetRegistry(initial?: Partial<AssetRegistryQuery>) {
  const [query, setQuery] = React.useState<AssetRegistryQuery>({
    q: "",
    classId: null,
    officeId: null,
    recordStatus: "active",
    sort: "property_no",
    dir: "asc",
    page: 1,
    pageSize: 10,
    ...initial,
  });
  const [data, setData] = React.useState<AssetRegistryResponse>(EMPTY);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  const load = React.useCallback(async (next: AssetRegistryQuery) => {
    setLoading(true);
    setError(null);
    try {
      const result = await fetchRegistry(next);
      setData(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    const timer = window.setTimeout(() => {
      void load(query);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [load, query]);

  const patchQuery = React.useCallback((patch: Partial<AssetRegistryQuery>) => {
    setQuery((prev) => ({ ...prev, ...patch }));
  }, []);

  const create = React.useCallback(
    async (input: LguAssetInput) => {
      setBusy(true);
      try {
        const created = await createAssetRequest(input);
        await load(query);
        return created;
      } finally {
        setBusy(false);
      }
    },
    [load, query]
  );

  const createBulk = React.useCallback(
    async (input: BulkAssetInput) => {
      setBusy(true);
      try {
        const result = await createBulkRequest(input);
        await load(query);
        return result;
      } finally {
        setBusy(false);
      }
    },
    [load, query]
  );

  const update = React.useCallback(
    async (id: number, input: Partial<LguAssetInput>) => {
      setBusy(true);
      try {
        const updated = await updateAssetRequest(id, input);
        await load(query);
        return updated;
      } finally {
        setBusy(false);
      }
    },
    [load, query]
  );

  const retire = React.useCallback(
    async (id: number) => {
      setBusy(true);
      try {
        const retired = await retireAssetRequest(id);
        await load(query);
        return retired;
      } finally {
        setBusy(false);
      }
    },
    [load, query]
  );

  return { query, patchQuery, data, loading, error, busy, refresh: () => load(query), create, createBulk, update, retire };
}
