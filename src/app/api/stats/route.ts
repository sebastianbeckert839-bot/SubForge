import { NextResponse } from "next/server";
import { db } from "@/lib/db";

// Always serve fresh data — prevents Vercel from statically evaluating
// (and baking) this route's response at build time.
export const dynamic = "force-dynamic";

interface StatsPayload {
  totalToolUses: number;
  tools: Record<string, number>;
  views: { total: number; today: number; days: { day: string; count: number }[] };
}

export async function GET(): Promise<NextResponse> {
  try {
    const rows = await db.toolUsage.findMany({
      select: { tool: true, count: true },
    });
    const viewRows = await db.pageView.findMany({
      orderBy: { day: "asc" },
    });

    const tools: Record<string, number> = {};
    let totalToolUses = 0;
    for (const row of rows) {
      tools[row.tool] = row.count;
      totalToolUses += row.count;
    }

    let total = 0;
    const days: { day: string; count: number }[] = [];
    for (const v of viewRows) {
      total += v.count;
      days.push({ day: v.day, count: v.count });
    }
    const today = new Date().toISOString().slice(0, 10);

    const payload: StatsPayload = {
      totalToolUses,
      tools,
      views: {
        total,
        today: viewRows.find((v) => v.day === today)?.count ?? 0,
        days: days.slice(-30),
      },
    };

    return NextResponse.json(payload);
  } catch {
    // Stats are non-critical: fail soft so the home page can hide them.
    const empty: StatsPayload = {
      totalToolUses: 0,
      tools: {},
      views: { total: 0, today: 0, days: [] },
    };
    return NextResponse.json(empty, { status: 200 });
  }
}
