"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Bell, BookOpen, Download, Monitor, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

import {
  COMPARE_OPTIONS,
  COMPARE_PARAM,
  CURRENCY_PARAM,
  PERIOD_PARAM,
  TV_ROUTES,
  isPeriod,
  recentPeriods,
  type CompareMode,
  type CurrencyCode,
} from "./analytics-screens";

const PERIODS = recentPeriods();
const TV_INTERVAL_MS = 20_000;

interface BellAlert {
  id: number;
  severity: string;
  alertType: string;
  title: string;
  detail?: string;
  state: string;
}

const GUIDE_STEPS = [
  {
    n: "STEP 1",
    title: "See the group at a glance",
    desc: "Company health, top issue per company, consolidated KPIs and the risk heatmap.",
    cta: "Open Overview",
    href: "/fm/management-analytics/analytics-overview",
  },
  {
    n: "STEP 2",
    title: "Drill into a breach",
    desc: "Click any KPI card to inspect it through Descriptive, Diagnostic, Predictive and Prescriptive tiers.",
    cta: "Analytics Tiers",
    href: "/fm/management-analytics/analytics-tiers",
  },
  {
    n: "STEP 3",
    title: "Assign an owner & memo",
    desc: "In Variance Protocol, assign an accountable owner, file the root-cause memo and track verification.",
    cta: "Variance Protocol",
    href: "/fm/management-analytics/analytics-variance",
  },
  {
    n: "STEP 4",
    title: "Run the monthly review",
    desc: "Meeting mode builds the agenda from open exceptions; record decisions, actions and export minutes.",
    cta: "Monthly Review",
    href: "/fm/management-analytics/analytics-review",
  },
  {
    n: "STEP 5",
    title: "Test a what-if scenario",
    desc: "Adjust revenue, margin, fixed costs, cash cycle or FX rate to see group EBITDA and cash impact.",
    cta: "Scenario Planner",
    href: "/fm/management-analytics/analytics-scenario",
  },
];

/**
 * The shared Management Analytics command toolbar (Period, Compare, Currency, Guide, Export,
 * TV wall display mode, and Notification Bell). Screen navigation lives in the app sidebar.
 */
