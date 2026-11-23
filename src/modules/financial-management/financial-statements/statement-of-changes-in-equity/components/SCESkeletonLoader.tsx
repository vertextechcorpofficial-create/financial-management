"use client";

import React from "react";
import { Skeleton } from "@/components/ui/skeleton";

export function SCESkeletonLoader() {
  return (
    <div className="flex flex-col gap-4 animate-in fade-in-50 duration-300">
      {/* Header Skeleton */}
      <div className="flex flex-wrap items-start justify-between gap-4 pb-1">
        <div className="space-y-2">
          <Skeleton className="h-3 w-48" />
          <div className="flex items-center gap-3">
            <Skeleton className="h-8 w-80" />
            <Skeleton className="h-6 w-32 rounded-full" />
          </div>
          <Skeleton className="h-4 w-56" />
        </div>
        <div className="flex items-center gap-2">
          <Skeleton className="h-8 w-28 rounded-md" />
          <Skeleton className="h-8 w-28 rounded-md" />
        </div>
      </div>

      {/* Control Bar Skeleton */}
      <div className="rounded-lg border bg-card p-3 shadow-sm sm:p-4 space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <div className="space-y-1">
            <Skeleton className="h-3 w-16" />
            <Skeleton className="h-8 w-full" />
          </div>
          <div className="space-y-1">
            <Skeleton className="h-3 w-16" />
            <Skeleton className="h-8 w-full" />
          </div>
          <div className="space-y-1">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-8 w-full" />
          </div>
          <div className="space-y-1">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-8 w-full" />
          </div>
        </div>
      </div>

      {/* Coverage & Status Banner Skeleton */}
      <div className="rounded-lg border bg-card p-3 shadow-sm sm:p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b pb-3">
          <div className="flex items-center gap-4">
            <Skeleton className="h-4 w-60" />
            <Skeleton className="h-5 w-36 rounded-md" />
          </div>
          <div className="flex items-center gap-2">
            <Skeleton className="h-8 w-44" />
            <Skeleton className="h-8 w-44" />
          </div>
        </div>
        <div className="flex items-center justify-between pt-1">
          <Skeleton className="h-3 w-80" />
          <Skeleton className="h-6 w-52 rounded-md" />
        </div>
      </div>

      {/* 4 Summary Cards Skeleton */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="rounded-lg border bg-card p-4 shadow-sm space-y-3">
            <div className="flex items-center justify-between">
              <Skeleton className="h-3 w-28" />
              <Skeleton className="h-4 w-4 rounded-full" />
            </div>
            <Skeleton className="h-8 w-40" />
            <Skeleton className="h-3 w-32" />
            <Skeleton className="h-3 w-24" />
          </div>
        ))}
      </div>

      {/* Tabs Skeleton */}
      <div className="flex rounded-md border p-1 bg-muted/40 w-fit gap-1">
        <Skeleton className="h-7 w-24 rounded-md" />
        <Skeleton className="h-7 w-32 rounded-md" />
        <Skeleton className="h-7 w-28 rounded-md" />
      </div>

      {/* Statement Table Matrix Skeleton */}
      <div className="rounded-lg border bg-card p-4 shadow-sm space-y-4">
        <div className="flex items-center justify-between border-b pb-3">
          <div className="flex items-center gap-2">
            <Skeleton className="h-4 w-44" />
            <Skeleton className="h-4 w-36 rounded-md" />
          </div>
          <div className="flex items-center gap-2">
            <Skeleton className="h-7 w-20 rounded-md" />
            <Skeleton className="h-7 w-20 rounded-md" />
          </div>
        </div>

        {/* Table Rows */}
        <div className="space-y-2.5">
          <Skeleton className="h-9 w-full rounded" />
          {[1, 2, 3, 4, 5, 6, 7].map((row) => (
            <div key={row} className="flex items-center gap-3">
              <Skeleton className="h-8 w-[280px]" />
              <Skeleton className="h-8 flex-1" />
              <Skeleton className="h-8 flex-1" />
              <Skeleton className="h-8 flex-1" />
              <Skeleton className="h-8 flex-1" />
              <Skeleton className="h-8 flex-1" />
              <Skeleton className="h-8 flex-1" />
              <Skeleton className="h-8 flex-1 bg-muted/50" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
