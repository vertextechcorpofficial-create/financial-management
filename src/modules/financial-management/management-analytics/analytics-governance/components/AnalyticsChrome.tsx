"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Calendar, Download, Monitor, Pause, Play, SkipForward, SlidersHorizontal, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

import {
  COMPANY_PARAM,
  COMPARE_OPTIONS,
  COMPARE_PARAM,
  CURRENCY_PARAM,
  PERIOD_PARAM,
  TV_ROUTES,
  isPeriod,
  readPersistedMaFilters,
  recentPeriods,
  writePersistedMaFilters,
  type CompareMode,
  type CurrencyCode,
} from "./analytics-screens";

const PERIODS = recentPeriods();
const TV_INTERVAL_MS = 20_000;
const TV_STORAGE_KEY = "ma_tv_mode_v1";

function readTvFlag(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.sessionStorage.getItem(TV_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

function writeTvFlag(active: boolean): void {
  if (typeof window === "undefined") return;
  try {
    if (active) window.sessionStorage.setItem(TV_STORAGE_KEY, "1");
    else window.sessionStorage.removeItem(TV_STORAGE_KEY);
  } catch {
    // Ignore storage failures
  }
}

export function AnalyticsChrome({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const query = useSearchParams();

  const isOverview = pathname.startsWith("/fm/management-analytics/analytics-overview");
  const requested = query.get(PERIOD_PARAM);
  const persistedInitial = readPersistedMaFilters();

  const period = isPeriod(requested)
    ? requested
    : isPeriod(persistedInitial.period)
      ? persistedInitial.period
      : PERIODS[0];
  const periodOptions = PERIODS.includes(period) ? PERIODS : [period, ...PERIODS];
  const rawCompare = query.get(COMPARE_PARAM) ?? persistedInitial.compare;
  const compare = (COMPARE_OPTIONS.some((o) => o.value === rawCompare)
    ? rawCompare
    : "target") as CompareMode;
  const rawCurrency = query.get(CURRENCY_PARAM) ?? persistedInitial.currency;
  const currency = (rawCurrency === "USD" ? "USD" : "PHP") as CurrencyCode;

  const [tvMode, setTvMode] = useState<boolean>(() => readTvFlag());
  const [tvPaused, setTvPaused] = useState(false);
  const [tvProgress, setTvProgress] = useState(0);
  const [tvClock, setTvClock] = useState("");
  const tvElapsedRef = useRef(0);

  // Restore persisted global filters into URL when arriving from a clean sidebar click
  useEffect(() => {
    const hasCompany = Boolean(query.get(COMPANY_PARAM));
    const hasPeriod = isPeriod(query.get(PERIOD_PARAM));
    const hasCompare = Boolean(query.get(COMPARE_PARAM));
    const hasCurrency = Boolean(query.get(CURRENCY_PARAM));

    const persisted = readPersistedMaFilters();
    const params = new URLSearchParams(query.toString());
    let changed = false;

    if (!hasCompany && persisted.company) {
      params.set(COMPANY_PARAM, persisted.company);
      changed = true;
    }
    if (!hasPeriod && persisted.period && isPeriod(persisted.period)) {
      params.set(PERIOD_PARAM, persisted.period);
      changed = true;
    }
    if (!hasCompare && persisted.compare && persisted.compare !== "target") {
      params.set(COMPARE_PARAM, persisted.compare);
      changed = true;
    }
    if (!hasCurrency && persisted.currency && persisted.currency !== "PHP") {
      params.set(CURRENCY_PARAM, persisted.currency);
      changed = true;
    }

    if (changed) {
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
      return;
    }

    const patch: Record<string, string> = {};
    if (hasCompany) patch.company = query.get(COMPANY_PARAM)!;
    if (hasPeriod) patch.period = query.get(PERIOD_PARAM)!;
    if (hasCompare) patch.compare = query.get(COMPARE_PARAM)!;
    if (hasCurrency) patch.currency = query.get(CURRENCY_PARAM)!;
    if (Object.keys(patch).length > 0) {
      writePersistedMaFilters(patch);
    }
  }, [pathname, query, router]);

  const updateParam = useCallback(
    (key: string, value: string) => {
      const params = new URLSearchParams(query.toString());
      params.set(key, value);
      if (key === COMPANY_PARAM) writePersistedMaFilters({ company: value });
      if (key === PERIOD_PARAM) writePersistedMaFilters({ period: value });
      if (key === COMPARE_PARAM) writePersistedMaFilters({ compare: value as CompareMode });
      if (key === CURRENCY_PARAM) writePersistedMaFilters({ currency: value as CurrencyCode });
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    },
    [pathname, query, router],
  );

  const qsParams = new URLSearchParams();
  const activeCompany = query.get(COMPANY_PARAM) ?? persistedInitial.company;
  if (activeCompany) qsParams.set(COMPANY_PARAM, activeCompany);
  qsParams.set(PERIOD_PARAM, period);
  if (compare !== "target") qsParams.set(COMPARE_PARAM, compare);
  if (currency !== "PHP") qsParams.set(CURRENCY_PARAM, currency);
  const carryQs = `?${qsParams.toString()}`;

  const advanceTvSlide = useCallback(() => {
    const idx = TV_ROUTES.findIndex((r) => pathname.startsWith(r.path));
    const next = TV_ROUTES[(idx + 1) % TV_ROUTES.length];
    tvElapsedRef.current = 0;
    setTvProgress(0);
    router.replace(`${next.path}${carryQs}`);
  }, [pathname, carryQs, router]);

  const enterTvMode = useCallback(() => {
    writeTvFlag(true);
    tvElapsedRef.current = 0;
    setTvProgress(0);
    setTvPaused(false);
    setTvMode(true);
    if (typeof document !== "undefined" && !document.fullscreenElement) {
      document.documentElement.requestFullscreen?.().catch(() => {});
    }
  }, []);

  const exitTvMode = useCallback(() => {
    writeTvFlag(false);
    setTvMode(false);
    setTvPaused(false);
    tvElapsedRef.current = 0;
    setTvProgress(0);
    if (typeof document !== "undefined" && document.fullscreenElement) {
      document.exitFullscreen?.().catch(() => {});
    }
  }, []);

  useEffect(() => {
    if (!tvMode) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") exitTvMode();
    };
    const onFsChange = () => {
      if (!document.fullscreenElement && readTvFlag()) {
        // User pressed browser Esc to leave fullscreen -> cleanly exit TV mode
        exitTvMode();
      }
    };
    window.addEventListener("keydown", onKey);
    document.addEventListener("fullscreenchange", onFsChange);

    const tick = window.setInterval(() => {
      setTvClock(
        new Date().toLocaleTimeString("en-PH", {
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
          timeZone: "Asia/Manila",
        }) + " PHT",
      );
      if (tvPaused) return;
      tvElapsedRef.current += 250;
      const pct = Math.min(100, (tvElapsedRef.current / TV_INTERVAL_MS) * 100);
      setTvProgress(pct);
      if (tvElapsedRef.current >= TV_INTERVAL_MS) {
        advanceTvSlide();
      }
    }, 250);

    return () => {
      window.removeEventListener("keydown", onKey);
      document.removeEventListener("fullscreenchange", onFsChange);
      window.clearInterval(tick);
    };
  }, [tvMode, tvPaused, advanceTvSlide, exitTvMode]);

  const activeTvLabel = TV_ROUTES.find((r) => pathname.startsWith(r.path))?.label ?? "Overview";

  if (tvMode) {
    return (
      <div className="fixed inset-0 z-50 flex flex-col overflow-hidden bg-background">
        <div className="relative flex shrink-0 items-center justify-between gap-4 border-b border-slate-800 bg-slate-950 px-5 py-2.5 text-white">
          <div className="flex items-center gap-3">
            <span className="inline-flex items-center gap-1.5 rounded-md bg-teal-500/20 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wider text-teal-300">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-teal-400" />
              TV Display
            </span>
            <span className="text-sm font-semibold tracking-tight">{activeTvLabel}</span>
            <span className="font-mono text-xs text-slate-400">{period}</span>
          </div>

          <div className="flex items-center gap-2">
            <span className="mr-2 font-mono text-xs tabular-nums text-slate-300">{tvClock}</span>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-7 gap-1.5 text-xs text-slate-200 hover:bg-white/10 hover:text-white"
              onClick={() => setTvPaused((p) => !p)}
            >
              {tvPaused ? <Play className="h-3.5 w-3.5" /> : <Pause className="h-3.5 w-3.5" />}
              {tvPaused ? "Resume" : "Pause"}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-7 gap-1.5 text-xs text-slate-200 hover:bg-white/10 hover:text-white"
              onClick={advanceTvSlide}
            >
              <SkipForward className="h-3.5 w-3.5" />
              Next
            </Button>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              className="h-7 gap-1 text-xs"
              onClick={exitTvMode}
            >
              <X className="h-3.5 w-3.5" />
              Exit
            </Button>
          </div>

          <span
            aria-hidden
            className="absolute bottom-0 left-0 h-0.5 bg-teal-400 transition-all duration-200"
            style={{ width: `${tvProgress}%` }}
          />
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
          <div className="mx-auto w-full max-w-[1600px]">{children}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-[1440px] flex-col gap-4 px-4 pb-12 pt-3 sm:px-6">
      {/* Unified, compact control strip */}
      <div className="flex flex-wrap items-center justify-between gap-2.5 border-b border-border/60 pb-3">
        <div className="inline-flex flex-wrap items-center divide-x divide-border/70 rounded-lg border border-border/75 bg-card shadow-2xs">
          {/* Period */}
          <div className="flex items-center gap-1.5 px-2.5 py-1">
            <Calendar className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
            <Select value={period} onValueChange={(next) => updateParam(PERIOD_PARAM, next)}>
              <SelectTrigger className="h-6 w-[88px] border-0 bg-transparent px-1 font-mono text-xs font-semibold tabular-nums shadow-none focus:ring-0">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="max-h-60">
                {periodOptions.map((month) => (
                  <SelectItem key={month} value={month} className="font-mono tabular-nums">
                    {month}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Compare */}
          <div className="flex items-center gap-1.5 px-2.5 py-1">
            <SlidersHorizontal className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
            <Select value={compare} onValueChange={(next) => updateParam(COMPARE_PARAM, next)}>
              <SelectTrigger className="h-6 w-[126px] border-0 bg-transparent px-1 text-xs font-medium shadow-none focus:ring-0">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="max-h-60">
                {COMPARE_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Currency */}
          <div className="flex items-center p-1">
            {(["PHP", "USD"] as const).map((code) => (
              <button
                key={code}
                type="button"
                onClick={() => updateParam(CURRENCY_PARAM, code)}
                className={cn(
                  "rounded-md px-2 py-0.5 font-mono text-[11px] font-semibold transition-colors",
                  currency === code
                    ? "bg-teal-700 text-white dark:bg-teal-400 dark:text-slate-950"
                    : "text-muted-foreground hover:text-foreground",
                )}
                title={code === "PHP" ? "Display in Philippine Peso" : "Display in US Dollar"}
              >
                {code === "PHP" ? "₱ PHP" : "$ USD"}
              </button>
            ))}
          </div>
        </div>

        {/* Overview-only actions */}
        {isOverview ? (
          <div className="flex items-center gap-2">
            <Button type="button" variant="outline" size="sm" className="h-8 gap-1.5 text-xs" asChild>
              <Link href={`/fm/management-analytics/analytics-cadence${carryQs}`}>
                <Download className="h-3.5 w-3.5" aria-hidden />
                Export Pack
              </Link>
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 gap-1.5 text-xs"
              onClick={enterTvMode}
            >
              <Monitor className="h-3.5 w-3.5" aria-hidden />
              TV Mode
            </Button>
          </div>
        ) : null}
      </div>

      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