export function AnalyticsChrome({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const query = useSearchParams();
  const requested = query.get(PERIOD_PARAM);

  const period = isPeriod(requested) ? requested : PERIODS[0];
  const periodOptions = PERIODS.includes(period) ? PERIODS : [period, ...PERIODS];
  const compare = (COMPARE_OPTIONS.some((o) => o.value === query.get(COMPARE_PARAM))
    ? query.get(COMPARE_PARAM)
    : "target") as CompareMode;
  const currency = (query.get(CURRENCY_PARAM) === "USD" ? "USD" : "PHP") as CurrencyCode;

  const [guideOpen, setGuideOpen] = useState(false);
  const [bellOpen, setBellOpen] = useState(false);
  const [alerts, setAlerts] = useState<BellAlert[]>([]);
  const [tvMode, setTvMode] = useState(false);
  const [tvProgress, setTvProgress] = useState(0);
  const [tvClock, setTvClock] = useState("");

  const updateParam = useCallback(
    (key: string, value: string) => {
      const params = new URLSearchParams(query.toString());
      params.set(key, value);
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    },
    [pathname, query, router],
  );

  useEffect(() => {
    let cancelled = false;
    const poll = async () => {
      try {
        const res = await fetch("/api/fm/management-analytics/alerts?state=UNREAD", { cache: "no-store" });
        if (!res.ok || cancelled) return;
        const body = (await res.json()) as { data?: { alerts?: BellAlert[] } };
        if (!cancelled) setAlerts(body.data?.alerts ?? []);
      } catch {
        // Non-blocking toolbar indicator
      }
    };
    void poll();
    const timer = window.setInterval(() => void poll(), 60_000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, []);

  const markAllRead = async () => {
    const unreadIds = alerts.map((a) => a.id);
    await Promise.all(
      unreadIds.map((id) =>
        fetch(`/api/fm/management-analytics/alerts/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ state: "READ" }),
        }).catch(() => undefined),
      ),
    );
    setAlerts([]);
  };

  useEffect(() => {
    if (!tvMode) return;
    let startedAt = Date.now();
    const tick = () => {
      const elapsed = Date.now() - startedAt;
      setTvProgress(Math.min(100, (elapsed / TV_INTERVAL_MS) * 100));
      setTvClock(new Date().toLocaleTimeString("en-PH", { hour: "2-digit", minute: "2-digit" }));
      if (elapsed >= TV_INTERVAL_MS) {
        startedAt = Date.now();
        const idx = TV_ROUTES.findIndex((r) => pathname.startsWith(r.path));
        const next = TV_ROUTES[(idx + 1) % TV_ROUTES.length];
        router.push(`${next.path}?${query.toString()}`);
      }
    };
    tick();
    const id = window.setInterval(tick, 250);
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setTvMode(false);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.clearInterval(id);
      window.removeEventListener("keydown", onKey);
    };
  }, [tvMode, pathname, query, router]);

  const unreadCount = alerts.length;
  const activeTvLabel = TV_ROUTES.find((r) => pathname.startsWith(r.path))?.label ?? "Management Analytics";

  return (
    <div className="flex min-w-0 flex-col gap-3">
      {tvMode ? (
        <div className="sticky top-0 z-30 flex items-center gap-4 overflow-hidden rounded-xl bg-foreground px-4 py-2.5 text-background shadow-md">
          <span className="font-semibold tracking-tight">Management Analytics</span>
          <span className="font-mono text-xs opacity-75">{activeTvLabel} · {period}</span>
          <span className="flex-1" />
          <span className="font-mono text-xs tabular-nums">{tvClock}</span>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            onClick={() => setTvMode(false)}
          >
            Exit TV mode
          </Button>
          <span
            aria-hidden
            className="absolute bottom-0 left-0 h-0.5 bg-primary transition-all"
            style={{ width: `${tvProgress}%` }}
          />
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-2 rounded-lg border border-border/60 bg-card py-1 pl-2.5 pr-1 shadow-sm">
            <span
              id="analytics-period-label"
              className="text-[11px] font-medium uppercase tracking-[0.06em] text-muted-foreground"
            >
              Period
            </span>
            <Select value={period} onValueChange={(next) => updateParam(PERIOD_PARAM, next)}>
              <SelectTrigger
                aria-labelledby="analytics-period-label"
                className="h-8 w-[116px] border-0 bg-transparent px-1.5 font-mono text-sm font-medium tabular-nums shadow-none"
              >
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

          <div className="flex items-center gap-2 rounded-lg border border-border/60 bg-card py-1 pl-2.5 pr-1 shadow-sm">
            <span
              id="analytics-compare-label"
              className="text-[11px] font-medium uppercase tracking-[0.06em] text-muted-foreground"
            >
              Compare
            </span>
            <Select value={compare} onValueChange={(next) => updateParam(COMPARE_PARAM, next)}>
              <SelectTrigger
                aria-labelledby="analytics-compare-label"
                className="h-8 w-[150px] border-0 bg-transparent px-1.5 text-xs font-medium shadow-none"
              >
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

          <div className="flex items-center gap-2 rounded-lg border border-border/60 bg-card py-1 pl-2.5 pr-1 shadow-sm">
            <span
              id="analytics-currency-label"
              className="text-[11px] font-medium uppercase tracking-[0.06em] text-muted-foreground"
            >
              Currency
            </span>
            <Select value={currency} onValueChange={(next) => updateParam(CURRENCY_PARAM, next)}>
              <SelectTrigger
                aria-labelledby="analytics-currency-label"
                className="h-8 w-[90px] border-0 bg-transparent px-1.5 font-mono text-xs font-medium shadow-none"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="max-h-60">
                <SelectItem value="PHP">₱ PHP</SelectItem>
                <SelectItem value="USD">$ USD</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="ml-auto flex flex-wrap items-center gap-1.5">
            <Button
              type="button"
              variant={guideOpen ? "secondary" : "outline"}
              size="sm"
              className="h-9"
              onClick={() => setGuideOpen((v) => !v)}
              title="Show the Start here walkthrough"
            >
              <BookOpen className="mr-1.5 h-3.5 w-3.5" aria-hidden />
              Guide
            </Button>

            <Button type="button" variant="outline" size="sm" className="h-9" asChild>
              <Link
                href={`/fm/management-analytics/analytics-cadence?period=${period}`}
                title="Open Monthly Executive Decision Pack"
              >
                <Download className="mr-1.5 h-3.5 w-3.5" aria-hidden />
                Export Pack
              </Link>
            </Button>

            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-9"
              onClick={() => setTvMode(true)}
              title="TV / wall display mode (cycles Overview, Variance, Cadence every 20s)"
            >
              <Monitor className="mr-1.5 h-3.5 w-3.5" aria-hidden />
              TV mode
            </Button>

            <Popover open={bellOpen} onOpenChange={setBellOpen}>
              <PopoverTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="relative h-9 w-9 p-0"
                  aria-label="Notifications"
                  title="Notifications"
                >
                  <Bell className="h-4 w-4" aria-hidden />
                  {unreadCount > 0 ? (
                    <span className="absolute -right-1.5 -top-1.5 grid min-w-[18px] h-[18px] place-items-center rounded-full bg-destructive px-1 font-mono text-[10px] font-semibold text-destructive-foreground">
                      {unreadCount > 99 ? "99+" : unreadCount}
                    </span>
                  ) : null}
                </Button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-[380px] max-w-[calc(100vw-2rem)] p-0">
                <div className="flex items-center justify-between border-b border-border/60 px-3.5 py-2.5">
                  <span className="text-xs font-semibold">Notifications ({unreadCount})</span>
                  <div className="flex items-center gap-1.5">
                    {unreadCount > 0 ? (
                      <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => void markAllRead()}>
                        Mark all read
                      </Button>
                    ) : null}
                    <Button type="button" variant="outline" size="sm" className="h-7 px-2 text-xs" asChild onClick={() => setBellOpen(false)}>
                      <Link href="/fm/management-analytics/analytics-alerts">Rules</Link>
                    </Button>
                  </div>
                </div>
                <div className="max-h-72 overflow-y-auto divide-y divide-border/50">
                  {alerts.length === 0 ? (
                    <p className="px-4 py-6 text-center text-xs text-muted-foreground">You&apos;re all caught up.</p>
                  ) : (
                    alerts.slice(0, 12).map((item) => (
                      <Link
                        key={item.id}
                        href="/fm/management-analytics/analytics-alerts"
                        onClick={() => setBellOpen(false)}
                        className="flex items-start gap-2.5 px-3.5 py-2.5 transition-colors hover:bg-muted/40"
                      >
                        <span
                          aria-hidden
                          className={cn(
                            "mt-1.5 h-2 w-2 shrink-0 rounded-full",
                            item.severity === "HIGH" || item.severity === "CRITICAL"
                              ? "bg-destructive"
                              : item.severity === "MEDIUM"
                                ? "bg-warning"
                                : "bg-primary",
                          )}
                        />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-xs font-medium">{item.title}</p>
                          {item.detail ? (
                            <p className="mt-0.5 line-clamp-2 text-[11px] text-muted-foreground">{item.detail}</p>
                          ) : null}
                        </div>
                      </Link>
                    ))
                  )}
                </div>
              </PopoverContent>
            </Popover>
          </div>
        </div>
      )}

      {guideOpen && !tvMode ? (
        <section className="rounded-xl border border-primary/25 bg-primary/5 p-4 shadow-sm">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-primary">
                Start here · Command Center walkthrough
              </p>
              <h2 className="mt-0.5 text-base font-semibold">Five steps through the decision flow</h2>
            </div>
            <Button type="button" variant="ghost" size="sm" onClick={() => setGuideOpen(false)} aria-label="Hide guide">
              <X className="h-4 w-4" />
            </Button>
          </div>
          <ol className="mt-3 grid gap-2.5 sm:grid-cols-2 lg:grid-cols-5">
            {GUIDE_STEPS.map((step) => (
              <li
                key={step.n}
                className="flex flex-col gap-1.5 rounded-lg border border-border/60 bg-card p-3"
              >
                <span className="font-mono text-[11px] font-semibold text-primary">{step.n}</span>
                <p className="text-xs font-semibold">{step.title}</p>
                <p className="text-[11.5px] leading-snug text-muted-foreground">{step.desc}</p>
                <Button type="button" variant="outline" size="sm" className="mt-auto h-7 w-fit text-xs" asChild>
                  <Link href={`${step.href}?period=${period}`}>{step.cta} →</Link>
                </Button>
              </li>
            ))}
          </ol>
        </section>
      ) : null}

      {/* Remount on period/compare/currency change so server & client views stay synchronized. */}
      <div key={`${period}:${compare}:${currency}`} className="min-w-0">
        {children}
      </div>
    </div>
  );
}
