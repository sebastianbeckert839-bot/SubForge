"use client";

import { useEffect, useState } from "react";
import { ArrowLeft, Eye, TrendingUp, Wrench, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TOOLS } from "@/lib/tools";
import { formatCount } from "@/lib/audio/engine";

interface StatsPayload {
  totalToolUses: number;
  tools: Record<string, number>;
  views: { total: number; today: number; days: { day: string; count: number }[] };
}

export function StatsDashboard() {
  const [data, setData] = useState<StatsPayload | null>(null);

  useEffect(() => {
    fetch("/api/stats")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setData(d))
      .catch(() => {});
  }, []);

  const toolRows = TOOLS.map((t) => ({
    name: t.name,
    id: t.id,
    count: data?.tools?.[t.id] ?? 0,
  }))
    .filter((r) => r.count > 0)
    .sort((a, b) => b.count - a.count);

  const maxDay = Math.max(1, ...(data?.views?.days ?? []).map((d) => d.count));

  return (
    <div className="mx-auto w-full max-w-6xl px-4 pb-16 pt-8 sm:px-6">
      <nav aria-label="Breadcrumb" className="mb-6 flex items-center gap-1.5 text-sm text-muted-foreground">
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
        <Button
          variant="outline"
          onClick={() => {
            setData(null);
            fetch("/api/stats")
              .then((r) => (r.ok ? r.json() : null))
              .then((d) => setData(d))
              .catch(() => {});
          }}
        >
          <RefreshCw className="size-4" />
          Refresh
        </Button>
      </header>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardContent className="flex items-center gap-4 p-6">
            <span className="flex size-11 items-center justify-center rounded-lg border bg-muted/50">
              <Eye className="size-5 text-primary" />
            </span>
            <div>
              <p className="text-2xl font-bold tabular-nums">
                {data ? formatCount(data.views.total) : "—"}
              </p>
              <p className="text-sm text-muted-foreground">Total visits</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-4 p-6">
            <span className="flex size-11 items-center justify-center rounded-lg border bg-muted/50">
              <TrendingUp className="size-5 text-primary" />
            </span>
            <div>
              <p className="text-2xl font-bold tabular-nums">
                {data ? formatCount(data.views.today) : "—"}
              </p>
              <p className="text-sm text-muted-foreground">Visits today</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-4 p-6">
            <span className="flex size-11 items-center justify-center rounded-lg border bg-muted/50">
              <Wrench className="size-5 text-primary" />
            </span>
            <div>
              <p className="text-2xl font-bold tabular-nums">
                {data ? formatCount(data.totalToolUses) : "—"}
              </p>
              <p className="text-sm text-muted-foreground">Tool runs</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Visits — last 30 days</CardTitle>
          </CardHeader>
          <CardContent>
            {data && data.views.days.length > 0 ? (
              <div className="flex h-40 items-end gap-1">
                {data.views.days.map((d) => (
                  <div
                    key={d.day}
                    className="flex-1 rounded-t bg-primary/80 transition-colors hover:bg-primary"
                    style={{ height: `${Math.max(3, (d.count / maxDay) * 100)}%` }}
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
            <CardTitle className="text-base">Most-used tools</CardTitle>
          </CardHeader>
          <CardContent>
            {toolRows.length > 0 ? (
              <ul className="max-h-72 space-y-1.5 overflow-y-auto pr-1">
                {toolRows.map((r) => {
                  const max = toolRows[0].count;
                  return (
                    <li key={r.id} className="flex items-center gap-3 text-sm">
                      <span className="w-36 shrink-0 truncate">{r.name}</span>
                      <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                        <div
                          className="h-full rounded-full bg-primary"
                          style={{ width: `${(r.count / max) * 100}%` }}
                        />
                      </div>
                      <span className="w-10 shrink-0 text-right font-mono text-xs tabular-nums text-muted-foreground">
                        {r.count}
                      </span>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="py-10 text-center text-sm text-muted-foreground">
                No tool usage recorded yet.
              </p>
            )}
          </CardContent>
        </Card>
      </div>

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
