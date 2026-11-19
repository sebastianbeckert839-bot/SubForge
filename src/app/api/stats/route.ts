import { NextResponse } from "next/server";
import { db } from "@/lib/db";

// Always serve fresh data — prevents Vercel from statically evaluating
// (and baking) this route's response at build time.
export const dynamic = "force-dynamic";

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

/** YYYY-MM-DD for a date offset by `deltaDays` from today (UTC). */
function dayString(deltaDays: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + deltaDays);
  return d.toISOString().slice(0, 10);
}

export async function GET(): Promise<NextResponse> {
  try {
    const rows = await db.toolUsage.findMany({
      select: { tool: true, count: true },
    });
    const viewRows = await db.pageView.findMany({
      orderBy: { day: "asc" },
    });
    const toolDayRows = await db.toolUsageDay.findMany({
      select: { day: true, tool: true, count: true },
    });

    const tools: Record<string, number> = {};
    let totalToolUses = 0;
    for (const row of rows) {
      tools[row.tool] = row.count;
      totalToolUses += row.count;
    }

    /* ---------- page views ---------- */
    let total = 0;
    const byDay = new Map<string, number>();
    let firstDay: string | null = null;
    for (const v of viewRows) {
      total += v.count;
      byDay.set(v.day, v.count);
      if (!firstDay || v.day < firstDay) firstDay = v.day;
    }
    const today = dayString(0);

    // last 30 days, zero-filled, oldest → newest
    const days: DayCount[] = [];
    let last7 = 0;
    let prev7 = 0;
    let peak: { day: string; count: number } | null = null;
    for (let i = 29; i >= 0; i--) {
      const day = dayString(-i);
      const count = byDay.get(day) ?? 0;
      days.push({ day, count });
      if (i < 7) last7 += count;
      if (i >= 7 && i < 14) prev7 += count;
      if (count > 0 && (!peak || count > peak.count)) peak = { day, count };
    }

    const daysLive = firstDay
      ? Math.max(
          1,
          Math.round(
            (Date.now() - Date.parse(`${firstDay}T00:00:00Z`)) / 86400000
          ) + 1
        )
      : 0;
    const activeDays = Array.from(byDay.values()).filter((c) => c > 0).length;
    const avgPerDay = activeDays > 0 ? total / activeDays : 0;

    /* ---------- tool runs per day (last 14 days, zero-filled) ---------- */
    const toolByDay = new Map<string, number>();
    for (const r of toolDayRows) {
      toolByDay.set(r.day, (toolByDay.get(r.day) ?? 0) + r.count);
    }
    const toolDays: DayCount[] = [];
    let toolToday = 0;
    let toolLast7 = 0;
    for (let i = 13; i >= 0; i--) {
      const day = dayString(-i);
      const count = toolByDay.get(day) ?? 0;
      toolDays.push({ day, count });
      if (i === 0) toolToday = count;
      if (i < 7) toolLast7 += count;
    }

    const payload: StatsPayload = {
      totalToolUses,
      tools,
      views: {
        total,
        today: byDay.get(today) ?? 0,
        yesterday: byDay.get(dayString(-1)) ?? 0,
        last7,
        prev7,
        avgPerDay,
        peak,
        firstDay,
        daysLive,
        days,
      },
      toolRuns: { today: toolToday, last7: toolLast7, days: toolDays },
    };

    return NextResponse.json(payload);
  } catch {
    // Stats are non-critical: fail soft so the dashboard can show zeros.
    const empty: StatsPayload = {
      totalToolUses: 0,
      tools: {},
      views: {
        total: 0,
        today: 0,
        yesterday: 0,
        last7: 0,
        prev7: 0,
        avgPerDay: 0,
        peak: null,
        firstDay: null,
        daysLive: 0,
        days: [],
      },
      toolRuns: { today: 0, last7: 0, days: [] },
    };
    return NextResponse.json(empty, { status: 200 });
  }
}
