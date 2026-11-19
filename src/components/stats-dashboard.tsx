"use client";

import { useCallback, useEffect, useState } from "react";
import {
  ArrowLeft,
  Calendar,
  CalendarDays,
  Eye,
  Flame,
  TrendingDown,
  TrendingUp,
  Wrench,
  RefreshCw,
  Activity,
  Crown,
  Info,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TOOLS } from "@/lib/tools";
import { formatCount } from "@/lib/audio/engine";

interface DayCount {
  day: string;
  count: number;
}

interface StatsPayload {
  totalToolUses: number;
  tools: Record<string, number>;
  views: {
    total: number;
    today: number;
    yesterday: number;
    last7: number;
    prev7: number;
    avgPerDay: number;
    peak: { day: string; count: number } | null;
    firstDay: string | null;
    daysLive: number;
    days: DayCount[];
  };
  toolRuns: {
    today: number;
    last7: number;
    days: DayCount[];
  };
}

function StatCard({
  icon,
  label,
  value,
  sub,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub?: React.ReactNode;
}) {
  return (
    <Card>
      <CardContent className="flex items-center gap-4 p-5">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-lg border bg-muted/50">
          {icon}
        </span>
        <div className="min-w-0">
          <p className="text-2xl font-bold tabular-nums leading-tight">{value}</p>
          <p className="text-sm text-muted-foreground truncate">{label}</p>
          {sub ? (
            <p className="mt-0.5 text-xs text-muted-foreground/80 truncate">{sub}</p>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}

function pct(delta: number): string {
  return `${delta >= 0 ? "+" : ""}${delta.toFixed(0)}%`;
}

export function StatsDashboard() {
  const [data, setData] = useState<StatsPayload | null>(null);

  const load = useCallback(() => {
    fetch("/api/stats")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setData(d))
      .catch(() => {});
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const toolRows = TOOLS.map((t) => ({
    name: t.name,
    id: t.id,
    count: data?.tools?.[t.id] ?? 0,
  }))
    .filter((r) => r.count > 0)
    .sort((a, b) => b.count - a.count);

  const maxDay = Math.max(1, ...(data?.views?.days ?? []).map((d) => d.count));
  const maxToolDay = Math.max(
    1,
    ...(data?.toolRuns?.days ?? []).map((d) => d.count)
  );
  const totalToolUses = data?.totalToolUses ?? 0;

  const weekTrend =
    data && data.views.prev7 > 0
      ? ((data.views.last7 - data.views.prev7) / data.views.prev7) * 100
      : null;

  const topTool = toolRows[0];

  return (
    <div className="mx-auto w-full max-w-6xl px-4 pb-16 pt-8 sm:px-6">
      <nav
        aria-label="Breadcrumb"
        className="mb-6 flex items-center gap-1.5 text-sm text-muted-foreground"
      >
        <a href="#/" className="transition-colors hover:text-foreground">
          Home
        </a>
        <span className="text-foreground">/ Stats</span>
      </nav>

      <header className="mb-8 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
            Site stats
          </h1>
          <p className="mt-1 text-muted-foreground">
            Owner dashboard — page views and tool usage. This page is only
            reachable at <code className="font-mono text-sm">#/stats</code>.
          </p>
        </div>
        <Button variant="outline" onClick={load}>
          <RefreshCw className="size-4" />
          Refresh
        </Button>
      </header>

      {/* headline row */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          icon={<Eye className="size-5 text-primary" />}
          label="Total visits"
          value={data ? formatCount(data.views.total) : "—"}
          sub={
            data && data.views.firstDay
              ? `tracking since ${data.views.firstDay} (${data.views.daysLive} days)`
              : undefined
          }
        />
        <StatCard
          icon={<Calendar className="size-5 text-primary" />}
          label="Visits today"
          value={data ? formatCount(data.views.today) : "—"}
          sub={
            data ? `yesterday: ${formatCount(data.views.yesterday)}` : undefined
          }
        />
        <StatCard
          icon={
            weekTrend === null || weekTrend >= 0 ? (
              <TrendingUp className="size-5 text-primary" />
            ) : (
              <TrendingDown className="size-5 text-primary" />
            )
          }
          label="Visits — last 7 days"
          value={data ? formatCount(data.views.last7) : "—"}
          sub={
            weekTrend !== null
              ? `${pct(weekTrend)} vs the week before`
              : "previous week had no visits"
          }
        />
        <StatCard
          icon={<Wrench className="size-5 text-primary" />}
          label="Tool runs — all time"
          value={data ? formatCount(totalToolUses) : "—"}
          sub={
            data
              ? `${formatCount(data.toolRuns.last7)} in the last 7 days`
              : undefined
          }
        />
      </div>

      {/* secondary row */}
      <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          icon={<CalendarDays className="size-5 text-primary" />}
          label="Average per active day"
          value={data ? data.views.avgPerDay.toFixed(1) : "—"}
        />
        <StatCard
          icon={<Flame className="size-5 text-primary" />}
          label="Best day"
          value={
            data?.views.peak ? formatCount(data.views.peak.count) : "—"
          }
          sub={data?.views.peak ? data.views.peak.day : undefined}
        />
        <StatCard
          icon={<Activity className="size-5 text-primary" />}
          label="Tool runs today"
          value={data ? formatCount(data.toolRuns.today) : "—"}
        />
        <StatCard
          icon={<Crown className="size-5 text-primary" />}
          label="Most-used tool"
          value={topTool ? topTool.name : "—"}
          sub={
            topTool
              ? `${formatCount(topTool.count)} runs${
                  totalToolUses > 0
                    ? ` · ${((topTool.count / totalToolUses) * 100).toFixed(0)}% of all`
                    : ""
                }`
              : undefined
          }
        />
      </div>

      {/* charts */}
      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Visits — last 30 days
            </CardTitle>
          </CardHeader>
          <CardContent>
            {data && data.views.days.some((d) => d.count > 0) ? (
              <div className="flex h-44 items-end gap-1">
                {data.views.days.map((d) => (
                  <div
                    key={d.day}
                    className="flex-1 rounded-t bg-primary/80 transition-colors hover:bg-primary"
                    style={{
                      height: `${Math.max(3, (d.count / maxDay) * 100)}%`,
                    }}
                    title={`${d.day}: ${d.count} visits`}
                  />
                ))}
              </div>
            ) : (
              <p className="py-10 text-center text-sm text-muted-foreground">
                No visit data yet.
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Tool runs — last 14 days
            </CardTitle>
          </CardHeader>
          <CardContent>
            {data && data.toolRuns.days.some((d) => d.count > 0) ? (
              <div className="flex h-44 items-end gap-1.5">
                {data.toolRuns.days.map((d) => (
                  <div
                    key={d.day}
                    className="flex-1 rounded-t bg-primary/80 transition-colors hover:bg-primary"
                    style={{
                      height: `${Math.max(3, (d.count / maxToolDay) * 100)}%`,
                    }}
                    title={`${d.day}: ${d.count} runs`}
                  />
                ))}
              </div>
            ) : (
              <p className="py-10 text-center text-sm text-muted-foreground">
                No tool usage recorded yet.
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* tool table */}
      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="text-base">
            All tools — usage ranking
          </CardTitle>
        </CardHeader>
        <CardContent>
          {toolRows.length > 0 ? (
            <ul className="max-h-96 space-y-1.5 overflow-y-auto pr-1">
              {toolRows.map((r, i) => (
                <li
                  key={r.id}
                  className="flex items-center gap-3 text-sm"
                >
                  <span className="w-6 shrink-0 text-right font-mono text-xs text-muted-foreground/70">
                    {i + 1}.
                  </span>
                  <span className="w-36 shrink-0 truncate">{r.name}</span>
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-primary"
                      style={{
                        width: `${(r.count / toolRows[0].count) * 100}%`,
                      }}
                    />
                  </div>
                  <span className="w-12 shrink-0 text-right font-mono text-xs tabular-nums text-muted-foreground">
                    {totalToolUses > 0
                      ? `${((r.count / totalToolUses) * 100).toFixed(0)}%`
                      : "—"}
                  </span>
                  <span className="w-10 shrink-0 text-right font-mono text-xs tabular-nums">
                    {r.count}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="py-10 text-center text-sm text-muted-foreground">
              No tool usage recorded yet.
            </p>
          )}
        </CardContent>
      </Card>

      <p className="mt-6 flex items-start gap-2 text-xs text-muted-foreground/70">
        <Info className="mt-0.5 size-3.5 shrink-0" />
        Stats are stored server-side. On serverless deployments, set
        TURSO_DATABASE_URL and TURSO_AUTH_TOKEN (free database at
        turso.tech) so visits from your live site get counted.
      </p>

      <div className="mt-8">
        <Button asChild variant="outline">
          <a href="#/">
            <ArrowLeft className="size-4" />
            Back to all tools
          </a>
        </Button>
      </div>
    </div>
  );
}
