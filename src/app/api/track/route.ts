import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { TOOL_IDS } from "@/lib/tools";

const VALID_TOOLS = new Set<string>(TOOL_IDS);

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const body: unknown = await request.json();
    const tool = (body as { tool?: unknown } | null)?.tool;

    if (typeof tool !== "string" || !VALID_TOOLS.has(tool)) {
      return NextResponse.json({ error: "Unknown tool" }, { status: 400 });
    }

    const usage = await db.toolUsage.upsert({
      where: { tool },
      update: { count: { increment: 1 } },
      create: { tool, count: 1 },
    });

    // per-day breakdown for the owner dashboard
    const day = new Date().toISOString().slice(0, 10);
    await db.toolUsageDay
      .upsert({
        where: { day_tool: { day, tool } },
        update: { count: { increment: 1 } },
        create: { day, tool, count: 1 },
      })
      .catch(() => {
        // table may not exist yet on older deployments — ignore
      });

    return NextResponse.json({ ok: true, count: usage.count });
  } catch {
    // Non-critical: fail soft (e.g. no database configured on serverless).
    return NextResponse.json({ ok: false }, { status: 200 });
  }
}
